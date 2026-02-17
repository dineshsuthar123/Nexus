#!/bin/bash
# ==============================================================================
# Nexus RTP — Restore & Smoke Test
# ==============================================================================
# Restores a CockroachDB backup to a test database and validates data integrity.
# Designed to run as a daily verification job.
#
# Usage:
#   ./restore_and_smoke.sh                    # Use latest backup
#   ./restore_and_smoke.sh <backup-path>      # Specific backup
# ==============================================================================

set -euo pipefail

S3_BUCKET="${S3_BUCKET:-s3://nexus-backups}"
S3_ENDPOINT="${S3_ENDPOINT:-}"
COCKROACH_URL="${COCKROACH_URL:-postgresql://root@cockroachdb:26257/defaultdb?sslmode=verify-full}"
SOURCE_DATABASE="${SOURCE_DATABASE:-nexus}"
RESTORE_DATABASE="${RESTORE_DATABASE:-nexus_restore_test}"
BACKUP_PATH="${1:-latest}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FAILURES=0
TESTS_RUN=0

log() { echo -e "${GREEN}[INFO]${NC} $(date '+%H:%M:%S') $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $(date '+%H:%M:%S') $1"; }
err() { echo -e "${RED}[ERROR]${NC} $(date '+%H:%M:%S') $1"; }

assert() {
    local name=$1 result=$2 expected=$3
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ "$result" == "$expected" ]]; then
        echo -e "  ${GREEN}✓${NC} ${name}: ${result}"
    else
        echo -e "  ${RED}✗${NC} ${name}: got ${result}, expected ${expected}"
        FAILURES=$((FAILURES + 1))
    fi
}

assert_gt() {
    local name=$1 result=$2 minimum=$3
    TESTS_RUN=$((TESTS_RUN + 1))
    if [[ "$result" -gt "$minimum" ]]; then
        echo -e "  ${GREEN}✓${NC} ${name}: ${result} > ${minimum}"
    else
        echo -e "  ${RED}✗${NC} ${name}: ${result} ≤ ${minimum}"
        FAILURES=$((FAILURES + 1))
    fi
}

build_s3_params() {
    local params=""
    if [[ -n "$S3_ENDPOINT" ]]; then
        params="?AWS_ENDPOINT='${S3_ENDPOINT}'&AWS_ACCESS_KEY_ID='${AWS_ACCESS_KEY_ID:-}'&AWS_SECRET_ACCESS_KEY='${AWS_SECRET_ACCESS_KEY:-}'"
    fi
    echo "$params"
}

echo "============================================"
echo "  Nexus RTP — Backup Restore & Smoke Test"
echo "============================================"

# Step 1: Drop any previous test database
log "Dropping previous test database (if exists)..."
cockroach sql --url="${COCKROACH_URL}" --execute="
    DROP DATABASE IF EXISTS ${RESTORE_DATABASE} CASCADE;
" 2>/dev/null || true

# Step 2: Restore backup
log "Restoring backup to '${RESTORE_DATABASE}'..."
RESTORE_START=$(date +%s)

params=$(build_s3_params)
BACKUP_COLLECTION="${S3_BUCKET}/${SOURCE_DATABASE}"

if [[ "$BACKUP_PATH" == "latest" ]]; then
    cockroach sql --url="${COCKROACH_URL}" --execute="
        RESTORE DATABASE ${SOURCE_DATABASE}
        FROM LATEST IN '${BACKUP_COLLECTION}${params}'
        WITH new_db_name = '${RESTORE_DATABASE}';
    "
else
    cockroach sql --url="${COCKROACH_URL}" --execute="
        RESTORE DATABASE ${SOURCE_DATABASE}
        FROM '${BACKUP_PATH}${params}'
        WITH new_db_name = '${RESTORE_DATABASE}';
    "
fi

RESTORE_END=$(date +%s)
RESTORE_DURATION=$((RESTORE_END - RESTORE_START))
log "Restore completed in ${RESTORE_DURATION}s"

# Step 3: Verify table existence
echo ""
log "Running smoke tests on restored database..."
echo "--- Schema Verification ---"

tables=$(cockroach sql --url="${COCKROACH_URL}" --format=csv --execute="
    SELECT table_name FROM ${RESTORE_DATABASE}.information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name;
" 2>/dev/null | tail -n +2 || echo "")

for expected_table in customer account transaction transaction_leg pending_credit outbox; do
    if echo "$tables" | grep -q "^${expected_table}$"; then
        assert "Table '${expected_table}' exists" "found" "found"
    else
        assert "Table '${expected_table}' exists" "missing" "found"
    fi
done

# Step 4: Row count verification
echo ""
echo "--- Data Integrity ---"

for tbl in customer account transaction; do
    count=$(cockroach sql --url="${COCKROACH_URL}" --format=csv --execute="
        SELECT count(*) FROM ${RESTORE_DATABASE}.public.${tbl};
    " 2>/dev/null | tail -1 || echo "0")
    assert_gt "Row count '${tbl}'" "${count}" "0"
done

# Step 5: Referential integrity
echo ""
echo "--- Referential Integrity ---"

orphaned_tx=$(cockroach sql --url="${COCKROACH_URL}" --format=csv --execute="
    SELECT count(*) FROM ${RESTORE_DATABASE}.public.transaction t
    LEFT JOIN ${RESTORE_DATABASE}.public.account a ON t.debtor_account_id = a.id
    WHERE a.id IS NULL AND t.debtor_account_id IS NOT NULL;
" 2>/dev/null | tail -1 || echo "0")
assert "Orphaned transactions" "${orphaned_tx}" "0"

orphaned_legs=$(cockroach sql --url="${COCKROACH_URL}" --format=csv --execute="
    SELECT count(*) FROM ${RESTORE_DATABASE}.public.transaction_leg l
    LEFT JOIN ${RESTORE_DATABASE}.public.transaction t ON l.transaction_id = t.id
    WHERE t.id IS NULL;
" 2>/dev/null | tail -1 || echo "0")
assert "Orphaned transaction legs" "${orphaned_legs}" "0"

# Step 6: Balance invariant (INV-1: conservation of value)
echo ""
echo "--- Balance Invariants ---"

balance_check=$(cockroach sql --url="${COCKROACH_URL}" --format=csv --execute="
    SELECT COALESCE(SUM(CASE WHEN type='DEBIT' THEN amount ELSE -amount END), 0)
    FROM ${RESTORE_DATABASE}.public.transaction_leg
    WHERE status = 'SETTLED';
" 2>/dev/null | tail -1 || echo "-1")

if [[ "$balance_check" == "0" ]] || [[ "$balance_check" == "0.0000" ]] || [[ "$balance_check" == "0.00" ]]; then
    assert "Double-entry balance (sum=0)" "balanced" "balanced"
else
    assert "Double-entry balance (sum=0)" "imbalanced(${balance_check})" "balanced"
fi

# Step 7: Cleanup
log "Cleaning up test database..."
cockroach sql --url="${COCKROACH_URL}" --execute="
    DROP DATABASE IF EXISTS ${RESTORE_DATABASE} CASCADE;
" 2>/dev/null || true

# Results
echo ""
echo "============================================"
echo "  Restore & Smoke Test Results"
echo "============================================"
echo "  Restore time: ${RESTORE_DURATION}s"
echo "  Tests run:    ${TESTS_RUN}"
echo "  Tests passed: $((TESTS_RUN - FAILURES))"
echo "  Tests failed: ${FAILURES}"
echo "============================================"

if [[ $FAILURES -gt 0 ]]; then
    err "BACKUP VERIFICATION FAILED"
    exit 1
fi

log "BACKUP VERIFICATION PASSED"
exit 0

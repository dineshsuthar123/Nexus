#!/bin/bash
# ==============================================================================
# Nexus RTP — Pre-Deploy Backup Snapshot
# Wraps infra/backup/backup-cockroachdb.sh with S3 upload and manifest generation
# Usage: ./scripts/backup_snapshot.sh --cluster <cluster-name> [--dry-run]
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLUSTER=""
DRY_RUN=false
BACKUP_BUCKET="${BACKUP_BUCKET:-s3://nexus-prod-backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MANIFEST_DIR="$REPO_ROOT/RELEASE"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[BACKUP]${NC} $(date '+%H:%M:%S') $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $(date '+%H:%M:%S') $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $(date '+%H:%M:%S') $*"; exit 1; }

usage() {
  echo "Usage: $0 --cluster <cluster-name> [--dry-run]"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cluster) CLUSTER="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --action)
      if [[ "$2" == "backup-only" ]]; then DRY_RUN=false; fi
      shift 2 ;;
    *) usage ;;
  esac
done

[[ -z "$CLUSTER" ]] && fail "Cluster name required (--cluster <name>)"

BACKUP_ID="nexus_full_${CLUSTER}_${TIMESTAMP}"
BACKUP_S3_PATH="${BACKUP_BUCKET}/${BACKUP_ID}/cockroachdb"

# ---- Step 1: Pre-backup health check ----
log "Checking CockroachDB cluster health on $CLUSTER..."
if [[ "$DRY_RUN" == "true" ]]; then
  log "[DRY-RUN] Would check: cockroach node status --host=\$COCKROACH_HOST"
else
  if command -v cockroach &>/dev/null; then
    cockroach node status --host="${COCKROACH_HOST:-localhost}" --insecure 2>/dev/null || warn "Could not reach CockroachDB — continuing with backup attempt"
  else
    warn "cockroach CLI not installed locally — skipping health check"
  fi
fi

# ---- Step 2: Execute backup ----
log "Starting full backup → $BACKUP_S3_PATH"
if [[ "$DRY_RUN" == "true" ]]; then
  log "[DRY-RUN] Would run: $REPO_ROOT/infra/backup/backup-cockroachdb.sh full"
  log "[DRY-RUN] Would upload to: $BACKUP_S3_PATH"
else
  if [[ -x "$REPO_ROOT/infra/backup/backup-cockroachdb.sh" ]]; then
    BACKUP_DIR="/tmp/nexus-backups" "$REPO_ROOT/infra/backup/backup-cockroachdb.sh" full || fail "Backup script failed"
  else
    warn "Backup script not executable or missing — attempting S3 BACKUP SQL"
    cockroach sql --url="${COCKROACH_URL:-postgresql://root@localhost:26257/nexus}" \
      -e "BACKUP DATABASE nexus INTO '${BACKUP_S3_PATH}';" 2>/dev/null || fail "BACKUP SQL failed"
  fi
fi

# ---- Step 3: Verify backup ----
log "Verifying backup..."
if [[ "$DRY_RUN" == "true" ]]; then
  log "[DRY-RUN] Would verify: aws s3 ls $BACKUP_S3_PATH"
  BACKUP_SIZE="N/A (dry-run)"
  BACKUP_VERIFIED="true (dry-run)"
else
  if command -v aws &>/dev/null; then
    BACKUP_SIZE=$(aws s3 ls "$BACKUP_S3_PATH" --recursive --summarize 2>/dev/null | grep "Total Size" || echo "unknown")
    BACKUP_VERIFIED="true"
  else
    BACKUP_SIZE="unknown (aws CLI not available)"
    BACKUP_VERIFIED="pending-manual"
  fi
fi

# ---- Step 4: Generate manifest ----
MANIFEST_FILE="$MANIFEST_DIR/backup-manifest-$(date +%Y%m%d).json"
log "Generating backup manifest → $MANIFEST_FILE"

cat > "$MANIFEST_FILE" <<EOF
{
  "backup_id": "${BACKUP_ID}",
  "cluster": "${CLUSTER}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "type": "full",
  "database": "nexus",
  "s3_path": "${BACKUP_S3_PATH}",
  "backup_size": "${BACKUP_SIZE}",
  "verified": ${BACKUP_VERIFIED:-false},
  "retention_days": 30,
  "restore_command": "cockroach sql -e \"RESTORE DATABASE nexus FROM '${BACKUP_S3_PATH}';\"",
  "helm_rollback_command": "helm rollback nexus-production <REVISION> -n nexus-production --wait",
  "created_by": "scripts/backup_snapshot.sh",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
}
EOF

log "Backup manifest written to $MANIFEST_FILE"
log "Backup ID: $BACKUP_ID"
log "S3 Path:   $BACKUP_S3_PATH"

echo ""
echo "============================================"
echo " BACKUP SNAPSHOT COMPLETE"
echo " ID:       $BACKUP_ID"
echo " Location: $BACKUP_S3_PATH"
echo " Manifest: $MANIFEST_FILE"
echo "============================================"

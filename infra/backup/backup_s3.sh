#!/bin/bash
# ==============================================================================
# Nexus RTP — Backup to S3-Compatible Storage
# ==============================================================================
# CockroachDB scheduled backups to S3/MinIO with lifecycle management.
#
# Usage:
#   ./backup_s3.sh full                 # Full backup
#   ./backup_s3.sh incremental          # Incremental backup
#   ./backup_s3.sh schedule             # Install cron schedule
#   ./backup_s3.sh verify <backup-id>   # Verify a backup
# ==============================================================================

set -euo pipefail

# Configuration — override via environment
S3_BUCKET="${S3_BUCKET:-s3://nexus-backups}"
S3_REGION="${S3_REGION:-us-east-1}"
S3_ENDPOINT="${S3_ENDPOINT:-}"  # For MinIO: http://minio:9000
COCKROACH_URL="${COCKROACH_URL:-postgresql://root@cockroachdb:26257/defaultdb?sslmode=verify-full}"
DATABASE="${DATABASE:-nexus}"
RETENTION_FULL="${RETENTION_FULL:-7}"          # Keep 7 full backups
RETENTION_INCREMENTAL="${RETENTION_INCREMENTAL:-24}" # Keep 24 incremental
BACKUP_SCHEDULE_FULL="${BACKUP_SCHEDULE_FULL:-0 2 * * *}"     # 2am daily
BACKUP_SCHEDULE_INC="${BACKUP_SCHEDULE_INC:-0 */4 * * *}"      # Every 4h

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_COLLECTION="${S3_BUCKET}/${DATABASE}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $(date '+%H:%M:%S') $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $(date '+%H:%M:%S') $1"; }
err() { echo -e "${RED}[ERROR]${NC} $(date '+%H:%M:%S') $1"; }

build_s3_params() {
    local params=""
    if [[ -n "$S3_ENDPOINT" ]]; then
        params="?AWS_ENDPOINT='${S3_ENDPOINT}'&AWS_ACCESS_KEY_ID='${AWS_ACCESS_KEY_ID:-}'&AWS_SECRET_ACCESS_KEY='${AWS_SECRET_ACCESS_KEY:-}'"
    fi
    echo "$params"
}

do_full_backup() {
    local dest="${BACKUP_COLLECTION}/full_${TIMESTAMP}"
    local params=$(build_s3_params)

    log "Starting FULL backup to ${dest}"
    log "Database: ${DATABASE}"

    cockroach sql --url="${COCKROACH_URL}" --execute="
        BACKUP DATABASE ${DATABASE}
        INTO '${dest}${params}'
        AS OF SYSTEM TIME '-10s'
        WITH revision_history;
    "

    if [[ $? -eq 0 ]]; then
        log "Full backup completed: ${dest}"

        # Record metadata
        cockroach sql --url="${COCKROACH_URL}" --execute="
            INSERT INTO ${DATABASE}.backup_metadata (backup_id, backup_type, backup_path, status, created_at)
            VALUES ('full_${TIMESTAMP}', 'full', '${dest}', 'completed', now())
            ON CONFLICT DO NOTHING;
        " 2>/dev/null || warn "Could not record backup metadata (table may not exist)"
    else
        err "Full backup FAILED"
        exit 1
    fi
}

do_incremental_backup() {
    log "Starting INCREMENTAL backup"

    # Find latest full backup
    local latest_full
    latest_full=$(cockroach sql --url="${COCKROACH_URL}" --format=csv --execute="
        SHOW BACKUPS IN '${BACKUP_COLLECTION}$(build_s3_params)';
    " 2>/dev/null | tail -1 || echo "")

    if [[ -z "$latest_full" ]]; then
        warn "No existing backup found. Performing full backup instead."
        do_full_backup
        return
    fi

    local dest="${BACKUP_COLLECTION}"
    local params=$(build_s3_params)

    cockroach sql --url="${COCKROACH_URL}" --execute="
        BACKUP DATABASE ${DATABASE}
        INTO LATEST IN '${dest}${params}'
        AS OF SYSTEM TIME '-10s'
        WITH revision_history;
    "

    if [[ $? -eq 0 ]]; then
        log "Incremental backup completed"
    else
        err "Incremental backup FAILED"
        exit 1
    fi
}

verify_backup() {
    local backup_id="${1:-}"
    log "Verifying backups in ${BACKUP_COLLECTION}"

    local params=$(build_s3_params)

    cockroach sql --url="${COCKROACH_URL}" --execute="
        SHOW BACKUPS IN '${BACKUP_COLLECTION}${params}';
    "

    if [[ -n "$backup_id" ]]; then
        log "Detailed info for: ${backup_id}"
        cockroach sql --url="${COCKROACH_URL}" --execute="
            SHOW BACKUP '${BACKUP_COLLECTION}/${backup_id}${params}';
        "
    fi
}

install_schedule() {
    log "Creating CockroachDB scheduled backups..."

    local params=$(build_s3_params)

    # Full daily backup at 2am
    cockroach sql --url="${COCKROACH_URL}" --execute="
        CREATE SCHEDULE nexus_full_backup
        FOR BACKUP DATABASE ${DATABASE}
        INTO '${BACKUP_COLLECTION}${params}'
        WITH revision_history
        RECURRING '${BACKUP_SCHEDULE_FULL}'
        FULL BACKUP ALWAYS
        WITH SCHEDULE OPTIONS first_run = 'now';
    " 2>/dev/null || warn "Schedule may already exist"

    # Incremental every 4h
    cockroach sql --url="${COCKROACH_URL}" --execute="
        CREATE SCHEDULE nexus_incremental_backup
        FOR BACKUP DATABASE ${DATABASE}
        INTO '${BACKUP_COLLECTION}${params}'
        WITH revision_history
        RECURRING '${BACKUP_SCHEDULE_INC}'
        FULL BACKUP '${BACKUP_SCHEDULE_FULL}'
        WITH SCHEDULE OPTIONS first_run = 'now';
    " 2>/dev/null || warn "Schedule may already exist"

    log "Backup schedules created. Verify with:"
    echo "  cockroach sql --url=... --execute='SHOW SCHEDULES;'"
}

# Main
case "${1:-help}" in
    full)        do_full_backup ;;
    incremental) do_incremental_backup ;;
    inc)         do_incremental_backup ;;
    schedule)    install_schedule ;;
    verify)      verify_backup "${2:-}" ;;
    *)
        echo "Usage: $0 {full|incremental|schedule|verify [backup-id]}"
        echo ""
        echo "Environment variables:"
        echo "  S3_BUCKET     Backup destination (default: s3://nexus-backups)"
        echo "  S3_ENDPOINT   S3-compatible endpoint (for MinIO)"
        echo "  COCKROACH_URL CockroachDB connection URL"
        echo "  DATABASE      Database name (default: nexus)"
        exit 1
        ;;
esac

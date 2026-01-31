#!/bin/bash
# CockroachDB Backup Script for Nexus RTP Platform
# Supports full and incremental backups to local filesystem or S3-compatible storage

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups/cockroachdb}"
COCKROACH_HOST="${COCKROACH_HOST:-localhost}"
COCKROACH_PORT="${COCKROACH_PORT:-26257}"
COCKROACH_USER="${COCKROACH_USER:-root}"
DATABASE="${DATABASE:-nexus}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
BACKUP_TYPE="${1:-full}"  # full or incremental

# Timestamp for backup naming
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="${DATABASE}_${BACKUP_TYPE}_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

# Check cockroach CLI availability
check_prerequisites() {
    if ! command -v cockroach &> /dev/null; then
        log_error "cockroach CLI not found. Please install CockroachDB."
        exit 1
    }
    
    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_DIR"
}

# Get connection string
get_connection() {
    echo "postgresql://${COCKROACH_USER}@${COCKROACH_HOST}:${COCKROACH_PORT}/${DATABASE}?sslmode=verify-full"
}

# Find latest full backup for incremental
find_latest_full_backup() {
    local latest=$(ls -1d "${BACKUP_DIR}/${DATABASE}_full_"* 2>/dev/null | sort -r | head -1)
    if [[ -z "$latest" ]]; then
        log_error "No full backup found. Cannot perform incremental backup."
        exit 1
    fi
    echo "$latest"
}

# Perform full backup
do_full_backup() {
    log_info "Starting full backup of database: ${DATABASE}"
    log_info "Backup destination: ${BACKUP_PATH}"
    
    # Using nodelocal for local filesystem backup
    # In production, use cloud storage (s3://, gs://, etc.)
    cockroach sql \
        --url="$(get_connection)" \
        --execute="BACKUP DATABASE ${DATABASE} TO 'nodelocal://1/${BACKUP_NAME}' AS OF SYSTEM TIME '-10s';"
    
    if [[ $? -eq 0 ]]; then
        log_info "Full backup completed successfully"
        
        # Record backup metadata
        cat > "${BACKUP_PATH}.meta" <<EOF
{
    "backup_type": "full",
    "database": "${DATABASE}",
    "timestamp": "${TIMESTAMP}",
    "backup_path": "${BACKUP_PATH}",
    "created_at": "$(date -Iseconds)"
}
EOF
    else
        log_error "Full backup failed"
        exit 1
    fi
}

# Perform incremental backup
do_incremental_backup() {
    local base_backup=$(find_latest_full_backup)
    log_info "Starting incremental backup based on: ${base_backup}"
    log_info "Backup destination: ${BACKUP_PATH}"
    
    cockroach sql \
        --url="$(get_connection)" \
        --execute="BACKUP DATABASE ${DATABASE} TO 'nodelocal://1/${BACKUP_NAME}' INCREMENTAL FROM 'nodelocal://1/$(basename ${base_backup})' AS OF SYSTEM TIME '-10s';"
    
    if [[ $? -eq 0 ]]; then
        log_info "Incremental backup completed successfully"
        
        # Record backup metadata
        cat > "${BACKUP_PATH}.meta" <<EOF
{
    "backup_type": "incremental",
    "database": "${DATABASE}",
    "base_backup": "${base_backup}",
    "timestamp": "${TIMESTAMP}",
    "backup_path": "${BACKUP_PATH}",
    "created_at": "$(date -Iseconds)"
}
EOF
    else
        log_error "Incremental backup failed"
        exit 1
    fi
}

# Cleanup old backups
cleanup_old_backups() {
    log_info "Cleaning up backups older than ${RETENTION_DAYS} days..."
    
    find "$BACKUP_DIR" -name "${DATABASE}_*" -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true
    find "$BACKUP_DIR" -name "${DATABASE}_*.meta" -type f -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
    
    log_info "Cleanup completed"
}

# List available backups
list_backups() {
    log_info "Available backups for database: ${DATABASE}"
    echo ""
    printf "%-50s %-15s %-25s\n" "BACKUP NAME" "TYPE" "CREATED"
    printf "%s\n" "$(printf '=%.0s' {1..90})"
    
    for meta in "$BACKUP_DIR"/${DATABASE}_*.meta; do
        if [[ -f "$meta" ]]; then
            name=$(basename "${meta%.meta}")
            type=$(grep -o '"backup_type": "[^"]*' "$meta" | cut -d'"' -f4)
            created=$(grep -o '"created_at": "[^"]*' "$meta" | cut -d'"' -f4)
            printf "%-50s %-15s %-25s\n" "$name" "$type" "$created"
        fi
    done
}

# Verify backup integrity
verify_backup() {
    local backup_name="${1:-}"
    
    if [[ -z "$backup_name" ]]; then
        log_error "Backup name required for verification"
        exit 1
    fi
    
    log_info "Verifying backup: ${backup_name}"
    
    cockroach sql \
        --url="$(get_connection)" \
        --execute="SHOW BACKUP 'nodelocal://1/${backup_name}';"
    
    if [[ $? -eq 0 ]]; then
        log_info "Backup verification successful"
    else
        log_error "Backup verification failed"
        exit 1
    fi
}

# Main execution
main() {
    check_prerequisites
    
    case "$BACKUP_TYPE" in
        full)
            do_full_backup
            cleanup_old_backups
            ;;
        incremental|inc)
            do_incremental_backup
            cleanup_old_backups
            ;;
        list)
            list_backups
            ;;
        verify)
            verify_backup "${2:-}"
            ;;
        *)
            echo "Usage: $0 {full|incremental|list|verify <backup_name>}"
            echo ""
            echo "Commands:"
            echo "  full          Perform full database backup"
            echo "  incremental   Perform incremental backup (requires existing full backup)"
            echo "  list          List available backups"
            echo "  verify        Verify backup integrity"
            echo ""
            echo "Environment variables:"
            echo "  BACKUP_DIR      Backup directory (default: /backups/cockroachdb)"
            echo "  COCKROACH_HOST  Database host (default: localhost)"
            echo "  COCKROACH_PORT  Database port (default: 26257)"
            echo "  DATABASE        Database name (default: nexus)"
            echo "  RETENTION_DAYS  Days to keep backups (default: 7)"
            exit 1
            ;;
    esac
}

main "$@"

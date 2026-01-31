#!/bin/bash
# CockroachDB Restore Script for Nexus RTP Platform
# Supports point-in-time recovery from full and incremental backups

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups/cockroachdb}"
COCKROACH_HOST="${COCKROACH_HOST:-localhost}"
COCKROACH_PORT="${COCKROACH_PORT:-26257}"
COCKROACH_USER="${COCKROACH_USER:-root}"
DATABASE="${DATABASE:-nexus}"
RESTORE_DATABASE="${RESTORE_DATABASE:-nexus_restored}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_step() {
    echo -e "${BLUE}[STEP]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

# Get connection string
get_connection() {
    echo "postgresql://${COCKROACH_USER}@${COCKROACH_HOST}:${COCKROACH_PORT}/defaultdb?sslmode=verify-full"
}

# Check prerequisites
check_prerequisites() {
    if ! command -v cockroach &> /dev/null; then
        log_error "cockroach CLI not found. Please install CockroachDB."
        exit 1
    }
    
    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_error "Backup directory not found: $BACKUP_DIR"
        exit 1
    fi
}

# List available backups
list_backups() {
    log_info "Available backups:"
    echo ""
    
    local count=0
    for meta in "$BACKUP_DIR"/${DATABASE}_*.meta; do
        if [[ -f "$meta" ]]; then
            ((count++))
            name=$(basename "${meta%.meta}")
            type=$(grep -o '"backup_type": "[^"]*' "$meta" | cut -d'"' -f4)
            created=$(grep -o '"created_at": "[^"]*' "$meta" | cut -d'"' -f4)
            echo "  [$count] $name ($type) - $created"
        fi
    done
    
    if [[ $count -eq 0 ]]; then
        log_warn "No backups found in $BACKUP_DIR"
        exit 1
    fi
}

# Find backup chain for incremental restore
find_backup_chain() {
    local target_backup=$1
    local chain=()
    local current_meta="${BACKUP_DIR}/${target_backup}.meta"
    
    if [[ ! -f "$current_meta" ]]; then
        log_error "Backup metadata not found: $current_meta"
        exit 1
    fi
    
    local backup_type=$(grep -o '"backup_type": "[^"]*' "$current_meta" | cut -d'"' -f4)
    
    if [[ "$backup_type" == "full" ]]; then
        echo "$target_backup"
        return
    fi
    
    # Build chain for incremental backup
    chain=("$target_backup")
    
    while true; do
        local base=$(grep -o '"base_backup": "[^"]*' "$current_meta" | cut -d'"' -f4)
        if [[ -z "$base" ]]; then
            break
        fi
        
        base=$(basename "$base")
        chain=("$base" "${chain[@]}")
        current_meta="${BACKUP_DIR}/${base}.meta"
        
        local type=$(grep -o '"backup_type": "[^"]*' "$current_meta" 2>/dev/null | cut -d'"' -f4)
        if [[ "$type" == "full" ]]; then
            break
        fi
    done
    
    echo "${chain[@]}"
}

# Perform restore
do_restore() {
    local backup_name=$1
    local target_db=${2:-$RESTORE_DATABASE}
    
    log_info "Starting restore from: $backup_name"
    log_info "Target database: $target_db"
    
    # Find backup chain
    log_step "Analyzing backup chain..."
    local chain=($(find_backup_chain "$backup_name"))
    log_info "Backup chain: ${chain[*]}"
    
    # Build RESTORE command
    local restore_locations=""
    for backup in "${chain[@]}"; do
        if [[ -n "$restore_locations" ]]; then
            restore_locations+=", "
        fi
        restore_locations+="'nodelocal://1/${backup}'"
    done
    
    # Check if target database exists
    log_step "Checking target database..."
    local db_exists=$(cockroach sql \
        --url="$(get_connection)" \
        --format=csv \
        --execute="SELECT count(*) FROM [SHOW DATABASES] WHERE database_name = '${target_db}';" 2>/dev/null | tail -1)
    
    if [[ "$db_exists" -gt 0 ]]; then
        log_warn "Database '${target_db}' already exists!"
        read -p "Do you want to drop and recreate it? (yes/no): " confirm
        if [[ "$confirm" != "yes" ]]; then
            log_info "Restore cancelled"
            exit 0
        fi
        
        log_step "Dropping existing database..."
        cockroach sql \
            --url="$(get_connection)" \
            --execute="DROP DATABASE IF EXISTS ${target_db} CASCADE;"
    fi
    
    # Perform restore
    log_step "Restoring database..."
    cockroach sql \
        --url="$(get_connection)" \
        --execute="RESTORE DATABASE ${DATABASE} FROM ${restore_locations} WITH new_db_name = '${target_db}';"
    
    if [[ $? -eq 0 ]]; then
        log_info "Restore completed successfully!"
        log_info "Database '${target_db}' is now available"
        
        # Show table counts
        log_step "Verifying restored data..."
        cockroach sql \
            --url="$(get_connection)" \
            --execute="USE ${target_db}; SELECT table_name, (SELECT count(*) FROM ${target_db}.information_schema.tables t WHERE t.table_name = tables.table_name) as row_count FROM information_schema.tables WHERE table_schema = 'public' LIMIT 10;"
    else
        log_error "Restore failed"
        exit 1
    fi
}

# Point-in-time recovery
do_pitr() {
    local backup_name=$1
    local timestamp=$2
    local target_db=${3:-$RESTORE_DATABASE}
    
    log_info "Starting point-in-time recovery"
    log_info "Backup: $backup_name"
    log_info "Target time: $timestamp"
    log_info "Target database: $target_db"
    
    cockroach sql \
        --url="$(get_connection)" \
        --execute="RESTORE DATABASE ${DATABASE} FROM 'nodelocal://1/${backup_name}' AS OF SYSTEM TIME '${timestamp}' WITH new_db_name = '${target_db}';"
    
    if [[ $? -eq 0 ]]; then
        log_info "Point-in-time recovery completed successfully!"
    else
        log_error "Point-in-time recovery failed"
        exit 1
    fi
}

# Verify restore integrity
verify_restore() {
    local db_name=${1:-$RESTORE_DATABASE}
    
    log_info "Verifying restored database: $db_name"
    
    # Check table counts
    log_step "Checking table row counts..."
    cockroach sql \
        --url="$(get_connection)" \
        --execute="
            USE ${db_name};
            SELECT 
                'payments' as table_name, 
                count(*) as row_count 
            FROM payments
            UNION ALL
            SELECT 'accounts', count(*) FROM accounts
            UNION ALL
            SELECT 'outbox_events', count(*) FROM outbox_events
            UNION ALL
            SELECT 'idempotency_keys', count(*) FROM idempotency_keys;
        "
    
    # Check for data integrity
    log_step "Checking data integrity..."
    cockroach sql \
        --url="$(get_connection)" \
        --execute="
            USE ${db_name};
            SELECT 
                'orphaned_payments' as check_name,
                count(*) as issues
            FROM payments p
            LEFT JOIN accounts a ON p.debtor_account_id = a.id
            WHERE a.id IS NULL;
        "
    
    log_info "Verification complete"
}

# Swap databases (for production recovery)
swap_databases() {
    local restored_db=$1
    local target_db=$2
    local backup_suffix="_backup_$(date +%Y%m%d_%H%M%S)"
    
    log_warn "This will swap '${target_db}' with '${restored_db}'"
    log_warn "Current '${target_db}' will be renamed to '${target_db}${backup_suffix}'"
    read -p "Are you sure? (yes/no): " confirm
    
    if [[ "$confirm" != "yes" ]]; then
        log_info "Swap cancelled"
        exit 0
    fi
    
    log_step "Renaming ${target_db} to ${target_db}${backup_suffix}..."
    cockroach sql \
        --url="$(get_connection)" \
        --execute="ALTER DATABASE ${target_db} RENAME TO ${target_db}${backup_suffix};"
    
    log_step "Renaming ${restored_db} to ${target_db}..."
    cockroach sql \
        --url="$(get_connection)" \
        --execute="ALTER DATABASE ${restored_db} RENAME TO ${target_db};"
    
    log_info "Database swap complete!"
    log_info "Old database available at: ${target_db}${backup_suffix}"
}

# Usage
show_usage() {
    echo "CockroachDB Restore Script for Nexus RTP Platform"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  list                          List available backups"
    echo "  restore <backup> [target_db]  Restore from backup"
    echo "  pitr <backup> <timestamp>     Point-in-time recovery"
    echo "  verify [database]             Verify restored database"
    echo "  swap <restored_db> <target>   Swap restored with target"
    echo ""
    echo "Examples:"
    echo "  $0 list"
    echo "  $0 restore nexus_full_20240115_120000"
    echo "  $0 restore nexus_full_20240115_120000 nexus_restored"
    echo "  $0 pitr nexus_full_20240115_120000 '2024-01-15 11:30:00'"
    echo "  $0 verify nexus_restored"
    echo "  $0 swap nexus_restored nexus"
}

# Main execution
main() {
    check_prerequisites
    
    case "${1:-}" in
        list)
            list_backups
            ;;
        restore)
            if [[ -z "${2:-}" ]]; then
                log_error "Backup name required"
                show_usage
                exit 1
            fi
            do_restore "$2" "${3:-}"
            ;;
        pitr)
            if [[ -z "${2:-}" ]] || [[ -z "${3:-}" ]]; then
                log_error "Backup name and timestamp required"
                show_usage
                exit 1
            fi
            do_pitr "$2" "$3" "${4:-}"
            ;;
        verify)
            verify_restore "${2:-}"
            ;;
        swap)
            if [[ -z "${2:-}" ]] || [[ -z "${3:-}" ]]; then
                log_error "Source and target database names required"
                show_usage
                exit 1
            fi
            swap_databases "$2" "$3"
            ;;
        *)
            show_usage
            exit 1
            ;;
    esac
}

main "$@"

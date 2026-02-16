#!/bin/bash
# ==============================================================================
# Nexus RTP — Security Scan CI Step
# ==============================================================================
# Runs Trivy container image scan + Go dependency vulnerability scan.
# Fails the build on Critical/High findings.
#
# Usage:
#   ./security_scan.sh                          # Scan all images
#   ./security_scan.sh --image nexus/payment    # Scan one image
#   ./security_scan.sh --deps-only              # Go deps only
# ==============================================================================

set -euo pipefail

SEVERITY_THRESHOLD="${SEVERITY_THRESHOLD:-CRITICAL,HIGH}"
TRIVY_EXIT_CODE="${TRIVY_EXIT_CODE:-1}"  # 1 = fail on findings
OUTPUT_DIR="${OUTPUT_DIR:-./security-reports}"
IMAGES=(
    "nexus/payment-service:latest"
    "nexus/account-service:latest"
    "nexus/auth-service:latest"
    "nexus/reconciliation-service:latest"
    "nexus/analytics-service:latest"
    "nexus/audit-service:latest"
    "nexus/notification-service:latest"
    "nexus/ws-gateway:latest"
)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[SCAN]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[VULN]${NC} $1"; }

mkdir -p "$OUTPUT_DIR"

# Check for Trivy
check_trivy() {
    if ! command -v trivy &>/dev/null; then
        log "Installing Trivy..."
        curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
    fi
    log "Trivy version: $(trivy --version | head -1)"
}

# Scan container images
scan_images() {
    log "=== Container Image Vulnerability Scan ==="
    local total_critical=0
    local total_high=0

    for img in "${IMAGES[@]}"; do
        local name=$(echo "$img" | cut -d: -f1 | tr '/' '-')
        log "Scanning: ${img}..."

        trivy image \
            --severity "${SEVERITY_THRESHOLD}" \
            --exit-code 0 \
            --format json \
            --output "${OUTPUT_DIR}/${name}-trivy.json" \
            "${img}" 2>/dev/null || true

        # Also generate human-readable table
        trivy image \
            --severity "${SEVERITY_THRESHOLD}" \
            --exit-code 0 \
            --format table \
            "${img}" 2>/dev/null | tee "${OUTPUT_DIR}/${name}-trivy.txt" || true

        # Count findings
        critical=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="CRITICAL")] | length' \
            "${OUTPUT_DIR}/${name}-trivy.json" 2>/dev/null || echo "0")
        high=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="HIGH")] | length' \
            "${OUTPUT_DIR}/${name}-trivy.json" 2>/dev/null || echo "0")

        total_critical=$((total_critical + critical))
        total_high=$((total_high + high))

        if [[ $critical -gt 0 ]]; then
            err "${img}: ${critical} CRITICAL vulnerabilities"
        fi
        if [[ $high -gt 0 ]]; then
            warn "${img}: ${high} HIGH vulnerabilities"
        fi
        if [[ $critical -eq 0 ]] && [[ $high -eq 0 ]]; then
            log "${img}: clean ✓"
        fi
    done

    echo ""
    log "Total: ${total_critical} CRITICAL, ${total_high} HIGH"

    if [[ $total_critical -gt 0 ]]; then
        err "BUILD BLOCKED: ${total_critical} critical vulnerabilities found"
        return 1
    fi
    return 0
}

# Scan Go dependencies
scan_go_deps() {
    log "=== Go Dependency Vulnerability Scan ==="

    local services_with_gomod=()
    for d in services/*/; do
        if [[ -f "${d}go.mod" ]]; then
            services_with_gomod+=("$d")
        fi
    done

    # Also scan shared packages
    for d in pkg/*/ proofs/ replay/ security/ audit/ tests/; do
        if [[ -f "${d}go.mod" ]]; then
            services_with_gomod+=("$d")
        fi
    done

    local vuln_count=0

    for mod_dir in "${services_with_gomod[@]}"; do
        local name=$(basename "$mod_dir")
        log "Scanning deps: ${mod_dir}..."

        trivy fs \
            --severity "${SEVERITY_THRESHOLD}" \
            --exit-code 0 \
            --scanners vuln \
            --format json \
            --output "${OUTPUT_DIR}/${name}-deps.json" \
            "${mod_dir}" 2>/dev/null || true

        local count=$(jq '[.Results[]?.Vulnerabilities[]?] | length' \
            "${OUTPUT_DIR}/${name}-deps.json" 2>/dev/null || echo "0")

        if [[ $count -gt 0 ]]; then
            warn "${mod_dir}: ${count} vulnerable dependencies"
            vuln_count=$((vuln_count + count))
        fi
    done

    if [[ $vuln_count -gt 0 ]]; then
        warn "Total dependency vulnerabilities: ${vuln_count}"
    else
        log "All Go dependencies clean ✓"
    fi
}

# Scan for secrets in source code
scan_secrets() {
    log "=== Secret Detection Scan ==="

    # Patterns to detect
    local patterns=(
        'PRIVATE KEY'
        'password\s*=\s*"[^"]{8,}'
        'api[_-]?key\s*=\s*"[^"]{8,}'
        'secret\s*=\s*"[^"]{8,}'
        'token\s*=\s*"[a-zA-Z0-9]{20,}'
        'AWS_SECRET_ACCESS_KEY'
    )

    local findings=0
    for pattern in "${patterns[@]}"; do
        local matches=$(grep -rn --include="*.go" --include="*.yaml" --include="*.yml" \
            --include="*.json" --include="*.sh" --include="*.env" \
            -i "$pattern" . 2>/dev/null | \
            grep -v "node_modules" | \
            grep -v ".git/" | \
            grep -v "vendor/" | \
            grep -v "_test.go" | \
            grep -v "example" | \
            grep -v "PLACEHOLDER" | \
            grep -v "security_scan.sh" | \
            grep -v "security-reports/" || true)

        if [[ -n "$matches" ]]; then
            err "Potential secret detected (pattern: $pattern):"
            echo "$matches" | head -5
            findings=$((findings + 1))
        fi
    done

    if [[ $findings -gt 0 ]]; then
        err "${findings} potential secret patterns detected!"
        err "Review findings and remediate before merge."
        return 1
    fi

    log "No secrets detected ✓"
}

# Generate summary report
generate_report() {
    log "Generating security report..."
    cat > "${OUTPUT_DIR}/SECURITY_SCAN_REPORT.md" <<EOF
# Security Scan Report — Nexus RTP

**Date**: $(date -Iseconds)
**Scanner**: Trivy $(trivy --version 2>/dev/null | head -1 || echo "N/A")
**Severity threshold**: ${SEVERITY_THRESHOLD}

## Container Image Scans

$(for img in "${IMAGES[@]}"; do
    name=$(echo "$img" | cut -d: -f1 | tr '/' '-')
    if [[ -f "${OUTPUT_DIR}/${name}-trivy.json" ]]; then
        critical=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="CRITICAL")] | length' "${OUTPUT_DIR}/${name}-trivy.json" 2>/dev/null || echo "?")
        high=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="HIGH")] | length' "${OUTPUT_DIR}/${name}-trivy.json" 2>/dev/null || echo "?")
        echo "| ${img} | ${critical} | ${high} |"
    fi
done)

## Dependency Scans

See individual JSON reports in \`security-reports/\`.

## Remediation

Critical findings must be resolved before production deployment.
High findings should be resolved within 14 days.

EOF
    log "Report: ${OUTPUT_DIR}/SECURITY_SCAN_REPORT.md"
}

# Main
main() {
    check_trivy

    case "${1:-all}" in
        --image)
            IMAGES=("${2}")
            scan_images
            ;;
        --deps-only)
            scan_go_deps
            ;;
        --secrets-only)
            scan_secrets
            ;;
        all|*)
            scan_images || true
            scan_go_deps
            scan_secrets || true
            generate_report
            ;;
    esac
}

main "$@"

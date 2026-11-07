#!/bin/bash
# PAN (Payment Card Number) and Secrets Scanner
# This script scans the repository for sensitive data patterns

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=============================================="
echo "Nexus RTP Platform - Security Scanner"
echo "=============================================="

ERRORS=0
WARNINGS=0

# Scan the staged repository contents, including all supported source/config types.
# Ignored local files and dependency/build directories are outside the commit.
EXCLUDE_DIRS="(^|/)(node_modules|vendor|\.git|bin|dist|target|\.idea|storybook-static)/"
tracked_scan() {
  git grep --cached -I -n -E "$1" -- \
    '*.go' '*.java' '*.py' '*.js' '*.ts' '*.tsx' '*.mjs' '*.cjs' \
    '*.json' '*.yml' '*.yaml' '*.xml' '*.sql' '*.env' '*.pem' '*.key' '*.p12'
}

# ============================================================
# 1. Scan for Credit Card PANs (Luhn-valid 13-19 digit numbers)
# ============================================================
echo -e "\n${YELLOW}[1/6] Scanning for potential credit card numbers...${NC}"

# Common test card patterns that are OK
TEST_CARDS="4111111111111111|5500000000000004|378282246310005|6011111111111117|3530111333300000"

# Look for 13-19 digit numbers that could be PANs
PAN_MATCHES=$(tracked_scan '\b[0-9]{13,19}\b' 2>/dev/null | grep -vE "$EXCLUDE_DIRS" | grep -vE "$TEST_CARDS" | grep -vE "uuid|timestamp|nano|millisecond|maxAmount|MaxAmount|NewFromFloat|decimal\.New" || true)

if [ -n "$PAN_MATCHES" ]; then
  echo -e "${YELLOW}WARNING: Potential card numbers found (review manually):${NC}"
  echo "$PAN_MATCHES" | head -10
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${GREEN}✓ No suspicious card number patterns found${NC}"
fi

# ============================================================
# 2. Scan for Private Keys
# ============================================================
echo -e "\n${YELLOW}[2/6] Scanning for private keys...${NC}"

PRIVATE_KEY_MATCHES=$(tracked_scan 'BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY' 2>/dev/null | grep -vE "$EXCLUDE_DIRS" | grep -vE "infra/mtls/certs/|services/auth-service/keys/dev_" || true)

if [ -n "$PRIVATE_KEY_MATCHES" ]; then
  echo -e "${RED}ERROR: Private keys found in repository:${NC}"
  echo "$PRIVATE_KEY_MATCHES"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✓ No private keys found${NC}"
fi

# ============================================================
# 3. Scan for AWS Credentials
# ============================================================
echo -e "\n${YELLOW}[3/6] Scanning for AWS credentials...${NC}"

AWS_KEY_MATCHES=$(tracked_scan 'AKIA[0-9A-Z]{16}' 2>/dev/null | grep -vE "$EXCLUDE_DIRS" || true)

if [ -n "$AWS_KEY_MATCHES" ]; then
  echo -e "${RED}ERROR: AWS access keys found:${NC}"
  echo "$AWS_KEY_MATCHES"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✓ No AWS access keys found${NC}"
fi

# ============================================================
# 4. Scan for Generic API Keys/Secrets
# ============================================================
echo -e "\n${YELLOW}[4/6] Scanning for hardcoded secrets...${NC}"

SECRET_PATTERNS='(api[_-]?key|apikey|secret[_-]?key|secretkey|password|passwd|pwd|token|auth[_-]?token)\s*[:=]\s*["\x27][a-zA-Z0-9_\-]{16,}["\x27]'

SECRET_MATCHES=$(tracked_scan "$SECRET_PATTERNS" 2>/dev/null | grep -vE "$EXCLUDE_DIRS" | grep -vE "example|sample|placeholder|your[-_]|_test\.go|REPLACE_WITH_" || true)

if [ -n "$SECRET_MATCHES" ]; then
  echo -e "${YELLOW}WARNING: Potential hardcoded secrets found (review manually):${NC}"
  echo "$SECRET_MATCHES" | head -10
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${GREEN}✓ No obvious hardcoded secrets found${NC}"
fi

# ============================================================
# 5. Scan for Database Connection Strings with Passwords
# ============================================================
echo -e "\n${YELLOW}[5/6] Scanning for database passwords in connection strings...${NC}"

DB_CONN_MATCHES=$(tracked_scan '(postgres|mysql|mongodb|redis)://[^:]+:[^@]+@' 2>/dev/null | grep -vE "$EXCLUDE_DIRS" | grep -vE "localhost|127\.0\.0\.1|root:@|:@" || true)

if [ -n "$DB_CONN_MATCHES" ]; then
  echo -e "${YELLOW}WARNING: Database connection strings with credentials found:${NC}"
  echo "$DB_CONN_MATCHES" | head -10
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${GREEN}✓ No exposed database credentials found${NC}"
fi

# ============================================================
# 6. Scan for JWT Secrets
# ============================================================
echo -e "\n${YELLOW}[6/6] Scanning for JWT tokens/secrets...${NC}"

JWT_MATCHES=$(tracked_scan 'eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*' 2>/dev/null | grep -vE "$EXCLUDE_DIRS" || true)

if [ -n "$JWT_MATCHES" ]; then
  echo -e "${YELLOW}WARNING: JWT tokens found (ensure these are test tokens only):${NC}"
  echo "$JWT_MATCHES" | head -5
  WARNINGS=$((WARNINGS + 1))
else
  echo -e "${GREEN}✓ No JWT tokens found${NC}"
fi

# ============================================================
# Summary
# ============================================================
echo -e "\n=============================================="
echo "SCAN COMPLETE"
echo "=============================================="
echo -e "Errors:   ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"

if [ $ERRORS -gt 0 ]; then
  echo -e "\n${RED}❌ FAILED: Critical security issues found. Fix before committing.${NC}"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo -e "\n${YELLOW}⚠ PASSED with warnings: Review flagged items manually.${NC}"
  exit 0
else
  echo -e "\n${GREEN}✓ PASSED: No security issues detected.${NC}"
  exit 0
fi

#!/usr/bin/env bash
#
# verify-local.sh - Verify local development environment
#
# Usage: ./scripts/verify-local.sh
#

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           Nexus RTP Local Environment Verification           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"

# Check if frontend is running
echo -e "${YELLOW}[1/5] Checking frontend...${NC}"
if curl -sI --max-time 3 "$FRONTEND_URL" > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Frontend is running at $FRONTEND_URL${NC}"
else
    echo -e "  ${RED}✗ Frontend not reachable at $FRONTEND_URL${NC}"
    echo "    Run: pnpm --filter @nexus/web dev"
fi

# Check manifest.json
echo -e "${YELLOW}[2/5] Checking manifest.json...${NC}"
if curl -sI --max-time 3 "$FRONTEND_URL/manifest.json" | grep -q "200\|304"; then
    echo -e "  ${GREEN}✓ manifest.json is accessible${NC}"
else
    echo -e "  ${RED}✗ manifest.json not found${NC}"
    echo "    Ensure public/manifest.json exists"
fi

# Check favicon
echo -e "${YELLOW}[3/5] Checking favicon...${NC}"
if curl -sI --max-time 3 "$FRONTEND_URL/favicon.svg" | grep -q "200\|304"; then
    echo -e "  ${GREEN}✓ favicon.svg is accessible${NC}"
elif curl -sI --max-time 3 "$FRONTEND_URL/favicon.ico" | grep -q "200\|304"; then
    echo -e "  ${GREEN}✓ favicon.ico is accessible${NC}"
else
    echo -e "  ${RED}✗ No favicon found${NC}"
    echo "    Add favicon.svg or favicon.ico to public/"
fi

# Check backend
echo -e "${YELLOW}[4/5] Checking backend...${NC}"
if curl -sS --max-time 3 "$BACKEND_URL/" > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Backend is running at $BACKEND_URL${NC}"
else
    echo -e "  ${RED}✗ Backend not reachable at $BACKEND_URL${NC}"
    echo "    Run mock: cd frontend/dev-mock && npm install && npm start"
fi

# Check NextAuth endpoints
echo -e "${YELLOW}[5/5] Checking NextAuth...${NC}"
if curl -sI --max-time 3 "$FRONTEND_URL/api/auth/providers" | grep -q "200"; then
    echo -e "  ${GREEN}✓ NextAuth providers endpoint is accessible${NC}"
else
    echo -e "  ${RED}✗ NextAuth not configured correctly${NC}"
    echo "    Check .env.local for NEXTAUTH_URL and NEXTAUTH_SECRET"
fi

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "Verification complete."
echo ""
echo "Quick fixes:"
echo "  1. Start frontend: pnpm --filter @nexus/web dev"
echo "  2. Start mock backend: cd frontend/dev-mock && npm start"
echo "  3. Set env vars in frontend/apps/web/.env.local"
echo ""

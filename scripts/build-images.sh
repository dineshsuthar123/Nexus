#!/bin/bash
# Build and optionally push all container images for the Nexus RTP Platform
# Usage:
#   ./scripts/build-images.sh                     # build only, tag as 'latest'
#   ./scripts/build-images.sh v1.0.0              # build + tag with version
#   ./scripts/build-images.sh v1.0.0 --push       # build + tag + push to registry
#
# Environment variables:
#   REGISTRY  - Container registry (default: registry.nexus-rtp.internal)

set -euo pipefail

VERSION="${1:-latest}"
PUSH="${2:-}"
REGISTRY="${REGISTRY:-registry.nexus-rtp.internal}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── Go backend services (require repo-root context for pkg/ shared libs) ──
GO_SERVICES=(
  payment-service
  account-service
  reconciliation-service
  auth-service
  notification-service
  ws-gateway
  analytics-service
  audit-service
)

# ── Frontend (context is frontend/) ──
FRONTEND="frontend"

# ── Flink fraud-detection (Java, context is flink-jobs/fraud-detection/) ──
FLINK="flink-jobs/fraud-detection"

TOTAL=0
FAILED=0

build_image() {
  local name="$1"
  local context="$2"
  local dockerfile="$3"
  local full_tag="${REGISTRY}/nexus/${name}:${VERSION}"

  echo -e "\n${YELLOW}Building ${name} → ${full_tag}${NC}"
  if docker build -t "$full_tag" -f "$dockerfile" "$context"; then
    echo -e "${GREEN}✓ ${name} built successfully${NC}"
    # Also tag as latest if version specified
    if [ "$VERSION" != "latest" ]; then
      docker tag "$full_tag" "${REGISTRY}/nexus/${name}:latest"
    fi
  else
    echo -e "${RED}✗ ${name} FAILED${NC}"
    FAILED=$((FAILED + 1))
  fi
  TOTAL=$((TOTAL + 1))
}

push_image() {
  local name="$1"
  local full_tag="${REGISTRY}/nexus/${name}:${VERSION}"
  echo -e "${YELLOW}Pushing ${full_tag}${NC}"
  docker push "$full_tag"
  if [ "$VERSION" != "latest" ]; then
    docker push "${REGISTRY}/nexus/${name}:latest"
  fi
}

echo "=============================================="
echo "Nexus RTP Platform — Container Image Builder"
echo "=============================================="
echo "Registry: ${REGISTRY}"
echo "Version:  ${VERSION}"
echo "Push:     ${PUSH:-no}"
echo ""

# Build Go services (all use repo root context)
for svc in "${GO_SERVICES[@]}"; do
  if [ -f "services/${svc}/Dockerfile" ]; then
    build_image "$svc" "." "services/${svc}/Dockerfile"
  else
    echo -e "${RED}⚠ No Dockerfile for ${svc}${NC}"
    FAILED=$((FAILED + 1))
    TOTAL=$((TOTAL + 1))
  fi
done

# Build Frontend
if [ -f "${FRONTEND}/Dockerfile" ]; then
  build_image "frontend" "${FRONTEND}" "${FRONTEND}/Dockerfile"
fi

# Build Flink fraud-detection (if Dockerfile exists)
if [ -f "${FLINK}/Dockerfile" ]; then
  build_image "fraud-detection" "${FLINK}" "${FLINK}/Dockerfile"
else
  echo -e "${YELLOW}⚠ No Dockerfile for fraud-detection — skipping${NC}"
fi

# Push if requested
if [ "$PUSH" = "--push" ]; then
  echo -e "\n${YELLOW}Pushing images to ${REGISTRY}...${NC}"
  for svc in "${GO_SERVICES[@]}"; do
    push_image "$svc"
  done
  push_image "frontend"
  if [ -f "${FLINK}/Dockerfile" ]; then
    push_image "fraud-detection"
  fi
fi

# Summary
echo -e "\n=============================================="
echo "BUILD COMPLETE"
echo "=============================================="
echo -e "Total:  ${TOTAL}"
echo -e "Failed: ${FAILED}"

if [ "$FAILED" -gt 0 ]; then
  echo -e "${RED}❌ ${FAILED} image(s) failed to build${NC}"
  exit 1
else
  echo -e "${GREEN}✓ All images built successfully${NC}"
fi

#!/bin/bash
# Re-tag staging images with a production release version
# This bridges the gap between staging (staging-<sha>) and production (v1.x.x) tags
#
# Usage:
#   ./scripts/promote-images.sh <staging-tag> <release-version>
#   ./scripts/promote-images.sh staging-abc1234 v1.0.0
#
# Environment:
#   REGISTRY - Container registry (default: registry.nexus-rtp.internal)

set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <staging-tag> <release-version>"
  echo "Example: $0 staging-abc1234 v1.0.0"
  exit 1
fi

STAGING_TAG="$1"
RELEASE_VERSION="$2"
REGISTRY="${REGISTRY:-registry.nexus-rtp.internal}"

SERVICES=(
  payment-service
  account-service
  reconciliation-service
  auth-service
  notification-service
  ws-gateway
  analytics-service
  audit-service
  frontend
)

echo "=============================================="
echo "Nexus RTP — Promote Staging → Production"
echo "=============================================="
echo "From: ${STAGING_TAG}"
echo "To:   ${RELEASE_VERSION}"
echo "Registry: ${REGISTRY}"
echo ""

FAILED=0

for svc in "${SERVICES[@]}"; do
  SRC="${REGISTRY}/nexus/${svc}:${STAGING_TAG}"
  DST="${REGISTRY}/nexus/${svc}:${RELEASE_VERSION}"
  echo -n "Promoting ${svc}... "

  if docker pull "$SRC" 2>/dev/null && \
     docker tag "$SRC" "$DST" && \
     docker push "$DST" 2>/dev/null; then
    echo "✓"
  else
    echo "✗ FAILED"
    FAILED=$((FAILED + 1))
  fi
done

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo "❌ ${FAILED} image(s) failed to promote"
  exit 1
else
  echo ""
  echo "✓ All images promoted to ${RELEASE_VERSION}"
fi

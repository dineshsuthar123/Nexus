#!/usr/bin/env bash
# compute-release-hashes.sh — Fill PLACEHOLDER hashes in docs/release_manifest.json
# Usage: ./scripts/compute-release-hashes.sh
#
# Reads docs/release_manifest.json, computes SHA-256 for every listed file,
# and writes the updated manifest back (in-place). Exits non-zero if any
# listed file is missing.
set -euo pipefail

MANIFEST="docs/release_manifest.json"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

if [[ ! -f "$MANIFEST" ]]; then
  echo "ERROR: $MANIFEST not found (run from repo root)" >&2
  exit 1
fi

# Require jq for JSON manipulation
if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not installed" >&2
  exit 1
fi

ERRORS=0
UPDATED=0
TOTAL=$(jq '.files | length' "$MANIFEST")

echo "=== Release Manifest Hash Computation ==="
echo "Manifest: $MANIFEST"
echo "Files:    $TOTAL"
echo ""

# Build updated manifest
TMP=$(mktemp)
cp "$MANIFEST" "$TMP"

for i in $(seq 0 $((TOTAL - 1))); do
  FILE_PATH=$(jq -r ".files[$i].path" "$MANIFEST")

  if [[ ! -f "$FILE_PATH" ]]; then
    echo "  MISSING: $FILE_PATH"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  HASH=$(sha256sum "$FILE_PATH" | cut -d' ' -f1)
  # Update the hash in the temp copy
  TMP2=$(mktemp)
  jq ".files[$i].sha256 = \"$HASH\"" "$TMP" > "$TMP2"
  mv "$TMP2" "$TMP"

  UPDATED=$((UPDATED + 1))
  echo "  OK: $FILE_PATH -> ${HASH:0:16}..."
done

# Update generated_at timestamp
TMP2=$(mktemp)
jq ".generated_at = \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"" "$TMP" > "$TMP2"
mv "$TMP2" "$TMP"

# Write back
mv "$TMP" "$MANIFEST"

echo ""
echo "Updated: $UPDATED / $TOTAL"
if [[ $ERRORS -gt 0 ]]; then
  echo "ERRORS:  $ERRORS file(s) missing — hashes left as PLACEHOLDER"
  exit 1
fi

echo "All hashes computed successfully."
echo "Remember to commit docs/release_manifest.json"

#!/bin/bash
# generate_whitepaper_release.sh
# 
# This script generates release artifacts for the Nexus RTP whitepaper.
# It renders the whitepaper to HTML (if pandoc is available) and creates
# a manifest with SHA256 checksums of all created files.
#
# Usage: ./scripts/generate_whitepaper_release.sh
#
# Requirements:
#   - bash
#   - sha256sum (or shasum on macOS)
#   - pandoc (optional, for HTML generation)
#
# Exit codes:
#   0 - Success
#   1 - Error

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCS_DIR="$REPO_ROOT/docs"

echo "=== Nexus RTP Whitepaper Release Generator ==="
echo "Repository root: $REPO_ROOT"
echo ""

# Files to include in manifest
WHITEPAPER_FILES=(
    "docs/whitepaper.md"
    "docs/executive_onepager.md"
    "docs/p0_gaps.md"
    "docs/roadmap_budget.csv"
    "docs/appendix/invariants_formal.md"
    "docs/appendix/property_tests.md"
    "docs/appendix/replay_cli.md"
    "docs/appendix/audit_bundle_example.json"
    "docs/appendix/mermaid_diagrams.md"
    "docs/appendix/example_test_output.txt"
    "docs/appendix/replay_digest_sample.txt"
)

# Check for sha256sum command
if command -v sha256sum &> /dev/null; then
    SHA_CMD="sha256sum"
elif command -v shasum &> /dev/null; then
    SHA_CMD="shasum -a 256"
else
    echo "ERROR: Neither sha256sum nor shasum found"
    exit 1
fi

echo "Using hash command: $SHA_CMD"
echo ""

# Generate HTML if pandoc is available
echo "=== Step 1: Generate HTML (if pandoc available) ==="
if command -v pandoc &> /dev/null; then
    echo "pandoc found, generating HTML..."
    pandoc "$DOCS_DIR/whitepaper.md" \
        -o "$DOCS_DIR/whitepaper.html" \
        --standalone \
        --toc \
        --toc-depth=3 \
        --metadata title="Nexus RTP Platform: Technical Whitepaper" \
        --metadata author="Nexus RTP Engineering" \
        --metadata date="$(date +%Y-%m-%d)" \
        -f markdown+tex_math_dollars \
        || echo "WARNING: pandoc failed, skipping HTML generation"
    
    if [ -f "$DOCS_DIR/whitepaper.html" ]; then
        echo "Generated: docs/whitepaper.html"
        WHITEPAPER_FILES+=("docs/whitepaper.html")
    fi
else
    echo "pandoc not found - skipping HTML generation"
    echo ""
    echo "To generate HTML, install pandoc:"
    echo "  Ubuntu/Debian: sudo apt-get install pandoc"
    echo "  macOS:         brew install pandoc"
    echo "  Windows:       choco install pandoc"
    echo ""
fi
echo ""

# Generate manifest
echo "=== Step 2: Generate Release Manifest ==="
MANIFEST_FILE="$DOCS_DIR/release_manifest.json"

echo "{" > "$MANIFEST_FILE"
echo '  "generated_at": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",\n' >> "$MANIFEST_FILE"
echo '  "generator": "generate_whitepaper_release.sh",' >> "$MANIFEST_FILE"
echo '  "files": [' >> "$MANIFEST_FILE"

FIRST=true
for file in "${WHITEPAPER_FILES[@]}"; do
    FULL_PATH="$REPO_ROOT/$file"
    if [ -f "$FULL_PATH" ]; then
        HASH=$($SHA_CMD "$FULL_PATH" | cut -d' ' -f1)
        
        if [ "$FIRST" = true ]; then
            FIRST=false
        else
            echo "," >> "$MANIFEST_FILE"
        fi
        
        printf '    {"path": "%s", "sha256": "%s"}' "$file" "$HASH" >> "$MANIFEST_FILE"
        echo "  ✓ $file"
    else
        echo "  ✗ $file (not found)"
    fi
done

echo "" >> "$MANIFEST_FILE"
echo "  ]" >> "$MANIFEST_FILE"
echo "}" >> "$MANIFEST_FILE"

echo ""
echo "Generated: docs/release_manifest.json"
echo ""

# Verify manifest is valid JSON (if jq available)
if command -v jq &> /dev/null; then
    echo "=== Step 3: Validate Manifest JSON ==="
    if jq . "$MANIFEST_FILE" > /dev/null 2>&1; then
        echo "Manifest JSON is valid ✓"
    else
        echo "WARNING: Manifest JSON may be malformed"
    fi
    echo ""
fi

# Summary
echo "=== Release Summary ==="
echo "Files included: ${#WHITEPAPER_FILES[@]}"
echo "Manifest: docs/release_manifest.json"

if command -v pandoc &> /dev/null; then
    echo "HTML output: docs/whitepaper.html"
else
    echo "HTML output: (skipped - pandoc missing)"
fi

echo ""
echo "Done!"
exit 0

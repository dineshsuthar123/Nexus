#!/usr/bin/env bash
# =============================================================================
# Nexus RTP — Locust Performance Test Runner
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"
LOCUSTFILE="$SCRIPT_DIR/locustfile.py"
HOST="${NEXUS_HOST:-http://localhost:8000}"

mkdir -p "$RESULTS_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
HTML_REPORT="$RESULTS_DIR/report_${TIMESTAMP}.html"
CSV_PREFIX="$RESULTS_DIR/metrics_${TIMESTAMP}"

# ── Parse args ───────────────────────────────────────────────────────────────
USERS="${1:-50}"        # concurrent virtual users
SPAWN_RATE="${2:-5}"    # users spawned per second
RUN_TIME="${3:-2m}"     # test duration

echo ""
echo "======================================================"
echo "  Nexus RTP — Locust Performance Test"
echo "======================================================"
echo "  Host       : $HOST"
echo "  Users      : $USERS"
echo "  Spawn rate : $SPAWN_RATE/s"
echo "  Duration   : $RUN_TIME"
echo "  HTML report: $HTML_REPORT"
echo "  CSV prefix : $CSV_PREFIX"
echo "======================================================"
echo ""

# ── Check locust is installed ────────────────────────────────────────────────
if ! command -v locust &>/dev/null; then
  echo "📦 Locust not found — installing..."
  pip install locust --quiet
fi

# ── Run headless ─────────────────────────────────────────────────────────────
locust \
  -f "$LOCUSTFILE" \
  --headless \
  --users "$USERS" \
  --spawn-rate "$SPAWN_RATE" \
  --run-time "$RUN_TIME" \
  --host "$HOST" \
  --html "$HTML_REPORT" \
  --csv  "$CSV_PREFIX" \
  --csv-full-history

echo ""
echo "======================================================"
echo "  Reports saved:"
echo "    HTML → $HTML_REPORT"
echo "    CSV  → ${CSV_PREFIX}_stats.csv"
echo "    CSV  → ${CSV_PREFIX}_stats_history.csv"
echo "======================================================"

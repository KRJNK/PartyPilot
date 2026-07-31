#!/usr/bin/env bash
#
# PartyPilot API Integration Test Runner
#
# Prerequisites:
#   1. Docker PostgreSQL running on port 5434
#   2. dev_server.py running on port 8000
#
# Usage:
#   ./tests/run_tests.sh              # run all tests
#   ./tests/run_tests.sh -k auth      # run only auth tests
#   ./tests/run_tests.sh -v           # verbose output
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

cd "$REPO_DIR"

echo ""
echo "  PartyPilot API — Integration Test Suite"
echo "  ─────────────────────────────────────────"
echo ""

# Check API server is up
if ! curl -s --max-time 3 http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "  [ERROR] API server not reachable at http://localhost:8000"
    echo "  Start it with:"
    echo "    systemd-run --user --unit=partypilot-api \\"
    echo "      --working-directory=$REPO_DIR \\"
    echo "      python3 -u dev_server.py"
    echo ""
    exit 1
fi

echo "  API server: OK"
echo "  Running: pytest tests/ $*"
echo "  ─────────────────────────────────────────"
echo ""

python3 -m pytest tests/ "$@"

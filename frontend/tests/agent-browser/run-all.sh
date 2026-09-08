#!/bin/bash
# Run all agent-browser smoke tests
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED=0
PASSED=0
SMOKE_SESSION_PREFIX="${AGENT_BROWSER_SESSION:-test-breadwinner-smoke}-$$"

echo "================================"
echo "Agent-Browser Smoke Tests"
echo "================================"
echo ""

# Check agent-browser is installed
if ! command -v agent-browser &> /dev/null; then
  echo "Error: agent-browser not installed"
  echo "Install with: npm install -g agent-browser && agent-browser install"
  exit 1
fi

run_test() {
  local test_name="$1"
  local test_script="$2"

  echo "----------------------------------------"
  echo "Running: $test_name"
  echo "----------------------------------------"

  if AGENT_BROWSER_SESSION="${SMOKE_SESSION_PREFIX}-${PASSED}-${FAILED}" bash "$test_script"; then
    echo ""
    PASSED=$((PASSED + 1))
  else
    echo ""
    echo "FAILED: $test_name"
    FAILED=$((FAILED + 1))
  fi
}

# Run tests
run_test "Login Page" "$SCRIPT_DIR/smoke-login.sh"

# Only run auth tests if credentials provided
if [[ -n "$TEST_EMAIL" && -n "$TEST_PASSWORD" ]]; then
  run_test "Authentication" "$SCRIPT_DIR/smoke-auth.sh"
  run_test "Brand Scrapes" "$SCRIPT_DIR/smoke-brand-scrapes.sh"
else
  echo ""
  echo "Skipping auth tests (set TEST_EMAIL and TEST_PASSWORD)"
fi

echo ""
echo "================================"
echo "Results: $PASSED passed, $FAILED failed"
echo "================================"

if [[ $FAILED -gt 0 ]]; then
  exit 1
fi

#!/bin/bash
# Smoke test: Login page loads correctly
set -e
trap 'agent-browser close >/dev/null 2>&1' EXIT

BASE_URL="${BASE_URL:-http://localhost:5173}"

echo "Testing: Login page loads"
agent-browser open "$BASE_URL/login"
agent-browser wait 'input[type="email"]'

# Get snapshot and verify elements exist
SNAPSHOT=$(agent-browser snapshot)

if echo "$SNAPSHOT" | grep -qi "email"; then
  echo "✓ Email input found"
else
  echo "✗ Email input not found"
  agent-browser screenshot /tmp/login-fail.png
  exit 1
fi

if echo "$SNAPSHOT" | grep -qi "password"; then
  echo "✓ Password input found"
else
  echo "✗ Password input not found"
  exit 1
fi

if echo "$SNAPSHOT" | grep -q -i "sign in\|log in\|submit"; then
  echo "✓ Submit button found"
else
  echo "✗ Submit button not found"
  exit 1
fi

echo "✓ Login page smoke test passed"

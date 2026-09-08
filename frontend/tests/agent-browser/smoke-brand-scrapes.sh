#!/bin/bash
# Smoke test: Brand scrapes page after login
set -e
trap 'agent-browser close >/dev/null 2>&1' EXIT

BASE_URL="${BASE_URL:-http://localhost:5173}"
TEST_EMAIL="${TEST_EMAIL:?Set TEST_EMAIL env var}"
TEST_PASSWORD="${TEST_PASSWORD:?Set TEST_PASSWORD env var}"

echo "Testing: Brand scrapes page"

# Login first
agent-browser open "$BASE_URL/login"
agent-browser wait 'input[type="email"]'
agent-browser fill 'input[type="email"]' "$TEST_EMAIL"
agent-browser fill 'input[type="password"]' "$TEST_PASSWORD"
agent-browser click 'button[type="submit"]'
agent-browser wait --text "Dashboard"

# Navigate to brand scrapes
agent-browser open "$BASE_URL/research/brand-scrapes"
agent-browser wait --text "Scrape Brand Ads"

# Verify page loaded
HEADING=$(agent-browser get text h1)

if echo "$HEADING" | grep -q "Scrape Brand Ads"; then
  echo "✓ Brand scrapes page loaded"
else
  echo "✗ Brand scrapes page not found"
  agent-browser screenshot /tmp/brand-scrapes-fail.png
  exit 1
fi

# Check for form inputs
if agent-browser wait 'input[placeholder*="Nike"]' && agent-browser wait 'input[placeholder*="123456789"]'; then
  echo "✓ Form inputs found"
else
  echo "✗ Form inputs not found"
  exit 1
fi

agent-browser screenshot /tmp/brand-scrapes-success.png
echo "✓ Brand scrapes smoke test passed"

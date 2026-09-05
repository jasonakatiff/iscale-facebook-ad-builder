#!/usr/bin/env bash
# validate-plan.sh — Hard gate for plan implementation readiness
# Usage: bash .claude/scripts/validate-plan.sh <plan-slug>

set -uo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

# Project root (two levels up from this script)
PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"

PASSED=0
TOTAL=4

pass() { echo -e "  ${GREEN}\xe2\x9c\x93${NC} $1"; PASSED=$((PASSED + 1)); }
fail() { echo -e "  ${RED}\xe2\x9c\x97${NC} $1"; }

# --- Argument check ---
if [ $# -lt 1 ]; then
  echo -e "${BOLD}Usage:${NC} validate-plan.sh <plan-slug>"
  echo "Example: validate-plan.sh client-campaign-schema"
  exit 1
fi

SLUG="$1"
PLAN_FILE="$PROJECT_ROOT/.claude/plans/${SLUG}.md"

echo -e "\n${BOLD}Validating plan: ${SLUG}${NC}\n"

# --- Check 1: Plan file exists ---
if [ -f "$PLAN_FILE" ]; then
  pass "Plan file found"
else
  fail "Plan file not found at .claude/plans/${SLUG}.md"
  echo -e "\nChecks: 0/${TOTAL} passed"
  echo -e "\n${RED}\xe2\x9d\x8c Plan validation failed. Fix the above issues before implementing.${NC}"
  exit 1
fi

# --- Check 2: Plan has test phase ---
if grep -qi -E '(phase\s*0|write\s*tests|write\s*all\s*tests)' "$PLAN_FILE" 2>/dev/null; then
  pass "Test phase found in plan"
else
  fail "No test phase (Phase 0 / Write Tests) found in plan"
fi

# --- Check 3: Plan status is at least tests-written ---
STATUS_LINE=$(grep -i '^Status:' "$PLAN_FILE" | head -1 || true)
if [ -z "$STATUS_LINE" ]; then
  fail "No Status: line found in plan file"
else
  STATUS=$(echo "$STATUS_LINE" | sed 's/^[Ss]tatus:[[:space:]]*//' | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
  case "$STATUS" in
    tests-written|tests_written|testswritten|in-progress|in_progress|inprogress|complete|completed)
      pass "Plan status: $(echo "$STATUS_LINE" | sed 's/^[Ss]tatus:[[:space:]]*//')"
      ;;
    planning)
      fail "Plan status is \"planning\" -- tests must be written first"
      ;;
    *)
      fail "Unknown plan status: \"$STATUS\" -- expected tests-written, in-progress, or complete"
      ;;
  esac
fi

# --- Check 4: Test files exist ---
# Extract key words from slug for fuzzy matching
SLUG_WORDS=$(echo "$SLUG" | tr '-' '\n')

# Build search dirs (support monorepo: apps/*/tests + apps/*/src, or root tests/src)
SEARCH_DIRS=("$PROJECT_ROOT/backend/tests")
if [ -d "$PROJECT_ROOT/apps" ]; then
  for d in "$PROJECT_ROOT"/apps/*/tests; do [ -d "$d" ] && SEARCH_DIRS+=("$d"); done
  for d in "$PROJECT_ROOT"/apps/*/src; do [ -d "$d" ] && SEARCH_DIRS+=("$d"); done
fi
[ -d "$PROJECT_ROOT/tests" ] && SEARCH_DIRS+=("$PROJECT_ROOT/tests")
[ -d "$PROJECT_ROOT/src" ] && SEARCH_DIRS+=("$PROJECT_ROOT/src")

# Search for .feature files
FEATURE_COUNT=0
for word in $SLUG_WORDS; do
  # Skip very short words (< 3 chars) to avoid false positives
  if [ ${#word} -lt 3 ]; then
    continue
  fi
  COUNT=$(find "${SEARCH_DIRS[@]}" -name "*.feature" -exec grep -li "$word" {} \; 2>/dev/null | wc -l | tr -d '[:space:]')
  if [ "$COUNT" -gt "$FEATURE_COUNT" ]; then
    FEATURE_COUNT=$COUNT
  fi
done
# Also check for files with slug words in the filename
for word in $SLUG_WORDS; do
  if [ ${#word} -lt 3 ]; then
    continue
  fi
  COUNT=$(find "${SEARCH_DIRS[@]}" -name "*${word}*.feature" 2>/dev/null | wc -l | tr -d '[:space:]')
  if [ "$COUNT" -gt "$FEATURE_COUNT" ]; then
    FEATURE_COUNT=$COUNT
  fi
done

# Search for test_*.py files
TEST_COUNT=0
for word in $SLUG_WORDS; do
  if [ ${#word} -lt 3 ]; then
    continue
  fi
  COUNT=$(find "${SEARCH_DIRS[@]}" -name "test_*${word}*.py" 2>/dev/null | wc -l | tr -d '[:space:]')
  if [ "$COUNT" -gt "$TEST_COUNT" ]; then
    TEST_COUNT=$COUNT
  fi
done
# Also search test file contents for slug words
for word in $SLUG_WORDS; do
  if [ ${#word} -lt 3 ]; then
    continue
  fi
  COUNT=$(find "${SEARCH_DIRS[@]}" -name "test_*.py" -exec grep -li "$word" {} \; 2>/dev/null | wc -l | tr -d '[:space:]')
  if [ "$COUNT" -gt "$TEST_COUNT" ]; then
    TEST_COUNT=$COUNT
  fi
done

if [ "$FEATURE_COUNT" -gt 0 ] && [ "$TEST_COUNT" -gt 0 ]; then
  pass "Found ${FEATURE_COUNT} .feature file(s), ${TEST_COUNT} test_*.py file(s)"
elif [ "$FEATURE_COUNT" -eq 0 ] && [ "$TEST_COUNT" -eq 0 ]; then
  fail "No test files found for this feature (need .feature + test_*.py)"
elif [ "$FEATURE_COUNT" -eq 0 ]; then
  fail "No .feature files found (found ${TEST_COUNT} test_*.py files)"
else
  fail "No test_*.py files found (found ${FEATURE_COUNT} .feature files)"
fi

# --- Summary ---
echo ""
echo -e "Checks: ${PASSED}/${TOTAL} passed"

if [ "$PASSED" -eq "$TOTAL" ]; then
  echo -e "\n${GREEN}\xe2\x9c\x85 Plan validated. Ready for implementation.${NC}"
  exit 0
else
  echo -e "\n${RED}\xe2\x9d\x8c Plan validation failed. Fix the above issues before implementing.${NC}"
  exit 1
fi

#!/usr/bin/env bash
# Python/backend adaptation of ~/.codex/scripts/validate-plan.sh.
set -euo pipefail

slug="${1:?Usage: validate-python-plan.sh <plan-slug>}"
plan=".claude/plans/${slug}.md"
passed=0
check() {
    if "$@"; then
        passed=$((passed + 1))
    else
        echo "Failed: $*" >&2
    fi
}

check test -f "$plan"
check rg -q 'Phase 0: Write Tests' "$plan"
check rg -q '^Status: (tests-written|in-progress|complete)$' "$plan"

# Match the feature prefix (pr3) in this repository's actual Python test tree.
prefix="${slug%%-*}"
if rg --files backend/tests -g "*${prefix}*.feature" | rg -q . &&
   rg --files backend/tests -g "test_*${prefix}*.py" | rg -q .; then
    passed=$((passed + 1))
else
    echo "Missing backend feature scenarios or Python tests for $slug" >&2
fi

echo "Checks: ${passed}/4 passed"
test "$passed" -eq 4

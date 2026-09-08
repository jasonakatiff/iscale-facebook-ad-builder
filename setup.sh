#!/usr/bin/env bash
# theLeadRouter — Ad Studio local setup. Credentials come from the process environment.
set -euo pipefail

setup_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
setup_mode="install"
case "${1:-}" in
    --check) setup_mode="check" ;;
    --skip-install) setup_mode="bootstrap" ;;
    --help|-h)
        cat <<'HELP'
theLeadRouter — Ad Studio local setup

./setup.sh                 Install dependencies and initialize the configured database
./setup.sh --check         Validate prerequisites/settings without writes or DB access
./setup.sh --skip-install  Initialize using already installed dependencies

Required process settings: DATABASE_URL, SECRET_KEY, OAUTH_TOKEN_ENCRYPTION_KEY.
First database initialization also requires ADMIN_EMAIL and ADMIN_PASSWORD.
AD_STUDIO_PYTHON optionally selects an existing Python 3.11+ interpreter.
No secret files are read, generated, copied, or overwritten by this script.
HELP
        exit 0 ;;
    "") ;;
    *) printf '%s\n' 'Unknown option. Run ./setup.sh --help.' >&2; exit 2 ;;
esac
if [[ $# -gt 1 ]]; then
    printf '%s\n' 'Pass at most one setup option.' >&2
    exit 2
fi

setup_python="${AD_STUDIO_PYTHON:-}"
if [[ -z "$setup_python" ]]; then
    if [[ -x "$setup_root/backend/venv/bin/python" ]]; then
        setup_python="$setup_root/backend/venv/bin/python"
    else
        setup_python="python3"
    fi
fi
if ! command -v "$setup_python" >/dev/null 2>&1; then
    printf '%s\n' 'Install Python 3.11+ or set AD_STUDIO_PYTHON to an existing interpreter.' >&2
    exit 2
fi
printf '%s\n' 'theLeadRouter — Ad Studio setup'
"$setup_python" "$setup_root/backend/scripts/local_setup.py" --check
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    printf '%s\n' 'Node.js and npm are required for the frontend.' >&2
    exit 2
fi
if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22 ? 0 : 1)'; then
    printf '%s\n' 'Use Node.js 20.19+ or 22.12+ as required by Vite.' >&2
    exit 2
fi
if [[ "$setup_mode" == "check" ]]; then
    printf '%s\n' 'Preflight passed. No dependencies installed or database contacted.'
    exit 0
fi

if [[ "$setup_mode" == "install" ]]; then
    if [[ ! -x "$setup_root/backend/venv/bin/python" ]]; then
        "$setup_python" -m venv "$setup_root/backend/venv"
    fi
    setup_python="$setup_root/backend/venv/bin/python"
    "$setup_python" -m pip install -r "$setup_root/backend/requirements.txt"
    npm --prefix "$setup_root/frontend" ci
fi
"$setup_python" "$setup_root/backend/scripts/local_setup.py" --bootstrap

printf '\n%s\n' 'Start each process from the repository root with the same configured environment:'
printf '  Backend:  cd backend && %q startup.py\n' "$setup_python"
printf '  Worker:   cd backend && %q -m app.sync_worker\n' "$setup_python"
printf '%s\n' '  Frontend: cd frontend && npm run dev'
printf '%s\n' 'Open http://localhost:5173 and sign in with the installation owner credentials.'
printf '%s\n' 'Connect AI providers through Settings → Integrations. See docs/deployment/local-development.md.'

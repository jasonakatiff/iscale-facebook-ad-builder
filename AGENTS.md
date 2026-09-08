# Ad Studio agent instructions

## Canonical repository

All Ad Studio and BreadWinner development now targets the public repository:
**`jasonakatiff/theleadrouter-ad-studio`**
(`https://github.com/jasonakatiff/theleadrouter-ad-studio`).

`A4DLLC/breadWinner.com` is the deprecated private repository. Treat its checkouts,
deployment URLs and runbooks as historical references. Routine development,
security changes, issues, PRs, merges and repository settings belong to the public
repository. Legacy maintenance requires a new explicit owner instruction.

Before changing files or running repository operations:

1. Inspect the actual checkout and both fetch and push destinations:
   `git rev-parse --show-toplevel`, `git branch --show-current`,
   `git remote get-url --all origin`, and `git remote get-url --push --all origin`.
2. Confirm both destinations identify `jasonakatiff/theleadrouter-ad-studio`.
   Canonical HTTPS and SSH URLs are supported. A folder name or an old renamed
   repository URL is not sufficient evidence of the target.
3. Confirm GitHub identity and visibility with
   `gh repo view jasonakatiff/theleadrouter-ad-studio --json nameWithOwner,visibility`.
   Expected: that exact owner/name and `PUBLIC`.
4. If the active checkout targets the private repository, move the task to a
   verified public checkout or create a public clone/worktree. Preserve dirty
   work. Do not repoint a private checkout to the public remote or push private
   history/files into the public repository.
5. Use `--repo jasonakatiff/theleadrouter-ad-studio` with GitHub CLI operations and
   explicit `repos/jasonakatiff/theleadrouter-ad-studio/...` API paths.

These routing rules govern this project even when an old workspace or inherited
guide contains private deployment instructions. They do not change routing for
other projects or authorize archiving/deleting the private repository.

## Runtime and configuration

- Use [README.md](README.md), [the installer guide](docs/deployment/install-on-railway.md),
  and [the release procedure](docs/deployment/railway-template-maintainer.md) for
  current setup. The public installer has backend, frontend, worker and PostgreSQL
  services; it has no shared production application URL.
- Use a dedicated development/test PostgreSQL database and isolated media storage.
  Do not use the old private BreadWinner database, domains, credentials or inherited
  repository URL variables as defaults for public development or verification.
- Configure child-process environments. Never write user-owned `.env`, `.env.local`
  or other secret files, expose credentials in logs, or commit secrets. A missing
  credential is not a reason to fall back to a private installation.
- Fresh v2 setup uses the shared bootstrap in `backend/startup.py`. The repaired
  `setup.sh` validates process settings and initializes it; Docker Compose starts
  the backend, worker, frontend and database in readiness order. Follow the
  [local development guide](docs/deployment/local-development.md). `init_db.py`
  alone does not complete v2 installation setup.
- Publishing public source does not verify a customer deployment. Identify the
  actual installation and scope before deployment or runtime checks. Use isolated
  tests and mocked providers unless live operations are explicitly in scope.

## Verification and delivery

- Frontend uses the existing npm lockfile: `npm ci`, `npm run test:unit`,
  `npm run test:coverage` and `npm run build`, from `frontend/`.
- Backend tests require explicit isolated PostgreSQL configuration; the delivery
  suite requires a localhost database named `test_delivery_*`. Use the exact
  migration/bootstrap test database variables in [.github/workflows/test.yml](.github/workflows/test.yml).
  Never point tests at shared or production data.
- Required CI checks are backend-tests, frontend-tests, deployment-images and
  installation, plus the active CodeQL merge rules. Keep the PR current with main
  and verify the exact head before merging. Do not bypass branch protection.
- Run checks that cover the change. Documentation-only guidance needs reference,
  conflict and repository-identity checks; do not invent application tests for it.
  Required GitHub checks still apply.
- Stop task-owned servers and clean up task-owned test data. Report what was
  changed, tested, merged and deployed separately, including remaining limitations.
- [CLAUDE.md](CLAUDE.md) contains architecture and coding context. Its runtime
  guidance must remain consistent with this file and the maintained setup docs.

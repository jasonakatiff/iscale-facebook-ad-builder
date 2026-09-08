# Railway installer release procedure

The [unlisted Ad Studio preview](https://railway.com/deploy/rNhJ3h?version=ad-studio) is available. A fresh template deployment verified the renamed public runtime in all three application services alongside PostgreSQL, generated public domains, backend readiness, owner login/setup, worker heartbeat, and browser branding. The disposable projects were removed. Earlier preview checks verified two persistent volumes, independent secrets, encrypted provider-key decryption, and database/media persistence after restart and update. A free Gemini request with an invalid test key verified rejection handling. Paid AI generation was not performed.

## Source and configuration

- Public repository: `jasonakatiff/theleadrouter-ad-studio`, branch `main` (v2 release source).
- Verified Ad Studio runtime revision: `fcf30f14e343d5811fa84c8c684c96ce05f9b23f`.
- Previous preview runtime revision: `e4c64143404b4389d39d2a66a4e24ee74bae92b2`.
- Template ID: `fddb5b7e-1e34-421e-85c4-832c90182a50`; code `rNhJ3h`.
- [serialized-template.json](../../.railway/serialized-template.json) is the API-accepted template definition. It contains symbolic references, generators, and two blank owner fields, with no resolved secrets.
- [template.json](../../.railway/template.json) records release status and input descriptions. [railway.ts](../../.railway/railway.ts) provides a guarded reference-project scaffold. These files do not replace the hosted template.
- Export reviewed runtime, migrations, tests, and build files onto public history. Exclude private history, plans, evidence, customer data, and secret files. Do not merge private Git ancestry into public history.

## Reproduce the deployment

1. Use a workspace token held in process memory. Inspect existing templates and staged changes before editing. Railway's authenticated composer endpoint, `https://backboard.railway.com/graphql/internal`, accepts `templateChangeSetStage` with a `TemplatePatch` containing `config` and `metadata`, followed by `templateChangeSetApply`. The public `/graphql/v2` endpoint supports deployment and inspection. Preserve the template ID and unlisted status during naming/source updates.
2. Load the hosted template configuration, fill only Backend `ADMIN_EMAIL` and `ADMIN_PASSWORD`, and deploy into a new isolated project. Leave the three secret expressions and cross-service references intact. Never persist resolved credentials locally.
3. Confirm Postgres and Worker have no public domains; Backend and Frontend receive generated domains on port 8080. Confirm Postgres mounts `/var/lib/postgresql/data` and Backend mounts `/app/uploads`.
4. Confirm Backend `/health/ready` returns 200, the owner can sign in, and the installation response reports the worker online. The frontend start command must call `/docker-entrypoint.sh nginx -g "daemon off;"` so Railway's command override still generates the nginx port configuration.
5. Save test-owned records and a media file, restart the database and deploy the next backend release, then verify owner login, installation ID/progress, provider-key decryption, record IDs, and media hashes. Internal signing/encryption/database credentials and owner fields use `preserveExisting` during template updates.
6. Remove disposable test projects and their fixtures when verification finishes. Keep the hosted template and reviewed source branch.

The customer guide is [install-on-railway.md](install-on-railway.md). Railway provisioning was tested through the API in the maintainer workspace. The complete dashboard clickthrough from an independent account remains unverified.

The preview link includes `?version=ad-studio` because Railway cached the old listing name after the rename. The versioned page was checked for the Ad Studio heading, renamed repository links, and exactly two owner inputs.

The Post-Deploy Verification workflow is manual: publishing public source does not deploy a shared application. Before dispatching it, configure `BACKEND_URL`, `FRONTEND_URL`, `TEST_EMAIL`, and `TEST_PASSWORD` for the intended installation. The inherited repository URLs currently reference the separate private BreadWinner installation; their results do not verify this public release.

## Remaining acceptance before marketplace publication

- Use funded Gemini/fal accounts to complete a real generated, saved, downloaded image. Record the charge and distinguish this from simulated browser tests.
- Run the dashboard installer from an independent Railway account without private-repository access.
- Have three nontechnical owners complete setup without maintainer help. Record elapsed time and stumbling points against the 15-minute target after external accounts are ready.
- Rehearse cloud database/media backup and restore with the compatible encryption configuration. Verify records, hashes, and decryption after restoration.

The unlisted preview is shareable for testing. Marketplace publication remains pending these acceptance checks.

## Updates, backup and rollback

Before updating, capture database and media backups and retain compatible encryption/signing configuration through the owner's password manager. Keep internal keys stable. Run migrations only in backend startup; the worker waits for the supported schema. Roll back app images only when the version understands the current additive schema; otherwise restore both volumes into an isolated installation and verify before cutover. Never run automatic down-migrations.

The backend uses one media volume and one instance; deploys can briefly interrupt access. Enable scheduled backups for both volumes. Cloud backup/restore behavior has not yet been rehearsed.

Official references: [template composition and generators](https://docs.railway.com/templates/create), [template sharing](https://docs.railway.com/templates/publish-and-share), [volume backups](https://docs.railway.com/volumes/backups), [template updates](https://docs.railway.com/templates/updates).

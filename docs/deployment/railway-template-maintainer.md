# Railway installer release procedure

Current state: implementation verified in local tests and private branch CI. All three images build; disposable-container checks cover fresh startup, worker heartbeat, encrypted-key decryption and media persistence after restart. No template created, no public-source publication, no production deployment, and no live AI call performed by this task.

The customer guide is [install-on-railway.md](install-on-railway.md). Resource settings live in [railway.ts](../../.railway/railway.ts); template fields and generated-variable expressions live in [template.json](../../.railway/template.json). These files form a reference-project scaffold and composition manifest. A manifest is not a published Railway template.

## Preconditions and reproducible reference project

1. Obtain a workspace/account Railway API token in the process environment. The available project token is restricted to existing production and cannot create the isolated reference project. Never apply this scaffold to production. Use a current Railway CLI supporting the installed SDK (SDK 3.11.0 documents CLI 5.42.1 or later).
2. Inspect that workspace's template inventory before creating a duplicate. Create or select the empty project named `test-breadwinner-installer`. Confirm its project/environment IDs are separate from all production resources.
3. Reconcile the release onto public repository history with a reviewed file-level export of application, migrations, tests, and deployment configuration. Do not merge private Git ancestry, customer data, local evidence, secret files, or private plans into the public repository. The current public main predates this feature. Record the merged public SHA in `template.json.sourceRevision` before deploying the reference project.
4. Provision the scaffold's five preserved values directly in Railway: test owner email/password, a random Postgres password, a random signing secret, and a Fernet encryption key. Generate these in memory and send them directly through the API; do not write resolved values into files. `preserve()` protects existing values during subsequent plans. The customer template replaces them with its two input fields and three generation expressions.
5. Run `npm ci --ignore-scripts --prefix .railway` and `npm run check --prefix .railway`. Review `railway config plan` against the isolated project, then apply that concrete plan. New services use explicit service configuration; do not opt them into deprecated legacy TOML/JSON config. Verify frontend root `/frontend`, Dockerfile `Dockerfile.railway`; backend/worker root `/`, their `backend/` Dockerfiles. Railway's current IaC reference excludes generated service domains. Generate Backend and Frontend domains through the Railway API/dashboard on port 8080 before starting builds; template composition must capture those automatic domains. The manifest records both public-domain ports.
6. Require four healthy services, backend readiness `/health/ready`, a current worker heartbeat in the installation response, private Postgres, and the backend volume mounted at `/app/uploads`. The worker has no public domain or migration command. Confirm the frontend build references only the new API domain and no secret variables.

Local typechecking proves DSL shape and file paths; domain creation, reference resolution, volume provisioning, and template capture remain cloud verification gates. Source and generated-domain settings must be inspected in Railway's actual plan before applying.

## Compose and verify the distributable template

Use Railway's **Generate Template** flow from the clean reference project. Include all four services and both volumes. Replace owner credential defaults with the two required fields in the manifest. Replace actual Postgres/signing/encryption values with the manifest's generation expressions. Preserve cross-service references. Remove private deployment IDs, production domains, fixed secret values, test owner values, OAuth credentials, and provider keys from template defaults.

The Fernet expression generates 43 URL-safe Base64 characters followed by `=`. Verify two fresh deployments produce different decodable 32-byte keys, and that an update preserves each existing key. Verify two databases and owner accounts are independent.

Deploy the private template into a fresh project from an unrelated Railway account. No terminal, variable editor, manual domain wiring, or pre-existing admin is allowed in the customer journey. Require:

- Exactly two customer fields, owner email and password.
- Login → wizard → Gemini/fal connections → brand/product → a real generated, saved, downloaded image. Record live-provider usage separately from simulated tests.
- Invalid keys, provider failures, expired session, mobile input, and interrupted setup show recoverable errors.
- Replacing/disconnecting a key changes subsequent generation without redeploy.
- Restart preserves login, progress, encrypted keys, brand/product, gallery rows, and uploaded/generated file bytes.
- Release update preserves those same records. Restore database and media into a separate installation with compatible encryption/signing configuration; verify row counts, file hashes and decryption. Never roll back with automatic down-migrations.
- Three nontechnical pilot users complete the journey with no maintainer intervention. Record elapsed time and stumbling points against the plan's 15-minute target.

Only after these gates pass: publish the template; store its real URL and public source SHA in the manifest; add the actual Railway badge/button to the README and customer guide; verify the button deploys that release.

## Updates, backup and rollback

Before updating, capture database and media backups plus the compatible environment configuration through the owner's secure secret-storage mechanism. Keep internal keys stable across deploys. Run migrations only in backend startup; the worker waits for the exact supported schema. Prefer rollback of app images only when that version understands the current additive schema. Otherwise restore both volumes together into an isolated project, verify decryption and media checksums, then arrange a controlled cutover.

Railway's volume constraints mean one backend instance and brief redeploy downtime. Database and media backup schedules require live verification in the deployed template; local filesystem tests do not establish cloud backup coverage.

Official references: [template composition and generators](https://docs.railway.com/templates/create), [IaC](https://docs.railway.com/infrastructure-as-code), [IaC reference](https://docs.railway.com/infrastructure-as-code/reference), [volume backups](https://docs.railway.com/volumes/backups), [template updates](https://docs.railway.com/templates/updates). Provider verification: [Kie credit endpoint](https://docs.kie.ai/common-api/get-account-credits), [Gemini models](https://ai.google.dev/api/models), [fal client](https://docs.fal.ai/model-apis/client-libraries/python).

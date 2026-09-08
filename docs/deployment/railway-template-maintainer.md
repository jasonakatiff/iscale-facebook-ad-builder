# Railway installer release procedure

The [unlisted preview template](https://railway.com/deploy/rNhJ3h) is available. A fresh template deployment passed in an isolated Railway project using only owner email/password. Four services, two persistent volumes, generated public domains, independent secrets, owner login, worker heartbeat, encrypted provider-key decryption, and database/media persistence after restart and an application update were verified. A free Gemini request with an invalid test key verified rejection handling. Paid AI generation was not performed.

## Source and configuration

- Public repository: `jasonakatiff/iscale-facebook-ad-builder`, branch `main` (v2 release source).
- Previous preview runtime revision: `e4c64143404b4389d39d2a66a4e24ee74bae92b2`.
- Template ID: `fddb5b7e-1e34-421e-85c4-832c90182a50`; code `rNhJ3h`.
- [serialized-template.json](../../.railway/serialized-template.json) is the API-accepted template definition. It contains symbolic references, generators, and two blank owner fields, with no resolved secrets.
- [template.json](../../.railway/template.json) records release status and input descriptions. [railway.ts](../../.railway/railway.ts) provides a guarded reference-project scaffold. These files do not replace the hosted template.
- Export reviewed runtime, migrations, tests, and build files onto public history. Exclude private history, plans, evidence, customer data, and secret files. Do not merge private Git ancestry into public history.

## Reproduce the deployment

1. Use a workspace token held in process memory. Inspect existing templates before creating another. The GraphQL public endpoint supports deployment and inspection; Railway's authenticated template composer API creates and stages template configuration.
2. Load the hosted template configuration, fill only Backend `ADMIN_EMAIL` and `ADMIN_PASSWORD`, and deploy into a new isolated project. Leave the three secret expressions and cross-service references intact. Never persist resolved credentials locally.
3. Confirm Postgres and Worker have no public domains; Backend and Frontend receive generated domains on port 8080. Confirm Postgres mounts `/var/lib/postgresql/data` and Backend mounts `/app/uploads`.
4. Confirm Backend `/health/ready` returns 200, the owner can sign in, and the installation response reports the worker online. The frontend start command must call `/docker-entrypoint.sh nginx -g "daemon off;"` so Railway's command override still generates the nginx port configuration.
5. Save test-owned records and a media file, restart the database and deploy the next backend release, then verify owner login, installation ID/progress, provider-key decryption, record IDs, and media hashes. Internal signing/encryption/database credentials and owner fields use `preserveExisting` during template updates.
6. Remove disposable test projects and their fixtures when verification finishes. Keep the hosted template and reviewed source branch.

The customer guide is [install-on-railway.md](install-on-railway.md). Railway provisioning was tested through the API in the maintainer workspace. The complete dashboard clickthrough from an independent account remains unverified.

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

# Public v2 and Railway installer

Status: complete for public v2 naming and the one-click preview. Public v2 merged in PR #36; Ad Studio naming merged in PR #37. The Railway project and template names match, and a fresh Ad Studio installation passed verification.

The public product is **theLeadRouter — Ad Studio**. A recipient opens one Railway link, supplies an owner email/password, and receives an isolated ad workspace with a guided setup flow. Existing public installer PR #36 and template `rNhJ3h` provide the release base.

## Acceptance

- Public repository `jasonakatiff/theleadrouter-ad-studio` contains the branded v2 application and current installer fixes without private Git ancestry.
- Public README and customer guide link to `https://railway.com/deploy/rNhJ3h?version=ad-studio`.
- Hosted template uses the same product name and reviewed public source, with four services, two volumes, two owner inputs, generated private credentials, and credential preservation during updates.
- Public release CI passes. An isolated template deployment verifies the source revision, branded frontend, API readiness, owner login/setup, and worker heartbeat.
- Disposable verification resources are removed. Template and public source remain available.

## Execution

1. Integrate the existing installer branch and branding commit; resolve documentation overlaps while preserving the verified template and generated-secret behavior.
2. Run `.railway` configuration checks, frontend build/unit checks, and release CI; merge public PR #36 after its required checks pass.
3. Update the existing hosted template's name and public source. Verify the actual hosted configuration and deploy an isolated copy for smoke testing.
4. Record the verified public commit, template URL, release state, and cleanup. Deliver a numbered installation walkthrough.

## Verification boundaries

The template remains an unlisted preview. Paid provider generation, independent-account dashboard testing, nontechnical pilot timing, and cloud backup/restore are separate acceptance checks. Their earlier absence does not block connecting the public release to the existing preview installer.

## Access

Workspace access is confirmed. The existing Railway project is named **theLeadRouter — Ad Studio**. The hosted template uses that name and the renamed public repository's `main` branch.

## Source configuration check

The initial check failed because the template still targeted `codex/railway-installer-public-20260908`. Updated the template manifest, serialized Backend/Frontend/Worker sources, and reference scaffold to public `main`. Added assertions for the release branch and product name; retain checks for exactly two owner fields and preserved/generated credentials.

## Deployment verification scope

The public repository's existing `BACKEND_URL` and `FRONTEND_URL` variables target the private BreadWinner installation, which deploys from a different repository. Removed automatic push triggering from Post-Deploy Verification. Maintainers can dispatch it after configuring the intended deployment URLs and test credentials. Public release CI verifies disposable containers and an isolated installation journey.

## Ad Studio naming

The owner selected **theLeadRouter — Ad Studio** and repository `jasonakatiff/theleadrouter-ad-studio`. Update product titles, downloadable filenames, docs, public repository metadata, Git remotes, and the three template GitHub sources together. Keep the current installer branch synchronized until the hosted template can move to `main`. Verify Git access through both repository URLs after renaming.

The Railway project and hosted template are separate resources. Verify their names independently; checked-in template files do not rename either hosted resource. No schema, credential, service, or domain change is required for naming.

The GitHub repository was renamed successfully; Git access through both the new URL and the former `iscale-facebook-ad-builder` URL resolved to the same commit. The original project token lacked rename permission; the workspace credential completed both hosted updates. Readback verified the project name, template name, public source on `main`, four services, two volumes, preserved generated credentials, and only owner email/password inputs. The versioned public preview page displays the new name immediately despite Railway's cached earlier listing.

## Final verification

All four services in the disposable template installation were healthy; the three application services ran public revision `fcf30f14e343d5811fa84c8c684c96ce05f9b23f`. Backend readiness, public HTTP domains limited to Frontend/Backend, owner login, initial setup state, worker heartbeat, and live browser login branding passed. Both disposable projects and the verification browser sessions were removed. README branding, product links, examples, and GitHub Markdown rendering were checked. Paid AI calls and marketplace acceptance remain outside this completed preview integration.

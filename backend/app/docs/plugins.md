# Plugins: local packages and connected services

BreadWinner · Powered by theLeadRouter.com

Open Plugins to import a package file, use an included example, or run an installed plugin. Installations, configuration and run history are private to your BreadWinner user. Every installed plugin can also be run through the same API using a BreadWinner read/write user key.

## Import and run a local package

Choose Import plugin and select a JSON package, up to 128 KB. Inspect its name, version, execution type and declared fields, then install. Configure its defaults, fill in the run inputs and select Run plugin. Local packages substitute declared values into a text or JSON template; they do not execute uploaded JavaScript/Python, contact a service, or invoke paid image generation. The Creative Brief example produces reusable prompt text.

Outputs appear in run history and can be copied or downloaded. Export package downloads the immutable definition with explicit defaults, excluding your configuration, run inputs and credentials. Reimporting the same version/content reuses its installation. Changed content requires a new version. Versions install separately and do not silently upgrade existing runs.

## Connect a company service or local worker

Import the service operator's package, or install Service Starter to try the protocol. A service package declares inputs and nonsecret configuration. Under Service connection, create a worker key and provide it securely to that service. The plaintext key appears once and is not included in exported packages or ordinary reads. The service uses the documented job API to claim and complete jobs for this installation only.

A worker can run on a company server or your own computer. It polls BreadWinner over outbound HTTPS; the application does not need access to localhost or an inbound port. An existing arbitrary vendor API needs a small adapter implementing this protocol. The example worker is a connection demonstration; the vendor supplies its own processing logic and manages its own provider credentials.

The service receives only the inputs and configuration you submit for its jobs. It has no automatic access to your brands, ad accounts, performance data, LeadRouter key, platform key or provider OAuth credentials. Do not place credentials or unnecessary personal data in plugin inputs/configuration. Review the operator's terms and handling of the submitted data before connecting a service. Any external usage fees are arranged with that operator; BreadWinner does not collect plugin fees in this release.

## Configuration, runs and history

Configuration changes affect new runs. Existing runs retain their original configuration, input and package digest. Text fields accept strings; JSON fields accept structured data. Required fields are validated by the server. Outputs are displayed as text/JSON; they are not executed as HTML or applied to advertising accounts.

Service jobs have a one-hour deadline. A claim lasts five minutes; a service can heartbeat to extend it within the job deadline. Expiry is reconciled when jobs are read or processed. Failed, expired and cancelled jobs are never automatically rerun. Cancel stops acceptance of results; it cannot undo computation already underway at an external service.

Disable or uninstall stops new runs, revokes the worker key, and cancels queued/running jobs. Rotating/revoking a key also cancels unfinished jobs. Re-enable requires a new service key. Uninstall retains run history; reimport restores the same version without restoring credentials. The private library allows 100 stored package versions and 2,000 retained runs per user, with 20 unfinished runs per installation. Reaching a limit returns a visible error; there is no silent deletion of history.

## API access and current boundaries

Use the plugin library API to list, validate, import, export, configure, run and cancel installed packages. Read-only user keys cannot create runs or modify installations. Worker key creation/revocation requires a signed-in browser session, following the platform's credential-management rules. Service credentials work only under `/api/v1/plugin-worker`.

The category label describes the author's use case. It does not confer access or enable a special executor. Optimization services can return suggestions as results; the canonical performance feed, structured approval inbox, and automatic pause/budget executor are not implemented by this release. Native LeadRouter remains built-in functionality.

See Plugin service API for package examples, endpoints, service lifecycle and the downloadable Python worker. Help downloads include both Markdown guides and the actual OpenAPI document.

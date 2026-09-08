import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Puzzle, Upload } from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { API_BASE, downloadBlob, usePlatformApi } from '../lib/platformApi';
import { useWorkspaceData } from '../lib/workspaceApi';

const MAX_PACKAGE_BYTES = 131072;
const RUN_REFRESH_MS = 10000;
const format = (value) =>
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
const fieldValue = (field, value) =>
    value == null
        ? ''
        : field.kind === 'json'
        ? JSON.stringify(value, null, 2)
        : value;
const fieldDefaults = (fields, values = {}) =>
    Object.fromEntries(
        fields.map((field) => [
            field.name,
            fieldValue(
                field,
                Object.hasOwn(values, field.name)
                    ? values[field.name]
                    : field.default,
            ),
        ]),
    );
const readFields = (fields, values) =>
    Object.fromEntries(
        fields.map((field) => {
            const value = values[field.name] ?? '';
            if (field.required && !value.trim())
                throw new Error(`${field.label} is required.`);
            if (field.kind !== 'json') return [field.name, value];
            try {
                return [field.name, value.trim() ? JSON.parse(value) : null];
            } catch {
                throw new Error(`${field.label} must contain valid JSON.`);
            }
        }),
    );

function Fields({ fields, values, onChange, disabled }) {
    return fields.map((field) => {
        const Control = field.kind === 'text' ? 'input' : 'textarea';
        return (
            <label key={field.name} className="block text-sm font-medium">
                {field.label}
                {field.required ? ' *' : ''}
                <Control
                    className="help-input mt-1 w-full"
                    aria-label={field.label}
                    rows={
                        field.kind === 'text'
                            ? undefined
                            : field.kind === 'json'
                            ? 4
                            : 3
                    }
                    value={values[field.name] ?? ''}
                    required={field.required}
                    disabled={disabled}
                    maxLength={65536}
                    onChange={(event) =>
                        onChange((previous) => ({
                            ...previous,
                            [field.name]: event.target.value,
                        }))
                    }
                />
                {field.kind === 'json' && (
                    <span className="text-xs text-muted">JSON data</span>
                )}
            </label>
        );
    });
}

export default function Plugins() {
    const { user } = useAuth();
    return <PluginLibrary key={user?.id} />;
}

function PluginLibrary() {
    const api = usePlatformApi();
    const { showError, showSuccess } = useToast();
    const library = useWorkspaceData(api, '/plugins?limit=100', {
        poll: false,
    });
    const examples = useWorkspaceData(api, '/plugins/examples', {
        poll: false,
    });
    const [selectedId, setSelectedId] = useState('');
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [offset, setOffset] = useState(0);
    const files = useRef(null);
    const rows = library.data?.data || [];
    const selected = rows.find((row) => row.id === selectedId);
    const history = useWorkspaceData(
        api,
        `/plugins/runs?limit=10&offset=${offset}${
            selected ? `&pluginId=${selected.id}` : ''
        }`,
        { poll: false },
    );
    const waiting = history.data?.data.some((run) =>
        ['queued', 'running'].includes(run.status),
    );
    useEffect(() => {
        if (!waiting) return;
        const timer = setInterval(history.reload, RUN_REFRESH_MS);
        return () => clearInterval(timer);
    }, [waiting, history.reload]);
    const select = (id) => {
        setSelectedId(id);
        setOffset(0);
    };
    const changed = () => {
        library.reload();
        history.reload();
    };
    const download = (value, filename) =>
        downloadBlob(
            new Blob([JSON.stringify(value, null, 2) + '\n'], {
                type: 'application/json',
            }),
            filename,
        );
    const importFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || busy) return;
        setPreview(null);
        setBusy(true);
        try {
            if (file.size > MAX_PACKAGE_BYTES)
                throw new Error('Plugin packages must be 128 KB or smaller.');
            const document = JSON.parse(await file.text());
            setPreview(
                await api('/plugins/validate', {
                    method: 'POST',
                    body: JSON.stringify(document),
                }),
            );
        } catch (error) {
            showError(error.message || 'Invalid plugin package.');
        } finally {
            setBusy(false);
        }
    };
    const install = async () => {
        if (!preview || busy) return;
        setBusy(true);
        try {
            const result = await api('/plugins', {
                method: 'POST',
                body: JSON.stringify(preview),
            });
            setPreview(null);
            select(result.data.id);
            library.reload();
            showSuccess('Plugin installed in your private library.');
        } catch (error) {
            showError(error.message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="space-y-5">
            <header className="studio-page-header">
                <div>
                    <h1 className="studio-heading">Plugins</h1>
                    <p className="studio-description">
                        Your reusable recipes and connected services.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link className="studio-button" to="/help">
                        Plugin help & API
                    </Link>
                    <button
                        className="studio-button primary"
                        disabled={busy}
                        onClick={() => files.current?.click()}
                    >
                        <Upload size={16} />
                        Import plugin
                    </button>
                    <input
                        ref={files}
                        className="sr-only"
                        type="file"
                        accept=".json,application/json"
                        aria-label="Plugin package file"
                        onChange={importFile}
                        disabled={busy}
                    />
                </div>
            </header>
            {preview && (
                <section
                    className="studio-panel p-4 space-y-3"
                    aria-label="Plugin import preview"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 className="font-semibold">Import preview</h2>
                            <p>
                                {preview.name} · {preview.version}
                            </p>
                        </div>
                        <span className="text-xs text-muted">
                            {preview.execution === 'service'
                                ? 'Connected service'
                                : 'Local package'}
                        </span>
                    </div>
                    <p className="text-sm text-muted">{preview.description}</p>
                    <p className="text-xs text-muted">
                        {preview.inputs.length} input fields ·{' '}
                        {preview.configFields.length} configuration fields ·{' '}
                        {preview.execution === 'service'
                            ? 'Receives only data you submit. Connect its service after installing.'
                            : 'Substitutes your inputs into a text or JSON template.'}
                    </p>
                    <details className="text-sm">
                        <summary className="cursor-pointer">
                            Package definition
                        </summary>
                        <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs max-h-60">
                            {JSON.stringify(preview, null, 2)}
                        </pre>
                    </details>
                    <div className="flex gap-2">
                        <button
                            className="studio-button primary"
                            disabled={busy}
                            onClick={install}
                        >
                            Install plugin
                        </button>
                        <button
                            className="studio-button"
                            disabled={busy}
                            onClick={() => setPreview(null)}
                        >
                            Cancel import
                        </button>
                    </div>
                </section>
            )}
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <section
                    className="studio-panel p-4 space-y-3 self-start"
                    aria-label="Installed plugins"
                >
                    <h2 className="font-semibold">Installed</h2>
                    {library.loading && (
                        <p role="status" className="text-sm text-muted">
                            Loading your plugins…
                        </p>
                    )}
                    {library.error && (
                        <p role="alert" className="text-danger text-sm">
                            {library.error}
                            <button
                                className="studio-button mt-2"
                                onClick={library.reload}
                            >
                                Retry library
                            </button>
                        </p>
                    )}
                    {!library.loading && !library.error && !rows.length && (
                        <p className="text-sm text-muted">
                            Import a package or choose an example below to
                            start.
                        </p>
                    )}
                    {rows.map((row) => (
                        <button
                            key={row.id}
                            className={`w-full text-left rounded-lg border p-3 ${
                                selected?.id === row.id
                                    ? 'border-brand-ink bg-brand-soft'
                                    : 'border-line'
                            }`}
                            aria-pressed={selected?.id === row.id}
                            onClick={() => select(row.id)}
                        >
                            <span className="font-medium text-sm block break-words">
                                {row.document.name}
                            </span>
                            <span className="text-xs text-muted">
                                {row.document.version} ·{' '}
                                {row.document.execution === 'service'
                                    ? 'Service'
                                    : 'Local'}{' '}
                                · {row.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                        </button>
                    ))}
                    {rows.length > 0 && (
                        <button
                            className="text-sm text-brand-ink underline"
                            onClick={() => select('')}
                        >
                            All run history
                        </button>
                    )}
                    <div className="border-t border-line pt-3 space-y-2">
                        <h3 className="font-medium text-sm">
                            Start with an example
                        </h3>
                        {examples.error && (
                            <p role="alert" className="text-sm text-danger">
                                {examples.error}
                            </p>
                        )}
                        {(examples.data || []).map((document) => (
                            <button
                                key={document.slug}
                                className="studio-button w-full justify-start"
                                disabled={busy}
                                onClick={() => setPreview(document)}
                            >
                                <Puzzle size={14} />
                                {document.name}
                            </button>
                        ))}
                    </div>
                </section>
                {selected ? (
                    <PluginDetail
                        key={selected.id}
                        plugin={selected}
                        api={api}
                        changed={changed}
                        onUninstalled={() => {
                            select('');
                            changed();
                        }}
                        download={download}
                    />
                ) : (
                    <section className="studio-panel p-6 self-start space-y-3">
                        <h2 className="font-semibold">
                            One library. Two ways to run.
                        </h2>
                        <p className="text-sm text-muted">
                            Local packages create repeatable prompts and
                            structured outputs. Connected services process your
                            inputs on a company server or a worker on your
                            computer.
                        </p>
                        <p className="text-sm text-muted">
                            Every installed plugin is available through your
                            BreadWinner API key. Your LeadRouter connection
                            remains native to the platform.
                        </p>
                    </section>
                )}
            </div>
            <section
                className="studio-panel p-4 space-y-3"
                aria-label="Plugin run history"
            >
                <div className="flex justify-between items-center gap-3">
                    <div>
                        <h2 className="font-semibold">
                            {selected
                                ? `${selected.document.name} runs`
                                : 'Recent runs'}
                        </h2>
                        {waiting && (
                            <p className="text-xs text-muted">
                                Waiting for service · Refreshes every 10 seconds
                            </p>
                        )}
                    </div>
                    <button className="studio-button" onClick={history.reload}>
                        Refresh runs
                    </button>
                </div>
                {history.loading && (
                    <p role="status" className="text-sm text-muted">
                        Loading runs…
                    </p>
                )}
                {history.error && (
                    <p role="alert" className="text-sm text-danger">
                        {history.error}
                    </p>
                )}
                {!history.loading &&
                    !history.error &&
                    !history.data?.data.length && (
                        <p className="text-sm text-muted">
                            Results will appear here after your first run.
                        </p>
                    )}
                {(history.data?.data || []).map((run) => (
                    <RunCard
                        key={run.id}
                        run={run}
                        api={api}
                        reload={history.reload}
                        download={download}
                    />
                ))}
                <div className="flex gap-2">
                    <button
                        className="studio-button"
                        disabled={!offset || history.loading}
                        onClick={() =>
                            setOffset((value) => Math.max(0, value - 10))
                        }
                    >
                        Previous runs
                    </button>
                    <button
                        className="studio-button"
                        disabled={
                            !history.data?.pagination.hasMore || history.loading
                        }
                        onClick={() => setOffset((value) => value + 10)}
                    >
                        Next runs
                    </button>
                </div>
            </section>
        </div>
    );
}

function PluginDetail({ plugin, api, changed, onUninstalled, download }) {
    const { authFetch } = useAuth();
    const { showError, showSuccess } = useToast();
    const [configuration, setConfiguration] = useState(() =>
        fieldDefaults(plugin.document.configFields, plugin.configuration),
    );
    const [inputs, setInputs] = useState(() =>
        fieldDefaults(plugin.document.inputs),
    );
    const [busy, setBusy] = useState(false);
    const [serviceKey, setServiceKey] = useState('');
    const [confirming, setConfirming] = useState(null);
    const [keyDays, setKeyDays] = useState('90');
    const pendingRequest = useRef(null);
    const path = `/plugins/${plugin.id}`;
    const dirty =
        JSON.stringify(configuration) !==
        JSON.stringify(
            fieldDefaults(plugin.document.configFields, plugin.configuration),
        );
    const mutate = async (operation, success) => {
        if (busy) return;
        setBusy(true);
        try {
            await operation();
            changed();
            if (success) showSuccess(success);
        } catch (error) {
            showError(error.message);
        } finally {
            setBusy(false);
        }
    };
    const copy = async (value) => {
        try {
            await navigator.clipboard.writeText(value);
            showSuccess('Copied.');
        } catch {
            showError('Copy failed. Select and copy the text manually.');
        }
    };
    const run = (event) => {
        event.preventDefault();
        return mutate(
            async () => {
                const data = readFields(plugin.document.inputs, inputs);
                const fingerprint = JSON.stringify({
                    data,
                    configuration: plugin.configuration,
                });
                if (pendingRequest.current?.fingerprint !== fingerprint)
                    pendingRequest.current = {
                        fingerprint,
                        requestId: crypto.randomUUID(),
                    };
                await api(`${path}/runs`, {
                    method: 'POST',
                    body: JSON.stringify({
                        requestId: pendingRequest.current.requestId,
                        inputs: data,
                    }),
                });
                pendingRequest.current = null;
            },
            plugin.document.execution === 'service'
                ? 'Run queued for your service.'
                : 'Plugin run completed.',
        );
    };
    const mint = () =>
        mutate(async () => {
            const result = await api(`${path}/worker-key`, {
                method: 'POST',
                body: JSON.stringify({ expiresInDays: Number(keyDays) }),
            });
            setServiceKey(result.workerKey);
        });
    const downloadWorker = () =>
        mutate(async () => {
            const response = await authFetch(
                `${API_BASE}/plugins/example-worker`,
            );
            if (!response.ok)
                throw new Error('Unable to download the example worker.');
            downloadBlob(await response.blob(), 'plugin-worker.py');
        });
    return (
        <section
            className="studio-panel p-4 space-y-4 self-start"
            aria-label="Plugin details"
        >
            <div className="flex flex-wrap justify-between gap-2">
                <div>
                    <h2 className="font-semibold">{plugin.document.name}</h2>
                    <p className="text-xs text-muted">
                        Version {plugin.document.version} ·{' '}
                        {plugin.document.execution === 'service'
                            ? 'Connected service'
                            : 'Local package'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        className="studio-button"
                        disabled={busy}
                        onClick={() =>
                            download(
                                plugin.document,
                                `${plugin.document.slug}-${plugin.document.version}.json`,
                            )
                        }
                    >
                        <Download size={14} />
                        Export package
                    </button>
                    <button
                        className="studio-button"
                        disabled={busy}
                        onClick={() =>
                            mutate(async () => {
                                await api(path, {
                                    method: 'PATCH',
                                    body: JSON.stringify({
                                        enabled: !plugin.enabled,
                                    }),
                                });
                                setServiceKey('');
                            })
                        }
                    >
                        {plugin.enabled ? 'Disable plugin' : 'Enable plugin'}
                    </button>
                </div>
            </div>
            <p className="text-sm text-muted">{plugin.document.description}</p>
            {plugin.document.configFields.length > 0 && (
                <form
                    className="space-y-3 border-t border-line pt-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        mutate(async () => {
                            await api(path, {
                                method: 'PATCH',
                                body: JSON.stringify({
                                    configuration: readFields(
                                        plugin.document.configFields,
                                        configuration,
                                    ),
                                }),
                            });
                        }, 'Configuration saved for new runs.');
                    }}
                >
                    <h3 className="font-medium text-sm">Configuration</h3>
                    <Fields
                        fields={plugin.document.configFields}
                        values={configuration}
                        onChange={setConfiguration}
                        disabled={busy}
                    />
                    <button className="studio-button" disabled={busy}>
                        Save configuration
                    </button>
                </form>
            )}
            {plugin.document.execution === 'service' && (
                <section
                    className="border-t border-line pt-3 space-y-3"
                    aria-label="Service connection"
                >
                    <h3 className="font-medium text-sm">Service connection</h3>
                    <p className="text-sm text-muted">
                        {plugin.workerLastSeenAt
                            ? `Last contacted ${new Date(
                                  plugin.workerLastSeenAt,
                              ).toLocaleString()}`
                            : 'No worker has contacted this installation yet.'}
                    </p>
                    {plugin.workerKeyPrefix && (
                        <p className="text-xs text-muted">
                            Key {plugin.workerKeyPrefix}… · Expires{' '}
                            {new Date(
                                plugin.workerKeyExpiresAt,
                            ).toLocaleString()}
                        </p>
                    )}
                    <p className="text-xs text-muted">
                        Your service receives only submitted inputs and
                        configuration. Rotating or revoking its key cancels
                        unfinished runs.
                    </p>
                    <div className="flex flex-wrap gap-2 items-end">
                        <label className="text-xs">
                            Key expires in
                            <select
                                aria-label="Service key expiry"
                                className="help-input block mt-1"
                                value={keyDays}
                                onChange={(event) =>
                                    setKeyDays(event.target.value)
                                }
                            >
                                <option value="7">7 days</option>
                                <option value="30">30 days</option>
                                <option value="90">90 days</option>
                            </select>
                        </label>
                        <button
                            className="studio-button"
                            disabled={busy || !plugin.enabled}
                            onClick={
                                plugin.workerKeyPrefix
                                    ? () => setConfirming('rotate')
                                    : mint
                            }
                        >
                            {plugin.workerKeyPrefix
                                ? 'Rotate service key'
                                : 'Create service key'}
                        </button>
                        {plugin.workerKeyPrefix && (
                            <button
                                className="studio-button"
                                disabled={busy}
                                onClick={() => setConfirming('revoke')}
                            >
                                Revoke service key
                            </button>
                        )}
                        <button
                            className="studio-button"
                            disabled={busy}
                            onClick={downloadWorker}
                        >
                            Download example worker
                        </button>
                    </div>
                    {serviceKey && (
                        <div className="rounded-lg border border-brand-line bg-brand-soft p-3 space-y-2">
                            <p className="text-sm font-medium">
                                Copy this key now. It is shown once.
                            </p>
                            <input
                                className="help-input w-full font-mono text-xs"
                                aria-label="One-time service key"
                                value={serviceKey}
                                readOnly
                            />
                            <div className="flex gap-2">
                                <button
                                    className="studio-button"
                                    onClick={() => copy(serviceKey)}
                                >
                                    Copy service key
                                </button>
                                <button
                                    className="studio-button"
                                    onClick={() => setServiceKey('')}
                                >
                                    Dismiss key
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            )}
            <form
                className="space-y-3 border-t border-line pt-3"
                onSubmit={run}
            >
                <h3 className="font-medium text-sm">Run inputs</h3>
                <Fields
                    fields={plugin.document.inputs}
                    values={inputs}
                    onChange={setInputs}
                    disabled={busy || !plugin.enabled}
                />
                {dirty && (
                    <p className="text-xs text-muted">
                        Save your configuration changes before running.
                    </p>
                )}
                <button
                    className="studio-button primary"
                    disabled={busy || !plugin.enabled || dirty}
                >
                    Run plugin
                </button>
            </form>
            <details className="text-xs text-muted">
                <summary className="cursor-pointer">API access</summary>
                <p className="mt-2 break-all">
                    POST {API_BASE}
                    {path}/runs
                </p>
                <p className="mt-1">
                    Use your BreadWinner read/write key to start runs. A service
                    key can only claim and complete this installation’s jobs.
                </p>
                <p className="mt-2 break-all">
                    Package digest: {plugin.packageDigest}
                </p>
            </details>
            <button
                className="text-sm text-danger underline"
                disabled={busy}
                onClick={() => setConfirming('uninstall')}
            >
                Uninstall plugin
            </button>
            <ConfirmationModal
                isOpen={!!confirming}
                onClose={() => setConfirming(null)}
                title={
                    confirming === 'uninstall'
                        ? 'Uninstall this plugin?'
                        : confirming === 'rotate'
                        ? 'Rotate the service key?'
                        : 'Revoke service access?'
                }
                message="Unfinished runs will be cancelled and the current service key will stop working. Completed run history is retained."
                confirmText={
                    confirming === 'uninstall'
                        ? 'Uninstall'
                        : confirming === 'rotate'
                        ? 'Rotate key'
                        : 'Revoke key'
                }
                onConfirm={async () => {
                    if (confirming === 'uninstall') {
                        await api(path, { method: 'DELETE' });
                        setServiceKey('');
                        onUninstalled();
                    } else if (confirming === 'rotate') {
                        const result = await api(`${path}/worker-key`, {
                            method: 'POST',
                            body: JSON.stringify({
                                expiresInDays: Number(keyDays),
                            }),
                        });
                        setServiceKey(result.workerKey);
                        changed();
                    } else {
                        await api(`${path}/worker-key`, { method: 'DELETE' });
                        setServiceKey('');
                        changed();
                    }
                }}
            />
        </section>
    );
}

function RunCard({ run, api, reload, download }) {
    const { showError, showSuccess } = useToast();
    const [busy, setBusy] = useState(false);
    const pending = ['queued', 'running'].includes(run.status);
    const cancel = async () => {
        setBusy(true);
        try {
            await api(`/plugins/runs/${run.id}/cancel`, { method: 'POST' });
            reload();
        } catch (error) {
            showError(error.message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <article className="border border-line rounded-lg p-3 space-y-2">
            <div className="flex flex-wrap justify-between gap-2">
                <p className="text-sm font-medium">
                    {run.pluginName}{' '}
                    <span className="text-muted font-normal">
                        · {run.status}
                    </span>
                </p>
                <span className="text-xs text-muted">
                    {new Date(run.createdAt).toLocaleString()}
                </span>
            </div>
            {run.error && <p className="text-sm text-danger">{run.error}</p>}
            {run.status === 'succeeded' && (
                <>
                    <pre
                        data-testid="plugin-output"
                        className="text-xs whitespace-pre-wrap break-all max-h-56 overflow-auto rounded bg-canvas p-3"
                    >
                        {format(run.output)}
                    </pre>
                    <div className="flex gap-2">
                        <button
                            className="studio-button"
                            onClick={async () => {
                                try {
                                    await navigator.clipboard.writeText(
                                        format(run.output),
                                    );
                                    showSuccess('Result copied.');
                                } catch {
                                    showError(
                                        'Copy failed. Download the result instead.',
                                    );
                                }
                            }}
                        >
                            Copy result
                        </button>
                        <button
                            className="studio-button"
                            onClick={() =>
                                download(
                                    run.output,
                                    `plugin-result-${run.id}.json`,
                                )
                            }
                        >
                            Download result
                        </button>
                    </div>
                </>
            )}
            {pending && (
                <div className="flex flex-wrap gap-3 items-center">
                    <p className="text-xs text-muted">
                        {run.status === 'queued'
                            ? 'Waiting for the connected service to claim this run.'
                            : 'Your service is processing this run.'}{' '}
                        Deadline: {new Date(run.expiresAt).toLocaleString()}
                    </p>
                    <button
                        className="studio-button"
                        disabled={busy}
                        onClick={cancel}
                    >
                        Cancel run
                    </button>
                </div>
            )}
            <details className="text-xs text-muted">
                <summary className="cursor-pointer">Run details</summary>
                <pre className="mt-2 whitespace-pre-wrap break-all max-h-48 overflow-auto">
                    {JSON.stringify(
                        {
                            id: run.id,
                            version: run.pluginVersion,
                            packageDigest: run.packageDigest,
                            inputs: run.inputs,
                            configuration: run.configuration,
                        },
                        null,
                        2,
                    )}
                </pre>
            </details>
        </article>
    );
}

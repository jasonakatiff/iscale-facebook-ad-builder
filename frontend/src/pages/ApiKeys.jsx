import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, KeyRound, Pencil, Trash2 } from 'lucide-react';
import { usePlatformApi } from '../lib/platformApi';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import ConfirmationModal from '../components/ConfirmationModal';

const date = (value) => (value ? new Date(value).toLocaleString() : 'Never');
export default function ApiKeys() {
    const api = usePlatformApi();
    const { hasRole } = useAuth();
    const { showError, showSuccess } = useToast();
    const [keys, setKeys] = useState([]);
    const [name, setName] = useState('');
    const [access, setAccess] = useState('read');
    const [days, setDays] = useState('90');
    const [created, setCreated] = useState(null);
    const [pending, setPending] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revoking, setRevoking] = useState(null);
    const [editing, setEditing] = useState(null);
    const [editName, setEditName] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const rows = [];
            for (let offset = 0; ; offset += 100) {
                const result = await api(
                    `/api-keys?limit=100&offset=${offset}`,
                );
                rows.push(...result.data);
                if (!result.pagination.hasMore) break;
                if (!result.data.length)
                    throw new Error('The key list changed. Reload it.');
            }
            setKeys(rows);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [api]);
    useEffect(() => {
        load();
    }, [load]);
    const create = async (event) => {
        event.preventDefault();
        if (pending || created) return;
        setPending(true);
        try {
            const result = await api('/api-keys', {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    access,
                    expiresInDays: Number(days),
                }),
            });
            setCreated(result);
            setName('');
            await load();
        } catch (err) {
            showError(err.message);
        } finally {
            setPending(false);
        }
    };
    const copy = () => {
        navigator.clipboard.writeText(created.apiKey).then(
            () => showSuccess('API key copied.'),
            () => showError('Copy failed. Select and copy the key manually.'),
        );
    };
    const rename = async (event) => {
        event.preventDefault();
        if (pending) return;
        setPending(true);
        try {
            await api(`/api-keys/${editing}`, {
                method: 'PATCH',
                body: JSON.stringify({ name: editName }),
            });
            setEditing(null);
            await load();
        } catch (err) {
            showError(err.message);
        } finally {
            setPending(false);
        }
    };
    return (
        <div className="space-y-5 max-w-5xl mx-auto">
            <header className="studio-page-header">
                <div>
                    <p className="studio-eyebrow">Developer access</p>
                    <h1 className="studio-heading">API Keys</h1>
                    <p className="studio-description">
                        Connect Claude Code, scripts, and integrations with your
                        own permissions.
                    </p>
                </div>
                <Link to="/help" className="studio-button">
                    API docs
                </Link>
            </header>
            <section
                className="studio-panel p-5"
                aria-labelledby="create-key-heading"
            >
                <h2
                    id="create-key-heading"
                    className="text-base font-semibold mb-4"
                >
                    Create an API key
                </h2>
                <form
                    onSubmit={create}
                    className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end"
                >
                    <label className="text-sm">
                        Key name
                        <input
                            className="help-input"
                            required
                            maxLength={80}
                            placeholder="Claude Code"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </label>
                    <label className="text-sm">
                        Access
                        <select
                            className="help-input"
                            value={access}
                            onChange={(event) => setAccess(event.target.value)}
                        >
                            <option value="read">Read-only</option>
                            <option value="write">Read and write</option>
                            {hasRole('admin') && <option value="telemetry">Diagnostics and feedback</option>}
                        </select>
                    </label>
                    <label className="text-sm">
                        Expires in
                        <select
                            className="help-input"
                            value={days}
                            onChange={(event) => setDays(event.target.value)}
                        >
                            <option value="30">30 days</option>
                            <option value="90">90 days</option>
                            <option value="365">1 year</option>
                        </select>
                    </label>
                    <button
                        className="studio-button primary"
                        disabled={pending || !!created || !name.trim()}
                    >
                        <KeyRound size={16} />
                        {pending ? 'Creating…' : 'Create key'}
                    </button>
                </form>
                <p className="text-xs text-muted mt-4">
                    Keys inherit your current roles and workspace access.
                    Read/write keys can change data and launch ads where you
                    have permission.
                </p>
            </section>
            {created && (
                <section
                    className="studio-panel p-5 border-brand-line bg-brand-soft"
                    aria-label="New API key"
                >
                    <h2 className="font-semibold mb-2">Copy your key now</h2>
                    <p className="text-sm text-secondary mb-3">
                        This is the only time the complete key is shown. Store
                        it securely before closing.
                    </p>
                    <div className="flex flex-wrap gap-3 items-center">
                        <code
                            className="select-all break-all font-mono text-sm flex-1"
                            aria-label="Generated API key"
                        >
                            {created.apiKey}
                        </code>
                        <button onClick={copy} className="studio-button">
                            <Copy size={16} />
                            Copy key
                        </button>
                    </div>
                    <button
                        onClick={() => setCreated(null)}
                        className="studio-button mt-3"
                    >
                        I saved my key
                    </button>
                </section>
            )}
            <section className="studio-panel p-5" aria-label="Your API keys">
                <h2 className="font-semibold mb-3">Your keys</h2>
                {loading && (
                    <p role="status" className="text-sm text-muted">
                        Loading keys…
                    </p>
                )}
                {error && (
                    <div role="alert" className="text-danger text-sm">
                        {error}
                        <button onClick={load} className="studio-button ml-3">
                            Retry
                        </button>
                    </div>
                )}
                {!loading && !error && !keys.length && (
                    <p className="text-sm text-muted">
                        No keys yet. Create one to connect your tools.
                    </p>
                )}
                <div className="divide-y divide-line">
                    {keys.map((key) => (
                        <article
                            key={key.id}
                            className="py-4 flex flex-wrap justify-between gap-3 items-center"
                        >
                            <div className="min-w-0">
                                <h3 className="font-medium break-words">
                                    {key.name}
                                </h3>
                                <p className="text-xs text-muted mt-1">
                                    {key.prefix ? `${key.prefix}… · ` : ''}
                                    {key.scopes.includes('platform:write')
                                        ? 'Read and write'
                                        : key.scopes.includes('platform:read')
                                          ? 'Read-only'
                                          : key.scopes.includes('telemetry:read') ? 'Diagnostics and feedback' : 'Legacy bot'}{' '}
                                    ·{' '}
                                    {key.revokedAt
                                        ? 'Revoked'
                                        : key.expiresAt &&
                                            Date.parse(key.expiresAt) <=
                                                Date.now()
                                          ? 'Expired'
                                          : 'Active'}
                                </p>
                                <p className="text-xs text-muted mt-1">
                                    Last used: {date(key.lastUsedAt)} · Expires:{' '}
                                    {date(key.expiresAt)}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    className="studio-button"
                                    aria-label={`Rename ${key.name}`}
                                    onClick={() => {
                                        setEditing(key.id);
                                        setEditName(key.name);
                                    }}
                                >
                                    <Pencil size={14} />
                                    Rename
                                </button>
                                <button
                                    className="studio-button text-danger"
                                    disabled={!!key.revokedAt}
                                    onClick={() => setRevoking(key)}
                                    aria-label={`Revoke ${key.name}`}
                                >
                                    <Trash2 size={14} />
                                    Revoke
                                </button>
                            </div>
                            {editing === key.id && (
                                <form
                                    onSubmit={rename}
                                    className="w-full flex gap-2"
                                >
                                    <label className="flex-1 text-sm">
                                        New key name
                                        <input
                                            required
                                            maxLength={80}
                                            className="help-input"
                                            value={editName}
                                            onChange={(event) =>
                                                setEditName(event.target.value)
                                            }
                                        />
                                    </label>
                                    <button
                                        className="studio-button self-end"
                                        disabled={pending || !editName.trim()}
                                    >
                                        Save name
                                    </button>
                                    <button
                                        type="button"
                                        className="studio-button self-end"
                                        onClick={() => setEditing(null)}
                                    >
                                        Cancel
                                    </button>
                                </form>
                            )}
                        </article>
                    ))}
                </div>
            </section>
            <ConfirmationModal
                isOpen={!!revoking}
                onClose={() => setRevoking(null)}
                title="Revoke API key?"
                message={`Tools using “${revoking?.name}” will lose access. Create a new key if you need to reconnect them.`}
                confirmText="Revoke key"
                onConfirm={async () => {
                    await api(`/api-keys/${revoking.id}`, { method: 'DELETE' });
                    await load();
                    showSuccess('API key revoked.');
                }}
            />
        </div>
    );
}

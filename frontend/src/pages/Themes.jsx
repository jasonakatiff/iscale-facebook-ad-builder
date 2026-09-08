import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Github, Palette, Plus, RefreshCw } from 'lucide-react';
import { usePlatformApi, downloadBlob } from '../lib/platformApi';
import {
    BUILTIN_SKINS,
    PALETTE_FIELDS,
    themeDocument,
    validateSkin,
} from '../lib/skins';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import ConfirmationModal from '../components/ConfirmationModal';

export default function Themes() {
    const api = usePlatformApi();
    const { skin, setSkin, resolvedTheme } = useTheme();
    const { showError, showSuccess } = useToast();
    const [themes, setThemes] = useState([]),
        [draft, setDraft] = useState(null),
        [editingId, setEditingId] = useState(null),
        [mode, setMode] = useState('light'),
        [githubUrl, setGithubUrl] = useState(''),
        [pending, setPending] = useState(false),
        [error, setError] = useState(''),
        [loading, setLoading] = useState(true),
        [deleting, setDeleting] = useState(null);
    const fileInput = useRef(null);
    const load = useCallback(async () => {
        setError('');
        setLoading(true);
        try {
            const result = await api('/themes?limit=100');
            setThemes(result.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [api]);
    useEffect(() => {
        load();
    }, [load]);
    const edit = (theme, id = null) => {
        setDraft(structuredClone(themeDocument(theme)));
        setEditingId(id);
        setMode(resolvedTheme);
    };
    const save = async (event) => {
        event.preventDefault();
        if (pending) return;
        setPending(true);
        try {
            const document = validateSkin(draft);
            const result = await api(
                editingId ? `/themes/${editingId}` : '/themes',
                {
                    method: editingId ? 'PUT' : 'POST',
                    body: JSON.stringify(document),
                },
            );
            if (skin.id === editingId) setSkin(result.data);
            setDraft(null);
            setEditingId(null);
            await load();
            showSuccess('Theme saved to your library.');
        } catch (err) {
            showError(err.message);
        } finally {
            setPending(false);
        }
    };
    const importGitHub = async (event) => {
        event.preventDefault();
        if (pending) return;
        setPending(true);
        try {
            await api('/themes/import-github', {
                method: 'POST',
                body: JSON.stringify({ url: githubUrl }),
            });
            setGithubUrl('');
            await load();
            showSuccess('GitHub theme added.');
        } catch (err) {
            showError(err.message);
        } finally {
            setPending(false);
        }
    };
    const importFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            if (file.size > 32768)
                throw new Error('Theme files must be 32 KB or smaller.');
            edit(validateSkin(JSON.parse(await file.text())));
        } catch (err) {
            showError(err.message || 'Unable to read that theme file.');
        }
    };
    const download = (theme) =>
        downloadBlob(
            new Blob([JSON.stringify(themeDocument(theme), null, 2) + '\n'], {
                type: 'application/json',
            }),
            'theleadrouter-ad-studio-theme.json',
        );
    const refresh = async (theme) => {
        if (pending) return;
        setPending(true);
        try {
            const result = await api(`/themes/${theme.id}/refresh-github`, {
                method: 'POST',
            });
            if (skin.id === theme.id) setSkin(result.data);
            await load();
            showSuccess('Theme refreshed from GitHub.');
        } catch (err) {
            showError(err.message);
        } finally {
            setPending(false);
        }
    };
    const card = (theme, builtin) => {
        const palette = theme[resolvedTheme];
        return (
            <article
                key={theme.id}
                className={`studio-panel overflow-hidden ${skin.id === theme.id ? 'ring-2 ring-brand-ink' : ''}`}
            >
                <div
                    className="skin-preview"
                    style={{ background: palette.canvas, color: palette.text }}
                    aria-label={`${theme.name} preview`}
                >
                    <aside
                        style={{
                            background: palette.panel,
                            borderColor: palette.border,
                        }}
                    >
                        <span style={{ background: palette.text }} />
                        <i style={{ background: palette.accent }} />
                        <i style={{ background: palette.border }} />
                        <i style={{ background: palette.border }} />
                    </aside>
                    <div>
                        <span style={{ color: palette.muted }}>
                            Your workspace
                        </span>
                        <h3>Build your next campaign</h3>
                        <section
                            style={{
                                background: palette.panel,
                                borderColor: palette.border,
                            }}
                        >
                            <span>Creative ready for review</span>
                            <b
                                style={{
                                    background: palette.accent,
                                    color: palette.accentText,
                                }}
                            >
                                Review
                            </b>
                        </section>
                    </div>
                </div>
                <div className="p-4">
                    <div className="flex justify-between gap-2">
                        <h3 className="font-semibold text-sm">{theme.name}</h3>
                        {skin.id === theme.id && (
                            <span className="text-xs text-success">
                                Applied
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-muted mt-1">
                        {builtin
                            ? 'Built-in · light + dark'
                            : theme.githubUrl
                              ? 'Your library · GitHub connected'
                              : 'Your library · light + dark'}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-4">
                        <button
                            className="studio-button"
                            onClick={() => {
                                setSkin(theme);
                                showSuccess(`${theme.name} applied.`);
                            }}
                        >
                            Apply
                        </button>
                        <button
                            className="studio-button"
                            onClick={() =>
                                edit(theme, builtin ? null : theme.id)
                            }
                        >
                            {builtin ? 'Customize' : 'Edit'}
                        </button>
                        <button
                            className="icon-button"
                            aria-label={`Download ${theme.name}`}
                            onClick={() => download(theme)}
                        >
                            <Download size={16} />
                        </button>
                        {!builtin && (
                            <button
                                className="studio-button text-danger"
                                onClick={() => setDeleting(theme)}
                            >
                                Delete
                            </button>
                        )}
                        {theme.githubUrl && (
                            <button
                                className="studio-button"
                                disabled={pending}
                                onClick={() => refresh(theme)}
                            >
                                <RefreshCw size={14} />
                                Refresh GitHub
                            </button>
                        )}
                    </div>
                </div>
            </article>
        );
    };
    return (
        <div className="space-y-6">
            <header className="studio-page-header">
                <div>
                    <p className="studio-eyebrow">Make it yours</p>
                    <h1 className="studio-heading">Theme Library</h1>
                    <p className="studio-description">
                        Build a skin, keep a personal library, and share it
                        through GitHub.
                    </p>
                </div>
                <button
                    className="studio-button primary"
                    onClick={() =>
                        edit({ ...BUILTIN_SKINS[0], name: 'My theme' })
                    }
                >
                    <Plus size={16} />
                    Create theme
                </button>
            </header>
            <div className="grid xl:grid-cols-3 md:grid-cols-2 gap-4">
                {BUILTIN_SKINS.map((theme) => card(theme, true))}
            </div>
            <section className="studio-panel p-5">
                <h2 className="font-semibold flex items-center gap-2">
                    <Github size={18} />
                    Connect a GitHub theme
                </h2>
                <p className="text-sm text-muted mt-2 mb-4">
                    Paste a public GitHub link to a theme JSON file for this ad workspace.
                    Refresh it manually when its author publishes changes.
                </p>
                <form
                    onSubmit={importGitHub}
                    className="flex flex-wrap gap-3 items-end"
                >
                    <label className="flex-1 min-w-0 text-sm">
                        GitHub theme file
                        <input
                            className="help-input"
                            type="url"
                            required
                            placeholder="https://github.com/owner/repo/blob/main/theme.json"
                            value={githubUrl}
                            onChange={(event) =>
                                setGithubUrl(event.target.value)
                            }
                        />
                    </label>
                    <button
                        className="studio-button"
                        disabled={pending || !githubUrl.trim()}
                    >
                        Import from GitHub
                    </button>
                    <button
                        type="button"
                        className="studio-button"
                        onClick={() => fileInput.current.click()}
                    >
                        Import JSON file
                    </button>
                    <input
                        ref={fileInput}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        aria-label="Import theme JSON"
                        onChange={importFile}
                    />
                </form>
                <p className="text-xs text-muted mt-3">
                    Color settings only. Export any skin below as a JSON file
                    for your repository. Private repositories and automatic
                    GitHub commits are not connected.
                </p>
            </section>
            {draft && (
                <form
                    onSubmit={save}
                    className="studio-panel p-5 space-y-4"
                    aria-label="Theme editor"
                >
                    <div className="flex flex-wrap justify-between gap-3">
                        <h2 className="font-semibold flex gap-2 items-center">
                            <Palette size={18} />
                            {editingId ? 'Edit theme' : 'Create your theme'}
                        </h2>
                        <button
                            className="studio-button"
                            type="button"
                            onClick={() => setDraft(null)}
                        >
                            Cancel
                        </button>
                    </div>
                    <label className="block text-sm max-w-sm">
                        Theme name
                        <input
                            className="help-input"
                            required
                            maxLength={80}
                            value={draft.name}
                            onChange={(event) =>
                                setDraft((previous) => ({
                                    ...previous,
                                    name: event.target.value,
                                }))
                            }
                        />
                    </label>
                    <div className="flex gap-2">
                        {['light', 'dark'].map((value) => (
                            <button
                                key={value}
                                className={`studio-button ${mode === value ? 'primary' : ''}`}
                                type="button"
                                aria-pressed={mode === value}
                                onClick={() => setMode(value)}
                            >
                                {value === 'light'
                                    ? 'Light palette'
                                    : 'Dark palette'}
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {PALETTE_FIELDS.map((field) => (
                            <label key={field} className="text-sm">
                                {field}
                                <input
                                    className="block w-full h-10 mt-2 cursor-pointer"
                                    type="color"
                                    aria-label={`${mode} ${field}`}
                                    value={draft[mode][field]}
                                    onChange={(event) =>
                                        setDraft((previous) => ({
                                            ...previous,
                                            [mode]: {
                                                ...previous[mode],
                                                [field]:
                                                    event.target.value.toUpperCase(),
                                            },
                                        }))
                                    }
                                />
                            </label>
                        ))}
                    </div>
                    <p className="text-xs text-muted">
                        Text and button colors need at least 4.5:1 contrast.
                        Both palettes are validated when you save.
                    </p>
                    <button
                        className="studio-button primary"
                        disabled={pending || !draft.name.trim()}
                    >
                        Save theme
                    </button>
                </form>
            )}
            <section aria-label="Your theme library">
                <h2 className="font-semibold mb-4">Your themes</h2>
                {loading && <p role="status">Loading your library…</p>}
                {error && (
                    <div role="alert" className="text-danger">
                        {error}
                        <button className="studio-button ml-3" onClick={load}>
                            Retry
                        </button>
                    </div>
                )}
                {!loading && !error && !themes.length && (
                    <p className="text-sm text-muted">
                        Customize a built-in skin or import a theme to start
                        your library.
                    </p>
                )}
                <div className="grid xl:grid-cols-3 md:grid-cols-2 gap-4">
                    {themes.map((theme) => card(theme, false))}
                </div>
            </section>
            <ConfirmationModal
                isOpen={!!deleting}
                onClose={() => setDeleting(null)}
                title="Delete theme?"
                message={`Remove “${deleting?.name}” from your library? Its GitHub source will remain available.`}
                onConfirm={async () => {
                    await api(`/themes/${deleting.id}`, { method: 'DELETE' });
                    if (skin.id === deleting.id) setSkin(BUILTIN_SKINS[0]);
                    await load();
                }}
            />
        </div>
    );
}

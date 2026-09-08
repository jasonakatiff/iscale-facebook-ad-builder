import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Download, ExternalLink, Search } from 'lucide-react';
import { API_BASE, downloadBlob } from '../lib/platformApi';
import { useToast } from '../context/ToastContext';

export default function Help() {
    const { showError } = useToast();
    const [docs, setDocs] = useState([]),
        [schema, setSchema] = useState(null),
        [query, setQuery] = useState(''),
        [error, setError] = useState(''),
        [revision, setRevision] = useState(0),
        [busy, setBusy] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        setError('');
        async function load() {
            try {
                const [guides, contract] = await Promise.all([
                    fetch(`${API_BASE}/help/docs`, {
                        signal: controller.signal,
                    }),
                    fetch(`${API_BASE}/openapi.json`, {
                        signal: controller.signal,
                    }),
                ]);
                if (!guides.ok || !contract.ok)
                    throw new Error('Documentation could not be loaded.');
                const [list, spec] = await Promise.all([
                    guides.json(),
                    contract.json(),
                ]);
                if (!controller.signal.aborted) {
                    setDocs(list.data);
                    setSchema(spec);
                }
            } catch (err) {
                if (!controller.signal.aborted) setError(err.message);
            }
        }
        load();
        return () => controller.abort();
    }, [revision]);
    const endpoints = useMemo(
        () =>
            Object.entries(schema?.paths || {}).flatMap(([path, methods]) =>
                Object.entries(methods)
                    .filter(([method]) =>
                        [
                            'get',
                            'post',
                            'put',
                            'patch',
                            'delete',
                            'head',
                            'options',
                        ].includes(method),
                    )
                    .map(([method, operation]) => ({
                        path,
                        method,
                        ...operation,
                    })),
            ),
        [schema],
    );
    const matching = endpoints.filter((item) =>
        `${item.method} ${item.path} ${item.summary} ${(item.tags || []).join(' ')}`
            .toLowerCase()
            .includes(query.toLowerCase()),
    );
    const download = async (path, filename) => {
        if (busy) return;
        setBusy(true);
        try {
            const response = await fetch(`${API_BASE}${path}`);
            if (!response.ok) throw new Error('Download failed. Try again.');
            downloadBlob(await response.blob(), filename);
        } catch (err) {
            showError(err.message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="space-y-6">
            <header className="studio-page-header">
                <div>
                    <p className="studio-eyebrow">
                        BreadWinner by theLeadRouter.com
                    </p>
                    <h1 className="studio-heading">Help & API Docs</h1>
                    <p className="studio-description">
                        Learn every feature and give your tools the same
                        reference.
                    </p>
                </div>
                <Link to="/settings/api-keys" className="studio-button">
                    Manage API keys
                </Link>
            </header>
            <section className="studio-panel p-5 flex flex-wrap justify-between gap-5 items-center">
                <div className="max-w-xl">
                    <h2 className="font-semibold mb-2">
                        Your documentation pack
                    </h2>
                    <p className="text-sm text-muted">
                        All user guides as Markdown, OpenAPI JSON, and a Claude
                        Code guide in one ZIP. Add the files to your project to
                        automate BreadWinner.
                    </p>
                </div>
                <button
                    className="studio-button primary"
                    disabled={busy}
                    onClick={() =>
                        download('/help/download', 'breadwinner-docs.zip')
                    }
                >
                    <Download size={16} />
                    Download all docs
                </button>
            </section>
            {error && (
                <div role="alert" className="text-danger">
                    {error}
                    <button
                        className="studio-button ml-3"
                        onClick={() => setRevision((value) => value + 1)}
                    >
                        Retry
                    </button>
                </div>
            )}
            {!schema && !error && <p role="status">Loading documentation…</p>}
            <section aria-labelledby="user-guides-title">
                <h2 id="user-guides-title" className="font-semibold mb-3">
                    User guides · Markdown
                </h2>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {docs.map((doc) => (
                        <article
                            key={doc.slug}
                            className="studio-panel p-4 flex gap-3 items-start"
                        >
                            <BookOpen
                                size={18}
                                className="text-brand-ink flex-shrink-0 mt-1"
                            />
                            <div className="min-w-0">
                                <h3 className="text-sm font-medium">
                                    {doc.title}
                                </h3>
                                <div className="flex gap-4 mt-3 text-xs">
                                    <a
                                        href={`${API_BASE}/help/docs/${doc.slug}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-brand-ink underline"
                                    >
                                        Read guide
                                    </a>
                                    <button
                                        disabled={busy}
                                        onClick={() =>
                                            download(
                                                `/help/docs/${doc.slug}`,
                                                doc.filename,
                                            )
                                        }
                                        className="text-brand-ink underline"
                                    >
                                        Download MD
                                    </button>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            </section>
            <section
                className="studio-panel p-5"
                aria-labelledby="api-reference-title"
            >
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 id="api-reference-title" className="font-semibold">
                        API reference
                    </h2>
                    <div className="flex flex-wrap gap-3">
                        <a
                            className="studio-button"
                            href={`${API_BASE}/docs`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Interactive OpenAPI <ExternalLink size={14} />
                        </a>
                        <button
                            className="studio-button"
                            disabled={busy}
                            onClick={() =>
                                download('/openapi.json', 'openapi.json')
                            }
                        >
                            Download OpenAPI JSON
                        </button>
                    </div>
                </div>
                <p className="text-sm text-muted mb-4">
                    Send your user key as{' '}
                    <code>Authorization: Bearer YOUR_API_KEY</code>. Read/write
                    keys inherit your permissions, including campaign actions.
                    Legacy shared catalogs and workspace-scoped resources retain
                    their existing access rules.
                </p>
                <label className="flex gap-2 items-center border border-line rounded-lg px-3">
                    <Search size={16} className="text-muted" />
                    <input
                        aria-label="Search API endpoints"
                        placeholder="Search features, paths, or methods…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="w-full py-2.5 bg-transparent outline-none"
                    />
                </label>
                <p className="text-xs text-muted my-3">
                    {matching.length} endpoints
                </p>
                <div className="space-y-2">
                    {matching.map((item) => (
                        <details
                            key={`${item.method}:${item.path}`}
                            className="border border-line rounded-lg p-3"
                        >
                            <summary className="cursor-pointer text-sm">
                                <span
                                    className={`inline-block w-16 font-mono font-semibold ${item.method === 'get' ? 'text-success' : 'text-brand-ink'}`}
                                >
                                    {item.method.toUpperCase()}
                                </span>
                                <code className="break-all">{item.path}</code>
                                <span className="block sm:inline text-xs text-muted sm:ml-4 mt-1">
                                    {item.summary}
                                </span>
                            </summary>
                            <div className="pt-3 text-sm space-y-3">
                                <p>{item.description || item.summary}</p>
                                <p className="text-muted">
                                    Authentication:{' '}
                                    {item.security?.length
                                        ? 'Bearer credential; see operation scopes and role checks.'
                                        : 'See the operation description; some callbacks validate OAuth state.'}
                                </p>
                                <pre className="text-xs bg-inset rounded p-3 overflow-x-auto max-h-80">
                                    {JSON.stringify(
                                        {
                                            parameters: item.parameters,
                                            requestBody: item.requestBody,
                                            responses: item.responses,
                                        },
                                        null,
                                        2,
                                    )}
                                </pre>
                                <a
                                    className="text-brand-ink underline"
                                    href={`${API_BASE}/docs#/${encodeURIComponent(item.tags?.[0] || 'default')}/${encodeURIComponent(item.operationId)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Open schemas in interactive reference
                                </a>
                            </div>
                        </details>
                    ))}
                </div>
            </section>
        </div>
    );
}

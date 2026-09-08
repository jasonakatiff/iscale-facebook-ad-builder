import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListOrdered, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ConfirmationModal from '../components/ConfirmationModal';
import { deliveryRequest, DELIVERY_PAGE_SIZE, DELIVERY_POLL_MS, formatDeliveryTime } from '../lib/delivery';

const panel = 'bg-surface border border-line rounded-xl p-5 space-y-4';
const input = 'w-full border border-line rounded-lg px-3 py-2 focus:outline-brand';
const button = 'rounded-lg bg-brand text-white px-4 py-2 disabled:opacity-50';
const settingsFields = [
    ['min_interval_seconds', 'Minimum seconds between postings', 1, 3600],
    ['max_posts', 'Maximum postings per window', 1, 10000],
    ['window_seconds', 'Rolling window in seconds', 1, 86400],
    ['max_read_retries', 'Maximum data-pull retries', 0, 10],
    ['status_interval_seconds', 'Status refresh in seconds', 60, 86400],
    ['performance_interval_seconds', 'Performance refresh in seconds', 60, 86400],
];
const labels = { queued: 'Queued', working: 'In progress', succeeded: 'Posted', failed: 'Failed', needs_reconciliation: 'Needs reconciliation', cancelled: 'Cancelled' };

export function PostingQueue() {
    const { hasRole } = useAuth();
    const admin = hasRole('admin');
    const { showSuccess, showError } = useToast();
    const [settings, setSettings] = useState(null);
    const [draft, setDraft] = useState(null);
    const [jobs, setJobs] = useState(null);
    const [syncs, setSyncs] = useState(null);
    const [offset, setOffset] = useState(0);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [cancel, setCancel] = useState(null);
    const [reconcile, setReconcile] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState('');

    const load = useCallback(async (signal) => {
        const [configuration, postings, imports] = await Promise.all([
            deliveryRequest('/settings', { signal }),
            deliveryRequest(`/jobs?limit=${DELIVERY_PAGE_SIZE}&offset=${offset}`, { signal }),
            deliveryRequest('/syncs?limit=100', { signal }),
        ]);
        setSettings(configuration);
        setDraft(previous => previous || configuration.config);
        setJobs(postings);
        setSyncs(imports);
        setError('');
    }, [offset]);

    useEffect(() => {
        const controller = new AbortController();
        let timer;
        const refresh = async () => {
            try { await load(controller.signal); }
            catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
            if (!controller.signal.aborted) timer = setTimeout(refresh, DELIVERY_POLL_MS);
        };
        refresh();
        return () => { controller.abort(); clearTimeout(timer); };
    }, [load]);

    const act = async (operation, message) => {
        setBusy(true);
        try { await operation(); showSuccess(message); await load(); }
        catch (failure) { setError(failure.message); showError(failure.message); }
        finally { setBusy(false); }
    };
    const save = event => {
        event.preventDefault();
        act(() => deliveryRequest('/settings', { method: 'PUT', body: draft }), 'Delivery settings saved');
    };
    const findCandidates = async job => {
        setBusy(true);
        setReconcile(job);
        setSelected('');
        setSearch('');
        setCandidates([]);
        try { setCandidates((await deliveryRequest(`/jobs/${job.id}/candidates`)).data); }
        catch (failure) { setError(failure.message); }
        finally { setBusy(false); }
    };
    const workerActive = settings?.posting_heartbeat && Date.now() - new Date(settings.posting_heartbeat).getTime() < 180000;
    return <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
            <div><h1 className="text-3xl font-bold text-primary flex items-center gap-3"><ListOrdered className="text-brand-ink" />Posting queue</h1>
                <p className="text-secondary mt-2">{admin ? 'Shared posting limits and delivery across all buyers.' : 'Track your ads from queue to Facebook.'} Queued ads continue after you leave this page.</p></div>
            <Link to="/reporting" className="text-brand-ink underline">View reporting</Link>
        </header>
        {error && <div role="alert" className="bg-danger-soft border border-red-200 rounded-xl p-4 text-danger">{error}<button className="ml-4 underline" onClick={() => load().catch(failure => setError(failure.message))}>Retry</button></div>}
        {!settings && !error && <p role="status">Loading delivery settings…</p>}
        {settings && <section className={panel} aria-label="Delivery settings">
            <div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-semibold">Delivery settings</h2><span className={workerActive ? 'text-success' : 'text-brand-ink'}>{workerActive ? 'Posting worker active' : 'Posting worker has not checked in recently'}</span></div>
            <p className="text-sm text-secondary">One shared limit counts final ad-creation attempts. Media preparation runs before dispatch. The configured interval is a minimum; Facebook processing can take longer.</p>
            <p className="text-sm text-secondary">Current: {settings.config.min_interval_seconds}s minimum · {settings.config.max_posts} postings per {settings.config.window_seconds}s · {settings.config.max_read_retries} retries after the initial data-pull attempt.</p>
            {admin && draft && <form onSubmit={save} className="space-y-4">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{settingsFields.map(([key, label, min, max]) => <label key={key} className="text-sm font-medium text-gray-700">{label}<input className={`${input} mt-1`} type="number" min={min} max={max} step="1" required value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value === '' ? '' : Number(event.target.value) })} /></label>)}</div>
                <div className="flex flex-wrap gap-6"><label className="flex items-center gap-2"><input type="checkbox" checked={draft.paused} onChange={event => setDraft({ ...draft, paused: event.target.checked })} />Pause posting</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={draft.imports_enabled} onChange={event => setDraft({ ...draft, imports_enabled: event.target.checked })} />Enable status and performance imports</label></div>
                <p className="text-sm text-muted">Changes apply to queued work. Running requests finish. Failed imports stay stopped until an admin restarts them.</p>
                <button className={button} disabled={busy}>Save delivery settings</button>
            </form>}
        </section>}
        <section className={panel} aria-label="Posting jobs">
            <div className="flex justify-between items-center"><h2 className="text-lg font-semibold">{admin ? 'All posting jobs' : 'Your posting jobs'}</h2><span className="text-sm text-muted">Refreshes every 5 seconds</span></div>
            {jobs?.data.length === 0 && <p>No posting jobs yet. Queue ads from Facebook Campaigns.</p>}
            {jobs?.data.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="border-b text-muted"><th className="py-3">Ad</th><th>Account</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>{jobs.data.map(job => <tr key={job.id} className="border-b align-top">
                <td className="py-3 pr-4"><p className="font-medium">{job.name}</p><details className="mt-1 text-muted"><summary>Job details</summary><p className="break-all">Job: {job.id}</p><p>Stage: {job.stage}</p>{job.results?.ad_id && <p>Facebook ad: {job.results.ad_id}</p>}{job.results?.creative_id && <p>Creative: {job.results.creative_id}</p>}</details></td>
                <td className="py-3 pr-4">{job.account_id}</td><td className="py-3 pr-4"><span className={`rounded-full px-2 py-1 text-xs ${['failed', 'needs_reconciliation'].includes(job.status) ? 'bg-danger-soft text-danger' : job.status === 'succeeded' ? 'bg-success-soft text-success' : 'bg-brand-soft text-brand-ink'}`}>{labels[job.status] || job.status}</span>{job.error_message && <p className="max-w-sm mt-2 text-danger">{job.error_message}</p>}</td>
                <td className="py-3 pr-4 whitespace-nowrap">{formatDeliveryTime(job.created_at)}</td><td className="py-3">{job.status === 'queued' && <button disabled={busy} className="text-red-700 underline" onClick={() => setCancel(job)}>Cancel {job.name}</button>}{admin && job.status === 'needs_reconciliation' && job.stage === 'ad' && <button disabled={busy} className="underline" onClick={() => findCandidates(job)}>Find matching Facebook ad</button>}</td>
            </tr>)}</tbody></table></div>}
            {jobs && <div className="flex justify-between items-center text-sm"><button className="underline disabled:opacity-40" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - DELIVERY_PAGE_SIZE))}>Previous jobs</button><span>{jobs.pagination.total} jobs</span><button className="underline disabled:opacity-40" disabled={!jobs.pagination.hasMore} onClick={() => setOffset(offset + DELIVERY_PAGE_SIZE)}>Next jobs</button></div>}
        </section>
        {reconcile && <section className={panel} aria-label="Reconcile posting"><h2 className="font-semibold">Reconcile {reconcile.name}</h2><p>Only ads with this job’s launch marker, account, ad set and creative can be linked. This action creates no new Facebook ad.</p>
            <label className="block">Search matching ads<input className={input} value={search} onChange={event => setSearch(event.target.value)} /></label>
            <label className="block">Matching Facebook ad<select className={input} value={selected} onChange={event => setSelected(event.target.value)}><option value="">Select a verified match</option>{candidates.filter(candidate => `${candidate.name} ${candidate.id}`.toLowerCase().includes(search.toLowerCase())).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.id}</option>)}</select></label>
            {!busy && candidates.length === 0 && <p>No verified match found. The job remains stopped for investigation.</p>}
            <div className="flex gap-3"><button className={button} disabled={busy || !selected} onClick={() => act(async () => { await deliveryRequest(`/jobs/${reconcile.id}/reconcile`, { method: 'POST', body: { fb_ad_id: selected } }); setReconcile(null); }, 'Facebook ad linked')}>Link selected ad</button><button onClick={() => setReconcile(null)}>Close</button></div>
        </section>}
        <section className={panel} aria-label="Data imports"><h2 className="text-lg font-semibold">Data imports</h2><p className="text-sm text-secondary">Performance refreshes reread 7 reporting days; daily reconciliation rereads 28 days. Dates use each ad account’s timezone. Retry limits apply to a complete import run.</p>
            {syncs?.data.length === 0 && <p>Imports begin after the first queued ad is posted.</p>}
            {syncs?.data.map(sync => <div key={sync.id} className="border-t pt-3 flex flex-wrap justify-between gap-3"><div><p className="font-medium">{sync.account_id} · {sync.kind}</p><p className="text-sm">{sync.status} · {sync.failures} failed attempts · Last success: {formatDeliveryTime(sync.last_success_at)}</p>{sync.error_message && <p className="text-danger text-sm">{sync.error_message}</p>}</div>{admin && <button className={button} disabled={busy || sync.status === 'running'} onClick={() => act(() => deliveryRequest(`/syncs/${sync.id}/restart`, { method: 'POST' }), 'Import scheduled')}><RefreshCw className="inline mr-2" size={15} />{sync.status === 'failed' ? 'Restart import' : 'Sync now'}</button>}</div>)}
        </section>
        <ConfirmationModal isOpen={!!cancel} onClose={() => setCancel(null)} title="Cancel queued ad?" message={`Stop ${cancel?.name || 'this ad'} before it posts. Any media already prepared remains on Facebook.`} confirmText="Cancel posting" onConfirm={() => act(() => deliveryRequest(`/jobs/${cancel.id}/cancel`, { method: 'POST' }), 'Posting cancelled')} />
    </div>;
}

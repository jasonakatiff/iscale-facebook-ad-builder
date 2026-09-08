import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usePlatformApi } from '../lib/platformApi';
import { useWorkspaceData } from '../lib/workspaceApi';
import { PLATFORM_NAMES, metricNames, fieldName, when } from '../lib/analytics';
import { sourceLabel } from '../lib/creatives';
import { SearchableSelect } from '../components/SearchableSelect';
import { CreativePicker } from '../components/CreativePicker';

const selectClass = 'border border-line-strong rounded-lg px-3 py-2 w-full mt-2';
function ReadState({ state }) {
    return <>{state.loading && <p role="status">Loading saved analytics…</p>}{state.error && <p role="alert" className="text-danger">{state.error} <button onClick={state.reload} className="underline">Retry</button></p>}</>;
}
function Pages({ data, offset, setOffset, size }) {
    if (!data?.pagination?.total) return null;
    return <div className="flex items-center gap-4 text-sm"><button className="studio-button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - size))}>Previous</button><span>{offset + 1}–{Math.min(offset + size, data.pagination.total)} of {data.pagination.total}</span><button className="studio-button" disabled={!data.pagination.hasMore} onClick={() => setOffset(offset + size)}>Next</button></div>;
}
function Patterns({ api, query }) {
    const [metric, setMetric] = useState('');
    const state = useWorkspaceData(api, `/analytics/patterns?${query}&${new URLSearchParams(metric ? { metric } : {})}`, { poll: false });
    const result = state.data;
    return <section className="space-y-4" aria-label="Creative patterns">
        <div className="flex gap-4 items-end justify-between"><label className="text-sm max-w-sm flex-1">Success metric<select aria-label="Success metric" className={selectClass} value={metric} onChange={event => setMetric(event.target.value)}><option value="">Use saved default</option>{Object.entries(metricNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><button className="studio-button" disabled={state.loading} onClick={state.reload}>Recalculate patterns</button></div>
        <p className="text-sm text-secondary">Find shared traits among winners in comparable ad groups. Duplicate uses in one group count together; a creative used across groups contributes its highest-impression group only. Correlations guide experiments; they do not prove a trait caused better performance.</p>
        <ReadState state={state} />
        {result && <>
            <div className="studio-panel p-4 text-sm space-y-2">
                <p>{result.coverage.eligible_creatives} eligible creative/group combinations · {result.coverage.winners} winners · {result.coverage.cohorts} comparable groups · {metricNames[result.settings.metric]}</p>
                <p className="text-secondary">{result.coverage.unlinked_ads} ads need a creative link · {result.coverage.immature_rows} daily rows are still settling · {result.coverage.conflicting_creatives} creatives excluded for conflicting metadata · {result.coverage.repeated_creative_groups || 0} repeated creative/group combinations excluded · {result.coverage.conflicting_daily_rows || 0} daily rows excluded for conflicting links.</p>
                <p className="text-muted">{result.tested_patterns} of {result.available_patterns} eligible traits and pairs tested. Up to 256 are selected by sample size before testing. Updated {when(result.computed_at)}.</p>
            </div>
            {!result.data.length && <div className="studio-panel p-6"><h2 className="font-semibold">No reliable comparison yet</h2><p className="text-sm text-secondary mt-2">Import performance and link the matching creatives. Comparisons need at least {result.settings.min_cohort_creatives} creatives per group and {result.settings.min_impressions} impressions per creative. Tied results or traits shared by every creative do not produce a signal.</p></div>}
            {result.data.map((pattern, index) => <article key={index} className="studio-panel p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="font-semibold">{pattern.traits.map(trait => `${fieldName(trait.field)}: ${trait.label || trait.value.replaceAll('_', ' ')}`).join(' + ')}</h2><span className={`text-xs rounded-full px-3 py-1 ${pattern.evidence === 'supported' ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>{pattern.evidence === 'supported' ? 'Stronger evidence' : 'Exploratory'}</span></div>
                <p className="text-sm">{pattern.winner_count} winners among {pattern.support} creative/group combinations sharing this {pattern.traits.length === 1 ? 'trait' : 'pair'}; {pattern.expected_winners} expected from their groups’ baseline.</p>
                <p className="text-xs text-secondary">Adjusted p-value: {pattern.q_value}. {pattern.evidence === 'supported' ? 'Passes the configured false discovery threshold.' : 'Does not pass the configured false discovery threshold.'}</p>
                {!!pattern.creative_examples?.length && <details><summary className="cursor-pointer text-sm text-brand">Supporting creative examples</summary><ul className="grid sm:grid-cols-3 gap-3 mt-3">{pattern.creative_examples.map(item => <li key={item.asset_id} className="border border-line rounded-lg p-3 text-xs">{item.media_type === 'image' && <img src={item.media_url} alt={item.name || 'Linked creative'} loading="lazy" className="h-28 w-full object-contain mb-2" />}{item.media_type === 'video' && <video src={item.media_url} controls preload="none" className="h-28 w-full mb-2" />}<p>{item.name || 'Linked creative'} · {sourceLabel(item.source_type)}</p></li>)}</ul></details>}
            </article>)}
            <p className="text-xs text-muted">CPA uses the selected Facebook event, Google primary conversions, and TikTok optimization conversions. These datasets remain separate. TikTok conversion value is unavailable in this importer and is excluded from ROAS. Currency totals are never combined.</p>
        </>}
    </section>;
}
function LinkCreative({ ad, api, onClose, onSaved }) {
    const dialog = useRef(null);
    const [selected, setSelected] = useState([]);
    const [analyzing, setAnalyzing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const { showSuccess } = useToast();
    const selectOne = useCallback(update => setSelected(previous => (typeof update === 'function' ? update(previous) : update).slice(-1)), []);
    useEffect(() => { const element = dialog.current; const previous = document.activeElement; element.showModal(); return () => { if (element.open) element.close(); previous?.focus(); }; }, []);
    const save = async assetId => {
        setSaving(true); setError('');
        try {
            await api(`/analytics/ads/${ad.id}/creative`, { method: 'PUT', body: JSON.stringify({ creative_asset_id: assetId, expected_revision: ad.binding_revision }) });
            showSuccess(assetId ? 'Creative linked with your user and metadata revision' : 'Creative link removed'); onSaved(); onClose();
        } catch (failure) { setError(failure.message); } finally { setSaving(false); }
    };
    return <dialog ref={dialog} aria-label="Link imported creative" onCancel={event => { event.preventDefault(); if (!saving && !analyzing) onClose(); }} className="rounded-2xl p-5 w-[min(960px,95vw)] max-h-[90vh] overflow-auto backdrop:bg-black/40 backdrop:backdrop-blur-sm">
        <div className="space-y-4"><h2 className="text-xl font-semibold">Link creative to {ad.name}</h2><p className="text-sm text-secondary">Select the exact image or video used by this remote ad. This records you as the linking user and freezes its metadata for all imported history. The original launching user remains unknown.</p>
            <CreativePicker selected={selected} onChange={selectOne} onBusyChange={setAnalyzing} />
            {selected[0] && <p className="text-sm">Selected: {selected[0].name}</p>}
            {error && <p role="alert" className="text-danger">{error}</p>}
            <div className="flex gap-3 flex-wrap justify-end">{ad.creative_asset_id && <button className="studio-button" disabled={saving || analyzing} onClick={() => save(null)}>Remove creative link</button>}<button className="studio-button" disabled={saving || analyzing} onClick={onClose}>Cancel</button><button className="studio-button primary" disabled={saving || analyzing || selected[0]?.asset?.analysis_status !== 'ready'} onClick={() => save(selected[0].creativeAssetId)}>Save creative link</button></div>
        </div>
    </dialog>;
}
function ImportedAds({ api, query, platform }) {
    const [unlinked, setUnlinked] = useState(false);
    const [offset, setOffset] = useState(0);
    const [editing, setEditing] = useState(null);
    const state = useWorkspaceData(api, platform === 'meta' ? null : `/analytics/ads?${query}&unlinked=${unlinked}&offset=${offset}`, { poll: false });
    if (platform === 'meta') return <p className="text-secondary">Facebook ads retain their creative link and user at launch in the Posting Queue.</p>;
    return <section className="space-y-4" aria-label="Imported ads"><p className="text-sm text-secondary">Match Google and TikTok ads to library creatives or analyzed external uploads. Facebook launches already preserve their creative metadata.</p><label className="text-sm flex gap-2"><input type="checkbox" checked={unlinked} onChange={event => { setUnlinked(event.target.checked); setOffset(0); }} />Only ads needing a creative link</label><ReadState state={state} />
        {state.data?.data.length === 0 && <p className="studio-panel p-5">No imported ads match these filters. Enable a source in Data sources and allow its first import to finish.</p>}
        {state.data?.data.map(ad => <article key={ad.id} className="studio-panel p-4 flex flex-wrap justify-between items-center gap-4"><div><h2 className="font-semibold">{ad.name}</h2><p className="text-sm text-secondary">{PLATFORM_NAMES[ad.platform]} · {ad.account_name} · Ad {ad.external_id}</p><p className="text-sm mt-2">{ad.creative_snapshot ? `${ad.creative_snapshot.name || 'Linked creative'} · ${sourceLabel(ad.creative_snapshot.source_type)}` : 'Creative not linked'}</p>{ad.linked_at && <p className="text-xs text-muted">Linked by {ad.linked_by_name || 'Unknown user'} · Revision {ad.binding_revision} · {when(ad.linked_at)}</p>}</div>{ad.can_edit && <button className="studio-button" onClick={() => setEditing(ad)}>{ad.creative_asset_id ? 'Change creative link' : 'Link creative'}</button>}</article>)}
        <Pages data={state.data} offset={offset} setOffset={setOffset} size={24} />
        {editing && <LinkCreative ad={editing} api={api} onClose={() => setEditing(null)} onSaved={state.reload} />}
    </section>;
}
function Sources({ api }) {
    const connections = useWorkspaceData(api, '/analytics/connections', { poll: false });
    const sources = useWorkspaceData(api, '/analytics/sources', { all: true });
    const accounts = useWorkspaceData(api, '/analytics/accounts', { all: true });
    const [connectionId, setConnectionId] = useState('');
    const [busy, setBusy] = useState(false);
    const { hasPermission } = useAuth();
    const { showSuccess, showError } = useToast();
    const act = async (path, method = 'POST', body) => {
        setBusy(true);
        try { const result = await api(`/analytics${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) }); showSuccess(result.coalesced ? 'Existing work or recently saved data reused' : 'Import request saved'); sources.reload(); accounts.reload(); }
        catch (failure) { showError(failure.message); } finally { setBusy(false); }
    };
    const selected = connections.data?.data.find(row => `${row.platform}:${row.id}` === connectionId);
    return <section className="space-y-5" aria-label="Analytics data sources"><p className="text-sm text-secondary">Imports use your connected accounts. Manager discovery is cached; performance is pulled in account-wide pages. Opening this report makes no advertising API calls.</p>
        <ReadState state={connections} /><ReadState state={sources} /><ReadState state={accounts} />
        {hasPermission('campaigns:write') && <div className="studio-panel p-5 space-y-3"><SearchableSelect label="Connected source" value={connectionId} onChange={setConnectionId} loading={connections.loading} options={(connections.data?.data || []).map(row => ({ id: `${row.platform}:${row.id}`, name: `${PLATFORM_NAMES[row.platform]} · ${row.name}` }))} /><button className="studio-button primary" disabled={busy || !selected?.configured} onClick={() => act('/sources', 'POST', { platform: selected.platform, connection_id: selected.id })}>Enable selected source</button>{connections.data?.data.length === 0 && <p className="text-sm text-secondary">No active Google or TikTok connection. <Link className="text-brand underline" to="/google-ads">Connect Google</Link> · <Link className="text-brand underline" to="/tiktok-ads">Connect TikTok</Link></p>}{selected && !selected.configured && <p className="text-sm text-amber-800">Provider credentials are missing. An administrator must complete provider setup.</p>}</div>}
        {sources.data?.map(source => <div className="studio-panel p-4 space-y-2" key={source.id}><h2 className="font-semibold">{PLATFORM_NAMES[source.platform]} · {source.enabled ? 'Enabled' : 'Paused'}</h2><p className="text-sm text-secondary">Last account discovery: {when(source.discovered_at)} · {source.connection_active ? 'Connection active' : 'Connection inactive'}</p>{source.error_message && <p role="alert" className="text-danger text-sm">{source.error_message}</p>}<div className="flex flex-wrap gap-3"><button className="studio-button" disabled={busy} onClick={() => act(`/sources/${source.id}`, 'PATCH', { enabled: !source.enabled })}>{source.enabled ? 'Pause source' : 'Resume source'}</button><button className="studio-button" disabled={busy || !source.enabled || !source.connection_active} onClick={() => act(`/sources/${source.id}/discover`)}>Refresh account discovery</button></div></div>)}
        {accounts.data?.map(account => <article key={account.id} className="studio-panel p-4 space-y-2"><h3 className="font-semibold">{PLATFORM_NAMES[account.platform]} · {account.name}</h3><p className="text-sm text-secondary">{account.currency} · {account.timezone} · {account.status.replaceAll('_', ' ')}{!account.enabled || !account.source_enabled ? ' · paused' : ''}</p><p className="text-xs text-muted">Last complete import: {when(account.last_success_at)} · Next: {when(account.next_run_at)}</p>{account.error_message && <p role="alert" className="text-danger text-sm">{account.error_message}</p>}{account.can_manage && <button className="studio-button" disabled={busy || !account.enabled || !account.source_enabled} onClick={() => act(`/accounts/${account.id}/sync`)}>Request performance refresh</button>}</article>)}
    </section>;
}
function DailyReport({ api, query }) {
    const [offset, setOffset] = useState(0);
    const state = useWorkspaceData(api, `/analytics/report?${query}&offset=${offset}`, { poll: false });
    return <section className="space-y-4" aria-label="Daily performance"><ReadState state={state} /><p className="text-sm text-secondary">Exact imported amounts in each account’s currency and timezone. Today’s results are provisional.</p>{state.data?.data.length === 0 && <p className="studio-panel p-5">No saved daily performance in this period.</p>}{!!state.data?.data.length && <div className="studio-panel overflow-x-auto"><table className="w-full text-sm whitespace-nowrap"><thead><tr>{['Date / account timezone', 'Ad / account', 'Currency', 'Spend', 'Impressions', 'Clicks', 'Conversions', 'Conversion value'].map(label => <th key={label} className="text-left p-3 border-b">{label}</th>)}</tr></thead><tbody>{state.data.data.map(row => <tr key={row.id}><td className="p-3">{row.report_date}<p className="text-xs text-muted">{row.timezone}</p></td><td className="p-3">{row.name}<p className="text-xs text-muted">{PLATFORM_NAMES[row.platform]} · {row.account_name}</p></td>{['currency', 'spend', 'impressions', 'clicks', 'conversions', 'conversion_value'].map(key => <td key={key} className="p-3 tabular-nums">{row[key] ?? 'Unavailable'}</td>)}</tr>)}</tbody></table></div>}<Pages data={state.data} offset={offset} setOffset={setOffset} size={50} /></section>;
}
export function CreativeAnalytics() {
    const api = usePlatformApi();
    const { hasRole } = useAuth();
    const [tab, setTab] = useState('patterns');
    const [platform, setPlatform] = useState('');
    const [account, setAccount] = useState('');
    const [allUsers, setAllUsers] = useState(false);
    const [days, setDays] = useState('');
    const accounts = useWorkspaceData(api, `/analytics/report-accounts?all_users=${allUsers}`, { poll: false });
    const query = new URLSearchParams({ all_users: String(allUsers), ...(platform ? { platform } : {}), ...(account ? { account_id: account } : {}), ...(days ? { days } : {}) }).toString();
    return <div className="space-y-5"><header className="studio-page-header"><div><h1 className="studio-heading">Creative analytics</h1><p className="studio-description">Connect ad results to the people, templates and visual choices behind them.</p></div><Link className="studio-button" to="/settings?tab=traffic">Analytics settings</Link></header>
        <nav aria-label="Analytics views" className="flex flex-wrap gap-2">{[['patterns', 'Patterns'], ['ads', 'Imported ads'], ['report', 'Daily performance'], ['sources', 'Data sources']].map(([id, name]) => <button key={id} className={tab === id ? 'studio-button primary' : 'studio-button'} aria-pressed={tab === id} onClick={() => setTab(id)}>{name}</button>)}</nav>
        {tab !== 'sources' && <div className="studio-panel p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4"><label className="text-sm">Platform<select aria-label="Platform" className={selectClass} value={platform} onChange={event => { setPlatform(event.target.value); setAccount(''); }}><option value="">All platforms</option>{Object.entries(PLATFORM_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><SearchableSelect label="Reporting account" value={account ? `${platform}:${account}` : ''} loading={accounts.loading} error={accounts.error} options={(accounts.data?.data || []).filter(row => !platform || row.platform === platform).map(row => ({ id: `${row.platform}:${row.external_id}`, name: `${PLATFORM_NAMES[row.platform]} · ${row.name}` }))} onChange={value => { if (!value) setAccount(''); else { const [nextPlatform, id] = value.split(':'); setPlatform(nextPlatform); setAccount(id); } }} /><label className="text-sm">Reporting period<select aria-label="Reporting period" className={selectClass} value={days} onChange={event => setDays(event.target.value)}><option value="">Saved default / 28 days in daily report</option>{[7, 14, 28, 60, 90].map(value => <option key={value} value={value}>{value} days</option>)}</select></label>{hasRole('admin') && <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={allUsers} onChange={event => { setAllUsers(event.target.checked); setAccount(''); }} />All users’ performance</label>}</div>}
        {tab === 'patterns' && <Patterns api={api} query={query} />}{tab === 'ads' && <ImportedAds key={query} api={api} query={query} platform={platform} />}{tab === 'sources' && <Sources api={api} />}{tab === 'report' && <DailyReport key={query} api={api} query={query} />}
    </div>;
}

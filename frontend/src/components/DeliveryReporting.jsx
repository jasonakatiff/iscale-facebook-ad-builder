import { sourceLabel } from '../lib/creatives';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart } from 'lucide-react';
import { deliveryRequest, DELIVERY_PAGE_SIZE, formatDeliveryTime } from '../lib/delivery';

export function DeliveryReporting() {
    const [days, setDays] = useState(7);
    const [offset, setOffset] = useState(0);
    const [report, setReport] = useState(null);
    const [error, setError] = useState('');
    const [refresh, setRefresh] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        const load = async () => {
            try {
                const data = await deliveryRequest(`/report?days=${days}&limit=${DELIVERY_PAGE_SIZE}&offset=${offset}`, { signal: controller.signal });
                if (!controller.signal.aborted) { setReport(data); setError(''); }
            } catch (failure) {
                if (!controller.signal.aborted) setError(failure.message);
            }
        };
        load();
        return () => controller.abort();
    }, [days, offset, refresh]);
    return <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-wrap justify-between gap-4"><div><h2 className="text-3xl font-bold text-primary flex items-center gap-3"><BarChart className="text-brand-ink" />Meta ad performance</h2><p className="mt-2 text-secondary">Imported daily performance for ads posted through the queue.</p></div><Link to="/posting-queue" className="text-brand-ink underline">Posting queue and sync status</Link></header>
        <div className="bg-surface border border-line rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap gap-4 items-center"><label>Reporting period<select className="ml-3 border rounded-lg px-3 py-2" value={days} onChange={event => { setReport(null); setError(''); setDays(Number(event.target.value)); setOffset(0); }}><option value={7}>Last 7 days</option><option value={28}>Last 28 days</option><option value={90}>Last 90 days</option></select></label><button className="bg-brand text-white rounded-lg px-4 py-2" onClick={() => { setReport(null); setError(''); setRefresh(value => value + 1); }}>Refresh report</button></div>
            <p className="text-sm text-secondary">7-day click / 1-day view attribution, by conversion date. Dates follow each account’s timezone; spend stays in the account’s currency. Previously collected history is retained beyond the configured correction window.</p>
            {error && <p role="alert" className="text-danger">{error}</p>}
            {!report && !error && <p role="status">Loading imported performance…</p>}
            {report?.data.length === 0 && <p>No performance data has been imported for this period. Check sync status in the posting queue.</p>}
            {report?.data.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr className="text-muted border-b"><th className="py-3">Ad / account</th><th>Date</th><th>Delivery</th><th className="text-right">Impressions</th><th className="text-right">Clicks</th><th className="text-right">Spend</th><th className="pl-4">Last imported</th></tr></thead><tbody>{report.data.map(row => <tr key={row.id} className="border-b align-top"><td className="py-3 pr-4"><p className="font-medium">{row.name}</p><p className="text-xs text-muted">{row.account_id} · Ad {row.fb_ad_id}</p><p className="text-xs text-muted">{sourceLabel(row.creative_snapshot?.source_type)} · Creator: {row.creative_created_by_name || 'Unknown'} · Launched by: {row.launched_by_name || 'Unknown'}</p>{row.creative_snapshot && <details className="text-xs mt-1"><summary>Creative metadata · revision {row.creative_snapshot.metadata_revision}</summary><dl>{Object.entries(row.creative_snapshot.metadata || {}).map(([key, value]) => <div key={key}><dt className="inline">{key.replaceAll('_', ' ')}: </dt><dd className="inline">{value || 'Unknown'}</dd></div>)}</dl></details>}</td><td className="py-3 pr-4 whitespace-nowrap">{row.report_date}<p className="text-xs text-muted">{row.account_timezone}</p></td><td className="py-3 pr-4">{row.effective_status || 'Awaiting status'}</td><td className="py-3 text-right">{row.impressions}</td><td className="py-3 text-right">{row.clicks}</td><td className="py-3 text-right whitespace-nowrap">{row.currency} {row.spend.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1')}</td><td className="py-3 pl-4 whitespace-nowrap">{formatDeliveryTime(row.imported_at)}</td></tr>)}</tbody></table></div>}
            {report && <div className="flex justify-between items-center"><button className="underline disabled:opacity-40" disabled={offset === 0} onClick={() => { setReport(null); setOffset(Math.max(0, offset - DELIVERY_PAGE_SIZE)); }}>Previous results</button><span className="text-sm text-muted">{report.pagination.total} daily records</span><button className="underline disabled:opacity-40" disabled={!report.pagination.hasMore} onClick={() => { setReport(null); setOffset(offset + DELIVERY_PAGE_SIZE); }}>Next results</button></div>}
        </div>
    </div>;
}

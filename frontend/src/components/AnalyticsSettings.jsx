import { useState } from 'react';
import { usePlatformApi } from '../lib/platformApi';
import { useWorkspaceData } from '../lib/workspaceApi';
import { useToast } from '../context/ToastContext';
import { SOURCE_FIELDS, PATTERN_FIELDS, PLATFORM_NAMES, metricNames } from '../lib/analytics';

const inputClass = 'w-full border border-line-strong rounded-lg px-3 py-2 mt-1';

function SettingsForm({ name, initial, editable, configured, api }) {
    const [draft, setDraft] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const { showSuccess, showError } = useToast();
    const patterns = name === 'patterns';
    const title = patterns ? 'Creative pattern evidence' : `${PLATFORM_NAMES[name]} imports`;
    const save = async event => {
        event.preventDefault(); setBusy(true); setError('');
        try {
            const result = await api(`/analytics/settings/${name}`, { method: 'PUT', body: JSON.stringify(draft) });
            setDraft(result.config); showSuccess(`${title} settings saved`);
        } catch (failure) { setError(failure.message); showError(failure.message); }
        finally { setBusy(false); }
    };
    return <form onSubmit={save} className="studio-panel p-5 space-y-4" aria-label={title}>
        <h3 className="text-lg font-semibold">{title}</h3>
        {!patterns && <p className="text-sm text-secondary">{name === 'google' ? 'Discover manager accounts centrally, then request paged ad reports for each child account.' : 'Discover authorized advertisers centrally, then request paged reports covering all their ads.'} These limits cover scheduled analytics imports and their token refreshes.</p>}
        {!patterns && !configured && <p className="text-sm text-amber-800 bg-amber-50 p-3 rounded-lg">Provider setup is incomplete. Settings can be saved; imports need configured credentials and an active connection.</p>}
        {patterns && <p className="text-sm text-secondary">Rank within each ad group, currency, attribution dataset and ad format. Ignore today and the selected full days while conversions settle. Evidence is observational; use it to choose experiments.</p>}
        {error && <p role="alert" className="text-danger">{error}</p>}
        <fieldset disabled={!editable || busy} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(patterns ? PATTERN_FIELDS : SOURCE_FIELDS).map(([key, label, min, max, factor = 1]) => <label key={key} className="text-sm">{label}<input type="number" required min={min / factor} max={max / factor} step={factor === 3600 ? 0.25 : 1} value={draft[key] === '' ? '' : draft[key] / factor} onChange={event => setDraft({ ...draft, [key]: event.target.value === '' ? '' : Number((Number(event.target.value) * factor).toFixed(6)) })} className={inputClass} /></label>)}
            {patterns ? <>
                <label className="text-sm">Default success metric<select aria-label="Default success metric" className={inputClass} value={draft.metric} onChange={event => setDraft({ ...draft, metric: event.target.value })}>{Object.entries(metricNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label className="text-sm">Facebook conversion event<select aria-label="Facebook conversion event" className={inputClass} value={draft.meta_conversion_event} onChange={event => setDraft({ ...draft, meta_conversion_event: event.target.value })}>{[['offsite_conversion.fb_pixel_lead', 'Website lead'], ['offsite_conversion.fb_pixel_purchase', 'Website purchase'], ['lead', 'Lead'], ['purchase', 'Purchase']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            </> : <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />Enable {PLATFORM_NAMES[name]} imports</label>}
        </fieldset>
        {editable && <button disabled={busy} className="studio-button primary">{busy ? 'Saving…' : `Save ${patterns ? 'pattern' : PLATFORM_NAMES[name]} settings`}</button>}
    </form>;
}

export function AnalyticsSettings() {
    const api = usePlatformApi();
    const state = useWorkspaceData(api, '/analytics/settings', { poll: false });
    return <section className="space-y-5" aria-label="Cross-platform analytics settings">
        <h2 className="text-xl font-semibold">Google, TikTok and creative analytics</h2>
        {state.loading && <p role="status">Loading analytics settings…</p>}
        {state.error && <p role="alert" className="text-danger">{state.error} <button onClick={state.reload} className="underline">Retry analytics settings</button></p>}
        {state.data && <>
            {!state.data.can_edit && <p className="text-secondary">An administrator manages these shared settings.</p>}
            {Object.entries(state.data.providers).map(([name, value]) => <SettingsForm key={name} name={name} initial={value} editable={state.data.can_edit} configured={state.data.configured[name]} api={api} />)}
            <SettingsForm name="patterns" initial={state.data.patterns} editable={state.data.can_edit} api={api} />
        </>}
    </section>;
}

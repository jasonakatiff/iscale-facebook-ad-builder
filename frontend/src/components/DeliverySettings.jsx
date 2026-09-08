import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { deliveryRequest, DELIVERY_SETTINGS_GROUPS } from '../lib/delivery';

export function DeliverySettings({ onSaved }) {
    const { hasRole } = useAuth();
    const admin = hasRole('admin');
    const { showSuccess, showError } = useToast();
    const [configuration, setConfiguration] = useState(null);
    const [draft, setDraft] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(async signal => {
        const value = await deliveryRequest('/settings', { signal });
        setConfiguration(value);
        setDraft(value.config);
        setError('');
    }, []);
    useEffect(() => {
        if (!admin) return;
        const controller = new AbortController();
        load(controller.signal).catch(failure => {
            if (!controller.signal.aborted) setError(failure.message);
        });
        return () => controller.abort();
    }, [admin, load]);

    const save = async event => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const result = await deliveryRequest('/settings', { method: 'PUT', body: draft });
            setConfiguration(previous => ({ ...previous, config: result.config }));
            setDraft(result.config);
            showSuccess('Delivery settings saved');
            await onSaved?.();
        } catch (failure) {
            setError(failure.message);
            showError(failure.message);
        } finally { setBusy(false); }
    };

    if (!admin) return <p className="text-secondary">An administrator manages traffic source settings.</p>;
    return <section className="space-y-5" aria-label="Traffic source sync settings">
        <div><h2 className="text-xl font-semibold text-primary">Traffic source sync</h2>
            <p className="text-sm text-secondary mt-2">Facebook · Shared across all buyers. Queue performance reports use saved data; opening them makes no Facebook requests.</p>
        </div>
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{error}
            {!draft && <button className="ml-3 underline" onClick={() => load().catch(failure => setError(failure.message))}>Retry loading settings</button>}
        </div>}
        {!draft && !error && <p role="status">Loading traffic source settings…</p>}
        {draft && <form onSubmit={save} className="space-y-6">
            {DELIVERY_SETTINGS_GROUPS.map(group => <fieldset key={group.title} disabled={busy} className="rounded-xl border border-line p-4 sm:p-5">
                <legend className="px-2 font-semibold text-primary">{group.title}</legend>
                <p className="text-sm text-secondary mb-4">{group.description}</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{group.fields.map(([key, label, min, max, factor = 1]) => <div key={key}>
                    <label htmlFor={`delivery-${key}`} className="block text-sm font-medium text-secondary mb-1">{label}</label>
                    <input id={`delivery-${key}`} type="number" required min={min / factor} max={max / factor} step={factor === 1 ? 1 : 'any'}
                        value={draft[key] === '' ? '' : draft[key] / factor}
                        onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value === '' ? '' : Math.round(Number(event.target.value) * factor) }))}
                        className="w-full border border-line-strong rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-600 focus:border-transparent disabled:opacity-60" />
                    {configuration.defaults && <p className="text-xs text-muted mt-1">Default: {configuration.defaults[key] / factor}</p>}
                </div>)}</div>
            </fieldset>)}
            <fieldset disabled={busy} className="flex flex-wrap gap-5 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={draft.imports_enabled} onChange={event => setDraft({ ...draft, imports_enabled: event.target.checked })} />Enable status and performance imports</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={draft.paused} onChange={event => setDraft({ ...draft, paused: event.target.checked })} />Pause posting</label>
            </fieldset>
            <p className="text-sm text-muted">Saving updates scheduled work without a server restart. Running requests finish; failed imports remain stopped until restarted. Recent manual refreshes reuse saved or pending reports.</p>
            <button disabled={busy} className="rounded-lg bg-purple-600 text-white px-5 py-2.5 font-medium hover:bg-purple-700 disabled:opacity-50">{busy ? 'Saving…' : 'Save delivery settings'}</button>
        </form>}
    </section>;
}

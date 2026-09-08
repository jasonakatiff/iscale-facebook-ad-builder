import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, KeyRound, Loader2, Unplug } from 'lucide-react';
import { usePlatformApi } from '../lib/platformApi';
import { useAuth } from '../context/AuthContext';
import { useInstallation } from '../context/InstallationContext';
import { useToast } from '../context/ToastContext';
import ConfirmationModal from './ConfirmationModal';

const STATUS_LABELS = {
    not_configured: 'Not connected', saved_unverified: 'Saved, not yet verified', connected: 'Connected',
    invalid: 'Key needs attention', insufficient_credit: 'Add provider credits', temporarily_unavailable: 'Try again later',
};

export function ProviderConnections({ includeOptional = true }) {
    const api = usePlatformApi();
    const { hasRole } = useAuth();
    const { refresh } = useInstallation();
    const canManage = hasRole('admin');
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try { setProviders((await api('/installation/providers')).data); }
        catch (err) { setError(err.message); }
        finally { setLoading(false); }
    }, [api]);
    useEffect(() => { if (canManage) load(); }, [load, canManage]);
    const changed = async (next) => {
        setProviders(current => current.map(item => item.provider === next.provider ? next : item));
        await refresh();
    };
    if (!canManage) return <p className="text-secondary">Only an installation administrator can manage service connections.</p>;
    if (loading) return <p className="text-secondary flex gap-2 items-center" role="status"><Loader2 className="animate-spin" size={18} />Loading your connections…</p>;
    if (error) return <div role="alert" className="space-y-3"><p className="text-danger">{error}</p><button className="studio-button" onClick={load}>Try again</button></div>;
    return <div className="space-y-5">
        <p className="text-sm text-secondary">Your connected accounts are used by authorized members of this installation. Providers bill your account for generation. Keys are encrypted and are never displayed after saving.</p>
        {providers.filter(item => includeOptional || item.provider !== 'kie').map(item =>
            <ProviderCard key={item.provider} provider={item} onChange={changed} />)}
    </div>;
}

function ProviderCard({ provider, onChange }) {
    const api = usePlatformApi();
    const { showSuccess } = useToast();
    const [key, setKey] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [disconnecting, setDisconnecting] = useState(false);
    const id = `provider-${provider.provider}`;
    const act = async (action) => {
        if (pending) return;
        setPending(true);
        setError('');
        try {
            const url = `/installation/providers/${provider.provider}`;
            const result = await api(action === 'test' ? `${url}/test` : url, action === 'test'
                ? { method: 'POST' } : action === 'disconnect' ? { method: 'DELETE' }
                    : { method: 'PUT', body: JSON.stringify({ api_key: key.trim() }) });
            if (action !== 'test') setKey('');
            await onChange(result);
            if (action === 'save') showSuccess('Key saved. The next request will use this connection.');
        } catch (err) {
            setError(err.message);
            if (action === 'disconnect') throw err;
        } finally { setPending(false); }
    };
    return <section className="studio-panel p-5 sm:p-6" aria-labelledby={`${id}-title`}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div><h3 id={`${id}-title`} className="font-semibold text-lg flex gap-2 items-center"><KeyRound size={19} className="text-brand-ink" />{provider.name}</h3>
                <p className="text-sm text-secondary mt-1">{provider.purpose}</p></div>
            <span className={`text-xs rounded-full px-3 py-1 bg-inset ${provider.status === 'connected' ? 'text-success' : 'text-secondary'}`} role="status">{STATUS_LABELS[provider.status]}</span>
        </div>
        <details className="text-sm text-secondary mb-4">
            <summary className="cursor-pointer text-foreground font-medium">How to get your {provider.name} key</summary>
            <ol className="list-decimal pl-5 space-y-2 my-3">{provider.guide.map(step => <li key={step}>{step}</li>)}</ol>
            <a href={provider.key_url} target="_blank" rel="noopener noreferrer" className="text-brand-ink inline-flex items-center gap-1">Open {provider.name} key settings <ExternalLink size={14} /></a>
        </details>
        <form onSubmit={event => { event.preventDefault(); act('save'); }}>
            <label className="block text-sm font-medium mb-2" htmlFor={id}>{provider.name} API key</label>
            <div className="flex flex-col sm:flex-row gap-3">
                <input id={id} type="password" autoComplete="off" spellCheck={false} value={key}
                    onChange={event => setKey(event.target.value)} className="help-input flex-1 min-w-0"
                    placeholder={provider.configured ? 'Paste a replacement key' : 'Paste your API key'}
                    minLength={8} maxLength={512} required disabled={pending} aria-describedby={`${id}-hint`} />
                <button className="studio-button bg-brand text-white" disabled={pending || key.trim().length < 8} type="submit">
                    {pending ? <Loader2 className="animate-spin" size={16} /> : null}{provider.configured ? 'Replace key' : 'Save key'}
                </button>
            </div>
        </form>
        <p id={`${id}-hint`} className="text-xs text-secondary mt-2">{provider.key_hint ? `Saved key ending ${provider.key_hint.slice(-4)}. ` : ''}
            {provider.source === 'environment' ? 'Currently using a server-configured key. Saving a key here replaces it for this application.' : 'Changes take effect without restarting your application.'}</p>
        {provider.message && <p className="text-sm text-secondary mt-3" aria-live="polite">{provider.message}</p>}
        {error && <p className="text-sm text-danger mt-3" role="alert">{error}</p>}
        {provider.configured && <div className="flex flex-wrap gap-3 mt-4">
            <button className="studio-button" disabled={pending} onClick={() => act('test')}>Test connection</button>
            <button className="studio-button text-danger" disabled={pending} onClick={() => setDisconnecting(true)}><Unplug size={15} />Disconnect</button>
        </div>}
        <ConfirmationModal isOpen={disconnecting} onClose={() => setDisconnecting(false)}
            onConfirm={() => act('disconnect')} title={`Disconnect ${provider.name}?`}
            message={`Features using ${provider.name} will stop working for everyone in this installation until an administrator reconnects it.`}
            confirmText="Disconnect" icon={Unplug} />
    </section>;
}

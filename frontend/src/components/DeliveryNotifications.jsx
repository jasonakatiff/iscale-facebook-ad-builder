import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { deliveryRequest, DELIVERY_NOTIFICATION_POLL_MS } from '../lib/delivery';

export function DeliveryNotifications() {
    const { user } = useAuth();
    const { showWarning } = useToast();
    const seen = useRef(new Set());
    const toast = useRef(showWarning);
    toast.current = showWarning;
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(null);
    const trigger = useRef(null);
    const panel = useRef(null);
    const load = useCallback(async signal => {
        const notices = await deliveryRequest('/notifications?limit=20', { signal });
        if (signal?.aborted) return;
        if (!Array.isArray(notices?.data) || !Number.isInteger(notices?.pagination?.total)) throw new Error('Posting notifications returned an invalid response');
        const fresh = notices.data.filter(notice => !seen.current.has(notice.id));
        notices.data.forEach(notice => seen.current.add(notice.id));
        if (fresh.length) toast.current(`${fresh.length} posting ${fresh.length === 1 ? 'failure needs' : 'failures need'} attention. See posting notifications.`);
        setData(notices);
        setError('');
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        let timer;
        const poll = async () => {
            try { await load(controller.signal); }
            catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
            if (!controller.signal.aborted) timer = setTimeout(poll, DELIVERY_NOTIFICATION_POLL_MS);
        };
        seen.current = new Set();
        setData(null);
        setOpen(false);
        if (user?.id) poll();
        return () => { controller.abort(); clearTimeout(timer); };
    }, [user?.id, load]);
    useEffect(() => {
        if (open) panel.current?.querySelector('button, a')?.focus();
    }, [open]);
    const close = () => { setOpen(false); trigger.current?.focus(); };
    const dismiss = async id => {
        setBusy(id);
        try {
            await deliveryRequest(`/notifications/${id}/read`, { method: 'POST' });
            await load();
        } catch (failure) { setError(failure.message); }
        finally { setBusy(null); }
    };
    const count = data?.pagination.total || 0;
    return <div className="relative">
        <button ref={trigger} type="button" className="icon-button relative" aria-expanded={open} aria-controls="posting-notifications"
            aria-label={error ? 'Posting notifications unavailable' : `Posting notifications, ${count} unread`}
            onClick={() => setOpen(value => !value)}>
            <Bell size={18} aria-hidden="true" />
            {(count > 0 || error) && <span className="absolute -right-1 -top-1 rounded-full bg-danger text-white text-[10px] min-w-4 px-1" aria-hidden="true">{error ? '!' : count > 99 ? '99+' : count}</span>}
        </button>
        {open && <section id="posting-notifications" ref={panel} aria-label="Posting notifications"
            onKeyDown={event => { if (event.key === 'Escape') close(); }}
            className="fixed top-16 left-3 right-3 z-50 rounded-xl border border-line bg-panel shadow-xl p-4 sm:absolute sm:top-11 sm:left-auto sm:right-0 sm:w-96 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-3 mb-3"><h2 className="font-semibold text-foreground">Posting notifications</h2><button type="button" className="icon-button" aria-label="Close posting notifications" onClick={close}><X size={16} /></button></div>
            {error && <p role="alert" className="text-sm text-danger mb-3">{error}<button className="underline ml-2" onClick={() => load().catch(failure => setError(failure.message))}>Retry loading notifications</button></p>}
            {!data && !error && <p role="status">Loading notifications…</p>}
            {data && count === 0 && <p className="text-sm text-muted">No unread posting failures.</p>}
            {data?.data.map(notice => <article key={notice.id} className="border-t border-line py-3 space-y-2">
                <p className="font-medium text-foreground break-words">{notice.name}</p><p className="text-sm text-secondary">{notice.message}</p>
                <div className="flex justify-between gap-4 text-sm"><Link to={`/posting-queue?job=${encodeURIComponent(notice.job_id)}`} onClick={close} className="text-brand-ink underline">View {notice.name}</Link>
                    <button disabled={busy !== null} className="text-muted underline" aria-label={`Dismiss notification for ${notice.name}`} onClick={() => dismiss(notice.id)}>Dismiss</button></div>
            </article>)}
            {data?.pagination.hasMore && <p className="text-sm text-muted">Showing the newest 20. Dismiss reviewed notifications to see more.</p>}
        </section>}
    </div>;
}

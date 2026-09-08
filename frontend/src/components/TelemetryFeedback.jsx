import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getDebugContext, getSessionId, reportBrowserEvent, telemetryRequest } from '../lib/telemetry';

export function TelemetryFeedback() {
    const location = useLocation();
    const [message, setMessage] = useState('');
    const [category, setCategory] = useState('bug');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [receipt, setReceipt] = useState(null);
    const [context, setContext] = useState(null);
    useEffect(() => {
        reportBrowserEvent('browser.navigation', { page: location.pathname, message: 'Page opened' });
    }, [location.pathname]);

    const submit = async event => {
        event.preventDefault(); setBusy(true); setError(null); setReceipt(null);
        try {
            const result = await telemetryRequest('/feedback', { method: 'POST', body: JSON.stringify({
                message, category, page: location.pathname, session_id: getSessionId(), trace_id: context?.trace_id || null,
            }) });
            setReceipt(result); setMessage('');
        } catch (err) { setError(err.message); }
        finally { setBusy(false); }
    };
    return <details className="fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-panel shadow-lg" onToggle={event => {
        if (event.currentTarget.open) setContext(getDebugContext());
    }}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">Send feedback</summary>
        <form className="w-80 max-w-full p-4 pt-0 space-y-3" onSubmit={submit}>
            <p className="text-xs text-muted">Describe what happened. Your page and debug reference are attached. Leave out passwords and private customer details.</p>
            <label className="block text-sm">Category<select className="block w-full border border-line bg-inset text-foreground rounded-lg p-2 mt-1" value={category} onChange={event => setCategory(event.target.value)}><option value="bug">Bug</option><option value="idea">Idea</option><option value="question">Question</option></select></label>
            <label className="block text-sm">Feedback<textarea className="block w-full border border-line bg-inset text-foreground rounded-lg p-2 mt-1" rows={4} minLength={3} maxLength={2000} required value={message} onChange={event => setMessage(event.target.value)} /></label>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            {receipt && <div role="status" className="text-sm text-success break-all">Feedback saved. Reference: <code data-testid="feedback-reference">{receipt.trace_id}</code></div>}
            <button className="studio-button primary" disabled={busy || message.trim().length < 3}>{busy ? 'Sending…' : 'Submit feedback'}</button>
        </form>
    </details>;
}

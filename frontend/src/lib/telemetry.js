import axios from 'axios';

export const TELEMETRY_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const MAX_QUEUE = 100;
const MAX_BATCH = 20;
let reporter = null;
let currentContext = null;
let tabSession = null;

function randomHex(bytes) {
    return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), value => value.toString(16).padStart(2, '0')).join('');
}

export function getSessionId() {
    if (tabSession) return tabSession;
    try {
        tabSession = sessionStorage.getItem('telemetrySession');
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(tabSession || '')) tabSession = crypto.randomUUID();
        sessionStorage.setItem('telemetrySession', tabSession);
    } catch {
        tabSession = crypto.randomUUID();
    }
    return tabSession;
}

export function safeUrl(value) {
    try { return new URL(value, window.location.origin).pathname.slice(0, 500); }
    catch { return '/unknown'; }
}

function redact(value) {
    let text = String(value || '').slice(0, 4000);
    for (const key of ['accessToken', 'refreshToken']) {
        const secret = localStorage.getItem(key);
        if (secret) text = text.split(secret).join('[REDACTED]');
    }
    return text
        .replace(/\b(?:bw_(?:tlm|live)_|bwp_worker_)[A-Za-z0-9_-]+/g, '[REDACTED]')
        .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, '[REDACTED]')
        .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g, '$1')
        .replace(/((?:password|token|secret|api[_-]?key|worker[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
        .slice(0, 2000);
}

export function getDebugContext() {
    return currentContext && Date.now() - currentContext.at < 60000 ? currentContext : null;
}

export function reportBrowserEvent(name, fields = {}) {
    const context = getDebugContext();
    const traceId = fields.trace_id || context?.trace_id || randomHex(16);
    try {
        reporter?.({ name, level: 'info', occurred_at: new Date().toISOString(), page: safeUrl(window.location.href), session_id: getSessionId(),
            trace_id: traceId, ...fields, message: fields.message ? redact(fields.message) : null });
    } catch {
        // Collection must never interrupt a user action; delivery health is in the admin UI.
    }
    return traceId;
}

export function installTelemetry({ apiUrl = TELEMETRY_API_URL } = {}) {
    const base = new URL(apiUrl, window.location.origin);
    const nativeFetch = window.fetch;
    const queue = [];
    let sending = false;
    let stopped = false;
    let queueToken = localStorage.getItem('accessToken');
    const isApi = value => {
        try {
            const url = new URL(value, window.location.origin);
            return url.origin === base.origin && (url.pathname === base.pathname || url.pathname.startsWith(`${base.pathname}/`));
        } catch { return false; }
    };
    const isTelemetry = value => safeUrl(value).startsWith(`${base.pathname}/telemetry`);
    reporter = event => {
        const token = localStorage.getItem('accessToken');
        if (token !== queueToken) { queue.length = 0; queueToken = token; }
        if (token && queue.length < MAX_QUEUE) queue.push(event);
    };

    const contextFor = () => ({ trace_id: randomHex(16), span_id: randomHex(8), at: Date.now() });
    function complete(ctx, url, started, status, requestId, traceparent) {
        const trace = /^00-([a-f0-9]{32})-/.exec(traceparent || '');
        currentContext = { ...ctx, trace_id: trace?.[1] || ctx.trace_id, request_id: requestId || null, at: Date.now() };
        const failed = status >= 400 || status === 0;
        reportBrowserEvent('browser.request', { level: failed ? 'error' : 'info', message: `Request ${failed ? 'failed' : 'completed'}: ${safeUrl(url)}`,
            status_code: status, duration_ms: Math.round(performance.now() - started),
            trace_id: currentContext.trace_id, request_id: currentContext.request_id });
    }

    window.fetch = async function(input, init) {
        const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
        if (!isApi(url) || isTelemetry(url)) return nativeFetch.call(window, input, init);
        const ctx = contextFor();
        const started = performance.now();
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        headers.set('traceparent', `00-${ctx.trace_id}-${ctx.span_id}-01`);
        headers.set('X-Session-ID', getSessionId());
        try {
            const response = await nativeFetch.call(window, input, { ...init, headers });
            complete(ctx, url, started, response.status, response.headers.get('x-request-id'), response.headers.get('traceparent'));
            return response;
        } catch (error) {
            complete(ctx, url, started, 0);
            throw error;
        }
    };

    // The app's research and generation clients use the default Axios instance.
    const requestInterceptor = axios.interceptors.request.use(config => {
        const url = new URL(config.url, config.baseURL || window.location.origin).href;
        if (isApi(url) && !isTelemetry(url)) {
            const ctx = contextFor();
            config.headers.set('traceparent', `00-${ctx.trace_id}-${ctx.span_id}-01`);
            config.headers.set('X-Session-ID', getSessionId());
            config.telemetry = { ctx, url, started: performance.now() };
        }
        return config;
    });
    const finishAxios = response => {
        const data = response.config?.telemetry;
        if (data) complete(data.ctx, data.url, data.started, response.status || 0,
            response.headers?.['x-request-id'], response.headers?.traceparent);
    };
    const responseInterceptor = axios.interceptors.response.use(response => {
        finishAxios(response);
        return response;
    }, error => {
        finishAxios(error.response || { config: error.config, status: 0 });
        return Promise.reject(error);
    });

    const onError = event => reportBrowserEvent('browser.error', { level: 'error',
        message: `${event.message || 'Resource failed to load'} ${event.filename ? safeUrl(event.filename) : ''}:${event.lineno || 0}` });
    const onRejection = event => reportBrowserEvent('browser.rejection', { level: 'error', message: event.reason?.message || 'Unhandled promise rejection' });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    async function flush() {
        if (sending || stopped || !queue.length) return;
        const token = localStorage.getItem('accessToken');
        if (!token || token !== queueToken) { queue.length = 0; queueToken = token; return; }
        sending = true;
        const events = queue.splice(0, MAX_BATCH);
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 5000);
        try {
            const response = await nativeFetch.call(window, `${base.href}/telemetry/client-events`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ events }), keepalive: true, signal: controller.signal,
            });
            if (!response.ok) console.warn(`Telemetry delivery unavailable (${response.status})`);
        } catch {
            console.warn('Telemetry delivery unavailable (network)');
        } finally { window.clearTimeout(timeout); sending = false; }
    }
    const observers = [];
    if (typeof PerformanceObserver !== 'undefined') {
        for (const type of ['largest-contentful-paint', 'longtask']) {
            if (!PerformanceObserver.supportedEntryTypes?.includes(type)) continue;
            try {
                const observer = new PerformanceObserver(list => {
                    const entry = list.getEntries().at(-1);
                    if (entry) reportBrowserEvent('browser.web_vital', { message: type,
                        duration_ms: Math.round(type === 'longtask' ? entry.duration : entry.startTime) });
                });
                observer.observe({ type, buffered: true });
                observers.push(observer);
            } catch { console.warn('Browser performance telemetry unavailable'); }
        }
    }
    const onHidden = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', onHidden);
    const timer = window.setInterval(flush, 5000);
    return () => {
        stopped = true;
        window.clearInterval(timer);
        window.fetch = nativeFetch;
        reporter = null;
        currentContext = null;
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
        document.removeEventListener('visibilitychange', onHidden);
        axios.interceptors.request.eject(requestInterceptor);
        axios.interceptors.response.eject(responseInterceptor);
        observers.forEach(observer => observer.disconnect());
    };
}

export async function telemetryRequest(path, options = {}) {
    const response = await fetch(`${TELEMETRY_API_URL}/telemetry${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('accessToken')}`, ...options.headers },
    });
    if (!response.ok) {
        let message = `Telemetry request failed (${response.status}). Please retry.`;
        try {
            const body = await response.json();
            if (body.error?.message) message = body.error.message;
        } catch { message = `Telemetry request failed (${response.status}). Please retry.`; }
        throw new Error(message);
    }
    return response.json();
}

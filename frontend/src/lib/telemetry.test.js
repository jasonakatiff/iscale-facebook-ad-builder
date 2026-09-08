import { afterEach, describe, expect, it, vi } from 'vitest';
import { installTelemetry, reportBrowserEvent, safeUrl } from './telemetry';

let cleanup;
afterEach(() => { cleanup?.(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('browser telemetry', () => {
    it('strips private query strings and fragments', () => {
        expect(safeUrl('https://example.com/path?access_token=secret#private')).toBe('/path');
    });
    it('correlates API requests without sending credentials to other hosts', async () => {
        const native = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
        window.fetch = native;
        cleanup = installTelemetry({ apiUrl: 'http://localhost:8000/api/v1' });
        await window.fetch('http://localhost:8000/api/v1/brands');
        expect(new Headers(native.mock.calls[0][1].headers).get('traceparent')).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
        await window.fetch('https://third-party.test/upload');
        expect(native.mock.calls[1][1]).toBeUndefined();
    });
    it('preserves failure responses and never reads their bodies', async () => {
        const response = new Response('secret response body', { status: 500 });
        window.fetch = vi.fn().mockResolvedValue(response);
        cleanup = installTelemetry({ apiUrl: 'http://localhost:8000/api/v1' });
        expect(await window.fetch('http://localhost:8000/api/v1/brands')).toBe(response);
        expect(response.bodyUsed).toBe(false);
    });
    it('delivers sanitized errors with correlation and authentication', async () => {
        vi.useFakeTimers();
        localStorage.getItem.mockReturnValue('test-auth-token');
        const native = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }));
        window.fetch = native;
        cleanup = installTelemetry({ apiUrl: 'http://localhost:8000/api/v1' });
        reportBrowserEvent('browser.error', { level: 'error', message: 'Error token=test-auth-token https://example.com/path?password=private' });
        await vi.advanceTimersByTimeAsync(5000);
        expect(native).toHaveBeenCalledTimes(1);
        const [url, options] = native.mock.calls[0];
        expect(url).toBe('http://localhost:8000/api/v1/telemetry/client-events');
        expect(options.headers.Authorization).toBe('Bearer test-auth-token');
        expect(options.body).not.toContain('test-auth-token');
        expect(options.body).not.toContain('password=private');
        expect(JSON.parse(options.body).events[0].trace_id).toHaveLength(32);
    });
    it('does not attribute queued events to a different login', async () => {
        vi.useFakeTimers();
        localStorage.getItem.mockReturnValue('first-user-token');
        const native = vi.fn();
        window.fetch = native;
        cleanup = installTelemetry({ apiUrl: 'http://localhost:8000/api/v1' });
        reportBrowserEvent('browser.error', { level: 'error', message: 'First user failed' });
        localStorage.getItem.mockReturnValue('second-user-token');
        await vi.advanceTimersByTimeAsync(5000);
        expect(native).not.toHaveBeenCalled();
    });
    it('never starts recursive collection when delivery fails', async () => {
        vi.useFakeTimers();
        localStorage.getItem.mockReturnValue('test-auth-token');
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const native = vi.fn().mockRejectedValue(new Error('offline'));
        window.fetch = native;
        cleanup = installTelemetry({ apiUrl: 'http://localhost:8000/api/v1' });
        reportBrowserEvent('browser.error', { level: 'error', message: 'A problem' });
        await vi.advanceTimersByTimeAsync(15000);
        expect(native).toHaveBeenCalledTimes(1);
    });
});


it('redacts installation worker credentials from browser errors', async () => {
    vi.useFakeTimers();
    localStorage.getItem.mockReturnValue('test-auth-token');
    const native = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }));
    window.fetch = native;
    cleanup = installTelemetry({ apiUrl: 'http://localhost:8000/api/v1' });
    reportBrowserEvent('browser.error', { level: 'error', message: 'bwp_worker_test-private-value workerKey=test-other-value' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(native).toHaveBeenCalledTimes(1);
    expect(native.mock.calls[0][1].body).not.toContain('test-private-value');
    expect(native.mock.calls[0][1].body).not.toContain('test-other-value');
});

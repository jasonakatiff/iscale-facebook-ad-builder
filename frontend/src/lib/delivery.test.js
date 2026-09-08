import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deliveryRequest, prepareQueueMedia } from './delivery';

describe('delivery requests', () => {
    beforeEach(() => { localStorage.getItem.mockReturnValue('test-token'); globalThis.fetch = vi.fn(); });
    it('keeps the supplied launch identity on retries', async () => {
        fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'test-job' }) });
        const body = { request_key: 'test-stable' };
        await deliveryRequest('/launches', { method: 'POST', body });
        await deliveryRequest('/launches', { method: 'POST', body });
        expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
    });
    it('surfaces server errors', async () => {
        fetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: { message: 'Different input' } }) });
        await expect(deliveryRequest('/launches', { method: 'POST', body: {} })).rejects.toThrow('Different input');
    });
    it('rejects a local upload that cannot survive worker restarts', async () => {
        fetch.mockResolvedValue({ ok: true, json: async () => ({ url: '/uploads/test.png' }) });
        await expect(prepareQueueMedia({ file: new File(['test'], 'test.png', { type: 'image/png' }) })).rejects.toThrow('shared storage');
    });
    it('reuses an already uploaded media URL', async () => {
        expect(await prepareQueueMedia({ queueMediaUrl: 'https://media.example.com/test.png' })).toBe('https://media.example.com/test.png');
        expect(fetch).not.toHaveBeenCalled();
    });
});

it('reuses shared-storage uploads when the wizard retries the same file', async () => {
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    fetch.mockResolvedValue({ ok: true, json: async () => ({ url: 'https://media.example.com/test-upload.png' }) });
    expect(await prepareQueueMedia({ file })).toBe('https://media.example.com/test-upload.png');
    expect(await prepareQueueMedia({ file })).toBe('https://media.example.com/test-upload.png');
    expect(fetch).toHaveBeenCalledTimes(1);
});

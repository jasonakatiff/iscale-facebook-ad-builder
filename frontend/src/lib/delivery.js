export const DELIVERY_API_ROOT = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
export const DELIVERY_PAGE_SIZE = 50;
export const DELIVERY_POLL_MS = 5000;
export const DELIVERY_NOTIFICATION_POLL_MS = 30000;

export async function deliveryRequest(path, { body, ...options } = {}) {
    const token = localStorage.getItem('accessToken');
    if (!token) throw new Error('Sign in to manage ad delivery');
    const response = await fetch(`${DELIVERY_API_ROOT}/delivery${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
            const error = await response.json();
            message = error.error?.message || error.detail?.error?.message || (typeof error.detail === 'string' ? error.detail : message);
        } catch {
            message = `Server returned an unreadable error (${response.status})`;
        }
        throw new Error(message);
    }
    return response.json();
}

const uploadedMedia = new WeakMap();

export async function prepareQueueMedia(creative) {
    if (creative.queueMediaUrl) return creative.queueMediaUrl;
    const source = creative.videoUrl || creative.imageUrl || creative.previewUrl;
    let file = creative.file;
    if (file && uploadedMedia.has(file)) return uploadedMedia.get(file);
    if (!file && source?.startsWith('blob:')) {
        const response = await fetch(source);
        if (!response.ok) throw new Error('Could not read the selected media');
        const blob = await response.blob();
        file = new File([blob], creative.name || (creative.mediaType === 'video' ? 'ad.mp4' : 'ad.png'), { type: blob.type });
    }
    if (!file) {
        if (!source || !/^https?:\/\//.test(source)) throw new Error('Select a file or a public media URL');
        return source;
    }
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`${DELIVERY_API_ROOT}/uploads/`, {
        method: 'POST', body: form,
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
    });
    if (!response.ok) throw new Error('Media upload failed');
    const uploaded = await response.json();
    if (!/^https?:\/\//.test(uploaded.url || '')) throw new Error('Queued media requires shared storage. Configure Cloudflare R2 before uploading.');
    uploadedMedia.set(file, uploaded.url);
    return uploaded.url;
}

export function formatDeliveryTime(value) {
    return value ? new Date(value).toLocaleString() : 'Not yet';
}

export const DELIVERY_SETTINGS_GROUPS = [
    { title: 'Refresh schedule', description: 'Schedules are coordinated across buyers and servers, with access scoped to each buyer and account. Reports use the account’s timezone.', fields: [
        ['performance_interval_seconds', 'Performance refresh (hours)', 60, 86400, 3600],
        ['status_interval_seconds', 'New ad status refresh (minutes)', 60, 86400, 60],
        ['stable_status_interval_seconds', 'Stable ad status refresh (minutes)', 60, 86400, 60],
        ['lookback_days', 'Recent reporting window (days)', 1, 90],
        ['reconcile_days', 'Historical correction window (days)', 1, 90],
        ['reconcile_interval_hours', 'Historical correction refresh (hours)', 1, 168],
        ['metadata_cache_hours', 'Account metadata cache (hours)', 1, 168],
        ['async_poll_seconds', 'Report progress check (seconds)', 15, 300],
    ] },
    { title: 'Shared API budget', description: 'These limits apply across buyers and servers. Imports have a separate allowance to leave capacity for launching ads. Facebook can require a slower pace.', fields: [
        ['api_requests_per_minute', 'Shared requests per minute', 1, 10000],
        ['import_requests_per_minute', 'Import requests per minute', 1, 10000],
        ['account_requests_per_minute', 'Requests per account per minute', 1, 10000],
        ['api_daily_request_limit', 'Shared requests per rolling 24 hours', 1, 1000000],
        ['api_max_concurrency', 'Maximum simultaneous requests', 1, 10],
        ['api_usage_pause_percent', 'Pause at Facebook usage (%)', 10, 95],
        ['max_read_retries', 'Maximum data-pull retries', 0, 10],
    ] },
    { title: 'Posting cadence', description: 'Final ad-creation attempts also follow these posting limits.', fields: [
        ['min_interval_seconds', 'Minimum seconds between postings', 1, 3600],
        ['max_posts', 'Maximum postings per window', 1, 10000],
        ['max_post_retries', 'Maximum posting retries', 0, 10],
        ['window_seconds', 'Rolling window in seconds', 1, 86400],
    ] },
];

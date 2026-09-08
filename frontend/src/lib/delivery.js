export const DELIVERY_API_ROOT = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
export const DELIVERY_PAGE_SIZE = 50;
export const DELIVERY_POLL_MS = 5000;

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

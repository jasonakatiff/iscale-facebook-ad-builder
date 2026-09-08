const API_ROOT = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const CREATIVE_FIELDS = [
    ['background', 'Background'], ['camera_angle', 'Camera angle'], ['lighting', 'Lighting'],
    ['composition', 'Composition'], ['color_scheme', 'Color scheme'],
    ['visual_style', 'Visual style'], ['messaging_angle', 'Messaging angle'],
];

export const sourceLabel = source => source === 'external_upload' ? 'External upload' : source === 'system_generated' ? 'Made in system' : 'Unknown source';

export async function creativeRequest(path = '', { body, ...options } = {}) {
    const token = localStorage.getItem('accessToken');
    if (!token) throw new Error('Sign in to manage creative');
    const multipart = body instanceof FormData;
    const response = await fetch(`${API_ROOT}/creatives${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...(!multipart ? { 'Content-Type': 'application/json' } : {}) },
        ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
    });
    if (!response.ok) {
        let message = `Creative request failed (${response.status})`;
        try {
            const error = await response.json();
            message = error.error?.message || (typeof error.detail === 'string' ? error.detail : message);
        } catch { message = `Creative service returned an unreadable response (${response.status})`; }
        throw new Error(message);
    }
    return response.json();
}

export function campaignCreative(asset) {
    return {
        id: asset.id, creativeAssetId: asset.id, generatedAdId: asset.generated_ad_id,
        previewUrl: asset.media_url, queueMediaUrl: asset.media_url,
        mediaType: asset.media_type, thumbnailUrl: asset.thumbnail_url,
        name: asset.name, asset,
    };
}

export async function readyCreative(creative) {
    let asset;
    if (creative.creativeAssetId) asset = await creativeRequest(`/${creative.creativeAssetId}`);
    else if (creative.generatedAdId) asset = await creativeRequest(`/generated/${creative.generatedAdId}`, { method: 'POST' });
    else throw new Error('Select this creative from the library or upload it in the Creative step');
    if (asset.analysis_status !== 'ready') asset = await creativeRequest(`/${asset.id}/analyze`, { method: 'POST' });
    return campaignCreative(asset);
}

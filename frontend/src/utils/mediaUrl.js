const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Media generated or uploaded by the backend is stored as a backend-relative
// path (for example, /uploads/generated_<id>.png). The frontend and backend
// run as separate Railway services, so those paths must be resolved against
// the API origin before they are used in an image, video, or download link.
const API_ORIGIN = API_URL
    .replace(/\/api\/v1\/?$/, '')
    .replace(/\/$/, '');

export function resolveMediaUrl(url) {
    if (!url || /^(https?:|data:|blob:)/i.test(url)) {
        return url;
    }

    if (url.startsWith('/')) {
        return `${API_ORIGIN}${url}`;
    }

    return `${API_ORIGIN}/${url}`;
}

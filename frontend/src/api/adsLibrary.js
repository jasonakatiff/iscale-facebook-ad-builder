import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const API_URL = `${API_BASE}/ads-library`;

const authHeaders = () => {
    const token = localStorage.getItem('accessToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const getLibraryItems = async (filters = {}) => {
    const response = await axios.get(API_URL, { params: filters, headers: authHeaders() });
    return response.data;
};

export const getLibraryStats = async () => {
    const response = await axios.get(`${API_URL}/stats`, { headers: authHeaders() });
    return response.data;
};

export const createLibraryItem = async (item) => {
    const response = await axios.post(API_URL, item, { headers: authHeaders() });
    return response.data;
};

export const updateLibraryItem = async (itemId, item) => {
    const response = await axios.put(`${API_URL}/${itemId}`, item, { headers: authHeaders() });
    return response.data;
};

export const deleteLibraryItem = async (itemId) => {
    const response = await axios.delete(`${API_URL}/${itemId}`, { headers: authHeaders() });
    return response.data;
};

export const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API_BASE}/uploads/`, formData, { headers: authHeaders() });
    return response.data;
};

export const getVideoThumbnail = async (videoUrl) => {
    const response = await axios.post(`${API_URL}/video-thumbnail`, { video_url: videoUrl }, { headers: authHeaders() });
    return response.data;
};

export const getAiName = async (imageUrl) => {
    const response = await axios.post(`${API_URL}/ai-name`, { image_url: imageUrl }, { headers: authHeaders() });
    return response.data;
};

/**
 * Extract a thumbnail frame from a video file using HTML5 canvas.
 * Returns a Blob of the thumbnail image.
 */
export const extractVideoThumbnail = (videoFile) => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';

        const url = URL.createObjectURL(videoFile);
        let resolved = false;

        // Timeout after 15 seconds
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                cleanup();
                reject(new Error('Thumbnail extraction timed out'));
            }
        }, 15000);

        const cleanup = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            video.pause();
            video.removeAttribute('src');
            video.load();
        };

        const captureFrame = () => {
            if (resolved) return;
            try {
                const w = video.videoWidth || 640;
                const h = video.videoHeight || 360;
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, w, h);
                canvas.toBlob((blob) => {
                    if (resolved) return;
                    resolved = true;
                    cleanup();
                    if (blob && blob.size > 1000) {
                        resolve(blob);
                    } else {
                        reject(new Error('Captured frame is blank'));
                    }
                }, 'image/jpeg', 0.85);
            } catch (e) {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    reject(e);
                }
            }
        };

        video.onloadedmetadata = () => {
            // Seek to 1 second or 10% of duration
            const seekTo = Math.min(1, (video.duration || 5) * 0.1);
            video.currentTime = seekTo;
        };

        video.onseeked = captureFrame;

        // Fallback: if seeked never fires, try capturing on canplay
        video.oncanplay = () => {
            if (!resolved && video.currentTime === 0) {
                // Seek didn't work, try capturing at 0
                setTimeout(captureFrame, 500);
            }
        };

        video.onerror = (e) => {
            if (!resolved) {
                resolved = true;
                cleanup();
                reject(new Error(`Video load error: ${e?.message || 'unknown'}`));
            }
        };

        video.src = url;
    });
};

/**
 * Detect aspect ratio from an image file.
 * Returns "1:1", "9:16", "16:9", "4:5", or the raw ratio string.
 */
export const detectAspectRatio = (imageFile) => {
    return new Promise((resolve) => {
        const img = new window.Image();
        const url = URL.createObjectURL(imageFile);
        img.onload = () => {
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            URL.revokeObjectURL(url);

            const ratio = w / h;
            // Match common FB ad ratios with some tolerance
            if (Math.abs(ratio - 1) < 0.08) resolve('1:1');
            else if (Math.abs(ratio - 9 / 16) < 0.08) resolve('9:16');
            else if (Math.abs(ratio - 16 / 9) < 0.08) resolve('16:9');
            else if (Math.abs(ratio - 4 / 5) < 0.08) resolve('4:5');
            else if (Math.abs(ratio - 4 / 3) < 0.08) resolve('4:3');
            else resolve(`${w}:${h}`);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve('unknown');
        };
        img.src = url;
    });
};

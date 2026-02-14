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
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;

        const url = URL.createObjectURL(videoFile);
        video.src = url;

        video.onloadeddata = () => {
            // Seek to 1 second or 10% of duration, whichever is less
            video.currentTime = Math.min(1, video.duration * 0.1);
        };

        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                URL.revokeObjectURL(url);
                video.remove();
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to create thumbnail blob'));
                }
            }, 'image/jpeg', 0.85);
        };

        video.onerror = () => {
            URL.revokeObjectURL(url);
            video.remove();
            reject(new Error('Failed to load video'));
        };
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

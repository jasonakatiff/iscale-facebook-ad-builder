import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const API_URL = `${API_BASE}/higgsfield`;

const authHeaders = () => {
    const token = localStorage.getItem('accessToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const getHiggsfieldStatus = async () => {
    const response = await axios.get(`${API_URL}/status`, { headers: authHeaders() });
    return response.data;
};

export const getMotions = async () => {
    const response = await axios.get(`${API_URL}/motions`, { headers: authHeaders() });
    return response.data;
};

export const generateVideo = async ({ image_url, motion_id, prompt, model, strength }) => {
    const response = await axios.post(`${API_URL}/generate-video`, {
        image_url,
        motion_id,
        prompt,
        model: model || 'dop-lite',
        strength: strength || 0.5,
    }, { headers: authHeaders() });
    return response.data;
};

export const getJobStatus = async (jobId) => {
    const response = await axios.get(`${API_URL}/jobs/${jobId}`, { headers: authHeaders() });
    return response.data;
};

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const API_URL = `${API_BASE}/ads-library`;

export const getLibraryItems = async (filters = {}) => {
    const response = await axios.get(API_URL, { params: filters });
    return response.data;
};

export const getLibraryStats = async () => {
    const response = await axios.get(`${API_URL}/stats`);
    return response.data;
};

export const createLibraryItem = async (item) => {
    const response = await axios.post(API_URL, item);
    return response.data;
};

export const updateLibraryItem = async (itemId, item) => {
    const response = await axios.put(`${API_URL}/${itemId}`, item);
    return response.data;
};

export const deleteLibraryItem = async (itemId) => {
    const response = await axios.delete(`${API_URL}/${itemId}`);
    return response.data;
};

export const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API_BASE}/uploads/`, formData);
    return response.data;
};

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const API_URL = `${API_BASE}/clickflare`;

const authHeaders = () => {
    const token = localStorage.getItem('accessToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

// --- Status ---

export const getClickflareStatus = async () => {
    const response = await axios.get(`${API_URL}/status`, { headers: authHeaders() });
    return response.data;
};

// --- Config ---

export const getClickflareConfig = async () => {
    const response = await axios.get(`${API_URL}/config`, { headers: authHeaders() });
    return response.data;
};

export const saveClickflareConfig = async (data) => {
    const response = await axios.post(`${API_URL}/config`, data, { headers: authHeaders() });
    return response.data;
};

export const testClickflareConnection = async () => {
    const response = await axios.post(`${API_URL}/test-connection`, {}, { headers: authHeaders() });
    return response.data;
};

export const setupTrafficSource = async () => {
    const response = await axios.post(`${API_URL}/setup-traffic-source`, {}, { headers: authHeaders() });
    return response.data;
};

// --- Tracking URL ---

export const generateTrackingUrl = async (adName, destinationUrl, facebookAdId = null) => {
    const response = await axios.post(`${API_URL}/generate-tracking-url`, {
        ad_name: adName,
        destination_url: destinationUrl,
        facebook_ad_id: facebookAdId,
    }, { headers: authHeaders() });
    return response.data;
};

// --- Reporting ---

export const getClickflareReports = async (dateFrom, dateTo, groupBy = 'campaign', campaignId = null) => {
    const params = { date_from: dateFrom, date_to: dateTo, group_by: groupBy };
    if (campaignId) params.campaign_id = campaignId;
    const response = await axios.get(`${API_URL}/reports`, { params, headers: authHeaders() });
    return response.data;
};

export const getClickflareCampaigns = async () => {
    const response = await axios.get(`${API_URL}/campaigns`, { headers: authHeaders() });
    return response.data;
};

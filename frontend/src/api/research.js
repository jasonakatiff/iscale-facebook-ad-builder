import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const API_URL = `${API_BASE}/research`;

// Research endpoints require a logged-in user. This client mirrors
// AuthContext.authFetch: attach the bearer token, and on a 401 refresh once
// (single-flight) and retry. Refresh failure clears the session.
const http = axios.create();

http.interceptors.request.use((config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
        config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
    }
    return config;
});

let refreshPromise = null;
async function refreshAccessToken() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');
        const res = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
        const data = await res.json();
        localStorage.setItem('accessToken', data.access_token);
        if (data.refresh_token) localStorage.setItem('refreshToken', data.refresh_token);
        return data.access_token;
    })();
    try {
        return await refreshPromise;
    } finally {
        refreshPromise = null;
    }
}

http.interceptors.response.use(
    (response) => response,
    async (error) => {
        const original = error.config;
        if (error.response?.status === 401 && original && !original._retried) {
            original._retried = true;
            try {
                const token = await refreshAccessToken();
                original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
                return http(original);
            } catch (refreshError) {
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);

export const searchAndSave = async (request) => {
    try {
        const response = await http.post(`${API_URL}/search-and-save`, request);
        return response.data;
    } catch (error) {
        console.error('Error searching and saving:', error);
        throw error;
    }
};

export const getSavedSearches = async () => {
    try {
        const response = await http.get(`${API_URL}/saved-searches`);
        return response.data;
    } catch (error) {
        console.error('Error fetching saved searches:', error);
        throw error;
    }
};

export const getSavedSearch = async (searchId) => {
    try {
        const response = await http.get(`${API_URL}/saved-searches/${searchId}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching saved search:', error);
        throw error;
    }
};

export const deleteSavedSearch = async (searchId) => {
    try {
        const response = await http.delete(`${API_URL}/saved-searches/${searchId}`);
        return response.data;
    } catch (error) {
        console.error('Error deleting saved search:', error);
        throw error;
    }
};

export const getApiUsage = async () => {
    try {
        const response = await http.get(`${API_URL}/api-usage`);
        return response.data;
    } catch (error) {
        console.error('Error fetching API usage:', error);
        throw error;
    }
};

export const getBlacklist = async () => {
    try {
        const response = await http.get(`${API_URL}/blacklist`);
        return response.data;
    } catch (error) {
        console.error('Error fetching blacklist:', error);
        throw error;
    }
};

export const addToBlacklist = async (pageName, reason = null) => {
    try {
        const response = await http.post(`${API_URL}/blacklist`, null, {
            params: { page_name: pageName, reason }
        });
        return response.data;
    } catch (error) {
        console.error('Error adding to blacklist:', error);
        throw error;
    }
};

export const removeFromBlacklist = async (blacklistId) => {
    try {
        const response = await http.delete(`${API_URL}/blacklist/${blacklistId}`);
        return response.data;
    } catch (error) {
        console.error('Error removing from blacklist:', error);
        throw error;
    }
};

export const getKeywordBlacklist = async () => {
    try {
        const response = await http.get(`${API_URL}/keyword-blacklist`);
        return response.data;
    } catch (error) {
        console.error('Error fetching keyword blacklist:', error);
        throw error;
    }
};

export const addToKeywordBlacklist = async (keyword, reason = null) => {
    try {
        const response = await http.post(`${API_URL}/keyword-blacklist`, null, {
            params: { keyword, reason }
        });
        return response.data;
    } catch (error) {
        console.error('Error adding to keyword blacklist:', error);
        throw error;
    }
};

export const removeFromKeywordBlacklist = async (blacklistId) => {
    try {
        const response = await http.delete(`${API_URL}/keyword-blacklist/${blacklistId}`);
        return response.data;
    } catch (error) {
        console.error('Error removing from keyword blacklist:', error);
        throw error;
    }
};

export const getRateLimit = async () => {
    try {
        const response = await http.get(`${API_URL}/rate-limit`);
        return response.data;
    } catch (error) {
        console.error('Error fetching rate limit:', error);
        throw error;
    }
};

export const getFacebookPages = async (limit = 50, offset = 0, sortBy = 'total_ads') => {
    try {
        const response = await http.get(`${API_URL}/facebook-pages`, {
            params: { limit, offset, sort_by: sortBy }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching Facebook pages:', error);
        throw error;
    }
};

export const getVerticals = async () => {
    try {
        const response = await http.get(`${API_URL}/verticals`);
        return response.data;
    } catch (error) {
        console.error('Error fetching verticals:', error);
        throw error;
    }
};

export const createVertical = async (name, description = null) => {
    try {
        const response = await http.post(`${API_URL}/verticals`, null, {
            params: { name, description }
        });
        return response.data;
    } catch (error) {
        console.error('Error creating vertical:', error);
        throw error;
    }
};

export const getVerticalAggregatedAds = async (verticalId) => {
    try {
        const response = await http.get(`${API_URL}/verticals/${verticalId}/aggregated-ads`);
        return response.data;
    } catch (error) {
        console.error('Error fetching vertical aggregated ads:', error);
        throw error;
    }
};

export const getVerticalPageAds = async (verticalId, pageId) => {
    try {
        const response = await http.get(`${API_URL}/verticals/${verticalId}/pages/${pageId}/ads`);
        return response.data;
    } catch (error) {
        console.error('Error fetching vertical page ads:', error);
        throw error;
    }
};

// Brand Scrapes API
export const createBrandScrape = async (brandName, pageUrl) => {
    try {
        const response = await http.post(`${API_URL}/brand-scrapes`, {
            brand_name: brandName,
            page_url: pageUrl
        });
        return response.data;
    } catch (error) {
        console.error('Error creating brand scrape:', error);
        throw error;
    }
};

export const getBrandScrapes = async () => {
    try {
        const response = await http.get(`${API_URL}/brand-scrapes`);
        return response.data;
    } catch (error) {
        console.error('Error fetching brand scrapes:', error);
        throw error;
    }
};

export const getBrandScrape = async (scrapeId) => {
    try {
        const response = await http.get(`${API_URL}/brand-scrapes/${scrapeId}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching brand scrape:', error);
        throw error;
    }
};

export const deleteBrandScrape = async (scrapeId) => {
    try {
        const response = await http.delete(`${API_URL}/brand-scrapes/${scrapeId}`);
        return response.data;
    } catch (error) {
        console.error('Error deleting brand scrape:', error);
        throw error;
    }
};

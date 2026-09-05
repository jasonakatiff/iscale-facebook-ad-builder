// Facebook Marketing API Integration Service
// Now proxies through our backend with authentication

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1') + '/facebook';

// Helper to get auth headers from localStorage
const getAuthHeaders = () => {
    const token = localStorage.getItem('accessToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// Authenticated fetch wrapper
const authFetch = async (url, options = {}) => {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            ...getAuthHeaders(),
        },
    });
    return response;
};

/**
 * Get all ad accounts accessible by the access token
 */
export async function getAdAccounts() {
    try {
        const response = await authFetch(`${API_BASE_URL}/accounts`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to fetch ad accounts');
        }
        const accounts = await response.json();

        // Map backend response to frontend expected format if necessary
        // Backend returns raw FB data list
        return accounts.map(account => ({
            id: account.id,
            accountId: account.account_id,
            name: account.name,
            status: account.account_status,
            currency: account.currency,
            timezone: account.timezone_name,
            balance: account.balance,
            amountSpent: account.amount_spent,
            spendCap: account.spend_cap,
            businessName: account.business_name,
            fundingSource: account.funding_source_details,
            minDailyBudget: account.min_daily_budget,
            age: account.age,
            disableReason: account.disable_reason
        }));
    } catch (error) {
        console.error('Error fetching ad accounts:', error);
        throw error;
    }
}

/**
 * Get all campaigns for a specific ad account
 */
export async function getCampaigns(adAccountId) {
    try {
        // Backend service currently fetches all campaigns for the connected account
        // It doesn't filter by adAccountId in the service call yet, but assumes the env var account
        // For now, we'll just call the endpoint
        const response = await authFetch(`${API_BASE_URL}/campaigns?ad_account_id=${adAccountId}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to fetch campaigns');
        }
        const campaigns = await response.json();

        return campaigns.map(campaign => ({
            id: campaign.id,
            name: campaign.name,
            objective: campaign.objective,
            status: campaign.status,
            dailyBudget: campaign.daily_budget,
            lifetimeBudget: campaign.lifetime_budget,
            budgetRemaining: campaign.budget_remaining,
            createdTime: campaign.created_time,
            updatedTime: campaign.updated_time,
            isCBO: campaign.is_adset_budget_sharing_enabled
        }));
    } catch (error) {
        console.error('Error fetching campaigns:', error);
        throw error;
    }
}

/**
 * Get all pixels for a specific ad account
 */
export async function getPixels(adAccountId) {
    try {
        const response = await authFetch(`${API_BASE_URL}/pixels?ad_account_id=${adAccountId}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to fetch pixels');
        }
        const pixels = await response.json();

        return pixels.map(pixel => ({
            id: pixel.id,
            name: pixel.name,
            code: pixel.code,
            isUnavailable: pixel.is_unavailable
        }));
    } catch (error) {
        console.error('Error fetching pixels:', error);
        throw error;
    }
}


/**
 * Get all promotable pages for a specific ad account
 */
export async function getPages(adAccountId) {
    try {
        const response = await authFetch(`${API_BASE_URL}/pages`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to fetch pages');
        }
        const pages = await response.json();

        return pages.map(page => ({
            id: page.id,
            name: page.name,
            category: page.category
        }));
    } catch (error) {
        console.error('Error fetching pages:', error);
        throw error;
    }
}


export const getAdSets = async (campaignId, adAccountId) => {
    try {
        let url = `${API_BASE_URL}/adsets?`;
        if (campaignId) {
            url += `campaign_id=${campaignId}`;
        } else if (adAccountId) {
            url += `ad_account_id=${adAccountId}`;
        }

        const response = await authFetch(url);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to fetch ad sets');
        }
        const adSets = await response.json();
        return adSets;
    } catch (error) {
        console.error('Error fetching ad sets:', error);
        throw error;
    }
};

export const searchGeoLocations = async (query, adAccountId) => {
    try {
        // Default to 'city' type for now, or we could make it a parameter
        // The backend supports 'city', 'region', 'country', 'zip', etc.
        // For general search, 'city' is common, but users might want countries.
        // Let's search for multiple types or default to a broad search if possible.
        // Facebook API 'location_types' can take multiple.

        // Let's use the searchLocations function we just added
        return await searchLocations(query, 'city', adAccountId);
    } catch (error) {
        console.error('Error searching geo locations:', error);
        return [];
    }
};


/**
 * Upload video to Facebook
 * @param {string} videoUrl - URL of the video to upload
 * @param {string} adAccountId - Facebook ad account ID
 * @param {boolean} waitForReady - Whether to wait for video processing (default true)
 * @param {number} timeout - Max seconds to wait for processing (default 600)
 * @returns {Promise<{video_id: string, status: string, thumbnails: string[]}>}
 */
export async function uploadVideoToFacebook(videoUrl, adAccountId, waitForReady = true, timeout = 600) {
    try {
        let finalVideoUrl = videoUrl;

        // If it's a blob URL, upload to our server first
        if (videoUrl.startsWith('blob:')) {
            const blobResponse = await fetch(videoUrl);
            const blob = await blobResponse.blob();

            const formData = new FormData();
            const extension = blob.type.split('/')[1] || 'mp4';
            formData.append('file', blob, `upload.${extension}`);

            const uploadResponse = await authFetch((import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1') + '/uploads/', {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                throw new Error('Failed to upload video to server');
            }

            const uploadResult = await uploadResponse.json();
            finalVideoUrl = uploadResult.url.startsWith('/') ? uploadResult.url.substring(1) : uploadResult.url;
        }

        const response = await authFetch(`${API_BASE_URL}/upload-video?ad_account_id=${adAccountId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                video_url: finalVideoUrl,
                wait_for_ready: waitForReady,
                timeout: timeout
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to upload video to Facebook');
        }

        return await response.json();
    } catch (error) {
        console.error('Error uploading video:', error);
        throw error;
    }
}

/**
 * Get video processing status
 * @param {string} videoId - Facebook video ID
 * @returns {Promise<{status: string, video_id: string, length?: number}>}
 */
export async function getVideoStatus(videoId) {
    try {
        const response = await authFetch(`${API_BASE_URL}/video-status/${videoId}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to get video status');
        }
        return await response.json();
    } catch (error) {
        console.error('Error getting video status:', error);
        throw error;
    }
}

/**
 * Get video thumbnails
 * @param {string} videoId - Facebook video ID
 * @returns {Promise<{thumbnails: string[]}>}
 */
export async function getVideoThumbnails(videoId) {
    try {
        const response = await authFetch(`${API_BASE_URL}/video-thumbnails/${videoId}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to get video thumbnails');
        }
        return await response.json();
    } catch (error) {
        console.error('Error getting video thumbnails:', error);
        throw error;
    }
}

/**
 * Upload image to Facebook
 */
export async function uploadImageToFacebook(imageUrl, adAccountId) {
    try {
        let finalImageUrl = imageUrl;

        // If it's a blob URL, we need to upload it to our server first
        if (imageUrl.startsWith('blob:')) {
            // 1. Fetch the blob
            const blobResponse = await fetch(imageUrl);
            const blob = await blobResponse.blob();

            // 2. Create FormData
            const formData = new FormData();
            // Use a default filename or try to guess extension
            const filename = 'upload.jpg';
            formData.append('file', blob, filename);

            // 3. Upload to our backend
            const uploadResponse = await authFetch((import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1') + '/uploads/', {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                throw new Error('Failed to upload image to server');
            }

            const uploadResult = await uploadResponse.json();
            // The backend returns { url: "/uploads/filename.ext" }
            // We need to remove the leading slash to make it a relative path for the python script
            // or keep it if the python script handles absolute paths.
            // The python script runs in 'backend/', and uploads are in 'backend/uploads/'
            // So 'uploads/filename.ext' should work.
            finalImageUrl = uploadResult.url.startsWith('/') ? uploadResult.url.substring(1) : uploadResult.url;
        }

        const response = await authFetch(`${API_BASE_URL}/upload-image?ad_account_id=${adAccountId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ image_url: finalImageUrl })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to upload image to Facebook');
        }

        const data = await response.json();
        return data.image_hash;
    } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
    }
}

/**
 * Create Facebook Campaign
 */
export async function createFacebookCampaign(campaignData, adAccountId) {
    try {
        const response = await authFetch(`${API_BASE_URL}/campaigns?ad_account_id=${adAccountId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(campaignData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create campaign');
        }

        const data = await response.json();
        return data.id;
    } catch (error) {
        console.error('Error creating campaign:', error);
        throw error;
    }
}

/**
 * Create Facebook Ad Set
 */
export async function createFacebookAdSet(adsetData, campaignId, adAccountId, budgetType) {
    try {
        // Prepare payload for backend
        const payload = {
            ...adsetData,
            campaign_id: campaignId,
            budget_type: budgetType, // CBO or ABO - tells backend whether to set budget at adset level
            daily_budget: adsetData.dailyBudget, // Map camelCase to snake_case if needed, or handle in backend
            optimization_goal: adsetData.optimizationGoal,
            bid_strategy: adsetData.bidStrategy,
            bid_amount: adsetData.bidAmount,
            start_time: adsetData.startTime ? new Date(adsetData.startTime).toISOString() : null,
            targeting: adsetData.targeting
        };

        const response = await authFetch(`${API_BASE_URL}/adsets?ad_account_id=${adAccountId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create ad set');
        }

        const data = await response.json();
        return data.id;
    } catch (error) {
        console.error('Error creating ad set:', error);
        throw error;
    }
}

/**
 * Create Facebook Ad Creative (supports both image and video)
 * @param {Object} creativeData - Creative data including bodies, headlines, websiteUrl
 * @param {string|null} imageHash - Image hash for image ads (null for video)
 * @param {string} pageId - Facebook page ID
 * @param {string} adAccountId - Facebook ad account ID
 * @param {Object|null} videoData - Video data: { video_id, thumbnail_url } for video ads
 */
export async function createFacebookCreative(creativeData, imageHash, pageId, adAccountId, videoData = null) {
    try {
        const payload = {
            ...creativeData,
            page_id: pageId,
            primary_text: creativeData.bodies[0],
            headline: creativeData.headlines[0],
            website_url: creativeData.websiteUrl
        };

        // Add image or video data
        if (videoData && videoData.video_id) {
            payload.video_id = videoData.video_id;
            if (videoData.thumbnail_url) {
                payload.thumbnail_url = videoData.thumbnail_url;
            }
        } else if (imageHash) {
            payload.image_hash = imageHash;
        }

        const response = await authFetch(`${API_BASE_URL}/creatives?ad_account_id=${adAccountId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create creative');
        }

        const data = await response.json();
        return data.id;
    } catch (error) {
        console.error('Error creating creative:', error);
        throw error;
    }
}

/**
 * Create Facebook Ad
 */
export async function createFacebookAd(adData, adsetId, creativeId, adAccountId) {
    try {
        const payload = {
            ...adData,
            adset_id: adsetId,
            creative_id: creativeId
        };

        const response = await authFetch(`${API_BASE_URL}/ads?ad_account_id=${adAccountId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create ad');
        }

        const data = await response.json();
        return data.id;
    } catch (error) {
        console.error('Error creating ad:', error);
        throw error;
    }
}

/**
 * Search for locations
 */
export async function searchLocations(query, type = 'city', adAccountId) {
    try {
        const response = await authFetch(`${API_BASE_URL}/locations/search?q=${encodeURIComponent(query)}&type=${type}&ad_account_id=${adAccountId}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to search locations');
        }
        return await response.json();
    } catch (error) {
        console.error('Error searching locations:', error);
        throw error;
    }
}


/**
 * Complete workflow: Upload media (image or video), create creative, and create ad
 * @param {string} campaignId - Campaign ID
 * @param {Object} adsetData - Ad set data with fbAdsetId
 * @param {Object} creativeData - Creative data with imageUrl or videoUrl
 * @param {Object} adData - Ad data
 * @param {string} pageId - Facebook page ID
 * @param {string} adAccountId - Facebook ad account ID
 * @param {string} budgetType - Budget type (CBO or ABO)
 */
export async function createCompleteAd(campaignId, adsetData, creativeData, adData, pageId, adAccountId, budgetType) {
    try {
        let imageHash = null;
        let videoData = null;

        // Determine if this is a video or image ad
        const isVideo = creativeData.mediaType === 'video' ||
                        (creativeData.videoUrl && !creativeData.imageUrl);

        if (isVideo) {
            // 1. Upload video
            const videoResult = await uploadVideoToFacebook(
                creativeData.videoUrl,
                adAccountId,
                true, // wait for ready
                600   // 10 minute timeout
            );

            videoData = {
                video_id: videoResult.video_id,
                thumbnail_url: creativeData.thumbnailUrl || (videoResult.thumbnails && videoResult.thumbnails[0])
            };
        } else {
            // 1. Upload image
            imageHash = await uploadImageToFacebook(creativeData.imageUrl, adAccountId);
        }

        // 2. Create ad creative (supports both image and video)
        const creativeId = await createFacebookCreative(
            creativeData,
            imageHash,
            pageId,
            adAccountId,
            videoData
        );

        // 3. Create ad
        const adId = await createFacebookAd(adData, adsetData.fbAdsetId, creativeId, adAccountId);

        return {
            imageHash,
            videoId: videoData?.video_id || null,
            creativeId,
            adId
        };
    } catch (error) {
        console.error('Error in complete ad creation:', error);
        throw error;
    }
}

import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import React, { useState } from 'react';
import { ChevronRight, Plus, Trash2, Loader, Film, Image } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { createCompleteAd, createFacebookCampaign, createFacebookAdSet } from '../lib/facebookApi';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const BulkAdCreation = ({ onNext, onBack }) => {
    const { showWarning, showError } = useToast();
    const { authFetch } = useAuth();
    const { campaignData, adsetData, creativeData, adsData, setAdsData, selectedAdAccount } = useCampaign();
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
    const [errors, setErrors] = useState([]);

    // Initialize ads based on creatives - generate all permutations
    React.useEffect(() => {
        if (creativeData.creatives && creativeData.creatives.length > 0) {
            const permutations = [];

            if (creativeData.creativeMode === 'per_creative') {
                // Per-creative mode: each creative has its own headlines/bodies
                creativeData.creatives.forEach((creative, creativeIndex) => {
                    const validHeadlines = (creative.headlines || ['']).filter(h => h && h.trim() !== '');
                    const validBodies = (creative.bodies || ['']).filter(b => b && b.trim() !== '');
                    const isVideo = creative.mediaType === 'video';
                    const mediaLabel = isVideo ? 'Video' : 'Image';

                    validHeadlines.forEach((headline, hIndex) => {
                        validBodies.forEach((body, bIndex) => {
                            permutations.push({
                                id: `ad_${Date.now()}_${creativeIndex}_${hIndex}_${bIndex}`,
                                name: `${creative.name || `${mediaLabel} ${creativeIndex + 1}`}${validHeadlines.length > 1 || validBodies.length > 1 ? ` - H${hIndex + 1}B${bIndex + 1}` : ''}`,
                                creativeId: creative.id,
                                headlineIndex: hIndex,
                                bodyIndex: bIndex,
                                mediaType: creative.mediaType || 'image',
                                useDefaultCreative: true,
                                perCreative: true
                            });
                        });
                    });
                });
            } else {
                // Standard mode: shared headlines/bodies across all creatives
                const validHeadlines = creativeData.headlines.filter(h => h && h.trim() !== '');
                const validBodies = creativeData.bodies.filter(b => b && b.trim() !== '');

                creativeData.creatives.forEach((creative, creativeIndex) => {
                    validHeadlines.forEach((headline, hIndex) => {
                        validBodies.forEach((body, bIndex) => {
                            const isVideo = creative.mediaType === 'video';
                            const mediaLabel = isVideo ? 'Video' : 'Image';
                            permutations.push({
                                id: `ad_${Date.now()}_${creativeIndex}_${hIndex}_${bIndex}`,
                                name: `${creative.name || `${mediaLabel} ${creativeIndex + 1}`} - H${hIndex + 1}B${bIndex + 1}`,
                                creativeId: creative.id,
                                headlineIndex: hIndex,
                                bodyIndex: bIndex,
                                mediaType: creative.mediaType || 'image',
                                useDefaultCreative: true
                            });
                        });
                    });
                });
            }

            setAdsData(permutations);
            console.log(`Generated ${permutations.length} ad permutations (${creativeData.creativeMode} mode)`);
        } else {
            setAdsData([]);
        }
    }, [creativeData.creatives, creativeData.headlines, creativeData.bodies, creativeData.creativeMode]);

    const addAd = () => {
        // Clone from the last ad's creative or fall back to the first creative
        const lastAd = adsData[adsData.length - 1];
        const creative = creativeData.creatives?.find(c => c.id === lastAd?.creativeId) || creativeData.creatives?.[0];
        const isPerCreative = creativeData.creativeMode === 'per_creative';

        setAdsData(prev => [
            ...prev,
            {
                id: `ad_${Date.now()}_${prev.length}`,
                name: `${creative?.name || 'Ad'} ${prev.length + 1}`,
                creativeId: creative?.id,
                headlineIndex: 0,
                bodyIndex: 0,
                mediaType: creative?.mediaType || 'image',
                useDefaultCreative: true,
                ...(isPerCreative ? { perCreative: true } : {})
            }
        ]);
    };

    const removeAd = (index) => {
        setAdsData(prev => prev.filter((_, i) => i !== index));
    };

    const updateAdName = (index, name) => {
        setAdsData(prev => prev.map((ad, i) => i === index ? { ...ad, name } : ad));
    };

    const handleSubmit = async () => {
        if (adsData.length === 0) {
            showWarning('Please add at least one ad');
            return;
        }

        setLoading(true);
        setErrors([]);
        setProgress({ current: 0, total: adsData.length, status: 'Starting...' });

        try {
            // Step 1: Create Facebook Campaign (if new)
            let fbCampaignId = campaignData.fbCampaignId;
            if (!campaignData.isExisting) {
                setProgress(prev => ({ ...prev, status: 'Creating campaign on Facebook...' }));
                fbCampaignId = await createFacebookCampaign(campaignData, selectedAdAccount.accountId);
            }

            // Save Campaign Locally (Ensure it exists in DB for FK constraints)
            try {
                const saveCampRes = await authFetch(`${API_URL}/facebook/campaigns/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...campaignData,
                        fbCampaignId: fbCampaignId,
                        // Ensure budget fields are numbers
                        dailyBudget: Number(campaignData.dailyBudget)
                    })
                });
                if (!saveCampRes.ok) {
                    const err = await saveCampRes.json();
                    throw new Error(`Failed to save campaign locally: ${err.detail || err.message}`);
                }
            } catch (err) {
                console.error('Error saving campaign locally:', err);
                throw err; // Stop execution
            }

            // Step 2: Create Facebook Ad Set (if new)
            let fbAdsetId = adsetData.fbAdsetId;
            if (!adsetData.isExisting) {
                setProgress(prev => ({ ...prev, status: 'Creating ad set on Facebook...' }));

                // For CBO campaigns, pass the bid strategy and bid amount from campaign level
                const adsetPayload = {
                    ...adsetData,
                    // Override bid strategy and amount with campaign-level values for CBO
                    ...(campaignData.budgetType === 'CBO' && {
                        bidStrategy: campaignData.bidStrategy,
                        bidAmount: campaignData.bidAmount
                    })
                };

                fbAdsetId = await createFacebookAdSet(adsetPayload, fbCampaignId, selectedAdAccount.accountId, campaignData.budgetType);
            }

            // Save Ad Set Locally (Ensure it exists in DB for FK constraints)
            try {
                const saveAdSetRes = await authFetch(`${API_URL}/facebook/adsets/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...adsetData,
                        campaignId: campaignData.id, // Use the ID we have in context (local or FB)
                        fbAdsetId: fbAdsetId,
                        // Ensure numeric fields
                        dailyBudget: adsetData.dailyBudget ? Number(adsetData.dailyBudget) : null,
                        bidAmount: adsetData.bidAmount ? Number(adsetData.bidAmount) : null
                    })
                });
                if (!saveAdSetRes.ok) {
                    const err = await saveAdSetRes.json();
                    throw new Error(`Failed to save ad set locally: ${err.detail || err.message}`);
                }
            } catch (err) {
                console.error('Error saving ad set locally:', err);
                throw err; // Stop execution
            }

            // Step 3: Create ads
            const createdAds = [];
            for (let i = 0; i < adsData.length; i++) {
                const ad = adsData[i];
                setProgress({
                    current: i + 1,
                    total: adsData.length,
                    status: `Creating ad ${i + 1} of ${adsData.length}...`
                });

                try {
                    // Find the specific creative for this ad
                    const specificCreative = creativeData.creatives?.find(c => c.id === ad.creativeId);
                    const isVideo = specificCreative?.mediaType === 'video';

                    // Construct creative data for this specific ad with specific headline and body
                    let adHeadlines, adBodies, adDescription, adCta;
                    if (ad.perCreative && specificCreative) {
                        // Per-creative mode: pull copy from the creative object
                        const cHeadlines = (specificCreative.headlines || []).filter(h => h && h.trim());
                        const cBodies = (specificCreative.bodies || []).filter(b => b && b.trim());
                        adHeadlines = [cHeadlines[ad.headlineIndex] || cHeadlines[0]];
                        adBodies = [cBodies[ad.bodyIndex] || cBodies[0]];
                        adDescription = specificCreative.description || creativeData.description;
                        adCta = specificCreative.cta || creativeData.cta;
                    } else {
                        // Standard mode: pull from global copy fields
                        adHeadlines = [creativeData.headlines[ad.headlineIndex]];
                        adBodies = [creativeData.bodies[ad.bodyIndex]];
                        adDescription = creativeData.description;
                        adCta = creativeData.cta;
                    }

                    const adSpecificCreativeData = {
                        ...creativeData,
                        mediaType: isVideo ? 'video' : 'image',
                        imageUrl: !isVideo ? (specificCreative?.imageUrl || specificCreative?.previewUrl) : undefined,
                        videoUrl: isVideo ? (specificCreative?.videoUrl || specificCreative?.previewUrl) : undefined,
                        imageFile: !isVideo && specificCreative ? specificCreative.file : null,
                        videoFile: isVideo && specificCreative ? specificCreative.file : null,
                        headlines: adHeadlines,
                        bodies: adBodies,
                        description: adDescription,
                        cta: adCta
                    };

                    if (!creativeData.pageId) {
                        throw new Error('Page ID is missing. Please go back to the Creative step and select a Facebook Page.');
                    }

                    console.log(`Submitting ${isVideo ? 'Video' : 'Image'} Ad with Page ID:`, creativeData.pageId);

                    // Update progress with video-specific message
                    if (isVideo) {
                        setProgress(prev => ({
                            ...prev,
                            status: `Uploading video ${i + 1} of ${adsData.length}... (this may take a while)`
                        }));
                    }

                    // Create ad on Facebook
                    const result = await createCompleteAd(
                        fbCampaignId,
                        { ...adsetData, fbAdsetId },
                        adSpecificCreativeData,
                        ad,
                        creativeData.pageId,
                        selectedAdAccount.accountId,
                        campaignData.budgetType
                    );

                    // Save to local database
                    await authFetch(`${API_URL}/facebook/ads/save`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: ad.id,
                            adsetId: adsetData.id,
                            name: ad.name,
                            creativeName: creativeData.creativeName,
                            mediaType: isVideo ? 'video' : 'image',
                            imageUrl: adSpecificCreativeData.imageUrl,
                            videoUrl: adSpecificCreativeData.videoUrl,
                            videoId: result.videoId,
                            thumbnailUrl: result.thumbnailUrl,
                            bodies: adBodies,
                            headlines: adHeadlines,
                            description: adDescription,
                            cta: adCta,
                            websiteUrl: creativeData.websiteUrl,
                            status: 'PAUSED',
                            fbAdId: result.adId,
                            fbCreativeId: result.creativeId
                        })
                    });

                    createdAds.push({
                        ...ad,
                        fbAdId: result.adId,
                        fbCreativeId: result.creativeId,
                        videoId: result.videoId
                    });
                } catch (error) {
                    console.error(`Error creating ad ${ad.name}:`, error);
                    setErrors(prev => [...prev, `Failed to create ${ad.name}: ${error.message}`]);
                }
            }

            setProgress({
                current: adsData.length,
                total: adsData.length,
                status: 'Complete!'
            });

            // Wait a moment to show completion
            setTimeout(() => {
                onNext();
            }, 1500);

        } catch (error) {
            console.error('Error in bulk ad creation:', error);
            showError(`Error: ${error.message}`);
            setLoading(false);
        }
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">Bulk Ad Creation</h2>
            <p className="text-gray-600 mb-6">
                Add multiple ads to be created with the same creative structure. Each ad will use the dynamic creative you configured.
            </p>

            {/* Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-blue-900 mb-2">Summary</h3>
                <div className="text-sm text-blue-800 space-y-1">
                    <div><strong>Campaign:</strong> {campaignData.name}</div>
                    {campaignData.budgetType === 'CBO' && (
                        <div><strong>Campaign Budget:</strong> ${Number(campaignData.dailyBudget).toFixed(2)} / day</div>
                    )}
                    <div><strong>Ad Set:</strong> {adsetData.name}</div>
                    {campaignData.budgetType === 'ABO' && (
                        <div><strong>Ad Set Budget:</strong> ${Number(adsetData.dailyBudget).toFixed(2)} / day</div>
                    )}
                    <div><strong>Creative Name:</strong> {creativeData.creativeName}</div>
                    <div>
                        <strong>Media:</strong>{' '}
                        {(() => {
                            const images = creativeData.creatives?.filter(c => c.mediaType !== 'video').length || 0;
                            const videos = creativeData.creatives?.filter(c => c.mediaType === 'video').length || 0;
                            const parts = [];
                            if (images > 0) parts.push(`${images} image${images !== 1 ? 's' : ''}`);
                            if (videos > 0) parts.push(`${videos} video${videos !== 1 ? 's' : ''}`);
                            return parts.join(', ') || '0 files';
                        })()}
                    </div>
                    <div><strong>Ad Copy:</strong> {creativeData.creativeMode === 'per_creative' ? 'Per Creative (unique copy per media)' : 'Standard (shared copy across all media)'}</div>
                </div>
            </div>

            {!loading ? (
                <>
                    {/* Ads List */}
                    <div className="space-y-2 mb-4">
                        {adsData.map((ad, index) => {
                            const creative = creativeData.creatives?.find(c => c.id === ad.creativeId);
                            const isVideo = creative?.mediaType === 'video';
                            return (
                                <div key={ad.id} className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                                    {/* Thumbnail */}
                                    {creative && (
                                        <div className="w-12 h-12 rounded overflow-hidden bg-gray-200 flex-shrink-0 relative">
                                            {isVideo ? (
                                                <>
                                                    <video
                                                        src={creative.previewUrl}
                                                        className="w-full h-full object-cover"
                                                        muted
                                                    />
                                                    <div className="absolute bottom-0 right-0 bg-purple-600 text-white p-0.5 rounded-tl">
                                                        <Film size={10} />
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <img
                                                        src={creative.previewUrl}
                                                        alt="Thumbnail"
                                                        className="w-full h-full object-cover"
                                                    />
                                                    <div className="absolute bottom-0 right-0 bg-blue-600 text-white p-0.5 rounded-tl">
                                                        <Image size={10} />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <input
                                            type="text"
                                            value={ad.name}
                                            onChange={(e) => updateAdName(index, e.target.value)}
                                            placeholder={`Ad ${index + 1} name`}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        />
                                    </div>
                                    <button
                                        onClick={() => removeAd(index)}
                                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Add Ad Button — goes back to Ad Creative to add more media/copy */}
                    <button
                        onClick={onBack}
                        className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-amber-500 hover:text-amber-600 transition-colors flex items-center justify-center gap-2"
                    >
                        <Plus size={20} />
                        Add Another Ad
                    </button>

                    {/* Errors */}
                    {errors.length > 0 && (
                        <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
                            <h3 className="font-semibold text-red-900 mb-2">Errors</h3>
                            <ul className="text-sm text-red-800 space-y-1">
                                {errors.map((error, index) => (
                                    <li key={index}>• {error}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Navigation */}
                    <div className="mt-8 flex justify-between">
                        <button
                            onClick={onBack}
                            className="px-6 py-3 text-gray-600 hover:text-gray-800 font-medium"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={adsData.length === 0}
                            className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            Create {adsData.length} Ad{adsData.length !== 1 ? 's' : ''} on Facebook
                        </button>
                    </div>
                </>
            ) : (
                <>
                    {/* Progress Indicator */}
                    <div className="text-center py-12">
                        <Loader className="animate-spin mx-auto mb-4 text-blue-600" size={48} />
                        <h3 className="text-xl font-semibold mb-2">{progress.status}</h3>
                        <div className="w-full max-w-md mx-auto bg-gray-200 rounded-full h-3 mb-2">
                            <div
                                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            />
                        </div>
                        <p className="text-gray-600">
                            {progress.current} of {progress.total} ads created
                        </p>
                    </div>
                </>
            )}
        </div>
    );
};

export default BulkAdCreation;

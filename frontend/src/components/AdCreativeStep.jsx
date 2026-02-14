import { useToast } from '../context/ToastContext';
import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Upload, X, Loader, Trash2, Film, Image, Sparkles, Play, FolderOpen, Check } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { useAuth } from '../context/AuthContext';
import { getPages } from '../lib/facebookApi';
import { getLibraryItems } from '../api/adsLibrary';
import { useBrands } from '../context/BrandContext';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];

// Facebook CTA types - confirmed working
const CTA_OPTIONS = [
    'LEARN_MORE',
    'SHOP_NOW',
    'SIGN_UP',
    'CONTACT_US',
    'DOWNLOAD',
    'BOOK_NOW',
    'BUY_TICKETS',
    'GET_QUOTE',
    'DONATE_NOW',
];

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const AdCreativeStep = ({ onNext, onBack }) => {
    const { showWarning, showError, showSuccess } = useToast();
    const { authFetch } = useAuth();
    const { creativeData, setCreativeData, selectedAdAccount, selectedProduct, adsetData } = useCampaign();
    const [pages, setPages] = useState([]);
    const [loadingPages, setLoadingPages] = useState(false);
    const [analyzingVideoId, setAnalyzingVideoId] = useState(null);
    const [analyzingProvider, setAnalyzingProvider] = useState(null);
    const [providerMenuId, setProviderMenuId] = useState(null);

    const [manualPageEntry, setManualPageEntry] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [playingVideo, setPlayingVideo] = useState(null);

    // Per-creative mode
    const [currentCreativeIndex, setCurrentCreativeIndex] = useState(0);

    // Ads Library import
    const { brands } = useBrands();
    const [showLibraryModal, setShowLibraryModal] = useState(false);
    const [libraryItems, setLibraryItems] = useState([]);
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [libraryFilterBrand, setLibraryFilterBrand] = useState('');
    const [libraryFilterMediaType, setLibraryFilterMediaType] = useState('');
    const [selectedLibraryItems, setSelectedLibraryItems] = useState(new Set());

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Only set dragging to false if leaving the drop zone entirely
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        // Filter for images and videos
        const mediaFiles = files.filter(file =>
            ALLOWED_IMAGE_TYPES.includes(file.type) || ALLOWED_VIDEO_TYPES.includes(file.type)
        );

        if (mediaFiles.length === 0) {
            showWarning('Please drop image or video files only');
            return;
        }

        const newCreatives = mediaFiles.map(file => {
            const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
            return {
                id: `creative_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                file,
                previewUrl: URL.createObjectURL(file),
                name: file.name,
                mediaType: isVideo ? 'video' : 'image'
            };
        });

        setCreativeData(prev => {
            const updated = {
                ...prev,
                creatives: [...(prev.creatives || []), ...newCreatives]
            };
            // Auto-fill Creative Name from file name if empty or just the adset name
            if (!prev.creativeName || prev.creativeName === adsetData?.name) {
                const baseName = mediaFiles[0].name.replace(/\.[^/.]+$/, '');
                if (mediaFiles.length === 1) {
                    updated.creativeName = baseName;
                } else {
                    updated.creativeName = `${baseName} (+${mediaFiles.length - 1} more)`;
                }
            }
            return updated;
        });
    };

    // Ads Library import functions
    const fetchLibraryItems = async (brandFilter, mediaFilter) => {
        setLibraryLoading(true);
        try {
            const filters = {};
            if (brandFilter) filters.brand_id = brandFilter;
            if (mediaFilter) filters.media_type = mediaFilter;
            const data = await getLibraryItems(filters);
            setLibraryItems(data);
        } catch (error) {
            showError('Failed to load ads library');
        } finally {
            setLibraryLoading(false);
        }
    };

    const toggleLibrarySelection = (itemId) => {
        setSelectedLibraryItems(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) next.delete(itemId);
            else next.add(itemId);
            return next;
        });
    };

    const handleImportFromLibrary = () => {
        const selected = libraryItems.filter(item => selectedLibraryItems.has(item.id));

        const newCreatives = selected.map(item => ({
            id: `creative_lib_${item.id}_${Date.now()}`,
            previewUrl: item.media_type === 'video'
                ? item.media_url
                : item.media_url,
            thumbnailUrl: item.media_type === 'video' ? item.thumbnail_url : undefined,
            imageUrl: item.media_type === 'image' ? item.media_url : undefined,
            videoUrl: item.media_type === 'video' ? item.media_url : undefined,
            name: item.name || 'Library Import',
            mediaType: item.media_type,
        }));

        setCreativeData(prev => {
            const updated = {
                ...prev,
                creatives: [...(prev.creatives || []), ...newCreatives],
            };
            // Auto-fill Creative Name from library item(s) if empty
            if (!prev.creativeName || prev.creativeName === adsetData?.name) {
                if (selected.length === 1) {
                    updated.creativeName = selected[0].name || '';
                } else {
                    // Multiple items: use first name + count
                    updated.creativeName = `${selected[0].name || 'Library Import'} (+${selected.length - 1} more)`;
                }
            }
            return updated;
        });

        // Pre-fill copy fields from first item if current fields are empty
        const firstWithCopy = selected.find(item => item.headline || item.body);
        if (firstWithCopy) {
            const bodiesEmpty = !creativeData.bodies || creativeData.bodies.every(b => !b?.trim());
            const headlinesEmpty = !creativeData.headlines || creativeData.headlines.every(h => !h?.trim());

            if (bodiesEmpty && firstWithCopy.body) {
                setCreativeData(prev => ({ ...prev, bodies: [firstWithCopy.body] }));
            }
            if (headlinesEmpty && firstWithCopy.headline) {
                setCreativeData(prev => ({ ...prev, headlines: [firstWithCopy.headline] }));
            }
        }

        showSuccess(`Imported ${newCreatives.length} item${newCreatives.length > 1 ? 's' : ''} from library`);
        setShowLibraryModal(false);
        setSelectedLibraryItems(new Set());
    };

    // Prepopulate Creative Name with Ad Set Name if empty
    useEffect(() => {
        if (adsetData?.name && !creativeData.creativeName) {
            handleInputChange('creativeName', adsetData.name);
        }
    }, [adsetData?.name]);

    // Load last used page ID on mount
    useEffect(() => {
        const lastUsedPageId = localStorage.getItem('lastUsedPageId');
        if (lastUsedPageId && !creativeData.pageId) {
            handleInputChange('pageId', lastUsedPageId);
        }
    }, []);

    // Load default URL from local storage for this ad account
    useEffect(() => {
        if (selectedAdAccount && !creativeData.websiteUrl) {
            const savedUrl = localStorage.getItem(`defaultUrl_${selectedAdAccount.id}`);
            if (savedUrl) {
                handleInputChange('websiteUrl', savedUrl);
            }
        }
    }, [selectedAdAccount]);

    // Fetch pages when ad account is selected
    useEffect(() => {
        if (selectedAdAccount) {
            fetchPages();
        }
    }, [selectedAdAccount]);

    const loadSavedManualPages = () => {
        try {
            const saved = localStorage.getItem('savedManualPages');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    };

    const mergePages = (fetchedPages) => {
        const savedPages = loadSavedManualPages();
        const fetchedIds = new Set(fetchedPages.map(p => p.id));
        const uniqueSaved = savedPages.filter(p => !fetchedIds.has(p.id));
        return [...fetchedPages, ...uniqueSaved];
    };

    const handleSaveManualPage = () => {
        const pageId = creativeData.pageId?.trim();
        if (!pageId) return;
        const savedPages = loadSavedManualPages();
        if (savedPages.some(p => p.id === pageId)) {
            showWarning('This Page ID is already saved');
            return;
        }
        const updated = [...savedPages, { id: pageId, name: `Page ${pageId}` }];
        localStorage.setItem('savedManualPages', JSON.stringify(updated));
        setPages(prev => {
            if (prev.some(p => p.id === pageId)) return prev;
            return [...prev, { id: pageId, name: `Page ${pageId}` }];
        });
        showSuccess('Page ID saved to dropdown list');
    };

    const fetchPages = async () => {
        setLoadingPages(true);
        try {
            const fetchedPages = await getPages(selectedAdAccount.id);
            const combined = mergePages(fetchedPages);
            setPages(combined);

            // If no page is selected and we have pages, select the first one (or the last used one if it exists in the list)
            if (combined.length > 0 && !creativeData.pageId) {
                const lastUsedPageId = localStorage.getItem('lastUsedPageId');
                const pageToSelect = combined.find(p => p.id === lastUsedPageId) || combined[0];
                handlePageSelection(pageToSelect.id, combined);
            } else if (combined.length === 0) {
                // If no pages found, default to manual entry so user isn't blocked
                setManualPageEntry(true);
            }
        } catch (error) {
            console.error('Error fetching pages:', error);
            // Still load saved manual pages even if fetch fails
            const savedPages = loadSavedManualPages();
            if (savedPages.length > 0) {
                setPages(savedPages);
            }
            showError('Failed to load Facebook Pages. You can enter Page ID manually.');
            setManualPageEntry(true); // Auto-switch to manual entry
        } finally {
            setLoadingPages(false);
        }
    };

    const handlePageSelection = (pageId, currentPages = pages) => {
        const selectedPage = currentPages.find(p => p.id === pageId);
        setCreativeData(prev => ({
            ...prev,
            pageId,
            instagramId: selectedPage ? selectedPage.instagramId : null
        }));
        localStorage.setItem('lastUsedPageId', pageId);
    };

    // Load saved creative fields from local storage for this ad account
    useEffect(() => {
        if (selectedAdAccount) {
            const savedHeadlines = localStorage.getItem(`defaultHeadlines_${selectedAdAccount.id}`);
            const savedBodies = localStorage.getItem(`defaultBodies_${selectedAdAccount.id}`);
            const savedDescription = localStorage.getItem(`defaultDescription_${selectedAdAccount.id}`);
            const savedCta = localStorage.getItem(`defaultCta_${selectedAdAccount.id}`);

            if (savedHeadlines && !creativeData.headlines[0]) {
                try {
                    const parsedHeadlines = JSON.parse(savedHeadlines);
                    if (Array.isArray(parsedHeadlines) && parsedHeadlines.length > 0) {
                        setCreativeData(prev => ({ ...prev, headlines: parsedHeadlines }));
                    }
                } catch (e) { console.error('Error parsing saved headlines', e); }
            }

            if (savedBodies && !creativeData.bodies[0]) {
                try {
                    const parsedBodies = JSON.parse(savedBodies);
                    if (Array.isArray(parsedBodies) && parsedBodies.length > 0) {
                        setCreativeData(prev => ({ ...prev, bodies: parsedBodies }));
                    }
                } catch (e) { console.error('Error parsing saved bodies', e); }
            }

            if (savedDescription && !creativeData.description) {
                setCreativeData(prev => ({ ...prev, description: savedDescription }));
            }

            if (savedCta && !creativeData.cta) {
                setCreativeData(prev => ({ ...prev, cta: savedCta }));
            }
        }
    }, [selectedAdAccount]);

    const handleInputChange = (field, value) => {
        setCreativeData(prev => ({
            ...prev,
            [field]: value,
            // When manually entering a Page ID, clear the instagramId to prevent using Page ID as IG ID
            ...(field === 'pageId' ? { instagramId: null } : {})
        }));

        // Persist page ID
        if (field === 'pageId') {
            localStorage.setItem('lastUsedPageId', value);
        }

        // Persist description
        if (field === 'description' && selectedAdAccount) {
            localStorage.setItem(`defaultDescription_${selectedAdAccount.id}`, value);
        }

        // Persist CTA
        if (field === 'cta' && selectedAdAccount) {
            localStorage.setItem(`defaultCta_${selectedAdAccount.id}`, value);
        }
    };

    const handleBodyChange = (index, value) => {
        const newBodies = [...creativeData.bodies];
        newBodies[index] = value;
        setCreativeData(prev => ({
            ...prev,
            bodies: newBodies
        }));

        if (selectedAdAccount) {
            localStorage.setItem(`defaultBodies_${selectedAdAccount.id}`, JSON.stringify(newBodies));
        }
    };

    const handleHeadlineChange = (index, value) => {
        const newHeadlines = [...creativeData.headlines];
        newHeadlines[index] = value;
        setCreativeData(prev => ({
            ...prev,
            headlines: newHeadlines
        }));

        if (selectedAdAccount) {
            localStorage.setItem(`defaultHeadlines_${selectedAdAccount.id}`, JSON.stringify(newHeadlines));
        }
    };

    const addBodyField = () => {
        if (creativeData.bodies.length < 6) {
            setCreativeData(prev => ({
                ...prev,
                bodies: [...prev.bodies, '']
            }));
        }
    };

    const addHeadlineField = () => {
        if (creativeData.headlines.length < 6) {
            setCreativeData(prev => ({
                ...prev,
                headlines: [...prev.headlines, '']
            }));
        }
    };

    const removeBodyField = (index) => {
        if (creativeData.bodies.length > 1) {
            const newBodies = creativeData.bodies.filter((_, i) => i !== index);
            setCreativeData(prev => ({
                ...prev,
                bodies: newBodies
            }));
        }
    };

    const removeHeadlineField = (index) => {
        if (creativeData.headlines.length > 1) {
            const newHeadlines = creativeData.headlines.filter((_, i) => i !== index);
            setCreativeData(prev => ({
                ...prev,
                headlines: newHeadlines
            }));
        }
    };

    // Per-creative mode helpers
    const isPerCreative = creativeData.creativeMode === 'per_creative';
    const currentCreative = creativeData.creatives?.[currentCreativeIndex];

    const updateCreativeField = (creativeIndex, field, value) => {
        setCreativeData(prev => {
            const newCreatives = [...prev.creatives];
            newCreatives[creativeIndex] = { ...newCreatives[creativeIndex], [field]: value };
            return { ...prev, creatives: newCreatives };
        });
    };

    const handlePerCreativeBodyChange = (bodyIndex, value) => {
        const bodies = [...(currentCreative?.bodies || [''])];
        bodies[bodyIndex] = value;
        updateCreativeField(currentCreativeIndex, 'bodies', bodies);
    };

    const handlePerCreativeHeadlineChange = (headlineIndex, value) => {
        const headlines = [...(currentCreative?.headlines || [''])];
        headlines[headlineIndex] = value;
        updateCreativeField(currentCreativeIndex, 'headlines', headlines);
    };

    const addPerCreativeBody = () => {
        const bodies = currentCreative?.bodies || [''];
        if (bodies.length < 6) {
            updateCreativeField(currentCreativeIndex, 'bodies', [...bodies, '']);
        }
    };

    const addPerCreativeHeadline = () => {
        const headlines = currentCreative?.headlines || [''];
        if (headlines.length < 6) {
            updateCreativeField(currentCreativeIndex, 'headlines', [...headlines, '']);
        }
    };

    const removePerCreativeBody = (index) => {
        const bodies = currentCreative?.bodies || [''];
        if (bodies.length > 1) {
            updateCreativeField(currentCreativeIndex, 'bodies', bodies.filter((_, i) => i !== index));
        }
    };

    const removePerCreativeHeadline = (index) => {
        const headlines = currentCreative?.headlines || [''];
        if (headlines.length > 1) {
            updateCreativeField(currentCreativeIndex, 'headlines', headlines.filter((_, i) => i !== index));
        }
    };

    // Initialize per-creative fields when switching to per-creative mode
    React.useEffect(() => {
        if (isPerCreative && creativeData.creatives.length > 0) {
            let needsInit = false;
            const updated = creativeData.creatives.map(c => {
                if (!c.headlines) {
                    needsInit = true;
                    return { ...c, headlines: [''], bodies: [''], description: '', cta: 'LEARN_MORE' };
                }
                return c;
            });
            if (needsInit) {
                setCreativeData(prev => ({ ...prev, creatives: updated }));
            }
        }
    }, [isPerCreative, creativeData.creatives.length]);

    const handleMediaUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const newCreatives = files.map(file => {
            const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
            return {
                id: `creative_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                file,
                previewUrl: URL.createObjectURL(file),
                name: file.name,
                mediaType: isVideo ? 'video' : 'image'
            };
        });

        setCreativeData(prev => {
            const updated = {
                ...prev,
                creatives: [...(prev.creatives || []), ...newCreatives]
            };
            // Auto-fill Creative Name from file name if empty or just the adset name
            if (!prev.creativeName || prev.creativeName === adsetData?.name) {
                const baseName = files[0].name.replace(/\.[^/.]+$/, ''); // strip extension
                if (files.length === 1) {
                    updated.creativeName = baseName;
                } else {
                    updated.creativeName = `${baseName} (+${files.length - 1} more)`;
                }
            }
            return updated;
        });
    };

    const removeCreative = (id) => {
        setCreativeData(prev => ({
            ...prev,
            creatives: prev.creatives.filter(c => c.id !== id)
        }));
    };

    const handleAnalyzeVideo = async (creative, provider = 'gemini') => {
        if (!creative.file) {
            showWarning('Cannot analyze videos added via URL');
            return;
        }

        setAnalyzingVideoId(creative.id);
        setAnalyzingProvider(provider);
        setProviderMenuId(null);
        try {
            const formData = new FormData();
            formData.append('file', creative.file);

            const response = await authFetch(`${API_URL}/video-analysis/analyze?provider=${provider}`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || 'Video analysis failed');
            }

            const data = await response.json();

            const newBodies = (data.bodies || []).filter(b => b && b.trim());
            const newHeadlines = (data.headlines || []).filter(h => h && h.trim());

            setCreativeData(prev => {
                // Keep existing non-empty entries, append new ones, cap at 6
                const existingBodies = prev.bodies.filter(b => b && b.trim());
                const existingHeadlines = prev.headlines.filter(h => h && h.trim());
                const mergedBodies = [...existingBodies, ...newBodies].slice(0, 6);
                const mergedHeadlines = [...existingHeadlines, ...newHeadlines].slice(0, 6);
                // Ensure at least 1 slot
                if (mergedBodies.length === 0) mergedBodies.push('');
                if (mergedHeadlines.length === 0) mergedHeadlines.push('');
                return { ...prev, bodies: mergedBodies, headlines: mergedHeadlines };
            });

            // Persist merged results to localStorage
            if (selectedAdAccount) {
                const existingBodies = creativeData.bodies.filter(b => b && b.trim());
                const existingHeadlines = creativeData.headlines.filter(h => h && h.trim());
                const allBodies = [...existingBodies, ...newBodies].slice(0, 6);
                const allHeadlines = [...existingHeadlines, ...newHeadlines].slice(0, 6);
                localStorage.setItem(`defaultBodies_${selectedAdAccount.id}`, JSON.stringify(allBodies));
                localStorage.setItem(`defaultHeadlines_${selectedAdAccount.id}`, JSON.stringify(allHeadlines));
            }

            const providerName = provider === 'transcribe_haiku' ? 'Transcribe + Haiku' : provider === 'claude' ? 'Claude Haiku' : 'Gemini';
            showSuccess(`${providerName} ad copy appended (${newBodies.length} bodies, ${newHeadlines.length} headlines)`);
        } catch (error) {
            console.error('Video analysis error:', error);
            showError(error.message || 'Failed to analyze video');
        } finally {
            setAnalyzingVideoId(null);
            setAnalyzingProvider(null);
        }
    };

    const handleNext = () => {
        // Validate required fields
        if (!creativeData.creativeName) {
            showWarning('Please enter a creative name');
            return;
        }
        if (!creativeData.creatives || creativeData.creatives.length === 0) {
            showWarning('Please upload at least one image or video');
            return;
        }

        if (isPerCreative) {
            // Per-creative mode: each creative must have at least 1 non-empty headline and body
            for (let i = 0; i < creativeData.creatives.length; i++) {
                const c = creativeData.creatives[i];
                const hasBody = (c.bodies || []).some(b => b && b.trim());
                const hasHeadline = (c.headlines || []).some(h => h && h.trim());
                if (!hasBody) {
                    setCurrentCreativeIndex(i);
                    showWarning(`Creative ${i + 1} ("${c.name}") needs at least one primary text`);
                    return;
                }
                if (!hasHeadline) {
                    setCurrentCreativeIndex(i);
                    showWarning(`Creative ${i + 1} ("${c.name}") needs at least one headline`);
                    return;
                }
            }
        } else {
            // Standard mode: validate global copy fields
            if (!creativeData.bodies[0] || !creativeData.bodies[0].trim()) {
                showWarning('Please provide primary text');
                return;
            }
            if (!creativeData.headlines[0] || !creativeData.headlines[0].trim()) {
                showWarning('Please provide a headline');
                return;
            }
        }

        if (!creativeData.websiteUrl) {
            showWarning('Please enter a website URL');
            return;
        }

        // Validate URL format
        try {
            const url = new URL(creativeData.websiteUrl);
            if (!url.protocol.startsWith('http')) {
                showWarning('Please enter a valid URL starting with http:// or https://');
                return;
            }
        } catch (e) {
            showWarning('Please enter a valid URL (e.g., https://example.com)');
            return;
        }

        if (!creativeData.pageId) {
            showWarning('Please enter a Facebook Page ID');
            return;
        }

        // Save URL to local storage for this ad account
        if (selectedAdAccount && creativeData.websiteUrl) {
            localStorage.setItem(`defaultUrl_${selectedAdAccount.id}`, creativeData.websiteUrl);
        }

        onNext();
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-4">Ad Creative</h2>

            {/* Mode Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg mb-6 w-fit">
                <button
                    onClick={() => setCreativeData(prev => ({ ...prev, creativeMode: 'standard' }))}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        !isPerCreative
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    Standard (Bulk)
                </button>
                <button
                    onClick={() => setCreativeData(prev => ({ ...prev, creativeMode: 'per_creative' }))}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        isPerCreative
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    Per Creative
                </button>
            </div>

            <p className="text-gray-600 mb-6">
                {isPerCreative
                    ? 'Each image/video gets its own dedicated copy. Step through creatives one at a time.'
                    : 'Create standard ads with shared copy across all media. We will create permutations of each image × headline × body.'}
            </p>

            <div className="space-y-6">
                {/* Creative Name */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Creative Name *
                    </label>
                    <input
                        type="text"
                        value={creativeData.creativeName}
                        onChange={(e) => handleInputChange('creativeName', e.target.value)}
                        placeholder="Summer Sale Dynamic Creative"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                </div>

                {/* Facebook Page Selection */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                            Facebook Page *
                        </label>
                        <button
                            onClick={() => setManualPageEntry(!manualPageEntry)}
                            className="text-xs text-amber-600 hover:text-amber-800 underline"
                        >
                            {manualPageEntry ? 'Select from list' : 'Enter Page ID manually'}
                        </button>
                    </div>

                    {manualPageEntry ? (
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={creativeData.pageId}
                                onChange={(e) => handleInputChange('pageId', e.target.value)}
                                placeholder="Enter Facebook Page ID (e.g., 933995649786806)"
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            />
                            {creativeData.pageId?.trim() && (
                                <button
                                    onClick={handleSaveManualPage}
                                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium whitespace-nowrap"
                                >
                                    Save
                                </button>
                            )}
                        </div>
                    ) : loadingPages ? (
                        <div className="flex items-center gap-2 text-gray-500 py-2">
                            <Loader className="animate-spin" size={20} />
                            <span>Loading pages...</span>
                        </div>
                    ) : (
                        <select
                            value={creativeData.pageId}
                            onChange={(e) => handlePageSelection(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        >
                            <option value="">Select a Facebook Page...</option>
                            {pages.map(page => (
                                <option key={page.id} value={page.id}>
                                    {page.name}
                                </option>
                            ))}
                        </select>
                    )}

                    {!manualPageEntry && pages.length === 0 && !loadingPages && (
                        <div className="mt-2">
                            <p className="text-xs text-red-500 mb-1">
                                No pages found. Please make sure your ad account has access to at least one Facebook Page.
                            </p>
                            <button
                                onClick={() => setManualPageEntry(true)}
                                className="text-xs text-amber-600 font-medium hover:underline"
                            >
                                Enter Page ID manually instead
                            </button>
                        </div>
                    )}
                </div>

                {/* Media Upload (Images + Videos) */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Ad Media (Images or Videos) *
                    </label>

                    {/* Upload Area */}
                    <div
                        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-4 ${isDragging ? 'border-amber-500 bg-amber-50' : 'border-gray-300 hover:border-amber-500'
                            }`}
                        onDragEnter={handleDragEnter}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <input
                            type="file"
                            accept="image/*,video/*"
                            multiple
                            onChange={handleMediaUpload}
                            className="hidden"
                            id="ad-media-upload"
                        />
                        <label htmlFor="ad-media-upload" className="cursor-pointer flex flex-col items-center">
                            <div className="flex gap-2 mb-2">
                                <Image className={`${isDragging ? 'text-amber-500' : 'text-gray-400'}`} size={28} />
                                <Film className={`${isDragging ? 'text-amber-500' : 'text-gray-400'}`} size={28} />
                            </div>
                            <span className={`font-medium ${isDragging ? 'text-amber-700' : 'text-gray-600'}`}>
                                {isDragging ? 'Drop files here' : 'Click to upload images or videos'}
                            </span>
                            <span className="text-sm text-gray-400 mt-1">or drag and drop</span>
                            <span className="text-xs text-amber-500 mt-2 bg-amber-50 px-2 py-1 rounded">Supports multiple files • Videos up to 500MB</span>
                        </label>
                    </div>

                    {/* Import from Ads Library */}
                    <div className="flex items-center gap-3 mb-4">
                        <button
                            onClick={() => {
                                setShowLibraryModal(true);
                                fetchLibraryItems(libraryFilterBrand, libraryFilterMediaType);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 border border-indigo-200 font-medium text-sm"
                        >
                            <FolderOpen size={18} />
                            Import from Ads Library
                        </button>
                    </div>

                    {/* Media Grid */}
                    {creativeData.creatives && creativeData.creatives.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                            {creativeData.creatives.map((creative) => (
                                <div key={creative.id} className="relative group border rounded-lg overflow-hidden aspect-square bg-gray-100">
                                    {creative.mediaType === 'video' ? (
                                        creative.thumbnailUrl ? (
                                            <img
                                                src={creative.thumbnailUrl}
                                                alt={creative.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <video
                                                src={creative.previewUrl}
                                                className="w-full h-full object-cover"
                                                muted
                                                playsInline
                                                poster={creative.thumbnailUrl || undefined}
                                                onMouseEnter={(e) => e.target.play().catch(() => {})}
                                                onMouseLeave={(e) => { e.target.pause(); e.target.currentTime = 0; }}
                                            />
                                        )
                                    ) : (
                                        <img
                                            src={creative.previewUrl}
                                            alt={creative.name}
                                            className="w-full h-full object-cover"
                                        />
                                    )}
                                    {/* Media type badge */}
                                    <div className="absolute top-2 left-2">
                                        {creative.mediaType === 'video' ? (
                                            <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                                                <Film size={12} /> Video
                                            </span>
                                        ) : (
                                            <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                                                <Image size={12} /> Image
                                            </span>
                                        )}
                                    </div>
                                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                        {creative.mediaType === 'video' && (
                                            <div className="relative">
                                                <button
                                                    onClick={() => setProviderMenuId(providerMenuId === creative.id ? null : creative.id)}
                                                    disabled={analyzingVideoId !== null}
                                                    className="p-2 bg-amber-500 text-white rounded-full hover:bg-amber-600 transform scale-90 hover:scale-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Analyze video with AI"
                                                >
                                                    <Sparkles size={16} />
                                                </button>
                                                {providerMenuId === creative.id && (
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white rounded-lg shadow-xl border border-gray-200 py-1 w-52 z-50">
                                                        <button
                                                            onClick={() => handleAnalyzeVideo(creative, 'gemini')}
                                                            className="w-full px-3 py-2 text-left text-sm hover:bg-amber-50 flex items-center gap-2"
                                                        >
                                                            <Sparkles size={14} className="text-amber-500" />
                                                            <div>
                                                                <div className="font-medium text-gray-800">Gemini 2.0 Flash</div>
                                                                <div className="text-xs text-gray-500">Analyzes video + audio</div>
                                                            </div>
                                                        </button>
                                                        <button
                                                            onClick={() => handleAnalyzeVideo(creative, 'transcribe_haiku')}
                                                            className="w-full px-3 py-2 text-left text-sm hover:bg-green-50 flex items-center gap-2"
                                                        >
                                                            <Sparkles size={14} className="text-green-500" />
                                                            <div>
                                                                <div className="font-medium text-gray-800">Transcribe + Haiku</div>
                                                                <div className="text-xs text-gray-500">Gemini transcribes → Haiku writes copy</div>
                                                            </div>
                                                        </button>
                                                        <div className="border-t border-gray-100 my-1"></div>
                                                        <button
                                                            onClick={() => handleAnalyzeVideo(creative, 'claude')}
                                                            className="w-full px-3 py-2 text-left text-sm hover:bg-purple-50 flex items-center gap-2"
                                                        >
                                                            <Sparkles size={14} className="text-purple-500" />
                                                            <div>
                                                                <div className="font-medium text-gray-800">Claude Haiku</div>
                                                                <div className="text-xs text-gray-500">Frames only (no audio)</div>
                                                            </div>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {creative.mediaType === 'video' && (
                                            <button
                                                onClick={() => setPlayingVideo(creative)}
                                                className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transform scale-90 hover:scale-100 transition-all"
                                                title="Play video"
                                            >
                                                <Play size={16} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => removeCreative(creative.id)}
                                            className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transform scale-90 hover:scale-100 transition-all"
                                            title="Remove media"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 truncate">
                                        {creative.name}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* AI Video Analysis Loading Banner */}
                    {analyzingVideoId && (
                        <div className={`flex items-center gap-3 ${
                            analyzingProvider === 'transcribe_haiku' ? 'bg-green-50 border-green-200'
                            : analyzingProvider === 'claude' ? 'bg-purple-50 border-purple-200'
                            : 'bg-amber-50 border-amber-200'
                        } border rounded-lg p-4 mb-4`}>
                            <Loader className={`animate-spin ${
                                analyzingProvider === 'transcribe_haiku' ? 'text-green-600'
                                : analyzingProvider === 'claude' ? 'text-purple-600'
                                : 'text-amber-600'
                            }`} size={20} />
                            <div>
                                <p className={`${
                                    analyzingProvider === 'transcribe_haiku' ? 'text-green-800'
                                    : analyzingProvider === 'claude' ? 'text-purple-800'
                                    : 'text-amber-800'
                                } font-medium`}>
                                    {analyzingProvider === 'transcribe_haiku'
                                        ? 'Transcribing audio + generating copy with Haiku...'
                                        : `Analyzing video with ${analyzingProvider === 'claude' ? 'Claude Haiku' : 'Gemini 2.0 Flash'}...`}
                                </p>
                                <p className={`${
                                    analyzingProvider === 'transcribe_haiku' ? 'text-green-600'
                                    : analyzingProvider === 'claude' ? 'text-purple-600'
                                    : 'text-amber-600'
                                } text-sm`}>
                                    {analyzingProvider === 'transcribe_haiku'
                                        ? 'Step 1: Gemini transcribes audio → Step 2: Haiku writes DR copy. This may take 60-90 seconds.'
                                        : analyzingProvider === 'claude'
                                        ? 'Extracting key frames and generating ad copy. This may take 30-60 seconds.'
                                        : 'Watching your video and generating ad copy. This may take 30-60 seconds.'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* URL Input (Optional fallback) */}
                    <div className="mt-2">
                        <p className="text-sm text-gray-500 mb-1">Or paste a media URL (image or video):</p>
                        <input
                            type="text"
                            placeholder="https://example.com/image.jpg or https://example.com/video.mp4"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                            onBlur={(e) => {
                                if (e.target.value) {
                                    const url = e.target.value.toLowerCase();
                                    const isVideo = url.endsWith('.mp4') || url.endsWith('.mov') || url.endsWith('.webm') || url.endsWith('.avi');
                                    const newCreative = {
                                        id: `creative_url_${Date.now()}`,
                                        previewUrl: e.target.value,
                                        imageUrl: isVideo ? undefined : e.target.value,
                                        videoUrl: isVideo ? e.target.value : undefined,
                                        name: isVideo ? 'Video from URL' : 'Image from URL',
                                        mediaType: isVideo ? 'video' : 'image'
                                    };
                                    setCreativeData(prev => ({
                                        ...prev,
                                        creatives: [...(prev.creatives || []), newCreative]
                                    }));
                                    e.target.value = ''; // Clear input
                                }
                            }}
                        />
                    </div>
                </div>

                {/* Copy Fields - Standard or Per Creative */}
                {isPerCreative ? (
                    /* ===== PER CREATIVE MODE ===== */
                    creativeData.creatives.length > 0 ? (
                        <div className="border border-gray-200 rounded-xl overflow-hidden">
                            {/* Creative Navigation Header */}
                            <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-b border-gray-200">
                                <button
                                    onClick={() => setCurrentCreativeIndex(Math.max(0, currentCreativeIndex - 1))}
                                    disabled={currentCreativeIndex === 0}
                                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-30 disabled:cursor-not-allowed text-gray-700 hover:bg-gray-200 transition-colors"
                                >
                                    <ChevronLeft size={16} /> Previous
                                </button>
                                <span className="text-sm font-semibold text-gray-800">
                                    Creative {currentCreativeIndex + 1} of {creativeData.creatives.length}
                                </span>
                                <button
                                    onClick={() => setCurrentCreativeIndex(Math.min(creativeData.creatives.length - 1, currentCreativeIndex + 1))}
                                    disabled={currentCreativeIndex === creativeData.creatives.length - 1}
                                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-30 disabled:cursor-not-allowed text-gray-700 hover:bg-gray-200 transition-colors"
                                >
                                    Next <ChevronRight size={16} />
                                </button>
                            </div>

                            {/* Creative dots / tabs */}
                            <div className="bg-gray-50 px-6 pb-3 flex items-center gap-2 flex-wrap">
                                {creativeData.creatives.map((c, idx) => {
                                    const hasBody = (c.bodies || []).some(b => b && b.trim());
                                    const hasHeadline = (c.headlines || []).some(h => h && h.trim());
                                    const isComplete = hasBody && hasHeadline;
                                    return (
                                        <button
                                            key={c.id}
                                            onClick={() => setCurrentCreativeIndex(idx)}
                                            className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
                                                idx === currentCreativeIndex
                                                    ? 'bg-amber-600 text-white scale-110 shadow'
                                                    : isComplete
                                                        ? 'bg-green-100 text-green-700 border border-green-300'
                                                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                                            }`}
                                            title={c.name}
                                        >
                                            {idx + 1}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Current Creative Preview + Fields */}
                            {currentCreative && (
                                <div className="p-6 space-y-5">
                                    {/* Thumbnail + Name */}
                                    <div className="flex items-center gap-4">
                                        <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                                            {currentCreative.mediaType === 'video' ? (
                                                currentCreative.thumbnailUrl ? (
                                                    <img src={currentCreative.thumbnailUrl} alt={currentCreative.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <video src={currentCreative.previewUrl} className="w-full h-full object-cover" muted />
                                                )
                                            ) : (
                                                <img src={currentCreative.previewUrl} alt={currentCreative.name} className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-900">{currentCreative.name}</p>
                                            <span className={`text-xs px-2 py-0.5 rounded ${currentCreative.mediaType === 'video' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {currentCreative.mediaType === 'video' ? 'Video' : 'Image'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Per-creative Primary Text */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="block text-sm font-medium text-gray-700">Primary Text *</label>
                                            {(currentCreative.bodies || ['']).length < 6 && (
                                                <button type="button" onClick={addPerCreativeBody}
                                                    className="text-sm text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                    </svg>
                                                    Add Body Copy
                                                </button>
                                            )}
                                        </div>
                                        <div className="space-y-3">
                                            {(currentCreative.bodies || ['']).map((body, index) => (
                                                <div key={index} className="relative">
                                                    <textarea
                                                        value={body}
                                                        onChange={(e) => handlePerCreativeBodyChange(index, e.target.value)}
                                                        placeholder={`Body copy ${index + 1}...`}
                                                        rows="3"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                                    />
                                                    {index >= 1 && (
                                                        <button type="button" onClick={() => removePerCreativeBody(index)}
                                                            className="absolute top-2 right-2 text-red-500 hover:text-red-700" title="Remove">
                                                            <X size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Per-creative Headlines */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="block text-sm font-medium text-gray-700">Headline *</label>
                                            {(currentCreative.headlines || ['']).length < 6 && (
                                                <button type="button" onClick={addPerCreativeHeadline}
                                                    className="text-sm text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                    </svg>
                                                    Add Headline
                                                </button>
                                            )}
                                        </div>
                                        <div className="space-y-3">
                                            {(currentCreative.headlines || ['']).map((headline, index) => (
                                                <div key={index} className="relative">
                                                    <input
                                                        type="text"
                                                        value={headline}
                                                        onChange={(e) => handlePerCreativeHeadlineChange(index, e.target.value)}
                                                        placeholder={`Headline ${index + 1}...`}
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                                    />
                                                    {index >= 1 && (
                                                        <button type="button" onClick={() => removePerCreativeHeadline(index)}
                                                            className="absolute top-2 right-2 text-red-500 hover:text-red-700" title="Remove">
                                                            <X size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Per-creative Description */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                                        <input
                                            type="text"
                                            value={currentCreative.description || ''}
                                            onChange={(e) => updateCreativeField(currentCreativeIndex, 'description', e.target.value)}
                                            placeholder="Shop now and save!"
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                        />
                                    </div>

                                    {/* Per-creative CTA */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Call to Action *</label>
                                        <select
                                            value={currentCreative.cta || creativeData.cta}
                                            onChange={(e) => updateCreativeField(currentCreativeIndex, 'cta', e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                        >
                                            {CTA_OPTIONS.map(cta => (
                                                <option key={cta} value={cta}>{cta.replace(/_/g, ' ')}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* Per-creative Ad Counter */}
                            <div className="px-6 pb-4">
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                    <div className="flex items-center gap-2 text-amber-800">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="font-medium">
                                            {(() => {
                                                let totalAds = 0;
                                                creativeData.creatives.forEach(c => {
                                                    const h = (c.headlines || []).filter(x => x && x.trim()).length || 1;
                                                    const b = (c.bodies || []).filter(x => x && x.trim()).length || 1;
                                                    totalAds += h * b;
                                                });
                                                return `${totalAds} ad${totalAds !== 1 ? 's' : ''} will be created (1 per creative × headlines × bodies)`;
                                            })()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                            Upload media above, then configure copy for each creative here.
                        </div>
                    )
                ) : (
                    /* ===== STANDARD (BULK) MODE ===== */
                    <>
                        {/* Body Text */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    Primary Text *
                                </label>
                                {creativeData.bodies.length < 6 && (
                                    <button
                                        type="button"
                                        onClick={addBodyField}
                                        className="text-sm text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add Body Copy
                                    </button>
                                )}
                            </div>
                            <div className="space-y-3">
                                {creativeData.bodies.map((body, index) => (
                                    <div key={index} className="relative">
                                        <textarea
                                            value={body}
                                            onChange={(e) => handleBodyChange(index, e.target.value)}
                                            placeholder={`Body copy ${index + 1}...`}
                                            rows="3"
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                        />
                                        {index >= 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeBodyField(index)}
                                                className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                                                title="Remove this body copy"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Headline */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-sm font-medium text-gray-700">
                                    Headline *
                                </label>
                                {creativeData.headlines.length < 6 && (
                                    <button
                                        type="button"
                                        onClick={addHeadlineField}
                                        className="text-sm text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add Headline
                                    </button>
                                )}
                            </div>
                            <div className="space-y-3">
                                {creativeData.headlines.map((headline, index) => (
                                    <div key={index} className="relative">
                                        <input
                                            type="text"
                                            value={headline}
                                            onChange={(e) => handleHeadlineChange(index, e.target.value)}
                                            placeholder={`Headline ${index + 1}...`}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                        />
                                        {index >= 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removeHeadlineField(index)}
                                                className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                                                title="Remove this headline"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Description
                            </label>
                            <input
                                type="text"
                                value={creativeData.description}
                                onChange={(e) => handleInputChange('description', e.target.value)}
                                placeholder="Shop now and save!"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            />
                        </div>

                        {/* Ad Permutation Counter */}
                        {creativeData.creatives && creativeData.creatives.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                <div className="flex items-center gap-2 text-amber-800">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="font-medium">
                                        {(() => {
                                            const validHeadlines = creativeData.headlines.filter(h => h && h.trim() !== '').length;
                                            const validBodies = creativeData.bodies.filter(b => b && b.trim() !== '').length;
                                            const totalAds = creativeData.creatives.length * validHeadlines * validBodies;
                                            const imageCount = creativeData.creatives.filter(c => c.mediaType !== 'video').length;
                                            const videoCount = creativeData.creatives.filter(c => c.mediaType === 'video').length;
                                            const mediaDesc = [];
                                            if (imageCount > 0) mediaDesc.push(`${imageCount} image${imageCount !== 1 ? 's' : ''}`);
                                            if (videoCount > 0) mediaDesc.push(`${videoCount} video${videoCount !== 1 ? 's' : ''}`);
                                            return (
                                                <>
                                                    {totalAds} ad{totalAds !== 1 ? 's' : ''} will be created
                                                    <span className="text-sm font-normal ml-2">
                                                        ({mediaDesc.join(' + ')} × {validHeadlines} headline{validHeadlines !== 1 ? 's' : ''} × {validBodies} bod{validBodies !== 1 ? 'ies' : 'y'})
                                                    </span>
                                                </>
                                            );
                                        })()}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Call to Action */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Call to Action *
                            </label>
                            <select
                                value={creativeData.cta}
                                onChange={(e) => handleInputChange('cta', e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            >
                                {CTA_OPTIONS.map(cta => (
                                    <option key={cta} value={cta}>{cta.replace(/_/g, ' ')}</option>
                                ))}
                            </select>
                        </div>
                    </>
                )}

                {/* Website URL */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Website URL (Landing Page) *
                    </label>
                    <input
                        type="url"
                        value={creativeData.websiteUrl}
                        onChange={(e) => handleInputChange('websiteUrl', e.target.value)}
                        placeholder="https://yourwebsite.com/landing"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                </div>
            </div>

            {/* Navigation */}
            <div className="mt-8 flex justify-between">
                <button
                    onClick={onBack}
                    className="px-6 py-3 text-gray-600 hover:text-gray-800 font-medium"
                >
                    Back
                </button>
                <button
                    onClick={handleNext}
                    className="flex items-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700"
                >
                    Next Step <ChevronRight size={20} />
                </button>
            </div>

            {/* Ads Library Import Modal */}
            {showLibraryModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                     onClick={() => { setShowLibraryModal(false); setSelectedLibraryItems(new Set()); }}>
                    <div className="bg-white rounded-xl max-w-5xl w-full max-h-[85vh] flex flex-col"
                         onClick={(e) => e.stopPropagation()}>

                        {/* Modal Header */}
                        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                <FolderOpen size={24} className="text-indigo-600" />
                                Import from Ads Library
                            </h3>
                            <button onClick={() => { setShowLibraryModal(false); setSelectedLibraryItems(new Set()); }}
                                    className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>

                        {/* Filters Bar */}
                        <div className="px-6 py-3 border-b border-gray-100 flex gap-3 items-center flex-wrap">
                            <select value={libraryFilterBrand}
                                    onChange={(e) => { setLibraryFilterBrand(e.target.value); fetchLibraryItems(e.target.value, libraryFilterMediaType); }}
                                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg">
                                <option value="">All Brands</option>
                                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                                {[['', 'All'], ['image', 'Images'], ['video', 'Videos']].map(([type, label]) => (
                                    <button key={type}
                                            onClick={() => { setLibraryFilterMediaType(type); fetchLibraryItems(libraryFilterBrand, type); }}
                                            className={`px-3 py-1.5 text-sm ${
                                                libraryFilterMediaType === type
                                                    ? 'bg-amber-600 text-white'
                                                    : 'bg-white text-gray-600 hover:bg-gray-50'
                                            }`}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                            {selectedLibraryItems.size > 0 && (
                                <span className="ml-auto text-sm text-indigo-600 font-medium">
                                    {selectedLibraryItems.size} selected
                                </span>
                            )}
                        </div>

                        {/* Items Grid */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {libraryLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader className="animate-spin text-amber-600" size={24} />
                                </div>
                            ) : libraryItems.length === 0 ? (
                                <div className="text-center py-12 text-gray-500">
                                    No library items found. Upload media in the Ads Library first.
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {libraryItems.map(item => {
                                        const isSelected = selectedLibraryItems.has(item.id);
                                        return (
                                            <div key={item.id}
                                                 onClick={() => toggleLibrarySelection(item.id)}
                                                 className={`relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
                                                     isSelected
                                                         ? 'border-indigo-600 ring-2 ring-indigo-200'
                                                         : 'border-gray-200 hover:border-indigo-300'
                                                 }`}>
                                                <div className="aspect-square bg-gray-100">
                                                    {item.media_type === 'video' ? (
                                                        item.thumbnail_url ? (
                                                            <img src={item.thumbnail_url} alt={item.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                                <Film size={32} className="text-gray-500" />
                                                            </div>
                                                        )
                                                    ) : (
                                                        <img src={item.media_url} alt={item.name} className="w-full h-full object-cover" />
                                                    )}
                                                </div>
                                                {isSelected && (
                                                    <div className="absolute top-2 right-2 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center">
                                                        <Check size={14} className="text-white" />
                                                    </div>
                                                )}
                                                <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                                                    {item.media_type}
                                                </span>
                                                {item.variants && Object.keys(item.variants).length > 1 && (
                                                    <span className="absolute bottom-12 left-2 px-2 py-0.5 bg-purple-600/90 text-white text-xs rounded">
                                                        {Object.keys(item.variants).length} sizes
                                                    </span>
                                                )}
                                                <div className="p-2">
                                                    <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                                                    <p className="text-xs text-gray-500 truncate">{item.brand_name}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-gray-200 flex justify-between items-center">
                            <button onClick={() => { setShowLibraryModal(false); setSelectedLibraryItems(new Set()); }}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                                Cancel
                            </button>
                            <button onClick={handleImportFromLibrary}
                                    disabled={selectedLibraryItems.size === 0}
                                    className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                                Import {selectedLibraryItems.size > 0 ? `(${selectedLibraryItems.size})` : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Video Playback Modal */}
            {playingVideo && (
                <div
                    className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
                    onClick={() => setPlayingVideo(null)}
                >
                    <div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setPlayingVideo(null)}
                            className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
                            title="Close"
                        >
                            <X size={28} />
                        </button>
                        <video
                            src={playingVideo.previewUrl}
                            controls
                            autoPlay
                            className="w-full rounded-lg"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdCreativeStep;

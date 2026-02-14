import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { createBrandScrape, getBrandScrapes, getBrandScrape, deleteBrandScrape, updateBrandScrape, refreshBrandScrape } from '../api/research';
import { Search, Trash2, ChevronDown, ChevronRight, ExternalLink, Image, Video, Loader2, RefreshCw, X, Download, ChevronLeft, Wand2, Pencil, Check } from 'lucide-react';
import GenerateVideoModal from '../components/GenerateVideoModal';

const VIDEO_PLACEHOLDER = 'https://pub-11870393a7f1464a9a0bf4fce09be525.r2.dev/placeholders/video_ad.png';

const BrandScrapes = () => {
    const { showSuccess, showError, showInfo } = useToast();
    const [brandName, setBrandName] = useState('');
    const [pageInput, setPageInput] = useState('');

    // Build full URL from page ID, search query, or extract from URL
    const buildPageUrl = (input) => {
        const trimmed = input.trim();
        // If it's just numbers, treat as page ID
        if (/^\d+$/.test(trimmed)) {
            return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&view_all_page_id=${trimmed}`;
        }
        // If it's a valid FB Ads Library URL (with view_all_page_id OR search query), use as-is
        if (trimmed.includes('facebook.com/ads/library') && (trimmed.includes('view_all_page_id=') || trimmed.includes('q='))) {
            return trimmed;
        }
        // Try to extract page ID from various FB URL formats
        const pageIdMatch = trimmed.match(/(?:page_id=|pages\/|facebook\.com\/)(\d+)/);
        if (pageIdMatch) {
            return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&view_all_page_id=${pageIdMatch[1]}`;
        }
        return null;
    };
    const [scrapes, setScrapes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expandedScrape, setExpandedScrape] = useState(null);
    const [scrapeDetails, setScrapeDetails] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [scrapeToDelete, setScrapeToDelete] = useState(null);
    const [selectedAd, setSelectedAd] = useState(null);
    const [mediaIndex, setMediaIndex] = useState(0);
    const [videoGenImage, setVideoGenImage] = useState(null);
    const [editingScrapeId, setEditingScrapeId] = useState(null);
    const [editName, setEditName] = useState('');
    const [refreshingScrapeId, setRefreshingScrapeId] = useState(null);

    const handleDownload = async (url) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = url.split('/').pop() || 'download';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch {
            window.open(url, '_blank');
        }
    };

    useEffect(() => {
        fetchScrapes();
    }, []);

    const fetchScrapes = async () => {
        try {
            const data = await getBrandScrapes();
            setScrapes(Array.isArray(data) ? data : []);
        } catch (error) {
            showError('Failed to load brand scrapes');
            setScrapes([]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!brandName.trim()) {
            showError('Please enter a brand name');
            return;
        }
        if (!pageInput.trim()) {
            showError('Please enter a Facebook Page ID or Ads Library URL');
            return;
        }

        const pageUrl = buildPageUrl(pageInput);
        if (!pageUrl) {
            showError('Invalid input. Enter a Page ID (numbers) or a Facebook Ads Library URL');
            return;
        }

        setLoading(true);
        try {
            await createBrandScrape(brandName, pageUrl);
            showSuccess('Brand scrape started! Check back soon for results.');
            setBrandName('');
            setPageInput('');
            fetchScrapes();
        } catch (error) {
            const message = error.response?.data?.detail || 'Failed to start scrape';
            showError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleExpand = async (scrapeId) => {
        if (expandedScrape === scrapeId) {
            setExpandedScrape(null);
            setScrapeDetails(null);
            return;
        }

        setExpandedScrape(scrapeId);
        try {
            const details = await getBrandScrape(scrapeId);
            // Ensure ads is always an array
            if (details && !Array.isArray(details.ads)) {
                details.ads = [];
            }
            setScrapeDetails(details);
        } catch (error) {
            showError('Failed to load scrape details');
            setScrapeDetails(null);
        }
    };

    const confirmDelete = (scrape) => {
        setScrapeToDelete(scrape);
        setShowDeleteModal(true);
    };

    const handleDelete = async () => {
        if (!scrapeToDelete) return;

        try {
            await deleteBrandScrape(scrapeToDelete.id);
            showSuccess('Brand scrape deleted');
            setShowDeleteModal(false);
            setScrapeToDelete(null);
            if (expandedScrape === scrapeToDelete.id) {
                setExpandedScrape(null);
                setScrapeDetails(null);
            }
            fetchScrapes();
        } catch (error) {
            showError('Failed to delete brand scrape');
        }
    };

    const handleRename = async (scrapeId) => {
        if (!editName.trim()) {
            showError('Name cannot be empty');
            return;
        }
        try {
            await updateBrandScrape(scrapeId, { brand_name: editName.trim() });
            showSuccess('Brand scrape renamed');
            setEditingScrapeId(null);
            fetchScrapes();
        } catch (error) {
            showError('Failed to rename brand scrape');
        }
    };

    const handleRefresh = async (scrape) => {
        setRefreshingScrapeId(scrape.id);
        try {
            await refreshBrandScrape(scrape.id);
            showSuccess(`Re-scraping ${scrape.brand_name}...`);
            fetchScrapes();
        } catch (error) {
            const msg = error.response?.data?.detail || 'Failed to refresh';
            showError(msg);
        } finally {
            setRefreshingScrapeId(null);
        }
    };

    const getStatusBadge = (status) => {
        const styles = {
            pending: 'bg-yellow-100 text-yellow-800',
            scraping: 'bg-blue-100 text-blue-800',
            completed: 'bg-green-100 text-green-800',
            failed: 'bg-red-100 text-red-800'
        };
        return (
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
                {status}
            </span>
        );
    };

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-amber-900">Scrape Brand Ads</h1>
                    <p className="text-amber-600 text-sm">Download all ads from a Facebook page to R2 storage</p>
                </div>
                <button
                    onClick={fetchScrapes}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg"
                >
                    <RefreshCw size={16} />
                    Refresh
                </button>
            </div>

            {/* Scrape Form */}
            <div className="bg-white rounded-xl border border-amber-200 p-6">
                <h2 className="text-lg font-semibold text-amber-900 mb-4">New Brand Scrape</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="brandName" className="block text-sm font-medium text-gray-700 mb-1">
                            Brand Name
                        </label>
                        <input
                            id="brandName"
                            name="brandName"
                            type="text"
                            value={brandName}
                            onChange={(e) => setBrandName(e.target.value)}
                            placeholder="e.g., Nike, Apple, etc."
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">This will be the folder name on R2 storage</p>
                    </div>
                    <div>
                        <label htmlFor="pageInput" className="block text-sm font-medium text-gray-700 mb-1">
                            Facebook Page ID or Ads Library URL
                        </label>
                        <input
                            id="pageInput"
                            name="pageInput"
                            type="text"
                            value={pageInput}
                            onChange={(e) => setPageInput(e.target.value)}
                            placeholder="123456789 or https://www.facebook.com/ads/library/?...&view_all_page_id=123456789"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Paste a Page ID or full Ads Library URL - we'll handle the rest
                        </p>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:bg-amber-300 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Starting...
                            </>
                        ) : (
                            <>
                                <Search size={18} />
                                Start Scrape
                            </>
                        )}
                    </button>
                </form>
            </div>

            {/* Scrapes List */}
            <div className="bg-white rounded-xl border border-amber-200">
                <div className="p-4 border-b border-amber-100">
                    <h2 className="text-lg font-semibold text-amber-900">Brand Scrapes</h2>
                </div>

                {scrapes.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        No brand scrapes yet. Start one above!
                    </div>
                ) : (
                    <div className="divide-y divide-amber-100">
                        {scrapes.map((scrape) => (
                            <div key={scrape.id}>
                                <div
                                    className="p-4 hover:bg-amber-50 cursor-pointer flex items-center justify-between"
                                    onClick={() => handleExpand(scrape.id)}
                                >
                                    <div className="flex items-center gap-4">
                                        <button className="text-amber-600">
                                            {expandedScrape === scrape.id ? (
                                                <ChevronDown size={20} />
                                            ) : (
                                                <ChevronRight size={20} />
                                            )}
                                        </button>
                                        <div>
                                            {editingScrapeId === scrape.id ? (
                                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="text"
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleRename(scrape.id);
                                                            if (e.key === 'Escape') setEditingScrapeId(null);
                                                        }}
                                                        className="px-2 py-1 border border-amber-300 rounded text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={() => handleRename(scrape.id)}
                                                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                                                        title="Save"
                                                    >
                                                        <Check size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingScrapeId(null)}
                                                        className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                                        title="Cancel"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <h3 className="font-medium text-gray-900">{scrape.brand_name}</h3>
                                            )}
                                            <p className="text-sm text-gray-500">
                                                {scrape.page_name || `Page ID: ${scrape.page_id}`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="text-right">
                                            <p className="text-sm font-medium text-gray-900">
                                                {scrape.total_ads} ads
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {scrape.media_downloaded} media files
                                            </p>
                                        </div>
                                        {getStatusBadge(scrape.status)}
                                        <span className="text-xs text-gray-400">
                                            {formatDate(scrape.created_at)}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingScrapeId(scrape.id);
                                                setEditName(scrape.brand_name);
                                            }}
                                            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                                            title="Rename"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRefresh(scrape);
                                            }}
                                            disabled={refreshingScrapeId === scrape.id || scrape.status === 'scraping'}
                                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg disabled:opacity-50"
                                            title="Re-scrape current ads"
                                        >
                                            <RefreshCw size={16} className={refreshingScrapeId === scrape.id ? 'animate-spin' : ''} />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                confirmDelete(scrape);
                                            }}
                                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Details */}
                                {expandedScrape === scrape.id && scrapeDetails && (
                                    <div className="px-4 pb-4 bg-amber-50/50">
                                        {scrape.error_message && (
                                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                                {scrape.error_message}
                                            </div>
                                        )}

                                        {scrapeDetails.ads && scrapeDetails.ads.length > 0 ? (
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                {scrapeDetails.ads.map((ad) => (
                                                    <div
                                                        key={ad.id}
                                                        className="bg-white rounded-lg border border-amber-200 overflow-hidden"
                                                    >
                                                        {/* Media Preview */}
                                                        <div
                                                            className="aspect-video bg-gray-100 relative cursor-pointer group"
                                                            onClick={() => { setSelectedAd(ad); setMediaIndex(0); }}
                                                        >
                                                            {ad.media_urls && ad.media_urls.length > 0 ? (
                                                                <img
                                                                    src={ad.media_type === 'video' ? VIDEO_PLACEHOLDER : ad.media_urls[0]}
                                                                    alt={ad.headline || 'Ad'}
                                                                    className={`w-full h-full ${ad.media_type === 'video' ? 'object-contain bg-gray-900' : 'object-cover'}`}
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                                    <Image size={32} />
                                                                </div>
                                                            )}
                                                            {ad.media_type && (
                                                                <span className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded flex items-center gap-1">
                                                                    {ad.media_type === 'video' ? <Video size={12} /> : <Image size={12} />}
                                                                    {ad.media_type}
                                                                </span>
                                                            )}
                                                            {ad.media_urls && ad.media_urls.length > 1 && (
                                                                <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                                                                    +{ad.media_urls.length - 1} more
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Ad Info */}
                                                        <div className="p-3">
                                                            {ad.page_name && (
                                                                <div className="flex items-center gap-1 mb-1">
                                                                    <span className="text-xs font-medium text-indigo-600 truncate">
                                                                        {ad.page_name}
                                                                    </span>
                                                                    {ad.page_link && (
                                                                        <a
                                                                            href={ad.page_link}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="text-indigo-400 hover:text-indigo-600 flex-shrink-0"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            title="View all ads from this page"
                                                                        >
                                                                            <ExternalLink size={10} />
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {ad.headline && (
                                                                <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">
                                                                    {ad.headline}
                                                                </p>
                                                            )}
                                                            {ad.ad_copy && (
                                                                <p className="text-xs text-gray-500 line-clamp-2 mb-1">
                                                                    {ad.ad_copy}
                                                                </p>
                                                            )}
                                                            {ad.cta_text && (
                                                                <span className="inline-block px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded mb-1">
                                                                    {ad.cta_text}
                                                                </span>
                                                            )}
                                                            <div className="mt-2 flex items-center justify-between">
                                                                <span className="text-xs text-gray-400">
                                                                    {ad.start_date || 'Unknown date'}
                                                                </span>
                                                                {ad.ad_link && (
                                                                    <a
                                                                        href={ad.ad_link}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-amber-600 hover:text-amber-800"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        title="View ad in library"
                                                                    >
                                                                        <ExternalLink size={14} />
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-8 text-gray-500">
                                                {scrape.status === 'scraping' ? (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <Loader2 size={20} className="animate-spin" />
                                                        Scraping in progress...
                                                    </div>
                                                ) : (
                                                    'No ads found'
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Media Viewer Modal */}
            {selectedAd && selectedAd.media_urls && selectedAd.media_urls.length > 0 && (
                <div
                    className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
                    onClick={() => setSelectedAd(null)}
                >
                    <div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
                        {/* Close button */}
                        <button
                            onClick={() => setSelectedAd(null)}
                            className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors z-10"
                        >
                            <X size={28} />
                        </button>

                        {/* Main media display */}
                        {(() => {
                            const currentUrl = selectedAd.media_urls[mediaIndex];
                            const isActualVideo = currentUrl?.match(/\.(mp4|webm|mov)(\?|$)/i);
                            const displayUrl = selectedAd.media_type === 'video' ? VIDEO_PLACEHOLDER : currentUrl;
                            return isActualVideo ? (
                                <video
                                    key={currentUrl}
                                    src={currentUrl}
                                    controls
                                    autoPlay
                                    className="w-full rounded-lg max-h-[70vh] object-contain bg-black"
                                />
                            ) : (
                                <img
                                    src={displayUrl}
                                    alt={selectedAd.headline || 'Ad'}
                                    className="w-full rounded-lg max-h-[70vh] object-contain bg-black"
                                />
                            );
                        })()}

                        {/* Carousel navigation */}
                        {selectedAd.media_urls.length > 1 && (
                            <>
                                <button
                                    onClick={() => setMediaIndex((mediaIndex - 1 + selectedAd.media_urls.length) % selectedAd.media_urls.length)}
                                    className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
                                >
                                    <ChevronLeft size={24} />
                                </button>
                                <button
                                    onClick={() => setMediaIndex((mediaIndex + 1) % selectedAd.media_urls.length)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
                                >
                                    <ChevronRight size={24} />
                                </button>
                                <div className="text-center text-white/70 text-sm mt-2">
                                    {mediaIndex + 1} of {selectedAd.media_urls.length}
                                </div>
                            </>
                        )}

                        {/* Thumbnail strip for multiple media */}
                        {selectedAd.media_urls.length > 1 && (
                            <div className="flex gap-2 mt-3 justify-center overflow-x-auto">
                                {selectedAd.media_urls.map((url, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setMediaIndex(i)}
                                        className={`w-16 h-12 rounded overflow-hidden flex-shrink-0 border-2 transition-colors ${
                                            i === mediaIndex ? 'border-amber-500' : 'border-transparent opacity-60 hover:opacity-100'
                                        }`}
                                    >
                                        <img src={url} alt="" className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Ad info + actions */}
                        <div className="mt-4 bg-white/10 backdrop-blur rounded-lg p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    {selectedAd.page_name && (
                                        <p className="text-amber-400 text-sm font-medium">{selectedAd.page_name}</p>
                                    )}
                                    {selectedAd.headline && (
                                        <p className="text-white font-medium mt-1">{selectedAd.headline}</p>
                                    )}
                                    {selectedAd.ad_copy && (
                                        <p className="text-white/70 text-sm mt-1">{selectedAd.ad_copy}</p>
                                    )}
                                    <div className="flex items-center gap-3 mt-2">
                                        {selectedAd.cta_text && (
                                            <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-300 rounded">
                                                {selectedAd.cta_text}
                                            </span>
                                        )}
                                        {selectedAd.start_date && (
                                            <span className="text-white/50 text-xs">{selectedAd.start_date}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => {
                                            setVideoGenImage(selectedAd.media_urls[mediaIndex]);
                                            setSelectedAd(null);
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                                        title="Generate video from this image"
                                    >
                                        <Wand2 size={16} />
                                        Generate Video
                                    </button>
                                    {selectedAd.ad_link && (
                                        <a
                                            href={selectedAd.ad_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                                        >
                                            <ExternalLink size={16} />
                                            {selectedAd.media_type === 'video' ? 'Watch on Facebook' : 'View on Facebook'}
                                        </a>
                                    )}
                                    <button
                                        onClick={() => handleDownload(selectedAd.media_urls[mediaIndex])}
                                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
                                    >
                                        <Download size={16} />
                                        Download
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && scrapeToDelete && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            Delete Brand Scrape?
                        </h3>
                        <p className="text-gray-600 mb-4">
                            This will delete all {scrapeToDelete.total_ads} ads and {scrapeToDelete.media_downloaded} media files from R2 storage. This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowDeleteModal(false);
                                    setScrapeToDelete(null);
                                }}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Generate Video Modal */}
            {videoGenImage && (
                <GenerateVideoModal
                    imageUrl={videoGenImage}
                    onClose={() => setVideoGenImage(null)}
                    onVideoReady={(videoUrl) => {
                        showSuccess('Video saved! Check your Ads Library.');
                        setVideoGenImage(null);
                    }}
                />
            )}
        </div>
    );
};

export default BrandScrapes;

import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { createBrandScrape, getBrandScrapes, getBrandScrape, deleteBrandScrape } from '../api/research';
import { Search, Trash2, ChevronDown, ChevronRight, ExternalLink, Image, Video, Loader2, RefreshCw } from 'lucide-react';

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

    const getStatusBadge = (status) => {
        const styles = {
            pending: 'bg-warning-soft text-warning',
            scraping: 'bg-info-soft text-info',
            completed: 'bg-success-soft text-success',
            failed: 'bg-danger-soft text-danger'
        };
        return (
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-inset text-foreground'}`}>
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
                    <h1 className="text-2xl font-bold text-brand-ink">Scrape Brand Ads</h1>
                    <p className="text-brand-ink text-sm">Download all ads from a Facebook page to R2 storage</p>
                </div>
                <button
                    onClick={fetchScrapes}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-brand-ink hover:text-brand-ink hover:bg-brand-soft rounded-lg"
                >
                    <RefreshCw size={16} />
                    Refresh
                </button>
            </div>

            {/* Scrape Form */}
            <div className="bg-panel rounded-xl border border-brand-line p-6">
                <h2 className="text-lg font-semibold text-brand-ink mb-4">New Brand Scrape</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="brandName" className="block text-sm font-medium text-secondary mb-1">
                            Brand Name
                        </label>
                        <input
                            id="brandName"
                            name="brandName"
                            type="text"
                            value={brandName}
                            onChange={(e) => setBrandName(e.target.value)}
                            placeholder="e.g., Nike, Apple, etc."
                            className="w-full px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        />
                        <p className="text-xs text-muted mt-1">This will be the folder name on R2 storage</p>
                    </div>
                    <div>
                        <label htmlFor="pageInput" className="block text-sm font-medium text-secondary mb-1">
                            Facebook Page ID or Ads Library URL
                        </label>
                        <input
                            id="pageInput"
                            name="pageInput"
                            type="text"
                            value={pageInput}
                            onChange={(e) => setPageInput(e.target.value)}
                            placeholder="123456789 or https://www.facebook.com/ads/library/?...&view_all_page_id=123456789"
                            className="w-full px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        />
                        <p className="text-xs text-muted mt-1">
                            Paste a Page ID or full Ads Library URL - we'll handle the rest
                        </p>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover disabled:bg-amber-300 disabled:cursor-not-allowed"
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
            <div className="bg-panel rounded-xl border border-brand-line">
                <div className="p-4 border-b border-brand-line">
                    <h2 className="text-lg font-semibold text-brand-ink">Brand Scrapes</h2>
                </div>

                {scrapes.length === 0 ? (
                    <div className="p-8 text-center text-muted">
                        No brand scrapes yet. Start one above!
                    </div>
                ) : (
                    <div className="divide-y divide-amber-100">
                        {scrapes.map((scrape) => (
                            <div key={scrape.id}>
                                <div
                                    className="p-4 hover:bg-brand-soft cursor-pointer flex items-center justify-between"
                                    onClick={() => handleExpand(scrape.id)}
                                >
                                    <div className="flex items-center gap-4">
                                        <button className="text-brand-ink">
                                            {expandedScrape === scrape.id ? (
                                                <ChevronDown size={20} />
                                            ) : (
                                                <ChevronRight size={20} />
                                            )}
                                        </button>
                                        <div>
                                            <h3 className="font-medium text-foreground">{scrape.brand_name}</h3>
                                            <p className="text-sm text-muted">
                                                {scrape.page_name || `Page ID: ${scrape.page_id}`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="text-right">
                                            <p className="text-sm font-medium text-foreground">
                                                {scrape.total_ads} ads
                                            </p>
                                            <p className="text-xs text-muted">
                                                {scrape.media_downloaded} media files
                                            </p>
                                        </div>
                                        {getStatusBadge(scrape.status)}
                                        <span className="text-xs text-faint">
                                            {formatDate(scrape.created_at)}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                confirmDelete(scrape);
                                            }}
                                            className="p-2 text-danger hover:bg-danger-soft rounded-lg"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Details */}
                                {expandedScrape === scrape.id && scrapeDetails && (
                                    <div className="px-4 pb-4 bg-brand-soft/50">
                                        {scrape.error_message && (
                                            <div className="mb-4 p-3 bg-danger-soft border border-danger-line rounded-lg text-sm text-danger">
                                                {scrape.error_message}
                                            </div>
                                        )}

                                        {scrapeDetails.ads && scrapeDetails.ads.length > 0 ? (
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                {scrapeDetails.ads.map((ad) => (
                                                    <div
                                                        key={ad.id}
                                                        className="bg-panel rounded-lg border border-brand-line overflow-hidden"
                                                    >
                                                        {/* Media Preview */}
                                                        <div className="aspect-video bg-inset relative">
                                                            {ad.media_urls && ad.media_urls.length > 0 ? (
                                                                ad.media_type === 'video' ? (
                                                                    <video
                                                                        src={ad.media_urls[0]}
                                                                        className="w-full h-full object-cover"
                                                                        controls
                                                                    />
                                                                ) : (
                                                                    <img
                                                                        src={ad.media_urls[0]}
                                                                        alt={ad.headline || 'Ad'}
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                )
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-faint">
                                                                    <Image size={32} />
                                                                </div>
                                                            )}
                                                            {ad.media_type && (
                                                                <span className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                                                                    {ad.media_type === 'video' ? (
                                                                        <Video size={12} className="inline mr-1" />
                                                                    ) : (
                                                                        <Image size={12} className="inline mr-1" />
                                                                    )}
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
                                                                    <span className="text-xs font-medium text-highlight truncate">
                                                                        {ad.page_name}
                                                                    </span>
                                                                    {ad.page_link && (
                                                                        <a
                                                                            href={ad.page_link}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="text-highlight hover:text-highlight flex-shrink-0"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            title="View all ads from this page"
                                                                        >
                                                                            <ExternalLink size={10} />
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {ad.headline && (
                                                                <p className="text-sm font-medium text-foreground line-clamp-2 mb-1">
                                                                    {ad.headline}
                                                                </p>
                                                            )}
                                                            {ad.ad_copy && (
                                                                <p className="text-xs text-muted line-clamp-2 mb-1">
                                                                    {ad.ad_copy}
                                                                </p>
                                                            )}
                                                            {ad.cta_text && (
                                                                <span className="inline-block px-2 py-0.5 text-xs bg-brand-soft text-brand-ink rounded mb-1">
                                                                    {ad.cta_text}
                                                                </span>
                                                            )}
                                                            <div className="mt-2 flex items-center justify-between">
                                                                <span className="text-xs text-faint">
                                                                    {ad.start_date || 'Unknown date'}
                                                                </span>
                                                                {ad.ad_link && (
                                                                    <a
                                                                        href={ad.ad_link}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-brand-ink hover:text-brand-ink"
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
                                            <div className="text-center py-8 text-muted">
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

            {/* Delete Confirmation Modal */}
            {showDeleteModal && scrapeToDelete && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-panel rounded-xl p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                            Delete Brand Scrape?
                        </h3>
                        <p className="text-secondary mb-4">
                            This will delete all {scrapeToDelete.total_ads} ads and {scrapeToDelete.media_downloaded} media files from R2 storage. This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowDeleteModal(false);
                                    setScrapeToDelete(null);
                                }}
                                className="px-4 py-2 text-secondary hover:bg-inset rounded-lg"
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
        </div>
    );
};

export default BrandScrapes;

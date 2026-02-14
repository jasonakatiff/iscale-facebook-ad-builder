import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import { useBrands } from '../context/BrandContext';
import {
    getLibraryItems, createLibraryItem, updateLibraryItem, deleteLibraryItem,
    uploadFile, getAiName, getVideoThumbnail, detectAspectRatio,
    getFolders, createFolder, updateFolder, deleteFolder, moveItemsToFolder, getLibraryStats
} from '../api/adsLibrary';
import {
    Upload, Image, Video, Trash2, Pencil, X, Download, Play, FolderOpen, Loader2,
    Wand2, Layers, Plus, Filter, Sparkles, ChevronRight, Folder, FolderPlus, MoreVertical, Check
} from 'lucide-react';
import GenerateVideoModal from '../components/GenerateVideoModal';

const FUNNEL_STAGES = [
    { value: '', label: 'All Stages' },
    { value: 'tofu', label: 'TOFU (Awareness)' },
    { value: 'mofu', label: 'MOFU (Consideration)' },
    { value: 'bofu', label: 'BOFU (Conversion)' },
];

const AD_FORMATS = [
    { value: '', label: 'Select Format' },
    { value: 'single_image', label: 'Single Image' },
    { value: 'carousel', label: 'Carousel' },
    { value: 'story', label: 'Story' },
    { value: 'reel', label: 'Reel' },
    { value: 'ugc', label: 'UGC' },
    { value: 'testimonial', label: 'Testimonial' },
];

const STATUSES = [
    { value: '', label: 'All Statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'ready', label: 'Ready' },
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
];

const STATUS_COLORS = {
    draft: 'bg-gray-100 text-gray-700',
    ready: 'bg-green-100 text-green-700',
    active: 'bg-blue-100 text-blue-700',
    archived: 'bg-amber-100 text-amber-700',
};

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];

const AdsLibrary = () => {
    const { showSuccess, showError } = useToast();
    const { brands } = useBrands();

    // ── Navigation state (4-level breadcrumb) ──
    const [currentBrandId, setCurrentBrandId] = useState(null);
    const [currentMediaType, setCurrentMediaType] = useState(null); // 'image' | 'video'
    const [currentFolderId, setCurrentFolderId] = useState(null);   // folder id, '__none__' for uncategorized, or null

    // Derived: current navigation level
    // Level 0: brands grid (nothing selected)
    // Level 1: media type picker (brand selected)
    // Level 2: folder grid (brand + media type selected)
    // Level 3: items inside folder (brand + media type + folder selected)
    const navLevel = currentFolderId !== null ? 3 : currentMediaType !== null ? 2 : currentBrandId !== null ? 1 : 0;

    // ── Data ──
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [folders, setFolders] = useState([]);
    const [foldersLoading, setFoldersLoading] = useState(false);
    const [brandStats, setBrandStats] = useState({}); // { brandId: { images, videos, total } }
    const [uncategorizedCount, setUncategorizedCount] = useState(0);

    // ── Filters (shown only at Level 3) ──
    const [filterFunnel, setFilterFunnel] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    // ── Upload ──
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    // ── Add variant ──
    const [addVariantTarget, setAddVariantTarget] = useState(null);
    const variantInputRef = useRef(null);

    // ── Review queue (items pending review before saving) ──
    const [reviewQueue, setReviewQueue] = useState([]);

    // ── Modals ──
    const [selectedItem, setSelectedItem] = useState(null);
    const [editItem, setEditItem] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [videoGenImage, setVideoGenImage] = useState(null);

    // ── Folder management ──
    const [newFolderName, setNewFolderName] = useState('');
    const [showNewFolderInput, setShowNewFolderInput] = useState(false);
    const [renamingFolderId, setRenamingFolderId] = useState(null);
    const [renameFolderName, setRenameFolderName] = useState('');
    const [deleteFolderTarget, setDeleteFolderTarget] = useState(null);
    const [folderMenuOpen, setFolderMenuOpen] = useState(null);
    const newFolderInputRef = useRef(null);
    const renameFolderInputRef = useRef(null);

    // ── Helpers ──
    const currentBrand = brands.find(b => b.id === currentBrandId);
    const currentFolder = folders.find(f => f.id === currentFolderId);
    const currentFolderName = currentFolderId === '__none__' ? 'Uncategorized' : (currentFolder?.name || '');

    // ── Fetch items (Level 3) ──
    const fetchItems = useCallback(async () => {
        if (navLevel < 3 || !currentBrandId || !currentMediaType || currentFolderId === null) return;
        try {
            setLoading(true);
            const filters = {
                brand_id: currentBrandId,
                media_type: currentMediaType,
            };
            if (currentFolderId === '__none__') {
                filters.folder_id = '__none__';
            } else {
                filters.folder_id = currentFolderId;
            }
            if (filterFunnel) filters.funnel_stage = filterFunnel;
            if (filterStatus) filters.status = filterStatus;
            const data = await getLibraryItems(filters);
            setItems(data);
        } catch (error) {
            showError('Failed to load ads library');
        } finally {
            setLoading(false);
        }
    }, [currentBrandId, currentMediaType, currentFolderId, filterFunnel, filterStatus, navLevel]);

    useEffect(() => {
        if (navLevel === 3) {
            fetchItems();
        }
    }, [fetchItems, navLevel]);

    // ── Fetch folders (Level 2) ──
    const fetchFolders = useCallback(async () => {
        if (!currentBrandId || !currentMediaType) return;
        try {
            setFoldersLoading(true);
            const data = await getFolders({ brand_id: currentBrandId, media_type: currentMediaType });
            setFolders(data);
        } catch (error) {
            showError('Failed to load folders');
        } finally {
            setFoldersLoading(false);
        }
    }, [currentBrandId, currentMediaType]);

    // Fetch uncategorized count for Level 2
    const fetchUncategorizedCount = useCallback(async () => {
        if (!currentBrandId || !currentMediaType) return;
        try {
            const data = await getLibraryItems({
                brand_id: currentBrandId,
                media_type: currentMediaType,
                folder_id: '__none__',
            });
            setUncategorizedCount(data.length);
        } catch {
            setUncategorizedCount(0);
        }
    }, [currentBrandId, currentMediaType]);

    useEffect(() => {
        if (navLevel === 2) {
            fetchFolders();
            fetchUncategorizedCount();
        }
    }, [navLevel, fetchFolders, fetchUncategorizedCount]);

    // ── Fetch brand stats for Level 1 ──
    const fetchBrandStats = useCallback(async (brandId) => {
        try {
            const stats = await getLibraryStats({ brand_id: brandId });
            setBrandStats(prev => ({ ...prev, [brandId]: stats }));
        } catch {
            // Silently fail
        }
    }, []);

    useEffect(() => {
        if (navLevel === 1 && currentBrandId) {
            fetchBrandStats(currentBrandId);
        }
    }, [navLevel, currentBrandId, fetchBrandStats]);

    // Standard ratios for FB ads
    const STANDARD_RATIOS = ['1:1', '9:16', '4:5'];

    // ── Upload handlers — now populates review queue instead of creating items immediately ──
    const handleFiles = async (files) => {
        setUploading(true);

        // Separate images and videos
        const imageFiles = [];
        const videoFiles = [];
        for (const file of files) {
            if (ALLOWED_IMAGE_TYPES.includes(file.type)) imageFiles.push(file);
            else if (ALLOWED_VIDEO_TYPES.includes(file.type)) videoFiles.push(file);
            else showError(`${file.name}: Unsupported file type`);
        }

        // Filter by current media type context
        const relevantImages = currentMediaType === 'video' ? [] : imageFiles;
        const relevantVideos = currentMediaType === 'image' ? [] : videoFiles;

        if (currentMediaType === 'video' && imageFiles.length > 0) {
            showError('Only video files are accepted in the Videos section');
        }
        if (currentMediaType === 'image' && videoFiles.length > 0) {
            showError('Only image files are accepted in the Images section');
        }

        // Phase 1: Upload all image files and detect ratios
        const imageUploads = [];
        for (const file of relevantImages) {
            try {
                setUploadProgress(`Uploading ${file.name}...`);
                const { url } = await uploadFile(file);
                let ratio = 'unknown';
                try {
                    ratio = await detectAspectRatio(file);
                } catch (e) {
                    console.warn('Aspect ratio detection failed:', e);
                }
                imageUploads.push({ file, url, ratio, size: file.size });
            } catch (error) {
                showError(`Failed to upload ${file.name}`);
            }
        }

        // Phase 2: Group images by ratio pairs
        const groups = [];
        const used = new Set();
        for (let i = 0; i < imageUploads.length; i++) {
            if (used.has(i)) continue;
            const a = imageUploads[i];
            let paired = false;
            for (let j = i + 1; j < imageUploads.length; j++) {
                if (used.has(j)) continue;
                const b = imageUploads[j];
                if (a.ratio !== b.ratio && a.ratio !== 'unknown' && b.ratio !== 'unknown') {
                    groups.push([a, b]);
                    used.add(i);
                    used.add(j);
                    paired = true;
                    break;
                }
            }
            if (!paired) {
                groups.push([a]);
                used.add(i);
            }
        }

        // Phase 3: Build review queue items for images
        const newQueueItems = [];

        for (const group of groups) {
            const tempId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const primary = group[0];
            const variants = {};
            let totalSize = 0;
            for (const item of group) {
                variants[item.ratio] = item.url;
                totalSize += item.size;
            }

            const uploadedRatios = Object.keys(variants);
            const missingRatios = STANDARD_RATIOS.filter(r => !uploadedRatios.includes(r));

            newQueueItems.push({
                id: tempId,
                mediaType: 'image',
                primaryUrl: primary.url,
                thumbnailUrl: null,
                variants,
                totalSize,
                name: primary.file.name.replace(/\.[^.]+$/, ''),
                nameLoading: true,
                missingRatios,
                tags: [],
                funnel_stage: '',
                ad_format: '',
                status: 'draft',
                folderId: (currentFolderId && currentFolderId !== '__none__') ? currentFolderId : null,
            });
        }

        // Phase 4: Handle video files — upload + extract thumbnail, add to queue
        for (const file of relevantVideos) {
            try {
                setUploadProgress(`Uploading ${file.name}...`);
                const { url } = await uploadFile(file);

                let thumbnailUrl = null;
                try {
                    setUploadProgress(`Extracting thumbnail...`);
                    const { thumbnail_url } = await getVideoThumbnail(url);
                    thumbnailUrl = thumbnail_url;
                } catch (e) {
                    console.warn('Server thumbnail extraction failed:', e?.message || e);
                }

                const tempId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                newQueueItems.push({
                    id: tempId,
                    mediaType: 'video',
                    primaryUrl: url,
                    thumbnailUrl,
                    variants: {},
                    totalSize: file.size,
                    name: file.name.replace(/\.[^.]+$/, ''),
                    nameLoading: false,
                    missingRatios: [],
                    tags: [],
                    funnel_stage: '',
                    ad_format: '',
                    status: 'draft',
                    folderId: (currentFolderId && currentFolderId !== '__none__') ? currentFolderId : null,
                });
            } catch (error) {
                showError(`Failed to upload ${file.name}`);
            }
        }

        setReviewQueue(prev => [...prev, ...newQueueItems]);
        setUploading(false);
        setUploadProgress('');

        // Kick off AI naming in parallel for image items
        for (const item of newQueueItems.filter(i => i.mediaType === 'image')) {
            getAiName(item.primaryUrl)
                .then(({ name }) => {
                    setReviewQueue(prev => prev.map(q =>
                        q.id === item.id ? { ...q, name, nameLoading: false } : q
                    ));
                })
                .catch(() => {
                    setReviewQueue(prev => prev.map(q =>
                        q.id === item.id ? { ...q, nameLoading: false } : q
                    ));
                });
        }
    };

    // Save all review queue items to the library
    const handleSaveAll = async () => {
        setUploading(true);
        let saved = 0;

        for (const item of reviewQueue) {
            try {
                setUploadProgress(`Saving "${item.name}"...`);
                const payload = {
                    brand_id: currentBrandId,
                    name: item.name,
                    media_type: item.mediaType,
                    media_url: item.primaryUrl,
                    thumbnail_url: item.thumbnailUrl || null,
                    variants: Object.keys(item.variants).length > 0 ? item.variants : null,
                    file_size: item.totalSize,
                    tags: item.tags.length > 0 ? item.tags : null,
                    funnel_stage: item.funnel_stage || null,
                    ad_format: item.ad_format || null,
                    status: item.status,
                };
                // Use folder_id stamped at upload time, fallback to current nav
                const folderId = item.folderId || ((currentFolderId && currentFolderId !== '__none__') ? currentFolderId : null);
                if (folderId) {
                    payload.folder_id = folderId;
                }
                await createLibraryItem(payload);
                saved++;
            } catch (error) {
                showError(`Failed to save "${item.name}"`);
            }
        }

        if (saved > 0) {
            showSuccess(`Saved ${saved} item${saved > 1 ? 's' : ''}`);
            setReviewQueue([]);
            if (navLevel === 3) fetchItems();
            if (navLevel === 2) {
                fetchFolders();
                fetchUncategorizedCount();
            }
        }
        setUploading(false);
        setUploadProgress('');
    };

    // Update a field on a review queue item
    const updateQueueItem = (itemId, updates) => {
        setReviewQueue(prev => prev.map(q =>
            q.id === itemId ? { ...q, ...updates } : q
        ));
    };

    // Remove an item from the review queue
    const removeFromQueue = (itemId) => {
        setReviewQueue(prev => prev.filter(q => q.id !== itemId));
    };

    // Drop a file onto a missing ratio slot
    const handleDropOnMissingRatio = async (queueItemId, files) => {
        const file = files[0];
        if (!file || !ALLOWED_IMAGE_TYPES.includes(file.type)) {
            showError('Only images can be added as size variants');
            return;
        }

        setUploading(true);
        setUploadProgress(`Uploading variant...`);
        try {
            const { url } = await uploadFile(file);
            const detectedRatio = await detectAspectRatio(file);

            setReviewQueue(prev => prev.map(q => {
                if (q.id !== queueItemId) return q;
                const newVariants = { ...q.variants, [detectedRatio]: url };
                const newMissing = q.missingRatios.filter(r => r !== detectedRatio);
                return { ...q, variants: newVariants, missingRatios: newMissing, totalSize: q.totalSize + file.size };
            }));
            showSuccess(`Added ${detectedRatio} variant`);
        } catch (error) {
            showError('Failed to upload variant');
        } finally {
            setUploading(false);
            setUploadProgress('');
        }
    };

    const handleAddVariant = async (files) => {
        if (!addVariantTarget || !files.length) return;
        const file = files[0];
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            showError('Only images can be added as size variants');
            return;
        }

        setUploading(true);
        try {
            setUploadProgress(`Uploading variant for ${addVariantTarget.name}...`);
            const { url } = await uploadFile(file);
            const ratio = await detectAspectRatio(file);
            const existingVariants = addVariantTarget.variants || {};
            const newVariants = { ...existingVariants, [ratio]: url };

            await updateLibraryItem(addVariantTarget.id, { variants: newVariants });
            showSuccess(`Added ${ratio} variant`);
            setAddVariantTarget(null);
            fetchItems();
        } catch (error) {
            showError('Failed to add variant');
        } finally {
            setUploading(false);
            setUploadProgress('');
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragActive(false);
        handleFiles(Array.from(e.dataTransfer.files));
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setDragActive(true);
    };

    const handleDragLeave = () => setDragActive(false);

    // Edit handlers
    const handleSaveEdit = async () => {
        if (!editItem) return;
        try {
            await updateLibraryItem(editItem.id, {
                name: editItem.name,
                headline: editItem.headline,
                body: editItem.body,
                cta: editItem.cta,
                tags: editItem.tags,
                funnel_stage: editItem.funnel_stage,
                ad_format: editItem.ad_format,
                status: editItem.status,
                brand_id: editItem.brand_id,
                folder_id: editItem.folder_id || null,
            });
            showSuccess('Ad updated');
            setEditItem(null);
            fetchItems();
        } catch (error) {
            showError('Failed to update ad');
        }
    };

    // Delete
    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteLibraryItem(deleteTarget.id);
            showSuccess('Ad deleted');
            setDeleteTarget(null);
            if (selectedItem?.id === deleteTarget.id) setSelectedItem(null);
            fetchItems();
        } catch (error) {
            showError('Failed to delete ad');
        }
    };

    const formatSize = (bytes) => {
        if (!bytes) return '';
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const variantCount = (item) => {
        if (!item.variants) return 0;
        return Object.keys(item.variants).length;
    };

    const handleDownload = async (url) => {
        try {
            const resp = await fetch(url);
            const blob = await resp.blob();
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

    // ── Folder management handlers ──
    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            await createFolder({
                brand_id: currentBrandId,
                media_type: currentMediaType,
                name: newFolderName.trim(),
            });
            showSuccess(`Folder "${newFolderName.trim()}" created`);
            setNewFolderName('');
            setShowNewFolderInput(false);
            fetchFolders();
        } catch (error) {
            showError(error?.response?.data?.detail || 'Failed to create folder');
        }
    };

    const handleRenameFolder = async (folderId) => {
        if (!renameFolderName.trim()) return;
        try {
            await updateFolder(folderId, { name: renameFolderName.trim() });
            showSuccess('Folder renamed');
            setRenamingFolderId(null);
            setRenameFolderName('');
            fetchFolders();
        } catch (error) {
            showError(error?.response?.data?.detail || 'Failed to rename folder');
        }
    };

    const handleDeleteFolder = async () => {
        if (!deleteFolderTarget) return;
        try {
            await deleteFolder(deleteFolderTarget.id);
            showSuccess(`Folder "${deleteFolderTarget.name}" deleted. Items are now uncategorized.`);
            setDeleteFolderTarget(null);
            fetchFolders();
            fetchUncategorizedCount();
        } catch (error) {
            showError('Failed to delete folder');
        }
    };

    // Focus new folder input when it appears
    useEffect(() => {
        if (showNewFolderInput && newFolderInputRef.current) {
            newFolderInputRef.current.focus();
        }
    }, [showNewFolderInput]);

    useEffect(() => {
        if (renamingFolderId && renameFolderInputRef.current) {
            renameFolderInputRef.current.focus();
        }
    }, [renamingFolderId]);

    // Close folder menu when clicking outside
    useEffect(() => {
        if (!folderMenuOpen) return;
        const handler = () => setFolderMenuOpen(null);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [folderMenuOpen]);

    // ── Navigation handlers ──
    const navigateToBrand = (brandId) => {
        setCurrentBrandId(brandId);
        setCurrentMediaType(null);
        setCurrentFolderId(null);
        setItems([]);
        setFolders([]);
        setReviewQueue([]);
        setFilterFunnel('');
        setFilterStatus('');
    };

    const navigateToMediaType = (mediaType) => {
        setCurrentMediaType(mediaType);
        setCurrentFolderId(null);
        setItems([]);
        setReviewQueue([]);
        setFilterFunnel('');
        setFilterStatus('');
    };

    const navigateToFolder = (folderId) => {
        setCurrentFolderId(folderId);
        setItems([]);
        setReviewQueue([]);
        setFilterFunnel('');
        setFilterStatus('');
    };

    const navigateToRoot = () => {
        setCurrentBrandId(null);
        setCurrentMediaType(null);
        setCurrentFolderId(null);
        setItems([]);
        setFolders([]);
        setReviewQueue([]);
        setFilterFunnel('');
        setFilterStatus('');
    };

    // ── Breadcrumb ──
    const renderBreadcrumb = () => (
        <div className="flex items-center gap-1 text-sm flex-wrap">
            <button
                onClick={navigateToRoot}
                className={`px-2 py-1 rounded transition-colors ${navLevel === 0 ? 'text-amber-900 font-semibold' : 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'}`}
            >
                Ads Library
            </button>
            {currentBrandId && (
                <>
                    <ChevronRight size={14} className="text-amber-400 flex-shrink-0" />
                    <button
                        onClick={() => { setCurrentMediaType(null); setCurrentFolderId(null); setItems([]); setReviewQueue([]); }}
                        className={`px-2 py-1 rounded transition-colors ${navLevel === 1 ? 'text-amber-900 font-semibold' : 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'}`}
                    >
                        {currentBrand?.name || 'Brand'}
                    </button>
                </>
            )}
            {currentMediaType && (
                <>
                    <ChevronRight size={14} className="text-amber-400 flex-shrink-0" />
                    <button
                        onClick={() => { setCurrentFolderId(null); setItems([]); setReviewQueue([]); }}
                        className={`px-2 py-1 rounded transition-colors ${navLevel === 2 ? 'text-amber-900 font-semibold' : 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'}`}
                    >
                        {currentMediaType === 'image' ? 'Images' : 'Videos'}
                    </button>
                </>
            )}
            {currentFolderId !== null && (
                <>
                    <ChevronRight size={14} className="text-amber-400 flex-shrink-0" />
                    <span className="px-2 py-1 text-amber-900 font-semibold">
                        {currentFolderName}
                    </span>
                </>
            )}
        </div>
    );

    // ── Upload area (shown at Level 2 and Level 3) ──
    const renderUploadArea = () => {
        const acceptTypes = currentMediaType === 'image' ? 'image/*' : currentMediaType === 'video' ? 'video/*' : 'image/*,video/*';
        const helpText = currentMediaType === 'image'
            ? 'JPG, PNG, WEBP, GIF — AI auto-names your ads'
            : currentMediaType === 'video'
            ? 'MP4, MOV, WEBM'
            : 'JPG, PNG, WEBP, GIF, MP4, MOV, WEBM — AI auto-names your ads';

        return (
            <div className="bg-white rounded-xl border border-amber-200 p-6">
                <h2 className="text-lg font-semibold text-amber-900 mb-4">
                    Upload {currentMediaType === 'image' ? 'Images' : currentMediaType === 'video' ? 'Videos' : 'Ads'}
                </h2>

                <div
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                        dragActive ? 'border-amber-500 bg-amber-50' : 'border-gray-300 hover:border-amber-400'
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                >
                    {uploading ? (
                        <div className="flex flex-col items-center gap-2 text-amber-600">
                            <Loader2 size={24} className="animate-spin" />
                            <span>{uploadProgress || 'Uploading...'}</span>
                        </div>
                    ) : (
                        <>
                            <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                            <p className="text-gray-600">
                                Drag & drop {currentMediaType === 'image' ? 'images' : currentMediaType === 'video' ? 'videos' : 'files'} here
                            </p>
                            <p className="text-gray-400 text-sm mt-1">{helpText}</p>
                            {currentFolderId && currentFolderId !== '__none__' && (
                                <p className="text-amber-600 text-xs mt-2">
                                    Uploads will be saved to folder: {currentFolderName}
                                </p>
                            )}
                        </>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={acceptTypes}
                        multiple
                        className="hidden"
                        onChange={(e) => handleFiles(Array.from(e.target.files))}
                    />
                </div>
            </div>
        );
    };

    // ── Review queue ──
    const renderReviewQueue = () => {
        if (reviewQueue.length === 0) return null;

        return (
            <div className="bg-white rounded-xl border border-indigo-200 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">
                        Review Uploads ({reviewQueue.length} item{reviewQueue.length !== 1 ? 's' : ''})
                    </h2>
                    <div className="flex gap-3">
                        <button onClick={() => setReviewQueue([])} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">
                            Discard All
                        </button>
                        <button
                            onClick={handleSaveAll}
                            disabled={uploading}
                            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium disabled:opacity-50"
                        >
                            Save All
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    {reviewQueue.map((qItem) => (
                        <div key={qItem.id} className="flex gap-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                            {/* Thumbnail */}
                            <div className="w-32 h-32 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200">
                                {qItem.mediaType === 'video' ? (
                                    qItem.thumbnailUrl ? (
                                        <img src={qItem.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                            <Video size={24} className="text-gray-500" />
                                        </div>
                                    )
                                ) : (
                                    <img src={qItem.primaryUrl} alt="" className="w-full h-full object-cover" />
                                )}
                            </div>

                            {/* Fields */}
                            <div className="flex-1 space-y-3">
                                {/* Name */}
                                <div className="flex items-center gap-2">
                                    {qItem.nameLoading ? (
                                        <div className="flex items-center gap-2 text-sm text-gray-500">
                                            <Loader2 size={14} className="animate-spin" />
                                            AI naming...
                                        </div>
                                    ) : null}
                                    <input
                                        type="text"
                                        value={qItem.name}
                                        onChange={(e) => updateQueueItem(qItem.id, { name: e.target.value })}
                                        placeholder="Ad name"
                                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                    />
                                </div>

                                {/* Ratio badges (images only) */}
                                {qItem.mediaType === 'image' && (
                                    <div className="flex flex-wrap gap-2">
                                        {/* Uploaded ratios */}
                                        {Object.keys(qItem.variants).map((ratio) => (
                                            <span key={ratio} className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-md font-medium">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                {ratio}
                                            </span>
                                        ))}
                                        {/* Missing ratios as drop zones */}
                                        {qItem.missingRatios.map((ratio) => (
                                            <label
                                                key={ratio}
                                                className="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-gray-400 text-gray-500 text-xs rounded-md cursor-pointer hover:border-amber-500 hover:text-amber-600 transition-colors"
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    handleDropOnMissingRatio(qItem.id, Array.from(e.dataTransfer.files));
                                                }}
                                            >
                                                <Plus size={12} />
                                                {ratio}
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => handleDropOnMissingRatio(qItem.id, Array.from(e.target.files))}
                                                />
                                            </label>
                                        ))}
                                    </div>
                                )}

                                {qItem.mediaType === 'video' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-md font-medium">
                                        <Video size={12} /> Video
                                    </span>
                                )}

                                {/* Metadata row */}
                                <div className="flex flex-wrap gap-2">
                                    <select
                                        value={qItem.funnel_stage}
                                        onChange={(e) => updateQueueItem(qItem.id, { funnel_stage: e.target.value })}
                                        className="px-2 py-1 text-xs border border-gray-300 rounded-lg"
                                    >
                                        <option value="">Funnel Stage</option>
                                        <option value="tofu">TOFU</option>
                                        <option value="mofu">MOFU</option>
                                        <option value="bofu">BOFU</option>
                                    </select>
                                    <select
                                        value={qItem.ad_format}
                                        onChange={(e) => updateQueueItem(qItem.id, { ad_format: e.target.value })}
                                        className="px-2 py-1 text-xs border border-gray-300 rounded-lg"
                                    >
                                        {AD_FORMATS.map((f) => (
                                            <option key={f.value} value={f.value}>{f.label}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="text"
                                        value={qItem.tags.join(', ')}
                                        onChange={(e) => updateQueueItem(qItem.id, {
                                            tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                                        })}
                                        placeholder="Tags (comma-separated)"
                                        className="flex-1 min-w-[120px] px-2 py-1 text-xs border border-gray-300 rounded-lg"
                                    />
                                    <button
                                        onClick={() => removeFromQueue(qItem.id)}
                                        className="px-2 py-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Remove"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // ── Level 0: Brand cards grid ──
    const renderBrandCards = () => {
        if (brands.length === 0) {
            return (
                <div className="bg-white rounded-xl border border-amber-200 p-12 text-center">
                    <FolderOpen size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500 text-lg">No brands yet</p>
                    <p className="text-gray-400 text-sm mt-1">Create a brand first to start uploading ads.</p>
                </div>
            );
        }

        return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {brands.map((brand) => (
                    <button
                        key={brand.id}
                        onClick={() => navigateToBrand(brand.id)}
                        className="bg-white rounded-xl border border-amber-200 p-6 text-left hover:border-amber-400 hover:shadow-md transition-all group"
                    >
                        <div className="flex items-center gap-3 mb-3">
                            {brand.logo_url ? (
                                <img
                                    src={brand.logo_url}
                                    alt={brand.name}
                                    className="w-12 h-12 rounded-lg object-cover border border-gray-200"
                                />
                            ) : (
                                <div
                                    className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                                    style={{ backgroundColor: brand.primary_color || '#d97706' }}
                                >
                                    {brand.name?.charAt(0)?.toUpperCase() || 'B'}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 truncate group-hover:text-amber-700 transition-colors">
                                    {brand.name}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                            <ChevronRight size={12} />
                            <span>View library</span>
                        </div>
                    </button>
                ))}
            </div>
        );
    };

    // ── Level 1: Media type picker ──
    const renderMediaTypePicker = () => {
        const stats = brandStats[currentBrandId] || {};
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
                {/* Images card */}
                <button
                    onClick={() => navigateToMediaType('image')}
                    className="bg-white rounded-xl border border-amber-200 p-8 text-left hover:border-amber-400 hover:shadow-md transition-all group"
                >
                    <div className="w-14 h-14 rounded-xl bg-amber-50 flex items-center justify-center mb-4 group-hover:bg-amber-100 transition-colors">
                        <Image size={28} className="text-amber-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-amber-700 transition-colors">Images</h3>
                    <p className="text-sm text-gray-500 mt-1">
                        {stats.images !== undefined ? `${stats.images} image${stats.images !== 1 ? 's' : ''}` : 'Browse image ads'}
                    </p>
                </button>

                {/* Videos card */}
                <button
                    onClick={() => navigateToMediaType('video')}
                    className="bg-white rounded-xl border border-amber-200 p-8 text-left hover:border-amber-400 hover:shadow-md transition-all group"
                >
                    <div className="w-14 h-14 rounded-xl bg-amber-50 flex items-center justify-center mb-4 group-hover:bg-amber-100 transition-colors">
                        <Video size={28} className="text-amber-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-amber-700 transition-colors">Videos</h3>
                    <p className="text-sm text-gray-500 mt-1">
                        {stats.videos !== undefined ? `${stats.videos} video${stats.videos !== 1 ? 's' : ''}` : 'Browse video ads'}
                    </p>
                </button>
            </div>
        );
    };

    // ── Level 2: Folder grid ──
    const renderFolderGrid = () => {
        if (foldersLoading) {
            return (
                <div className="flex items-center justify-center py-12 text-amber-600">
                    <Loader2 size={24} className="animate-spin mr-2" />
                    Loading folders...
                </div>
            );
        }

        return (
            <div className="space-y-6">
                {/* Folder grid */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-amber-900">Folders</h2>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {/* Folder cards */}
                        {folders.map((folder) => (
                            <div
                                key={folder.id}
                                className="bg-white rounded-xl border border-amber-200 overflow-hidden hover:border-amber-400 hover:shadow-md transition-all group relative"
                            >
                                {renamingFolderId === folder.id ? (
                                    <div className="p-4">
                                        <input
                                            ref={renameFolderInputRef}
                                            type="text"
                                            value={renameFolderName}
                                            onChange={(e) => setRenameFolderName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleRenameFolder(folder.id);
                                                if (e.key === 'Escape') { setRenamingFolderId(null); setRenameFolderName(''); }
                                            }}
                                            className="w-full px-3 py-2 text-sm border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                            placeholder="Folder name"
                                        />
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => handleRenameFolder(folder.id)}
                                                className="flex-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs hover:bg-amber-700"
                                            >
                                                Save
                                            </button>
                                            <button
                                                onClick={() => { setRenamingFolderId(null); setRenameFolderName(''); }}
                                                className="flex-1 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-xs"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => navigateToFolder(folder.id)}
                                        className="w-full p-5 text-left"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center mb-3 group-hover:bg-amber-100 transition-colors">
                                                <Folder size={24} className="text-amber-600" />
                                            </div>
                                            {/* Menu button */}
                                            <div
                                                className="opacity-0 group-hover:opacity-100 transition-opacity relative"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        e.preventDefault();
                                                        setFolderMenuOpen(folderMenuOpen === folder.id ? null : folder.id);
                                                    }}
                                                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                                                >
                                                    <MoreVertical size={16} />
                                                </button>
                                                {folderMenuOpen === folder.id && (
                                                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[120px]">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                setRenamingFolderId(folder.id);
                                                                setRenameFolderName(folder.name);
                                                                setFolderMenuOpen(null);
                                                            }}
                                                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                        >
                                                            <Pencil size={14} /> Rename
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                setDeleteFolderTarget(folder);
                                                                setFolderMenuOpen(null);
                                                            }}
                                                            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                                        >
                                                            <Trash2 size={14} /> Delete
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <p className="font-medium text-gray-900 truncate group-hover:text-amber-700 transition-colors">
                                            {folder.name}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {folder.item_count} item{folder.item_count !== 1 ? 's' : ''}
                                        </p>
                                    </button>
                                )}
                            </div>
                        ))}

                        {/* Uncategorized card */}
                        <button
                            onClick={() => navigateToFolder('__none__')}
                            className="bg-white rounded-xl border border-dashed border-gray-300 p-5 text-left hover:border-amber-400 hover:shadow-md transition-all group"
                        >
                            <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center mb-3 group-hover:bg-gray-100 transition-colors">
                                <FolderOpen size={24} className="text-gray-400" />
                            </div>
                            <p className="font-medium text-gray-600 truncate group-hover:text-amber-700 transition-colors">
                                Uncategorized
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                {uncategorizedCount} item{uncategorizedCount !== 1 ? 's' : ''}
                            </p>
                        </button>

                        {/* New Folder card / input */}
                        {showNewFolderInput ? (
                            <div className="bg-white rounded-xl border border-amber-300 p-4">
                                <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center mb-3">
                                    <FolderPlus size={24} className="text-amber-600" />
                                </div>
                                <input
                                    ref={newFolderInputRef}
                                    type="text"
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreateFolder();
                                        if (e.key === 'Escape') { setShowNewFolderInput(false); setNewFolderName(''); }
                                    }}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 mb-2"
                                    placeholder="Folder name"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleCreateFolder}
                                        className="flex-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs hover:bg-amber-700"
                                    >
                                        Create
                                    </button>
                                    <button
                                        onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }}
                                        className="flex-1 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-xs"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setShowNewFolderInput(true)}
                                className="bg-white rounded-xl border border-dashed border-amber-300 p-5 text-left hover:border-amber-500 hover:bg-amber-50 transition-all group flex flex-col items-center justify-center min-h-[140px]"
                            >
                                <div className="w-12 h-12 rounded-lg bg-amber-50 flex items-center justify-center mb-3 group-hover:bg-amber-100 transition-colors">
                                    <FolderPlus size={24} className="text-amber-500" />
                                </div>
                                <p className="font-medium text-amber-600 text-sm">New Folder</p>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ── Level 3: Items inside folder ──
    const renderItemsGrid = () => {
        return (
            <div className="space-y-6">
                {/* Upload area */}
                {renderUploadArea()}

                {/* Review queue */}
                {renderReviewQueue()}

                {/* Filters (no media type filter — implicit from navigation; no brand filter — implicit) */}
                <div className="bg-white rounded-xl border border-amber-200 p-4">
                    <div className="flex flex-wrap gap-3 items-center">
                        <Filter size={16} className="text-gray-400" />

                        <select
                            value={filterFunnel}
                            onChange={(e) => setFilterFunnel(e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                        >
                            {FUNNEL_STAGES.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                        </select>

                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                        >
                            {STATUSES.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                        </select>

                        <span className="text-xs text-gray-400 ml-auto">
                            {items.length} item{items.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="flex items-center justify-center py-12 text-amber-600">
                        <Loader2 size={24} className="animate-spin mr-2" />
                        Loading...
                    </div>
                ) : items.length === 0 ? (
                    <div className="bg-white rounded-xl border border-amber-200 p-12 text-center">
                        <FolderOpen size={48} className="mx-auto text-gray-300 mb-4" />
                        <p className="text-gray-500 text-lg">No ads in this folder</p>
                        <p className="text-gray-400 text-sm mt-1">Upload your first ad above!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {items.map((item) => (
                            <div
                                key={item.id}
                                className="bg-white rounded-lg border border-amber-200 overflow-hidden group"
                            >
                                {/* Thumbnail */}
                                <div
                                    className="aspect-video bg-gray-100 relative cursor-pointer"
                                    onClick={() => setSelectedItem(item)}
                                >
                                    {item.media_type === 'video' ? (
                                        <>
                                            {item.thumbnail_url ? (
                                                <img
                                                    src={item.thumbnail_url}
                                                    alt={item.name || 'Video'}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                                    <Video size={32} className="text-gray-500" />
                                                </div>
                                            )}
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-10 h-10 bg-black/60 rounded-full flex items-center justify-center group-hover:bg-black/80 transition-colors">
                                                    <Play size={20} className="text-white ml-0.5" fill="white" />
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <img
                                            src={item.media_url}
                                            alt={item.name || 'Ad'}
                                            className="w-full h-full object-cover"
                                        />
                                    )}

                                    {/* Media type badge */}
                                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded flex items-center gap-1">
                                        {item.media_type === 'video' ? <Video size={10} /> : <Image size={10} />}
                                        {item.media_type}
                                    </span>

                                    {/* Variants badge */}
                                    {variantCount(item) > 1 && (
                                        <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-purple-600/90 text-white text-xs rounded flex items-center gap-1">
                                            <Layers size={10} />
                                            {variantCount(item)} sizes
                                        </span>
                                    )}

                                    {/* Status badge */}
                                    <span className={`absolute top-2 right-2 px-2 py-0.5 text-xs rounded ${STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-700'}`}>
                                        {item.status}
                                    </span>

                                    {/* Hover actions */}
                                    <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {item.media_type === 'image' && (
                                            <>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setVideoGenImage(item.media_url); }}
                                                    className="w-8 h-8 bg-purple-500/90 hover:bg-purple-600 rounded-full flex items-center justify-center text-white"
                                                    title="Generate Video"
                                                >
                                                    <Wand2 size={14} />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setAddVariantTarget(item);
                                                        setTimeout(() => variantInputRef.current?.click(), 100);
                                                    }}
                                                    className="w-8 h-8 bg-indigo-500/90 hover:bg-indigo-600 rounded-full flex items-center justify-center text-white"
                                                    title="Add size variant"
                                                >
                                                    <Plus size={14} />
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setEditItem({ ...item }); }}
                                            className="w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center text-gray-700"
                                            title="Edit"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
                                            className="w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center text-red-600"
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="p-3">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                        {item.name || 'Untitled'}
                                    </p>
                                    {item.folder_name && (
                                        <p className="text-xs text-amber-600 truncate">
                                            {item.folder_name}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        {item.variants && Object.keys(item.variants).length > 0 && (
                                            Object.keys(item.variants).map((ratio) => (
                                                <span key={ratio} className="px-1.5 py-0.5 text-[10px] bg-indigo-100 text-indigo-700 rounded">
                                                    {ratio}
                                                </span>
                                            ))
                                        )}
                                        {item.funnel_stage && (
                                            <span className="px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-700 rounded">
                                                {item.funnel_stage.toUpperCase()}
                                            </span>
                                        )}
                                        {item.ad_format && (
                                            <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded">
                                                {item.ad_format.replace('_', ' ')}
                                            </span>
                                        )}
                                        {item.tags && item.tags.map((tag, i) => (
                                            <span key={i} className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                    {item.file_size && (
                                        <p className="text-[10px] text-gray-400 mt-1">{formatSize(item.file_size)}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // ── Main render ──
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-amber-900 flex items-center gap-2">
                        <FolderOpen size={28} />
                        Ads Library
                    </h1>
                    <p className="text-amber-600 text-sm">Upload and organize your ad creatives by brand</p>
                </div>
                {navLevel === 3 && (
                    <div className="text-sm text-gray-500">
                        {items.length} ad{items.length !== 1 ? 's' : ''}
                    </div>
                )}
            </div>

            {/* Breadcrumb */}
            {navLevel > 0 && (
                <div className="bg-white rounded-lg border border-amber-100 px-4 py-2.5">
                    {renderBreadcrumb()}
                </div>
            )}

            {/* Level-specific content */}
            {navLevel === 0 && renderBrandCards()}
            {navLevel === 1 && renderMediaTypePicker()}
            {navLevel === 2 && renderFolderGrid()}
            {navLevel === 3 && renderItemsGrid()}

            {/* Hidden input for adding variant */}
            <input
                ref={variantInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    handleAddVariant(Array.from(e.target.files));
                    e.target.value = '';
                }}
            />

            {/* View Modal */}
            {selectedItem && (
                <div
                    className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
                    onClick={() => setSelectedItem(null)}
                >
                    <div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setSelectedItem(null)}
                            className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors z-10"
                        >
                            <X size={28} />
                        </button>

                        {selectedItem.media_type === 'video' ? (
                            <div className="relative">
                                <video
                                    key={selectedItem.id}
                                    src={selectedItem.media_url}
                                    controls
                                    autoPlay
                                    playsInline
                                    poster={selectedItem.thumbnail_url || undefined}
                                    className="w-full rounded-lg max-h-[70vh] object-contain bg-black"
                                    style={{ minHeight: '300px' }}
                                />
                                <a
                                    href={selectedItem.media_url}
                                    download
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="absolute top-3 right-3 flex items-center gap-1 px-3 py-1.5 bg-white/90 text-gray-800 rounded-lg text-sm font-medium hover:bg-white transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Download size={14} />
                                    Download
                                </a>
                            </div>
                        ) : (
                            <img
                                src={selectedItem.media_url}
                                alt={selectedItem.name || 'Ad'}
                                className="w-full rounded-lg max-h-[70vh] object-contain bg-black"
                            />
                        )}

                        {/* Variant previews */}
                        {selectedItem.variants && Object.keys(selectedItem.variants).length > 1 && (
                            <div className="mt-3">
                                <p className="text-white/60 text-xs mb-2">Size Variants:</p>
                                <div className="flex gap-3">
                                    {Object.entries(selectedItem.variants).map(([ratio, url]) => (
                                        <div key={ratio} className="text-center">
                                            <img
                                                src={url}
                                                alt={ratio}
                                                className={`rounded border-2 transition-colors cursor-pointer ${
                                                    selectedItem.media_url === url ? 'border-amber-500' : 'border-transparent hover:border-white/50'
                                                } ${ratio === '9:16' || ratio === '4:5' ? 'h-24 w-auto' : 'h-16 w-auto'}`}
                                                onClick={() => setSelectedItem({ ...selectedItem, media_url: url })}
                                            />
                                            <span className="text-white/70 text-xs mt-1 block">{ratio}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-4 bg-white/10 backdrop-blur rounded-lg p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    {selectedItem.brand_name && (
                                        <p className="text-amber-400 text-sm font-medium">{selectedItem.brand_name}</p>
                                    )}
                                    <p className="text-white font-medium mt-1">{selectedItem.name || 'Untitled'}</p>
                                    {selectedItem.folder_name && (
                                        <p className="text-white/50 text-xs mt-0.5">Folder: {selectedItem.folder_name}</p>
                                    )}
                                    {selectedItem.headline && (
                                        <p className="text-white/80 text-sm mt-1">{selectedItem.headline}</p>
                                    )}
                                    {selectedItem.body && (
                                        <p className="text-white/60 text-sm mt-1">{selectedItem.body}</p>
                                    )}
                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                        {selectedItem.cta && (
                                            <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-300 rounded">{selectedItem.cta}</span>
                                        )}
                                        {selectedItem.funnel_stage && (
                                            <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-300 rounded">{selectedItem.funnel_stage.toUpperCase()}</span>
                                        )}
                                        {selectedItem.ad_format && (
                                            <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-300 rounded">{selectedItem.ad_format.replace('_', ' ')}</span>
                                        )}
                                        <span className={`px-2 py-0.5 text-xs rounded ${STATUS_COLORS[selectedItem.status] || ''}`}>{selectedItem.status}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {selectedItem.media_type === 'image' && (
                                        <button
                                            onClick={() => {
                                                setVideoGenImage(selectedItem.media_url);
                                                setSelectedItem(null);
                                            }}
                                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                                        >
                                            <Wand2 size={16} />
                                            Generate Video
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDownload(selectedItem.media_url)}
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

            {/* Edit Modal */}
            {editItem && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditItem(null)}>
                    <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900">Edit Ad</h3>
                            <button onClick={() => setEditItem(null)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={editItem.name || ''}
                                        onChange={(e) => setEditItem({ ...editItem, name: e.target.value })}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                        placeholder="Ad name"
                                    />
                                    <button
                                        onClick={async () => {
                                            try {
                                                const { name } = await getAiName(editItem.media_url);
                                                setEditItem({ ...editItem, name });
                                            } catch {
                                                showError('AI naming failed');
                                            }
                                        }}
                                        className="px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-sm flex items-center gap-1"
                                        title="Generate name with AI"
                                    >
                                        <Sparkles size={14} />
                                        AI
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                                <select
                                    value={editItem.brand_id || ''}
                                    onChange={(e) => setEditItem({ ...editItem, brand_id: e.target.value || null })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                                >
                                    <option value="">No Brand</option>
                                    {brands.map((b) => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Folder selector */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Folder</label>
                                <select
                                    value={editItem.folder_id || ''}
                                    onChange={(e) => setEditItem({ ...editItem, folder_id: e.target.value || null })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                                >
                                    <option value="">Uncategorized</option>
                                    {folders.map((f) => (
                                        <option key={f.id} value={f.id}>{f.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Funnel Stage</label>
                                    <select
                                        value={editItem.funnel_stage || ''}
                                        onChange={(e) => setEditItem({ ...editItem, funnel_stage: e.target.value || null })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                                    >
                                        <option value="">None</option>
                                        <option value="tofu">TOFU (Awareness)</option>
                                        <option value="mofu">MOFU (Consideration)</option>
                                        <option value="bofu">BOFU (Conversion)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ad Format</label>
                                    <select
                                        value={editItem.ad_format || ''}
                                        onChange={(e) => setEditItem({ ...editItem, ad_format: e.target.value || null })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                                    >
                                        {AD_FORMATS.map((f) => (
                                            <option key={f.value} value={f.value}>{f.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                <select
                                    value={editItem.status || 'draft'}
                                    onChange={(e) => setEditItem({ ...editItem, status: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                                >
                                    <option value="draft">Draft</option>
                                    <option value="ready">Ready</option>
                                    <option value="active">Active</option>
                                    <option value="archived">Archived</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
                                <input
                                    type="text"
                                    value={editItem.headline || ''}
                                    onChange={(e) => setEditItem({ ...editItem, headline: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                                    placeholder="Ad headline"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                                <textarea
                                    value={editItem.body || ''}
                                    onChange={(e) => setEditItem({ ...editItem, body: e.target.value })}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                                    placeholder="Ad body text"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">CTA</label>
                                <input
                                    type="text"
                                    value={editItem.cta || ''}
                                    onChange={(e) => setEditItem({ ...editItem, cta: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                                    placeholder="Call to action"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
                                <input
                                    type="text"
                                    value={(editItem.tags || []).join(', ')}
                                    onChange={(e) => setEditItem({
                                        ...editItem,
                                        tags: e.target.value ? e.target.value.split(',').map(t => t.trim()).filter(Boolean) : []
                                    })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                                    placeholder="e.g., testimonial, Q1, promo"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end mt-6">
                            <button
                                onClick={() => setEditItem(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Modal */}
            {deleteTarget && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Ad?</h3>
                        <p className="text-gray-600 mb-4">
                            This will permanently delete "{deleteTarget.name || 'Untitled'}" and its media file. This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setDeleteTarget(null)}
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

            {/* Delete Folder Modal */}
            {deleteFolderTarget && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Folder?</h3>
                        <p className="text-gray-600 mb-4">
                            This will delete the folder "{deleteFolderTarget.name}". All items inside will become uncategorized. This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setDeleteFolderTarget(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteFolder}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                            >
                                Delete Folder
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
                        showSuccess('Video generated! Refresh to see it in your library.');
                        setVideoGenImage(null);
                        fetchItems();
                    }}
                />
            )}
        </div>
    );
};

export default AdsLibrary;

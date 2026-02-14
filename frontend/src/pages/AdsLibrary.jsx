import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import { useBrands } from '../context/BrandContext';
import { getLibraryItems, createLibraryItem, updateLibraryItem, deleteLibraryItem, uploadFile, getAiName, extractVideoThumbnail, detectAspectRatio } from '../api/adsLibrary';
import { Upload, Image, Video, Trash2, Pencil, X, Download, Play, FolderOpen, Loader2, Wand2, Layers, Plus, Filter, Sparkles } from 'lucide-react';
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

    // Data
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [filterBrand, setFilterBrand] = useState('');
    const [filterMediaType, setFilterMediaType] = useState('');
    const [filterFunnel, setFilterFunnel] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    // Upload
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [uploadBrand, setUploadBrand] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    // Add variant
    const [addVariantTarget, setAddVariantTarget] = useState(null);
    const variantInputRef = useRef(null);

    // Modals
    const [selectedItem, setSelectedItem] = useState(null);
    const [editItem, setEditItem] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [videoGenImage, setVideoGenImage] = useState(null);

    const fetchItems = useCallback(async () => {
        try {
            setLoading(true);
            const filters = {};
            if (filterBrand) filters.brand_id = filterBrand;
            if (filterMediaType) filters.media_type = filterMediaType;
            if (filterFunnel) filters.funnel_stage = filterFunnel;
            if (filterStatus) filters.status = filterStatus;
            const data = await getLibraryItems(filters);
            setItems(data);
        } catch (error) {
            showError('Failed to load ads library');
        } finally {
            setLoading(false);
        }
    }, [filterBrand, filterMediaType, filterFunnel, filterStatus]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    // Upload handlers
    const handleFiles = async (files) => {
        if (!uploadBrand) {
            showError('Please select a brand first');
            return;
        }

        setUploading(true);
        let uploaded = 0;

        for (const file of files) {
            const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
            const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

            if (!isImage && !isVideo) {
                showError(`${file.name}: Unsupported file type`);
                continue;
            }

            try {
                setUploadProgress(`Uploading ${file.name}...`);

                // Upload file to R2
                const { url, media_type } = await uploadFile(file);

                let thumbnailUrl = null;
                let variants = null;
                let aiName = null;

                if (isVideo) {
                    // Extract video thumbnail
                    try {
                        setUploadProgress(`Extracting thumbnail from ${file.name}...`);
                        const thumbBlob = await extractVideoThumbnail(file);
                        const thumbFile = new File([thumbBlob], `thumb_${file.name.replace(/\.[^.]+$/, '.jpg')}`, { type: 'image/jpeg' });
                        const thumbResult = await uploadFile(thumbFile);
                        thumbnailUrl = thumbResult.url;
                    } catch (e) {
                        console.warn('Thumbnail extraction failed:', e);
                    }
                }

                if (isImage) {
                    // Detect aspect ratio and store in variants
                    try {
                        const ratio = await detectAspectRatio(file);
                        variants = { [ratio]: url };
                    } catch (e) {
                        console.warn('Aspect ratio detection failed:', e);
                    }
                }

                // AI-generated name
                try {
                    setUploadProgress(`Naming ${file.name} with AI...`);
                    const { name } = await getAiName(url);
                    aiName = name;
                } catch (e) {
                    console.warn('AI naming failed:', e);
                }

                // Create library item
                await createLibraryItem({
                    brand_id: uploadBrand,
                    name: aiName || file.name.replace(/\.[^.]+$/, ''),
                    media_type: media_type,
                    media_url: url,
                    thumbnail_url: thumbnailUrl,
                    variants: variants,
                    file_size: file.size,
                    status: 'draft',
                });
                uploaded++;
            } catch (error) {
                showError(`Failed to upload ${file.name}`);
            }
        }

        if (uploaded > 0) {
            showSuccess(`Uploaded ${uploaded} file${uploaded > 1 ? 's' : ''}`);
            fetchItems();
        }
        setUploading(false);
        setUploadProgress('');
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
                <div className="text-sm text-gray-500">
                    {items.length} ad{items.length !== 1 ? 's' : ''}
                </div>
            </div>

            {/* Upload Area */}
            <div className="bg-white rounded-xl border border-amber-200 p-6">
                <h2 className="text-lg font-semibold text-amber-900 mb-4">Upload Ads</h2>
                <div className="flex gap-4 mb-4">
                    <select
                        value={uploadBrand}
                        onChange={(e) => setUploadBrand(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    >
                        <option value="">Select Brand *</option>
                        {brands.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                </div>

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
                            <p className="text-gray-600">Drag & drop images or videos here</p>
                            <p className="text-gray-400 text-sm mt-1">JPG, PNG, WEBP, GIF, MP4, MOV, WEBM &mdash; AI auto-names your ads</p>
                        </>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFiles(Array.from(e.target.files))}
                    />
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl border border-amber-200 p-4">
                <div className="flex flex-wrap gap-3 items-center">
                    <Filter size={16} className="text-gray-400" />
                    <select
                        value={filterBrand}
                        onChange={(e) => setFilterBrand(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                    >
                        <option value="">All Brands</option>
                        {brands.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>

                    <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                        {['', 'image', 'video'].map((type) => (
                            <button
                                key={type}
                                onClick={() => setFilterMediaType(type)}
                                className={`px-3 py-1.5 text-sm ${
                                    filterMediaType === type
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-white text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {type === '' ? 'All' : type === 'image' ? 'Images' : 'Videos'}
                            </button>
                        ))}
                    </div>

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
                    <p className="text-gray-500 text-lg">No ads yet</p>
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
                                <p className="text-xs text-amber-600 truncate">
                                    {item.brand_name || 'No brand'}
                                </p>
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

                        {(() => {
                            const isActualVideo = selectedItem.media_url?.match(/\.(mp4|webm|mov)(\?|$)/i);
                            return isActualVideo ? (
                                <video
                                    src={selectedItem.media_url}
                                    controls
                                    autoPlay
                                    className="w-full rounded-lg max-h-[70vh] object-contain bg-black"
                                />
                            ) : (
                                <img
                                    src={selectedItem.media_url}
                                    alt={selectedItem.name || 'Ad'}
                                    className="w-full rounded-lg max-h-[70vh] object-contain bg-black"
                                />
                            );
                        })()}

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

import React, { useState, useEffect } from 'react';
import { X, Filter, Grid, List, Sparkles, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export default function ImageTemplateSelector({ onSelect, onClose, embedded = false }) {
    const { showError } = useToast();
    const { authFetch } = useAuth();
    const [templates, setTemplates] = useState([]);
    const [filters, setFilters] = useState({ categories: [], styles: [] });
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedStyle, setSelectedStyle] = useState('');
    const [viewMode, setViewMode] = useState(localStorage.getItem('preferred_view_mode') || 'grid'); // 'grid' or 'list'

    // Persist view mode preference
    useEffect(() => {
        localStorage.setItem('preferred_view_mode', viewMode);
    }, [viewMode]);

    const [sortBy, setSortBy] = useState('newest'); // 'newest', 'oldest', 'name'
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Fetch available filters
    useEffect(() => {
        fetchFilters();
    }, []);

    // Fetch templates when filters change
    useEffect(() => {
        fetchTemplates();
    }, [selectedCategory, selectedStyle]);

    const fetchFilters = async () => {
        try {
            const response = await authFetch(`${API_URL}/templates/filters`);
            if (response.ok) {
                const data = await response.json();
                setFilters(data);
            }
        } catch (error) {
            console.error('Error fetching filters:', error);
        }
    };

    const fetchTemplates = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (selectedCategory) params.append('category', selectedCategory);
            if (selectedStyle) params.append('style', selectedStyle);

            const response = await authFetch(`${API_URL}/templates/?${params}`);
            if (response.ok) {
                const data = await response.json();
                setTemplates(sortTemplates(Array.isArray(data) ? data : [], sortBy));
            } else {
                setTemplates([]);
            }
        } catch (error) {
            console.error('Error fetching templates:', error);
            setTemplates([]);
        } finally {
            setLoading(false);
        }
    };

    const handleTemplateSelect = async (template) => {
        // Fetch full preview data
        try {
            const response = await authFetch(`${API_URL}/templates/${template.id}/preview`);
            if (response.ok) {
                const preview = await response.json();
                onSelect(preview);
            } else {
                onSelect(template);
            }
        } catch (error) {
            console.error('Error fetching template preview:', error);
            onSelect(template);
        }
    };

    const clearFilters = () => {
        setSelectedCategory('');
        setSelectedStyle('');
    };

    const sortTemplates = (templateList, sortOption) => {
        if (!Array.isArray(templateList)) return [];
        const sorted = [...templateList];
        switch (sortOption) {
            case 'newest':
                return sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            case 'oldest':
                return sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            case 'name':
                return sorted.sort((a, b) => a.name.localeCompare(b.name));
            default:
                return sorted;
        }
    };

    // Re-sort templates when sortBy changes
    useEffect(() => {
        setTemplates(prev => sortTemplates(prev, sortBy));
    }, [sortBy]);

    // Selection Logic
    const toggleSelection = (id) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const selectAll = () => {
        if (selectedIds.size === templates.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(templates.map(t => t.id)));
        }
    };

    const confirmDelete = () => {
        setShowDeleteConfirm(true);
    };

    const handleDelete = async () => {
        try {
            const response = await authFetch(`${API_URL}/templates/bulk-delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ids: Array.from(selectedIds) })
            });

            if (response.ok) {
                setSelectedIds(new Set());
                fetchTemplates(); // Refresh list
                fetchFilters(); // Refresh filters
                setShowDeleteConfirm(false);
            } else {
                showError('Failed to delete templates');
            }
        } catch (error) {
            console.error('Delete error:', error);
            showError('Error deleting templates');
        }
    };

    const content = (
        <>
            {/* Header */}
            <div className={embedded ? "mb-6" : "p-6 border-b border-line"}>
                {!embedded && (
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                            <Sparkles className="text-highlight" size={24} />
                            Select Template
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-faint hover:text-secondary transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>
                )}

                {/* Filters */}
                <div className="flex flex-wrap gap-4 items-center">
                    {/* Bulk Actions */}
                    {templates.length > 0 && (
                        <div className="flex items-center gap-2 mr-2 border-r border-line pr-4">
                            <input
                                type="checkbox"
                                checked={selectedIds.size === templates.length && templates.length > 0}
                                onChange={selectAll}
                                className="w-4 h-4 rounded border-line-strong text-highlight focus:ring-purple-500"
                            />
                            <span className="text-sm text-secondary">
                                {selectedIds.size > 0 ? `${selectedIds.size} Selected` : 'Select All'}
                            </span>
                            {selectedIds.size > 0 && (
                                <button
                                    onClick={confirmDelete}
                                    className="ml-2 flex items-center gap-1 text-danger hover:text-danger text-sm font-medium bg-danger-soft px-2 py-1 rounded"
                                >
                                    <Trash2 size={14} />
                                    Delete
                                </button>
                            )}
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <Filter size={16} className="text-muted" />
                        <span className="text-sm font-medium text-secondary">Filters:</span>
                    </div>

                    {/* Category Filter */}
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="px-3 py-2 border border-line-strong rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent capitalize"
                    >
                        <option value="">All Categories</option>
                        {filters.categories && filters.categories.map(cat => (
                            <option key={cat} value={cat} className="capitalize">{cat}</option>
                        ))}
                    </select>

                    {/* Style Filter */}
                    <select
                        value={selectedStyle}
                        onChange={(e) => setSelectedStyle(e.target.value)}
                        className="px-3 py-2 border border-line-strong rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                        <option value="">All Styles</option>
                        {filters.styles && filters.styles.map(style => (
                            <option key={style} value={style}>{style}</option>
                        ))}
                    </select>

                    {/* Sort By */}
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="px-3 py-2 border border-line-strong rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="name">Name (A-Z)</option>
                    </select>

                    {(selectedCategory || selectedStyle) && (
                        <button
                            onClick={clearFilters}
                            className="text-sm text-highlight hover:text-highlight font-medium"
                        >
                            Clear Filters
                        </button>
                    )}

                    <div className="ml-auto flex gap-2">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded ${viewMode === 'grid' ? 'bg-highlight-soft text-highlight' : 'text-faint hover:text-secondary'}`}
                        >
                            <Grid size={20} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded ${viewMode === 'list' ? 'bg-highlight-soft text-highlight' : 'text-faint hover:text-secondary'}`}
                        >
                            <List size={20} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Templates Grid/List */}
            <div className={embedded ? "overflow-y-auto" : "flex-1 overflow-y-auto p-6"}>
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                    </div>
                ) : templates.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-muted text-lg">No templates found</p>
                        <p className="text-faint text-sm mt-2">Try adjusting your filters</p>
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {templates.map(template => (
                            <TemplateCard
                                key={template.id}
                                template={template}
                                isSelected={selectedIds.has(template.id)}
                                onToggleSelect={() => toggleSelection(template.id)}
                                onSelect={() => handleTemplateSelect(template)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="space-y-4 w-full">
                        {templates.map(template => (
                            <TemplateListItem
                                key={template.id}
                                template={template}
                                isSelected={selectedIds.has(template.id)}
                                onToggleSelect={() => toggleSelection(template.id)}
                                onSelect={() => handleTemplateSelect(template)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
                    <div className="bg-panel rounded-lg shadow-xl max-w-md w-full p-6">
                        <div className="flex items-center gap-3 text-danger mb-4">
                            <AlertTriangle size={24} />
                            <h3 className="text-lg font-bold">Delete Templates?</h3>
                        </div>
                        <p className="text-secondary mb-6">
                            Are you sure you want to delete {selectedIds.size} selected template{selectedIds.size !== 1 ? 's' : ''}? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-4 py-2 text-secondary hover:bg-inset rounded-lg font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    if (embedded) {
        return <div className="w-full relative">{content}</div>;
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-panel rounded-xl shadow-2xl max-w-7xl w-full max-h-[90vh] flex flex-col relative">
                {content}
            </div>
        </div>
    );
}

// Template Card Component (Grid View)
function TemplateCard({ template, onSelect, isSelected, onToggleSelect }) {
    let colorPalette = null;
    try {
        colorPalette = template.color_palette ? JSON.parse(template.color_palette) : null;
    } catch (e) {
        // Ignore parse errors
    }

    return (
        <div
            className={`bg-panel border-2 rounded-lg overflow-hidden transition-all group relative ${isSelected ? 'border-purple-600 ring-2 ring-purple-200' : 'border-line hover:border-purple-500 hover:shadow-lg'}`}
        >
            {/* Selection Checkbox */}
            <div className="absolute top-2 right-2 z-10">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                        e.stopPropagation();
                        onToggleSelect();
                    }}
                    className="w-5 h-5 rounded border-line-strong text-highlight focus:ring-purple-500 shadow-sm cursor-pointer"
                />
            </div>

            <div onClick={onSelect} className="cursor-pointer">
                {/* Image */}
                <div className="aspect-square bg-inset relative overflow-hidden">
                    <img
                        src={template.image_url}
                        alt={template.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    {template.template_category && (
                        <div className="absolute top-2 left-2 bg-purple-600 text-white text-xs px-2 py-1 rounded-full font-medium capitalize">
                            {template.template_category}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="p-4">
                    <h3 className="font-semibold text-foreground mb-2 line-clamp-1">{template.name}</h3>

                    {template.design_style && (
                        <p className="text-xs text-muted mb-3">{template.design_style}</p>
                    )}

                    {/* Color Palette */}
                    {colorPalette && (
                        <div className="flex gap-1">
                            {colorPalette.primary && (
                                <div className="w-6 h-6 rounded border border-line-strong" style={{ backgroundColor: colorPalette.primary }}></div>
                            )}
                            {colorPalette.secondary && (
                                <div className="w-6 h-6 rounded border border-line-strong" style={{ backgroundColor: colorPalette.secondary }}></div>
                            )}
                            {colorPalette.accent && (
                                <div className="w-6 h-6 rounded border border-line-strong" style={{ backgroundColor: colorPalette.accent }}></div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Template List Item Component (List View)
function TemplateListItem({ template, onSelect, isSelected, onToggleSelect }) {
    let colorPalette = null;
    try {
        colorPalette = template.color_palette ? JSON.parse(template.color_palette) : null;
    } catch (e) {
        // Ignore parse errors
    }

    return (
        <div
            className={`w-full bg-panel border-2 rounded-lg p-4 transition-all flex gap-4 items-center ${isSelected ? 'border-purple-600 bg-highlight-soft' : 'border-line hover:border-purple-500 hover:shadow-md'}`}
        >
            {/* Selection Checkbox */}
            <div className="flex-shrink-0">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                        e.stopPropagation();
                        onToggleSelect();
                    }}
                    className="w-5 h-5 rounded border-line-strong text-highlight focus:ring-purple-500 cursor-pointer"
                />
            </div>

            <div onClick={onSelect} className="flex-1 flex gap-4 cursor-pointer">
                {/* Thumbnail */}
                <div className="w-32 h-32 bg-inset rounded overflow-hidden flex-shrink-0">
                    <img
                        src={template.image_url}
                        alt={template.name}
                        className="w-full h-full object-cover"
                    />
                </div>

                {/* Info */}
                <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-foreground text-lg">{template.name}</h3>
                        {template.template_category && (
                            <span className="bg-highlight-soft text-highlight text-xs px-3 py-1 rounded-full font-medium capitalize">
                                {template.template_category}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm text-secondary mb-3">
                        {template.design_style && (
                            <span>Style: <span className="font-medium">{template.design_style}</span></span>
                        )}
                        {template.category && (
                            <span>Category: <span className="font-medium">{template.category}</span></span>
                        )}
                    </div>

                    {/* Color Palette */}
                    {colorPalette && (
                        <div className="flex gap-2 items-center">
                            <span className="text-xs text-muted">Colors:</span>
                            <div className="flex gap-1">
                                {colorPalette.primary && (
                                    <div className="w-6 h-6 rounded border border-line-strong" style={{ backgroundColor: colorPalette.primary }}></div>
                                )}
                                {colorPalette.secondary && (
                                    <div className="w-6 h-6 rounded border border-line-strong" style={{ backgroundColor: colorPalette.secondary }}></div>
                                )}
                                {colorPalette.accent && (
                                    <div className="w-6 h-6 rounded border border-line-strong" style={{ backgroundColor: colorPalette.accent }}></div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

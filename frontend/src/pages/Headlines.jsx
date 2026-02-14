import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Trash2, Plus, Upload, X, Loader, FileText, Check } from 'lucide-react';
import { useBrands } from '../context/BrandContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const CATEGORIES = [
    { value: '', label: 'All' },
    { value: 'curiosity', label: 'Curiosity' },
    { value: 'urgency', label: 'Urgency' },
    { value: 'benefit', label: 'Benefit' },
    { value: 'social_proof', label: 'Social Proof' },
    { value: 'fomo', label: 'FOMO' },
];

const CATEGORY_COLORS = {
    curiosity: 'bg-blue-100 text-blue-700',
    urgency: 'bg-red-100 text-red-700',
    benefit: 'bg-green-100 text-green-700',
    social_proof: 'bg-purple-100 text-purple-700',
    fomo: 'bg-amber-100 text-amber-700',
};

export default function Headlines() {
    const { brands } = useBrands();
    const { authFetch } = useAuth();
    const { showSuccess, showError, showWarning } = useToast();

    const [selectedBrandId, setSelectedBrandId] = useState('');
    const [selectedProductId, setSelectedProductId] = useState('');
    const [researchFile, setResearchFile] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [headlines, setHeadlines] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filterCategory, setFilterCategory] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [newHeadlineText, setNewHeadlineText] = useState('');
    const [showAddInput, setShowAddInput] = useState(false);
    const fileInputRef = useRef(null);

    const selectedBrand = brands.find(b => b.id === selectedBrandId);
    const products = selectedBrand?.products || [];

    // Fetch headlines when brand changes
    useEffect(() => {
        if (selectedBrandId) {
            fetchHeadlines();
        } else {
            setHeadlines([]);
        }
    }, [selectedBrandId, selectedProductId]);

    const fetchHeadlines = async () => {
        setLoading(true);
        try {
            let url = `${API_URL}/headlines?brand_id=${selectedBrandId}`;
            if (selectedProductId) url += `&product_id=${selectedProductId}`;
            const res = await authFetch(url);
            if (!res.ok) throw new Error('Failed to fetch headlines');
            const data = await res.json();
            setHeadlines(data);
        } catch (err) {
            showError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerate = async () => {
        if (!selectedBrandId) {
            showWarning('Please select a brand');
            return;
        }
        if (!researchFile) {
            showWarning('Please upload a research document');
            return;
        }

        setGenerating(true);
        try {
            const formData = new FormData();
            formData.append('brand_id', selectedBrandId);
            if (selectedProductId) formData.append('product_id', selectedProductId);
            formData.append('file', researchFile);

            const res = await authFetch(`${API_URL}/headlines/generate`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'Generation failed');
            }

            const newHeadlines = await res.json();
            setHeadlines(prev => [...newHeadlines, ...prev]);
            showSuccess(`Generated ${newHeadlines.length} headlines`);
        } catch (err) {
            showError(err.message);
        } finally {
            setGenerating(false);
        }
    };

    const handleAddManual = async () => {
        const text = newHeadlineText.trim();
        if (!text) return;
        if (!selectedBrandId) {
            showWarning('Please select a brand first');
            return;
        }

        try {
            const res = await authFetch(`${API_URL}/headlines`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    brand_id: selectedBrandId,
                    product_id: selectedProductId || null,
                    source: 'manual',
                }),
            });
            if (!res.ok) throw new Error('Failed to save headline');
            const saved = await res.json();
            setHeadlines(prev => [saved, ...prev]);
            setNewHeadlineText('');
            setShowAddInput(false);
            showSuccess('Headline added');
        } catch (err) {
            showError(err.message);
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) return;
        try {
            const res = await authFetch(`${API_URL}/headlines/batch`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedIds) }),
            });
            if (!res.ok) throw new Error('Failed to delete');
            setHeadlines(prev => prev.filter(h => !selectedIds.has(h.id)));
            showSuccess(`Deleted ${selectedIds.size} headline${selectedIds.size > 1 ? 's' : ''}`);
            setSelectedIds(new Set());
        } catch (err) {
            showError(err.message);
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        const filtered = filteredHeadlines;
        if (selectedIds.size === filtered.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filtered.map(h => h.id)));
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) setResearchFile(file);
    };

    const filteredHeadlines = filterCategory
        ? headlines.filter(h => h.category === filterCategory)
        : headlines;

    return (
        <div className="max-w-5xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Headlines</h1>
                <p className="text-gray-500 mt-1">Generate and manage ad headlines by brand</p>
            </div>

            {/* Top Controls */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-5">
                {/* Brand & Product Selectors */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Brand *</label>
                        <select
                            value={selectedBrandId}
                            onChange={(e) => {
                                setSelectedBrandId(e.target.value);
                                setSelectedProductId('');
                                setSelectedIds(new Set());
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        >
                            <option value="">Select a brand...</option>
                            {brands.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
                        <select
                            value={selectedProductId}
                            onChange={(e) => setSelectedProductId(e.target.value)}
                            disabled={!selectedBrandId}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-50"
                        >
                            <option value="">All Products</option>
                            {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Research Document Upload */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Research Document</label>
                    {researchFile ? (
                        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                            <FileText size={20} className="text-amber-600 flex-shrink-0" />
                            <span className="text-sm text-gray-800 truncate flex-1">{researchFile.name}</span>
                            <span className="text-xs text-gray-400">{(researchFile.size / 1024).toFixed(0)} KB</span>
                            <button onClick={() => { setResearchFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                className="text-gray-400 hover:text-red-500">
                                <X size={16} />
                            </button>
                        </div>
                    ) : (
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-amber-500 transition-colors"
                        >
                            <Upload size={24} className="mx-auto text-gray-400 mb-2" />
                            <p className="text-sm text-gray-600">Click to upload research document</p>
                            <p className="text-xs text-gray-400 mt-1">PDF, TXT, CSV, or DOC</p>
                        </div>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.txt,.csv,.doc,.docx,.md"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                </div>

                {/* Generate Button */}
                <button
                    onClick={handleGenerate}
                    disabled={generating || !selectedBrandId || !researchFile}
                    className="flex items-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {generating ? (
                        <>
                            <Loader size={18} className="animate-spin" />
                            Generating Headlines...
                        </>
                    ) : (
                        <>
                            <Sparkles size={18} />
                            Generate Headlines
                        </>
                    )}
                </button>
            </div>

            {/* Headlines List */}
            {selectedBrandId && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {/* List Header */}
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold text-gray-900">
                                Saved Headlines
                                <span className="text-sm font-normal text-gray-400 ml-2">({filteredHeadlines.length})</span>
                            </h2>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Category Filter */}
                            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                                {CATEGORIES.map(cat => (
                                    <button
                                        key={cat.value}
                                        onClick={() => setFilterCategory(cat.value)}
                                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                            filterCategory === cat.value
                                                ? 'bg-amber-600 text-white'
                                                : 'bg-white text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>

                            {/* Add Manual */}
                            <button
                                onClick={() => setShowAddInput(!showAddInput)}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 border border-amber-200"
                            >
                                <Plus size={14} /> Add
                            </button>
                        </div>
                    </div>

                    {/* Manual Add Input */}
                    {showAddInput && (
                        <div className="px-6 py-3 border-b border-gray-100 bg-amber-50 flex gap-2">
                            <input
                                type="text"
                                value={newHeadlineText}
                                onChange={(e) => setNewHeadlineText(e.target.value)}
                                placeholder="Type a headline..."
                                maxLength={100}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAddManual(); }}
                                autoFocus
                            />
                            <button
                                onClick={handleAddManual}
                                disabled={!newHeadlineText.trim()}
                                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                            >
                                Save
                            </button>
                            <button
                                onClick={() => { setShowAddInput(false); setNewHeadlineText(''); }}
                                className="px-3 py-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}

                    {/* Bulk Actions */}
                    {selectedIds.size > 0 && (
                        <div className="px-6 py-2 border-b border-gray-100 bg-red-50 flex items-center justify-between">
                            <span className="text-sm text-red-700 font-medium">{selectedIds.size} selected</span>
                            <button
                                onClick={handleDeleteSelected}
                                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200"
                            >
                                <Trash2 size={14} /> Delete Selected
                            </button>
                        </div>
                    )}

                    {/* Headlines */}
                    <div className="divide-y divide-gray-50">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader size={24} className="animate-spin text-amber-600" />
                            </div>
                        ) : filteredHeadlines.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                {headlines.length === 0
                                    ? 'No headlines yet. Upload a research doc and generate some!'
                                    : 'No headlines match this filter.'}
                            </div>
                        ) : (
                            <>
                                {/* Select All */}
                                <div className="px-6 py-2 bg-gray-50 flex items-center gap-3">
                                    <button
                                        onClick={toggleSelectAll}
                                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                            selectedIds.size === filteredHeadlines.length && filteredHeadlines.length > 0
                                                ? 'bg-amber-600 border-amber-600'
                                                : 'border-gray-300 hover:border-amber-400'
                                        }`}
                                    >
                                        {selectedIds.size === filteredHeadlines.length && filteredHeadlines.length > 0 && (
                                            <Check size={12} className="text-white" />
                                        )}
                                    </button>
                                    <span className="text-xs text-gray-500 font-medium">Select All</span>
                                </div>

                                {filteredHeadlines.map(headline => (
                                    <div
                                        key={headline.id}
                                        className={`px-6 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                                            selectedIds.has(headline.id) ? 'bg-amber-50' : ''
                                        }`}
                                    >
                                        <button
                                            onClick={() => toggleSelect(headline.id)}
                                            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                                selectedIds.has(headline.id)
                                                    ? 'bg-amber-600 border-amber-600'
                                                    : 'border-gray-300 hover:border-amber-400'
                                            }`}
                                        >
                                            {selectedIds.has(headline.id) && (
                                                <Check size={12} className="text-white" />
                                            )}
                                        </button>
                                        <span className="flex-1 text-gray-800">{headline.text}</span>
                                        {headline.category && (
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                CATEGORY_COLORS[headline.category] || 'bg-gray-100 text-gray-600'
                                            }`}>
                                                {headline.category.replace('_', ' ')}
                                            </span>
                                        )}
                                        {headline.source === 'manual' && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">manual</span>
                                        )}
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

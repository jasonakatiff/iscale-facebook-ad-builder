import React, { useState, useEffect } from 'react';
import { Plus, Copy, Trash2, Edit3, X, Check, Search, FileText, Loader, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const CATEGORIES = [
    'Higgsfield',
    'Image Generation',
    'Video Analysis',
    'Ad Copy',
    'Research',
    'Other',
];

const CATEGORY_COLORS = {
    'Higgsfield': 'bg-purple-100 text-purple-700 border-purple-200',
    'Image Generation': 'bg-blue-100 text-blue-700 border-blue-200',
    'Video Analysis': 'bg-green-100 text-green-700 border-green-200',
    'Ad Copy': 'bg-amber-100 text-amber-700 border-amber-200',
    'Research': 'bg-indigo-100 text-indigo-700 border-indigo-200',
    'Other': 'bg-gray-100 text-gray-700 border-gray-200',
};

function generateId() {
    return `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default function PromptsAndDocs() {
    const { authFetch } = useAuth();
    const { showSuccess, showError } = useToast();

    const [prompts, setPrompts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        category: 'Other',
        description: '',
        template: '',
        notes: '',
    });

    useEffect(() => {
        fetchPrompts();
    }, []);

    const fetchPrompts = async () => {
        setLoading(true);
        try {
            const res = await authFetch(`${API_URL}/prompts/`);
            if (!res.ok) throw new Error('Failed to fetch prompts');
            const data = await res.json();
            setPrompts(data);
        } catch (err) {
            showError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.name.trim() || !formData.template.trim()) {
            showError('Name and prompt text are required');
            return;
        }

        try {
            if (editingId) {
                // Update
                const res = await authFetch(`${API_URL}/prompts/${editingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: formData.name,
                        category: formData.category,
                        description: formData.description,
                        template: formData.template,
                        notes: formData.notes,
                    }),
                });
                if (!res.ok) throw new Error('Failed to update');
                const updated = await res.json();
                setPrompts(prev => prev.map(p => p.id === editingId ? updated : p));
                showSuccess('Prompt updated');
            } else {
                // Create
                const res = await authFetch(`${API_URL}/prompts/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: generateId(),
                        name: formData.name,
                        category: formData.category,
                        description: formData.description || null,
                        template: formData.template,
                        notes: formData.notes || null,
                        variables: [],
                    }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || 'Failed to create');
                }
                const created = await res.json();
                setPrompts(prev => [created, ...prev]);
                showSuccess('Prompt saved');
            }
            resetForm();
        } catch (err) {
            showError(err.message);
        }
    };

    const handleDelete = async (id) => {
        try {
            const res = await authFetch(`${API_URL}/prompts/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            setPrompts(prev => prev.filter(p => p.id !== id));
            showSuccess('Prompt deleted');
            if (expandedId === id) setExpandedId(null);
        } catch (err) {
            showError(err.message);
        }
    };

    const handleEdit = (prompt) => {
        setEditingId(prompt.id);
        setFormData({
            name: prompt.name,
            category: prompt.category,
            description: prompt.description || '',
            template: prompt.template,
            notes: prompt.notes || '',
        });
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCopy = (text) => {
        navigator.clipboard.writeText(text);
        showSuccess('Copied to clipboard');
    };

    const resetForm = () => {
        setShowForm(false);
        setEditingId(null);
        setFormData({ name: '', category: 'Other', description: '', template: '', notes: '' });
    };

    // Filter
    const filtered = prompts.filter(p => {
        if (filterCategory && p.category !== filterCategory) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                p.name.toLowerCase().includes(q) ||
                p.template.toLowerCase().includes(q) ||
                (p.description || '').toLowerCase().includes(q) ||
                (p.notes || '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    return (
        <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Prompts & Docs</h1>
                    <p className="text-gray-500 mt-1">Save and recall prompts you use across tools</p>
                </div>
                <button
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700"
                >
                    <Plus size={18} /> New Prompt
                </button>
            </div>

            {/* Create / Edit Form */}
            {showForm && (
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-900">
                            {editingId ? 'Edit Prompt' : 'New Prompt'}
                        </h2>
                        <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="e.g. Higgsfield Character Prompt"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                            <select
                                value={formData.category}
                                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            >
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <input
                            type="text"
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Brief description of what this prompt does"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prompt Text *</label>
                        <textarea
                            value={formData.template}
                            onChange={(e) => setFormData(prev => ({ ...prev, template: e.target.value }))}
                            placeholder="Paste your full prompt here..."
                            rows="10"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono text-sm"
                        />
                        <p className="text-xs text-gray-400 mt-1">{formData.template.length} characters</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                            placeholder="Any notes, tips, or context for this prompt..."
                            rows="3"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={resetForm} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!formData.name.trim() || !formData.template.trim()}
                            className="flex items-center gap-2 px-6 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50"
                        >
                            <Check size={16} /> {editingId ? 'Update' : 'Save'}
                        </button>
                    </div>
                </div>
            )}

            {/* Search & Filter */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search prompts..."
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                    />
                </div>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                    <button
                        onClick={() => setFilterCategory('')}
                        className={`px-3 py-2 text-xs font-medium ${!filterCategory ? 'bg-amber-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                        All
                    </button>
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
                            className={`px-3 py-2 text-xs font-medium ${filterCategory === cat ? 'bg-amber-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Prompts List */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader size={28} className="animate-spin text-amber-600" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                    <FileText size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">
                        {prompts.length === 0 ? 'No prompts saved yet. Click "New Prompt" to get started.' : 'No prompts match your search.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map(prompt => {
                        const isExpanded = expandedId === prompt.id;
                        return (
                            <div key={prompt.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                {/* Header row */}
                                <div
                                    className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                                    onClick={() => setExpandedId(isExpanded ? null : prompt.id)}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-semibold text-gray-900">{prompt.name}</h3>
                                            <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[prompt.category] || CATEGORY_COLORS['Other']}`}>
                                                {prompt.category}
                                            </span>
                                        </div>
                                        {prompt.description && (
                                            <p className="text-sm text-gray-500 mt-0.5 truncate">{prompt.description}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleCopy(prompt.template); }}
                                            className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                            title="Copy prompt"
                                        >
                                            <Copy size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleEdit(prompt); }}
                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Edit"
                                        >
                                            <Edit3 size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(prompt.id); }}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                        {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                                    </div>
                                </div>

                                {/* Expanded content */}
                                {isExpanded && (
                                    <div className="px-5 pb-5 border-t border-gray-100">
                                        <div className="mt-4 bg-gray-50 rounded-lg p-4 relative">
                                            <button
                                                onClick={() => handleCopy(prompt.template)}
                                                className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-amber-600 hover:bg-white rounded transition-colors"
                                                title="Copy"
                                            >
                                                <Copy size={14} />
                                            </button>
                                            <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono pr-8 max-h-96 overflow-y-auto">
                                                {prompt.template}
                                            </pre>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-2">{prompt.template.length} characters</p>
                                        {prompt.notes && (
                                            <div className="mt-3 text-sm text-gray-600 bg-amber-50 rounded-lg p-3 border border-amber-100">
                                                <span className="font-medium text-amber-700">Notes: </span>
                                                {prompt.notes}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ProviderConnections } from '../components/ProviderConnections';
import { Settings as SettingsIcon, Plus, Sparkles, Edit, Trash2, Save, X, FileText, Code, AlertTriangle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { adStyles as initialStyles, AD_CATEGORIES } from '../data/adStyles';
import { PROMPT_CATEGORIES } from '../data/prompts';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export default function Settings() {
    const { showSuccess, showError } = useToast();
    const { authFetch } = useAuth();
    const [params, setParams] = useSearchParams();
    const activeTab = params.get('tab') || 'styles';
    const setActiveTab = tab => setParams({ tab });
    const [styles, setStyles] = useState([]);
    const [prompts, setPrompts] = useState([]);
    const [editingStyle, setEditingStyle] = useState(null);
    const [editingPrompt, setEditingPrompt] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showAIModal, setShowAIModal] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [loading, setLoading] = useState(true);
    const [styleToDelete, setStyleToDelete] = useState(null);

    // Load prompts and styles from API
    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const [promptsRes, stylesRes] = await Promise.all([
                authFetch(`${API_BASE}/prompts`),
                authFetch(`${API_BASE}/ad-styles`)
            ]);

            if (promptsRes.ok) {
                const promptsData = await promptsRes.json();
                setPrompts(promptsData);
            }

            if (stylesRes.ok) {
                const stylesData = await stylesRes.json();
                setStyles(stylesData.length > 0 ? stylesData : initialStyles);
            } else {
                // If no styles in DB, use initial styles from file
                setStyles(initialStyles);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            showError('Failed to load settings');
            // Fallback to local data
            setStyles(initialStyles);
        } finally {
            setLoading(false);
        }
    };

    const tabs = [
        { id: 'styles', label: 'Ad Styles', count: styles.length },
        { id: 'prompts', label: 'Prompts', count: prompts.length },
        { id: 'general', label: 'General', count: null },
        { id: 'integrations', label: 'Integrations', count: null }
    ];

    const handleDeleteStyle = (styleId) => {
        setStyleToDelete(styleId);
    };

    const confirmDeleteStyle = () => {
        if (styleToDelete) {
            setStyles(styles.filter(s => s.id !== styleToDelete));
            showSuccess('Style deleted successfully');
            setStyleToDelete(null);
        }
    };

    const handleEditStyle = (style) => {
        setEditingStyle({ ...style });
    };

    const handleSaveEdit = () => {
        setStyles(styles.map(s => s.id === editingStyle.id ? editingStyle : s));
        setEditingStyle(null);
        showSuccess('Style updated successfully');
    };

    const handleAddStyle = (newStyle) => {
        const styleWithId = {
            ...newStyle,
            id: `custom-${Date.now()}`
        };
        setStyles([...styles, styleWithId]);
        setShowAddModal(false);
        showSuccess('Style added successfully');
    };

    const handleGenerateAIStyles = async (prompt, count) => {
        setGenerating(true);
        try {
            // TODO: Implement AI generation endpoint
            await new Promise(resolve => setTimeout(resolve, 2000)); // Simulated API call
            showSuccess(`Generated ${count} new styles!`);
            setShowAIModal(false);
        } catch (error) {
            showError('Failed to generate styles');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                    <SettingsIcon size={32} className="text-highlight" />
                    Settings
                </h1>
                <Link className="studio-button mt-3" to="/settings/leadrouter">Configure LeadRouter</Link>
                <p className="text-secondary mt-1">Manage your ad styles and application settings</p>
            </div>

            {/* Tabs */}
            <div className="bg-panel rounded-xl shadow-sm border border-line mb-6">
                <div className="flex flex-wrap border-b border-line">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 sm:flex-none px-3 sm:px-6 py-4 text-sm sm:text-base font-medium transition-colors ${
                                activeTab === tab.id
                                    ? 'text-highlight border-b-2 border-purple-600'
                                    : 'text-secondary hover:text-foreground'
                            }`}
                        >
                            {tab.label}
                            {tab.count !== null && (
                                <span className="ml-2 px-2 py-1 text-xs rounded-full bg-inset text-secondary">
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="p-6">
                    {activeTab === 'integrations' && <div className="space-y-5"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold">Service connections</h2><p className="text-secondary mt-1">Connect the tools that create your ads.</p></div><Link to="/setup" className="studio-button">Open setup wizard</Link></div><ProviderConnections /></div>}
                    {activeTab === 'styles' && (
                        <StylesSettings
                            styles={styles}
                            editingStyle={editingStyle}
                            onEdit={handleEditStyle}
                            onDelete={handleDeleteStyle}
                            onSave={handleSaveEdit}
                            onCancelEdit={() => setEditingStyle(null)}
                            onUpdateEdit={setEditingStyle}
                            onShowAdd={() => setShowAddModal(true)}
                            onShowAI={() => setShowAIModal(true)}
                        />
                    )}
                    {activeTab === 'prompts' && (
                        <PromptsSettings
                            prompts={prompts}
                            editingPrompt={editingPrompt}
                            onEdit={setEditingPrompt}
                            onSave={() => {
                                setPrompts(prompts.map(p => p.id === editingPrompt.id ? editingPrompt : p));
                                setEditingPrompt(null);
                                showSuccess('Prompt updated successfully');
                            }}
                            onCancel={() => setEditingPrompt(null)}
                            onUpdate={(updatedPrompt) => setEditingPrompt(updatedPrompt)}
                        />
                    )}
                    {activeTab === 'general' && (
                        <GeneralSettings />
                    )}
                </div>
            </div>

            {/* Add Style Modal */}
            {showAddModal && (
                <AddStyleModal
                    onClose={() => setShowAddModal(false)}
                    onSave={handleAddStyle}
                />
            )}

            {/* AI Generation Modal */}
            {showAIModal && (
                <AIGenerationModal
                    onClose={() => setShowAIModal(false)}
                    onGenerate={handleGenerateAIStyles}
                    generating={generating}
                />
            )}

            {/* Delete Style Confirmation Modal */}
            {styleToDelete && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-panel rounded-lg shadow-xl max-w-md w-full p-6">
                        <div className="flex items-center gap-3 text-danger mb-4">
                            <AlertTriangle size={24} />
                            <h3 className="text-lg font-bold">Delete Style?</h3>
                        </div>
                        <p className="text-secondary mb-6">
                            Are you sure you want to delete this ad style? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setStyleToDelete(null)}
                                className="px-4 py-2 text-secondary hover:bg-inset rounded-lg font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteStyle}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StylesSettings({ styles, editingStyle, onEdit, onDelete, onSave, onCancelEdit, onUpdateEdit, onShowAdd, onShowAI }) {
    const [filterCategory, setFilterCategory] = useState('all');

    const filteredStyles = filterCategory === 'all'
        ? styles
        : styles.filter(s => s.category === filterCategory);

    return (
        <div className="space-y-6">
            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex gap-3">
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    >
                        <option value="all">All Categories ({styles.length})</option>
                        {Object.values(AD_CATEGORIES).map(cat => (
                            <option key={cat} value={cat}>
                                {cat} ({styles.filter(s => s.category === cat).length})
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={onShowAI}
                        className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors"
                    >
                        <Sparkles size={20} />
                        Generate with AI
                    </button>
                    <button
                        onClick={onShowAdd}
                        className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors"
                    >
                        <Plus size={20} />
                        Add Style
                    </button>
                </div>
            </div>

            {/* Styles List */}
            <div className="space-y-4">
                {filteredStyles.map((style) => (
                    <div
                        key={style.id}
                        className="bg-subtle border border-line rounded-lg p-4"
                    >
                        {editingStyle?.id === style.id ? (
                            <EditStyleForm
                                style={editingStyle}
                                onChange={onUpdateEdit}
                                onSave={onSave}
                                onCancel={onCancelEdit}
                            />
                        ) : (
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-lg font-semibold text-foreground">{style.name}</h3>
                                        <span className="px-3 py-1 text-xs font-medium rounded-full bg-highlight-soft text-highlight">
                                            {style.category}
                                        </span>
                                    </div>
                                    <p className="text-secondary text-sm mb-3">{style.description}</p>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        <span className="text-xs text-muted">Best for:</span>
                                        {style.bestFor?.map((industry, idx) => (
                                            <span key={idx} className="px-2 py-1 text-xs bg-soft text-secondary rounded">
                                                {industry}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-sm text-secondary">
                                        <div><strong>Mood:</strong> {style.mood}</div>
                                        <div><strong>Design:</strong> {style.design_style}</div>
                                    </div>
                                </div>
                                <div className="flex gap-2 ml-4">
                                    <button
                                        onClick={() => onEdit(style)}
                                        className="p-2 text-secondary hover:text-highlight hover:bg-highlight-soft rounded-lg transition-colors"
                                    >
                                        <Edit size={18} />
                                    </button>
                                    <button
                                        onClick={() => onDelete(style.id)}
                                        className="p-2 text-secondary hover:text-danger hover:bg-danger-soft rounded-lg transition-colors"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function EditStyleForm({ style, onChange, onSave, onCancel }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-secondary mb-1">Name</label>
                <input
                    type="text"
                    value={style.name}
                    onChange={(e) => onChange({ ...style, name: e.target.value })}
                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-secondary mb-1">Description</label>
                <textarea
                    value={style.description}
                    onChange={(e) => onChange({ ...style, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-secondary mb-1">Mood</label>
                    <input
                        type="text"
                        value={style.mood}
                        onChange={(e) => onChange({ ...style, mood: e.target.value })}
                        className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-secondary mb-1">Design Style</label>
                    <input
                        type="text"
                        value={style.design_style}
                        onChange={(e) => onChange({ ...style, design_style: e.target.value })}
                        className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    />
                </div>
            </div>
            <div className="flex gap-3 justify-end">
                <button
                    onClick={onCancel}
                    className="flex items-center gap-2 px-4 py-2 bg-inset text-secondary rounded-lg hover:bg-soft transition-colors"
                >
                    <X size={18} />
                    Cancel
                </button>
                <button
                    onClick={onSave}
                    className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors"
                >
                    <Save size={18} />
                    Save Changes
                </button>
            </div>
        </div>
    );
}

function AddStyleModal({ onClose, onSave }) {
    const [newStyle, setNewStyle] = useState({
        name: '',
        category: AD_CATEGORIES.TRUST_AUTHORITY,
        description: '',
        bestFor: [],
        mood: '',
        lighting: '',
        composition: '',
        design_style: '',
        prompt: ''
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(newStyle);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-panel rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-line">
                    <h2 className="text-2xl font-bold text-foreground">Add New Style</h2>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">Name *</label>
                        <input
                            type="text"
                            required
                            value={newStyle.name}
                            onChange={(e) => setNewStyle({ ...newStyle, name: e.target.value })}
                            className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                            placeholder="e.g., The Bold Comparison"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">Category *</label>
                        <select
                            required
                            value={newStyle.category}
                            onChange={(e) => setNewStyle({ ...newStyle, category: e.target.value })}
                            className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                        >
                            {Object.values(AD_CATEGORIES).map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">Description *</label>
                        <textarea
                            required
                            value={newStyle.description}
                            onChange={(e) => setNewStyle({ ...newStyle, description: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                            placeholder="What makes this style unique?"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Mood</label>
                            <input
                                type="text"
                                value={newStyle.mood}
                                onChange={(e) => setNewStyle({ ...newStyle, mood: e.target.value })}
                                className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                                placeholder="e.g., Bold and energetic"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-secondary mb-1">Design Style</label>
                            <input
                                type="text"
                                value={newStyle.design_style}
                                onChange={(e) => setNewStyle({ ...newStyle, design_style: e.target.value })}
                                className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                                placeholder="e.g., Modern minimal"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">Image Generation Prompt</label>
                        <textarea
                            value={newStyle.prompt}
                            onChange={(e) => setNewStyle({ ...newStyle, prompt: e.target.value })}
                            rows={4}
                            className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                            placeholder="Detailed prompt for AI image generation..."
                        />
                    </div>
                    <div className="flex gap-3 justify-end pt-4 border-t border-line">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2 bg-inset text-secondary rounded-lg hover:bg-soft transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors"
                        >
                            Add Style
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function AIGenerationModal({ onClose, onGenerate, generating }) {
    const [prompt, setPrompt] = useState('');
    const [count, setCount] = useState(5);

    const handleSubmit = (e) => {
        e.preventDefault();
        onGenerate(prompt, count);
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-panel rounded-2xl shadow-2xl max-w-2xl w-full">
                <div className="p-6 border-b border-line">
                    <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Sparkles className="text-highlight" />
                        Generate Styles with AI
                    </h2>
                    <p className="text-secondary mt-1">Describe the types of ad styles you want to create</p>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">
                            What kind of ad styles do you need?
                        </label>
                        <textarea
                            required
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows={5}
                            className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                            placeholder="Example: Create ad styles for fitness supplements targeting women aged 25-40. Focus on before/after transformations and social proof..."
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-secondary mb-1">
                            How many styles to generate?
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="20"
                            value={count}
                            onChange={(e) => setCount(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                        />
                    </div>
                    <div className="flex gap-3 justify-end pt-4 border-t border-line">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={generating}
                            className="px-6 py-2 bg-inset text-secondary rounded-lg hover:bg-soft transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={generating}
                            className="flex items-center gap-2 px-6 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
                        >
                            <Sparkles size={18} className={generating ? 'animate-spin' : ''} />
                            {generating ? 'Generating...' : 'Generate Styles'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function PromptsSettings({ prompts, editingPrompt, onEdit, onSave, onCancel, onUpdate }) {
    const [filterCategory, setFilterCategory] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    const filteredPrompts = prompts.filter(p => {
        const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
        const matchesSearch = searchTerm === '' ||
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.description.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return (
        <div className="space-y-6">
            {/* Filter Bar */}
            <div className="flex items-center gap-3">
                <input
                    type="text"
                    placeholder="Search prompts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1 px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
                <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                >
                    <option value="all">All Categories ({prompts.length})</option>
                    {Object.values(PROMPT_CATEGORIES).map(cat => (
                        <option key={cat} value={cat}>
                            {cat} ({prompts.filter(p => p.category === cat).length})
                        </option>
                    ))}
                </select>
            </div>

            {/* Prompts List */}
            <div className="space-y-4">
                {filteredPrompts.map((prompt) => (
                    <div
                        key={prompt.id}
                        className="bg-subtle border border-line rounded-lg p-6"
                    >
                        {editingPrompt?.id === prompt.id ? (
                            <EditPromptForm
                                prompt={editingPrompt}
                                onChange={onUpdate}
                                onSave={onSave}
                                onCancel={onCancel}
                            />
                        ) : (
                            <div>
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <FileText size={20} className="text-highlight" />
                                            <h3 className="text-lg font-semibold text-foreground">{prompt.name}</h3>
                                            <span className="px-3 py-1 text-xs font-medium rounded-full bg-info-soft text-info">
                                                {prompt.category}
                                            </span>
                                        </div>
                                        <p className="text-secondary text-sm mb-3">{prompt.description}</p>
                                        {prompt.variables && prompt.variables.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                <span className="text-xs text-muted font-medium">Variables:</span>
                                                {prompt.variables.map((variable, idx) => (
                                                    <code key={idx} className="px-2 py-1 text-xs bg-soft text-foreground rounded font-mono">
                                                        {'{' + variable + '}'}
                                                    </code>
                                                ))}
                                            </div>
                                        )}
                                        {prompt.notes && (
                                            <div className="text-xs text-brand-ink bg-brand-soft border border-brand-line rounded p-2 mt-2">
                                                <strong>Note:</strong> {prompt.notes}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => onEdit(prompt)}
                                        className="ml-4 p-2 text-secondary hover:text-highlight hover:bg-highlight-soft rounded-lg transition-colors"
                                    >
                                        <Edit size={18} />
                                    </button>
                                </div>
                                <details className="mt-4">
                                    <summary className="cursor-pointer text-sm font-medium text-highlight hover:text-highlight flex items-center gap-2">
                                        <Code size={16} />
                                        View Full Prompt Template
                                    </summary>
                                    <pre className="mt-3 p-4 bg-panel text-foreground rounded-lg overflow-x-auto text-xs leading-relaxed">
                                        {prompt.template}
                                    </pre>
                                </details>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function EditPromptForm({ prompt, onChange, onSave, onCancel }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-secondary mb-1">Name</label>
                <input
                    type="text"
                    value={prompt.name}
                    onChange={(e) => onChange({ ...prompt, name: e.target.value })}
                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-secondary mb-1">Description</label>
                <textarea
                    value={prompt.description}
                    onChange={(e) => onChange({ ...prompt, description: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-secondary mb-1">Prompt Template</label>
                <textarea
                    value={prompt.template}
                    onChange={(e) => onChange({ ...prompt, template: e.target.value })}
                    rows={15}
                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent font-mono text-sm"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-secondary mb-1">Notes</label>
                <textarea
                    value={prompt.notes}
                    onChange={(e) => onChange({ ...prompt, notes: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
            </div>
            <div className="flex gap-3 justify-end pt-4 border-t border-line">
                <button
                    onClick={onCancel}
                    className="flex items-center gap-2 px-4 py-2 bg-inset text-secondary rounded-lg hover:bg-soft transition-colors"
                >
                    <X size={18} />
                    Cancel
                </button>
                <button
                    onClick={onSave}
                    className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover transition-colors"
                >
                    <Save size={18} />
                    Save Changes
                </button>
            </div>
        </div>
    );
}

function GeneralSettings() {
    return (
        <div className="space-y-6">
            <div className="bg-subtle border border-line rounded-lg p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Application Settings</h3>
                <p className="text-secondary">General settings coming soon...</p>
            </div>
        </div>
    );
}

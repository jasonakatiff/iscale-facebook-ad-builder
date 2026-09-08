import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import React, { useState, useRef } from 'react';
import { Plus, X, Copy, Check, Upload, Loader, Star } from 'lucide-react';
import ImageTemplateSelector from '../components/ImageTemplateSelector';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Helper Components
const CopyButton = ({ text, label }) => {
    const { showError } = useToast();
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className="p-1.5 text-faint hover:text-highlight hover:bg-highlight-soft rounded-md transition-colors"
            title={`Copy ${label}`}
        >
            {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
        </button>
    );
};

const AnalysisField = ({ label, value, fullWidth = false }) => {
    const displayValue = typeof value === 'object' && value !== null
        ? JSON.stringify(value, null, 2)
        : value;

    return (
        <div className={`bg-subtle rounded-lg p-4 border border-line ${fullWidth ? 'col-span-full' : ''}`}>
            <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-foreground text-sm uppercase tracking-wide">{label}</h3>
                {displayValue && <CopyButton text={displayValue} label={label} />}
            </div>
            <p className={`text-secondary text-sm leading-relaxed whitespace-pre-wrap ${typeof value === 'object' ? 'font-mono text-xs' : ''}`}>
                {displayValue || <span className="text-faint italic">Not available</span>}
            </p>
        </div>
    );
};

const WinningAds = () => {
    const { showError } = useToast();
    const { authFetch } = useAuth();
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const fileInputRef = useRef(null);

    const handleFileUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setUploading(true);

        try {
            const formData = new FormData();
            files.forEach(file => {
                formData.append('images', file);
            });

            const response = await authFetch(`${API_URL}/templates/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const result = await response.json();
            console.log('Upload successful:', result);

            // Refresh the template selector to show new uploads
            setRefreshKey(prev => prev + 1);

            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error) {
            console.error('Upload error:', error);
            showError('Failed to upload templates. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    // Helper to safely parse JSON or return object if already parsed
    const safeParse = (data) => {
        if (!data) return null;
        if (typeof data === 'object') return data;
        try {
            return JSON.parse(data);
        } catch (e) {
            console.error('JSON parse error:', e);
            return null;
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                        <Star size={32} className="text-brand-ink" />
                        Image Templates
                    </h1>
                    <p className="text-secondary mt-1">Browse and manage your winning ad templates</p>
                </div>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-hover transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {uploading ? <Loader size={20} className="animate-spin" /> : <Plus size={20} />}
                    {uploading ? 'Uploading...' : 'Upload Templates'}
                </button>
            </div>

            {/* Hidden File Input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.zip"
                multiple
                onChange={handleFileUpload}
                className="hidden"
            />

            {/* Embedded Template Selector */}
            <div className="bg-panel rounded-xl shadow-sm border border-line p-6">
                <ImageTemplateSelector
                    key={refreshKey}
                    onSelect={(template) => {
                        console.log('Selected template:', template);
                        setSelectedTemplate(template);
                    }}
                    onClose={() => { }}
                    embedded={true}
                />
            </div>

            {/* Selected Template Details Modal */}
            {selectedTemplate && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                    onClick={() => setSelectedTemplate(null)}
                >
                    <div
                        className="bg-panel rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6 border-b border-line flex justify-between items-center sticky top-0 bg-panel z-10">
                            <h2 className="text-2xl font-bold text-foreground">Template Details</h2>
                            <button
                                onClick={() => setSelectedTemplate(null)}
                                className="text-faint hover:text-secondary transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Left Column - Image */}
                                <div>
                                    <img
                                        src={selectedTemplate.image_url}
                                        alt={selectedTemplate.name}
                                        className="w-full rounded-lg shadow-md mb-4"
                                    />

                                    {/* Quick Info */}
                                    <div className="bg-subtle rounded-lg p-4 border border-line">
                                        <h3 className="font-semibold text-foreground mb-3">Quick Info</h3>
                                        <div className="space-y-2 text-sm">
                                            {selectedTemplate.template_category && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted">Category</span>
                                                    <span className="text-foreground font-medium capitalize">{selectedTemplate.template_category}</span>
                                                </div>
                                            )}
                                            {selectedTemplate.design_style && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted">Style</span>
                                                    <span className="text-foreground font-medium">{selectedTemplate.design_style}</span>
                                                </div>
                                            )}
                                            {selectedTemplate.created_at && (
                                                <div className="flex justify-between">
                                                    <span className="text-muted">Created</span>
                                                    <span className="text-foreground">{new Date(selectedTemplate.created_at).toLocaleDateString()}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column - Analysis Data */}
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-2xl font-bold text-foreground mb-2">{selectedTemplate.name}</h3>
                                        <div className="flex gap-2 flex-wrap">
                                            {selectedTemplate.topic && (
                                                <span className="inline-block bg-brand-soft text-brand-ink px-3 py-1 rounded-full text-sm font-medium">
                                                    {selectedTemplate.topic}
                                                </span>
                                            )}
                                            {selectedTemplate.mood && (
                                                <span className="inline-block bg-brand-soft text-brand-ink px-3 py-1 rounded-full text-sm font-medium">
                                                    {selectedTemplate.mood}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Analysis Fields Grid */}
                                    <div className="grid grid-cols-1 gap-4">
                                        {selectedTemplate.subject_matter && (
                                            <AnalysisField label="Subject Matter" value={selectedTemplate.subject_matter} fullWidth />
                                        )}

                                        {selectedTemplate.analysis && (
                                            <AnalysisField label="Visual Analysis" value={selectedTemplate.analysis} fullWidth />
                                        )}

                                        {selectedTemplate.copy_analysis && (
                                            <AnalysisField label="Copy Analysis" value={selectedTemplate.copy_analysis} fullWidth />
                                        )}

                                        {selectedTemplate.structural_analysis && (
                                            <AnalysisField label="Structural Analysis" value={selectedTemplate.structural_analysis} fullWidth />
                                        )}

                                        {selectedTemplate.layering && (
                                            <AnalysisField label="Layering" value={selectedTemplate.layering} fullWidth />
                                        )}

                                        {selectedTemplate.recreation_prompt && (
                                            <AnalysisField label="Recreation Prompt" value={selectedTemplate.recreation_prompt} fullWidth />
                                        )}
                                    </div>

                                    {/* Template Structure */}
                                    {selectedTemplate.template_structure && (() => {
                                        const structure = safeParse(selectedTemplate.template_structure);
                                        if (!structure) return null;
                                        return (
                                            <div className="bg-brand-soft rounded-lg p-4 border border-brand-line">
                                                <h3 className="font-semibold text-brand-ink mb-3">Template Structure</h3>
                                                <div className="space-y-2 text-sm">
                                                    {structure.template_name && (
                                                        <div><span className="text-brand-ink font-medium">Name:</span> {structure.template_name}</div>
                                                    )}
                                                    {structure.layout_type && (
                                                        <div><span className="text-brand-ink font-medium">Layout:</span> {structure.layout_type}</div>
                                                    )}
                                                    {structure.aspect_ratio && (
                                                        <div><span className="text-brand-ink font-medium">Aspect Ratio:</span> {structure.aspect_ratio}</div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Color Palette */}
                                    {selectedTemplate.color_palette && (() => {
                                        const palette = safeParse(selectedTemplate.color_palette);
                                        if (!palette) return null;
                                        return (
                                            <div className="bg-subtle rounded-lg p-4 border border-line">
                                                <h3 className="font-semibold text-foreground mb-3">Color Palette</h3>
                                                <div className="flex gap-3 flex-wrap">
                                                    {Object.entries(palette).map(([key, color]) => {
                                                        if (key === 'theme' || key === 'color_count') return null;
                                                        return (
                                                            <div key={key} className="flex flex-col items-center">
                                                                <div
                                                                    className="w-12 h-12 rounded border border-line-strong shadow-sm"
                                                                    style={{ backgroundColor: color }}
                                                                />
                                                                <span className="text-xs text-secondary mt-1 capitalize">{key.replace('_', ' ')}</span>
                                                                <span className="text-xs text-faint">{color}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {palette.theme && (
                                                    <div className="mt-3 text-sm text-secondary">
                                                        <span className="font-medium">Theme:</span> {palette.theme}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Typography System */}
                                    {selectedTemplate.typography_system && (
                                        <AnalysisField label="Typography System" value={selectedTemplate.typography_system} fullWidth />
                                    )}

                                    {/* Copy Patterns */}
                                    {selectedTemplate.copy_patterns && (
                                        <AnalysisField label="Copy Patterns" value={selectedTemplate.copy_patterns} fullWidth />
                                    )}

                                    {/* Visual Elements */}
                                    {selectedTemplate.visual_elements && (
                                        <AnalysisField label="Visual Elements" value={selectedTemplate.visual_elements} fullWidth />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WinningAds;

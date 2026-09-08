import React, { useState } from 'react';
import { ChevronRight, Wand2, RefreshCw, Check, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const NanoBananaGenerationStep = ({ copyData, selectedTemplate, brand, product, onImagesGenerated, onNext, onBack }) => {
    const { authFetch } = useAuth();
    const { showError } = useToast();
    const [generating, setGenerating] = useState(false);
    const [generatedImages, setGeneratedImages] = useState([]);
    const [selectedImages, setSelectedImages] = useState([]);

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const response = await authFetch(`${API_URL}/generated-ads/generate-image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brand, product, template: selectedTemplate, copy: copyData, count: 4, imageSizes: [{ name: 'Square', width: 1080, height: 1080 }] }) });
            if (!response.ok) throw new Error('Image generation failed. Check the generation service configuration.');
            const data = await response.json();
            const newImages = data.images.map((image, index) => ({ ...image, previewUrl: image.url, name: `Generated Image ${index + 1}` }));
            setGeneratedImages(newImages);
            setSelectedImages([]);
        } catch (failure) { showError(failure.message); }
        finally { setGenerating(false); }
    };

    const toggleImageSelection = (image) => {
        if (selectedImages.find(img => img.id === image.id)) {
            setSelectedImages(prev => prev.filter(img => img.id !== image.id));
        } else {
            setSelectedImages(prev => [...prev, image]);
        }
    };

    const handleContinue = () => {
        onImagesGenerated(selectedImages);
        onNext();
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-2">Generate Images</h2>
            <p className="text-secondary mb-8">Create stunning visuals using Nano Banana Pro AI.</p>

            {/* Generation Controls */}
            <div className="bg-panel border border-line rounded-xl p-6 mb-8">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="font-bold text-foreground">Generation Settings</h3>
                        <p className="text-sm text-muted">Based on your copy and selected template</p>
                    </div>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-lg font-medium hover:bg-brand-hover disabled:bg-purple-300 transition-colors"
                    >
                        {generating ? (
                            <>
                                <RefreshCw className="animate-spin" size={20} />
                                Generating...
                            </>
                        ) : (
                            <>
                                <Wand2 size={20} />
                                Generate Images
                            </>
                        )}
                    </button>
                </div>

                {/* Context Summary */}
                <div className="flex gap-4 text-sm text-secondary bg-subtle p-3 rounded-lg">
                    <span className="flex items-center gap-1">
                        <span className="font-semibold">Headline:</span> {copyData.headline || 'N/A'}
                    </span>
                    <span className="text-faint">|</span>
                    <span className="flex items-center gap-1">
                        <span className="font-semibold">Template:</span> {selectedTemplate?.name || 'N/A'}
                    </span>
                </div>
            </div>

            {/* Results Grid */}
            {generatedImages.length > 0 && (
                <div className="mb-8">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg">Generated Results</h3>
                        <span className="text-sm text-muted">{selectedImages.length} selected</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {generatedImages.map(image => (
                            <div
                                key={image.id}
                                onClick={() => toggleImageSelection(image)}
                                className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${selectedImages.find(img => img.id === image.id)
                                        ? 'border-blue-600 ring-2 ring-blue-100'
                                        : 'border-transparent hover:border-line-strong'
                                    }`}
                            >
                                <img
                                    src={image.previewUrl}
                                    alt={image.name}
                                    className="w-full aspect-square object-cover"
                                />

                                {/* Selection Overlay */}
                                <div className={`absolute inset-0 bg-black/20 transition-opacity ${selectedImages.find(img => img.id === image.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                    }`}>
                                    <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center ${selectedImages.find(img => img.id === image.id)
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-panel/80 text-faint'
                                        }`}>
                                        <Check size={14} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty State */}
            {generatedImages.length === 0 && !generating && (
                <div className="text-center py-16 bg-subtle rounded-xl border-2 border-dashed border-line mb-8">
                    <div className="w-16 h-16 bg-highlight-soft text-highlight rounded-full flex items-center justify-center mx-auto mb-4">
                        <ImageIcon size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-foreground mb-1">Ready to Generate</h3>
                    <p className="text-muted">Click the generate button to create images with Nano Banana Pro.</p>
                </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
                <button
                    onClick={onBack}
                    className="px-6 py-3 text-secondary hover:text-foreground font-medium"
                >
                    Back
                </button>
                <button
                    onClick={handleContinue}
                    disabled={selectedImages.length === 0}
                    className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-lg font-medium hover:bg-brand-hover disabled:bg-line-strong disabled:cursor-not-allowed"
                >
                    Create Batch ({selectedImages.length}) <ChevronRight size={20} />
                </button>
            </div>
        </div>
    );
};

export default NanoBananaGenerationStep;

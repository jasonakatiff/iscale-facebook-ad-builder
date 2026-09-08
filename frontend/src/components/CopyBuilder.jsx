import React, { useState } from 'react';
import { useToast } from '../context/ToastContext';

const CopyBuilder = ({ data, setData, onNext, brandVoice, activeBrand }) => {
    const { showWarning } = useToast();
    const [isGenerating, setIsGenerating] = useState(false);
    const [lastGenerated, setLastGenerated] = useState(0);
    const COOLDOWN_MS = 3000; // 3 seconds

    const updateData = (key, value) => {
        setData(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const handleGenerateCopy = async () => {
        const now = Date.now();
        if (now - lastGenerated < COOLDOWN_MS) {
            showWarning(`Please wait ${Math.ceil((COOLDOWN_MS - (now - lastGenerated)) / 1000)} seconds before generating again`);
            return;
        }

        setLastGenerated(now);
        setIsGenerating(true);
        // Simulate API call with brand voice context
        setTimeout(() => {
            const voicePrefix = brandVoice ? `[${brandVoice} Voice] ` : '';
            setData(prev => ({
                ...prev,
                generatedCopy: `${voicePrefix}Experience the magic of ${prev.productName || 'our product'}. Designed for ${prev.targetAudience || 'you'}.`,
                headline: `${voicePrefix}The Ultimate Solution`,
                cta: 'Shop Now'
            }));
            setIsGenerating(false);
        }, 1500);
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-foreground">Step 1: Create Ad Copy</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-secondary mb-2">Product Name</label>
                    {activeBrand?.products?.length > 0 ? (
                        <select
                            className="w-full p-3 border border-line-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            value={data.productName}
                            onChange={(e) => updateData('productName', e.target.value)}
                        >
                            <option value="">Select a product...</option>
                            {activeBrand.products.map(product => (
                                <option key={product.id} value={product.name}>
                                    {product.name}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <input
                            type="text"
                            className="w-full p-3 border border-line-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="e.g., Glow Serum"
                            value={data.productName}
                            onChange={(e) => updateData('productName', e.target.value)}
                        />
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-secondary mb-2">Target Audience</label>
                    <input
                        type="text"
                        className="w-full p-3 border border-line-strong rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="e.g., Skincare enthusiasts"
                        value={data.targetAudience}
                        onChange={(e) => updateData('targetAudience', e.target.value)}
                    />
                </div>
            </div>

            <div>
                <button
                    onClick={handleGenerateCopy}
                    disabled={isGenerating || !data.productName}
                    className={`w-full py-3 rounded-lg font-semibold text-white transition-all ${isGenerating || !data.productName
                        ? 'bg-brand opacity-50 cursor-not-allowed'
                        : 'bg-brand hover:bg-brand-hover'
                        }`}
                >
                    {isGenerating ? 'Generating Magic...' : 'Generate Copy with AI'}
                </button>
            </div>

            {data.generatedCopy && (
                <div className="bg-subtle p-4 rounded-lg border border-line animate-fade-in">
                    <label className="block text-sm font-medium text-secondary mb-2">Generated Copy</label>
                    <textarea
                        className="w-full p-3 border border-line-strong rounded-lg bg-panel"
                        rows="3"
                        value={data.generatedCopy}
                        onChange={(e) => updateData('generatedCopy', e.target.value)}
                    />
                </div>
            )}

            <div className="flex justify-end pt-4">
                <button
                    onClick={onNext}
                    disabled={!data.generatedCopy}
                    className={`px-8 py-3 rounded-lg font-semibold transition-colors ${!data.generatedCopy
                        ? 'bg-soft text-faint cursor-not-allowed'
                        : 'bg-brand text-white hover:bg-brand-hover'
                        }`}
                >
                    Next: Select Template
                </button>
            </div>
        </div>
    );
};

export default CopyBuilder;

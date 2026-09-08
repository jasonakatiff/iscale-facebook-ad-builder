import React, { useState, useEffect } from 'react';
import { ChevronRight, Loader, Sparkles, CheckCircle2 } from 'lucide-react';

const AnalyzeTemplatesStep = ({ selectedTemplate, onNext, onBack }) => {
    const [analyzing, setAnalyzing] = useState(true);
    const [analysis, setAnalysis] = useState(null);

    useEffect(() => {
        // Simulate analysis process
        const timer = setTimeout(() => {
            setAnalyzing(false);
            setAnalysis({
                style: selectedTemplate?.style || 'Modern',
                tone: 'Professional & Engaging',
                recommendations: [
                    'Use high-contrast imagery',
                    'Keep headline under 40 characters',
                    'Focus on value proposition'
                ]
            });
        }, 2000);

        return () => clearTimeout(timer);
    }, [selectedTemplate]);

    return (
        <div>
            <h2 className="text-2xl font-bold mb-2">Analyze Template</h2>
            <p className="text-secondary mb-8">Analyzing the selected template to optimize your content.</p>

            <div className="bg-panel border border-line rounded-xl p-8 mb-8">
                <div className="flex items-center gap-6 mb-8">
                    {/* Template Preview */}
                    <div className="w-32 h-32 bg-inset rounded-lg flex items-center justify-center flex-shrink-0 border border-line">
                        {selectedTemplate?.thumbnail ? (
                            <img src={selectedTemplate.thumbnail} alt={selectedTemplate.name} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                            <span className="text-faint text-xs text-center px-2">{selectedTemplate?.name || 'Template'}</span>
                        )}
                    </div>

                    <div className="flex-1">
                        <h3 className="text-xl font-bold text-foreground mb-2">{selectedTemplate?.name}</h3>
                        <p className="text-muted text-sm">{selectedTemplate?.description || 'No description available.'}</p>
                    </div>
                </div>

                {analyzing ? (
                    <div className="flex flex-col items-center justify-center py-12 bg-info-soft rounded-xl">
                        <Loader className="animate-spin text-info mb-4" size={32} />
                        <p className="text-info font-medium animate-pulse">Analyzing template structure and style...</p>
                    </div>
                ) : (
                    <div className="bg-success-soft border border-success-line rounded-xl p-6 animate-in fade-in duration-500">
                        <div className="flex items-center gap-2 mb-4">
                            <Sparkles className="text-success" size={24} />
                            <h4 className="font-bold text-success text-lg">Analysis Complete</h4>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h5 className="font-semibold text-success mb-2">Style Profile</h5>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm border-b border-success-line pb-1">
                                        <span className="text-success">Visual Style</span>
                                        <span className="font-medium text-success">{analysis.style}</span>
                                    </div>
                                    <div className="flex justify-between text-sm border-b border-success-line pb-1">
                                        <span className="text-success">Recommended Tone</span>
                                        <span className="font-medium text-success">{analysis.tone}</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h5 className="font-semibold text-success mb-2">Key Recommendations</h5>
                                <ul className="space-y-2">
                                    {analysis.recommendations.map((rec, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-success">
                                            <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
                                            {rec}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between">
                <button
                    onClick={onBack}
                    className="px-6 py-3 text-secondary hover:text-foreground font-medium"
                >
                    Back
                </button>
                <button
                    onClick={onNext}
                    disabled={analyzing}
                    className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-lg font-medium hover:bg-brand-hover disabled:bg-line-strong disabled:cursor-not-allowed"
                >
                    Next Step <ChevronRight size={20} />
                </button>
            </div>
        </div>
    );
};

export default AnalyzeTemplatesStep;

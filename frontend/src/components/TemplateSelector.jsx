import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Check, LayoutGrid, List } from 'lucide-react';
import templates from '../data/templates.json';

const TemplateSelector = ({ selectedTemplate, onSelect, onNext, onBack }) => {
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Choose a Template</h2>
                <div className="flex bg-inset p-1 rounded-lg">
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-panel shadow-sm text-info' : 'text-muted hover:text-secondary'}`}
                    >
                        <List size={20} />
                    </button>
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-panel shadow-sm text-info' : 'text-muted hover:text-secondary'}`}
                    >
                        <LayoutGrid size={20} />
                    </button>
                </div>
            </div>

            {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    {templates.map((template) => (
                        <div
                            key={template.id}
                            onClick={() => onSelect(template)}
                            className={`cursor-pointer rounded-xl border-2 overflow-hidden transition-all hover:shadow-md ${selectedTemplate?.id === template.id
                                ? 'border-blue-600 ring-2 ring-blue-100'
                                : 'border-line hover:border-info-line'
                                }`}
                        >
                            <div className="h-40 bg-inset relative">
                                <img
                                    src={template.thumbnail}
                                    alt={template.name}
                                    className="w-full h-full object-cover"
                                />
                                {selectedTemplate?.id === template.id && (
                                    <div className="absolute top-2 right-2 bg-blue-600 text-white p-1 rounded-full">
                                        <Check size={16} />
                                    </div>
                                )}
                            </div>
                            <div className="p-4">
                                <h3 className="font-bold text-foreground mb-1">{template.name}</h3>
                                <p className="text-sm text-muted mb-3">{template.description}</p>
                                <div className="flex flex-wrap gap-2">
                                    {template.tags.map(tag => (
                                        <span key={tag} className="text-xs bg-inset text-secondary px-2 py-1 rounded-full">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-3 mb-8">
                    {templates.map((template) => (
                        <div
                            key={template.id}
                            onClick={() => onSelect(template)}
                            className={`cursor-pointer p-3 rounded-xl border-2 transition-all flex items-center gap-4 hover:shadow-sm ${selectedTemplate?.id === template.id
                                ? 'border-blue-600 bg-info-soft'
                                : 'border-line hover:border-info-line hover:bg-subtle'
                                }`}
                        >
                            <div className="w-24 h-16 bg-inset rounded-lg overflow-hidden flex-shrink-0">
                                <img
                                    src={template.thumbnail}
                                    alt={template.name}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-bold text-foreground">{template.name}</h3>
                                        <p className="text-sm text-muted line-clamp-1">{template.description}</p>
                                    </div>
                                    {selectedTemplate?.id === template.id && (
                                        <div className="bg-blue-600 text-white p-1 rounded-full">
                                            <Check size={16} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex justify-between mt-8">
                <button
                    onClick={onBack}
                    className="px-6 py-2 bg-soft text-secondary rounded-lg hover:bg-line-strong transition-colors"
                >
                    Back
                </button>
                <button
                    onClick={onNext}
                    disabled={!selectedTemplate}
                    className={`px-8 py-3 rounded-lg font-semibold transition-colors ${!selectedTemplate
                        ? 'bg-soft text-faint cursor-not-allowed'
                        : 'bg-brand text-white hover:bg-brand-hover'
                        }`}
                >
                    Next: Generate Ad
                </button>
            </div>
        </div>
    );
};

export default TemplateSelector;

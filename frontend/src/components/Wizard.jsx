import React, { useState, useEffect } from 'react';
import { ChevronRight, Check, Wand2, Layout, Image as ImageIcon, Briefcase, LayoutGrid, List, Search, BarChart2, Layers } from 'lucide-react';
import CopyBuilder from './CopyBuilder';
import TemplateSelector from './TemplateSelector';
import BrandOptionsStep from './BrandOptionsStep';
import AnalyzeTemplatesStep from './AnalyzeTemplatesStep';
import NanoBananaGenerationStep from './NanoBananaGenerationStep';
import BulkAdCreation from './BulkAdCreation';
import { useBrands } from '../context/BrandContext';
import { useCampaign } from '../context/CampaignContext';
import { useToast } from '../context/ToastContext';

const Wizard = () => {
    const { showSuccess } = useToast();
    const [step, setStep] = useState(1);
    const { brands, customerProfiles, activeBrand, setActiveBrand } = useBrands();
    const { setCreativeData } = useCampaign();
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
    const [expandedBrands, setExpandedBrands] = useState({}); // Track which brands are expanded

    // Wizard State
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [copyData, setCopyData] = useState({
        productName: '',
        targetAudience: '',
        generatedCopy: '',
        headline: '',
        cta: ''
    });

    // Auto-fill from product if selected
    useEffect(() => {
        if (selectedProduct) {
            setCopyData(prev => ({
                ...prev,
                productName: selectedProduct.name,
                // You could also map description to something if needed
            }));
        }
    }, [selectedProduct]);

    const handleNext = () => {
        setStep(step + 1);
    };

    const handleBack = () => {
        setStep(step - 1);
    };

    const handleImagesGenerated = (images) => {
        // Update global creative data for BulkAdCreation
        setCreativeData(prev => ({
            ...prev,
            creatives: images.map(img => ({
                id: img.id,
                file: null, // No file object for generated images yet
                previewUrl: img.previewUrl,
                imageUrl: img.url,
                name: img.name
            })),
            headlines: [copyData.headline],
            bodies: [copyData.generatedCopy],
            cta: copyData.cta || 'LEARN_MORE',
            creativeName: `${activeBrand.name} - ${selectedProduct.name} Batch`
        }));
    };

    const steps = [
        { id: 1, name: 'Select Brand', icon: Briefcase },
        { id: 2, name: 'Brand Options', icon: Search },
        { id: 3, name: 'Choose Template', icon: Layout },
        { id: 4, name: 'Analyze', icon: BarChart2 },
        { id: 5, name: 'Copy Builder', icon: Wand2 },
        { id: 6, name: 'Generate', icon: ImageIcon },
        { id: 7, name: 'Create Batch', icon: Layers },
    ];

    return (
        <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-foreground">Video Ad Builder</h1>
                <p className="text-secondary mt-1">Create video ads with AI-generated content</p>
            </div>

            {/* Progress Bar */}
            <div className="mb-10">
                <div className="grid grid-cols-4 gap-y-4 sm:flex items-center justify-between relative">
                    <div className="hidden sm:block absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-px bg-line -z-10"></div>
                    {steps.map((s) => {
                        const Icon = s.icon;
                        const isActive = s.id === step;
                        const isCompleted = s.id < step;

                        return (
                            <div key={s.id} className="flex flex-col items-center bg-subtle px-2">
                                <div
                                    className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 transition-colors ${isActive ? 'bg-brand text-white' :
                                        isCompleted ? 'bg-green-500 text-white' : 'bg-soft text-muted'
                                        }`}
                                >
                                    {isCompleted ? <Check size={20} /> : <Icon size={20} />}
                                </div>
                                <span className={`text-xs font-medium hidden md:block ${isActive ? 'text-brand-ink' : 'text-muted'}`}>
                                    {s.name}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Step Content */}
            <div className="bg-panel rounded-2xl shadow-sm border border-line p-8 min-h-[500px]">

                {/* Step 1: Brand Selection */}
                {step === 1 && (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold">Select a Brand</h2>
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

                        {brands.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-muted mb-4">No brands found. Create a brand to get started.</p>
                                <a href="/brands" className="text-info font-medium hover:underline">Go to Brand Management</a>
                            </div>
                        ) : (
                            <>
                                {viewMode === 'grid' ? (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {brands.map(brand => (
                                            <div
                                                key={brand.id}
                                                onClick={() => setActiveBrand(brand)}
                                                className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${activeBrand?.id === brand.id
                                                    ? 'border-blue-600 bg-info-soft'
                                                    : 'border-line hover:border-info-line'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3 mb-3">
                                                    <div
                                                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                                                        style={{ backgroundColor: brand.colors.primary }}
                                                    >
                                                        {brand.name.charAt(0)}
                                                    </div>
                                                    <span className="font-bold text-foreground">{brand.name}</span>
                                                </div>
                                                <div className="text-xs text-muted">
                                                    {brand.products.length} Products • {brand.voice || 'No voice set'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {brands.map(brand => {
                                            const brandProfiles = customerProfiles.filter(p =>
                                                brand.profileIds?.includes(p.id)
                                            );
                                            const isExpanded = expandedBrands[brand.id];

                                            return (
                                                <div key={brand.id} className="border-2 rounded-xl overflow-hidden transition-all">
                                                    {/* Brand Row */}
                                                    <div
                                                        onClick={() => {
                                                            setActiveBrand(brand);
                                                            setExpandedBrands(prev => ({
                                                                ...prev,
                                                                [brand.id]: !prev[brand.id]
                                                            }));
                                                        }}
                                                        className={`cursor-pointer p-4 transition-all flex items-center justify-between ${activeBrand?.id === brand.id
                                                            ? 'border-blue-600 bg-info-soft'
                                                            : 'border-line hover:border-info-line hover:bg-subtle'
                                                            }`}
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div
                                                                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                                                                style={{ backgroundColor: brand.colors.primary }}
                                                            >
                                                                {brand.name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <span className="font-bold text-foreground block">{brand.name}</span>
                                                                <span className="text-xs text-muted">
                                                                    {brand.products.length} Products • {brandProfiles.length} Profiles
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex gap-1">
                                                                <div className="w-4 h-4 rounded" style={{ backgroundColor: brand.colors.primary }}></div>
                                                                <div className="w-4 h-4 rounded" style={{ backgroundColor: brand.colors.secondary }}></div>
                                                            </div>
                                                            {activeBrand?.id === brand.id && <Check className="text-info" size={20} />}
                                                            <ChevronRight
                                                                className={`text-faint transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                                size={20}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Customer Profiles (Collapsible) */}
                                                    {isExpanded && brandProfiles.length > 0 && (
                                                        <div className="bg-subtle border-t border-line p-4">
                                                            <h4 className="text-xs font-semibold text-muted uppercase mb-2">Customer Profiles</h4>
                                                            <div className="space-y-2">
                                                                {brandProfiles.map(profile => (
                                                                    <div
                                                                        key={profile.id}
                                                                        className="bg-panel p-3 rounded-lg border border-line text-sm"
                                                                    >
                                                                        <div className="font-medium text-foreground mb-1">{profile.name}</div>
                                                                        {profile.demographics && (
                                                                            <div className="text-xs text-secondary mb-1">
                                                                                {profile.demographics}
                                                                            </div>
                                                                        )}
                                                                        {profile.pain_points && (
                                                                            <div className="text-xs text-muted">
                                                                                Pain Points: {profile.pain_points}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )}

                        <div className="mt-8 flex justify-end">
                            <button
                                onClick={handleNext}
                                disabled={!activeBrand}
                                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${activeBrand
                                    ? 'bg-brand text-white hover:bg-brand-hover'
                                    : 'bg-soft text-faint cursor-not-allowed'
                                    }`}
                            >
                                Next Step <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Brand Options */}
                {step === 2 && (
                    <BrandOptionsStep
                        activeBrand={activeBrand}
                        selectedProduct={selectedProduct}
                        onSelectProduct={setSelectedProduct}
                        onNext={handleNext}
                        onBack={handleBack}
                    />
                )}

                {/* Step 3: Template Selection */}
                {step === 3 && (
                    <TemplateSelector
                        selectedTemplate={selectedTemplate}
                        onSelect={setSelectedTemplate}
                        onNext={handleNext}
                        onBack={handleBack}
                    />
                )}

                {/* Step 4: Analyze Templates */}
                {step === 4 && (
                    <AnalyzeTemplatesStep
                        selectedTemplate={selectedTemplate}
                        onNext={handleNext}
                        onBack={handleBack}
                    />
                )}

                {/* Step 5: Copy Builder */}
                {step === 5 && (
                    <CopyBuilder
                        data={copyData}
                        setData={setCopyData}
                        onNext={handleNext}
                        brandVoice={activeBrand?.voice}
                        activeBrand={activeBrand}
                    />
                )}

                {/* Step 6: Generate Images (Nano Banana Pro) */}
                {step === 6 && (
                    <NanoBananaGenerationStep
                        copyData={copyData}
                        selectedTemplate={selectedTemplate}
                        onImagesGenerated={handleImagesGenerated}
                        onNext={handleNext}
                        onBack={handleBack}
                    />
                )}

                {/* Step 7: Create Batch */}
                {step === 7 && (
                    <BulkAdCreation
                        onNext={() => showSuccess('Campaign Created Successfully!')}
                        onBack={handleBack}
                    />
                )}
            </div>
        </div>
    );
};

export default Wizard;

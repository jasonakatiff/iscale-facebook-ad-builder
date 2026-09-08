import React, { useState } from 'react';
import { Video, Briefcase, Package, Users, Check, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useBrands } from '../context/BrandContext';
import BrandSelectionStep from '../components/steps/BrandSelectionStep';
import ProductSelectionStep from '../components/steps/ProductSelectionStep';
import ProfileSelectionStep from '../components/steps/ProfileSelectionStep';

export default function VideoAds() {
    const { brands, customerProfiles } = useBrands();
    const [currentStep, setCurrentStep] = useState(1);
    const [wizardData, setWizardData] = useState({
        brand: null,
        product: null,
        profile: null,
        useProductShots: false
    });

    const steps = [
        { id: 1, name: 'Brand', icon: Briefcase },
        { id: 2, name: 'Product', icon: Package },
        { id: 3, name: 'Profile', icon: Users },
        { id: 4, name: 'Video Style', icon: Video },
        { id: 5, name: 'Generate', icon: Sparkles }
    ];

    const updateData = (field, value) => {
        setWizardData(prev => ({ ...prev, [field]: value }));
    };

    const isStepComplete = (stepId) => {
        switch (stepId) {
            case 1: return wizardData.brand !== null;
            case 2: return wizardData.product !== null;
            case 3: return wizardData.profile !== null;
            default: return true;
        }
    };

    const canProceed = () => isStepComplete(currentStep);

    const nextStep = () => {
        if (currentStep < steps.length) {
            setCurrentStep(currentStep + 1);
        }
    };

    const prevStep = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleStepClick = (stepId) => {
        if (stepId < currentStep) {
            setCurrentStep(stepId);
            return;
        }
        let canNavigate = true;
        for (let i = 1; i < stepId; i++) {
            if (!isStepComplete(i)) {
                canNavigate = false;
                break;
            }
        }
        if (canNavigate) {
            setCurrentStep(stepId);
        }
    };

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                    <Video size={32} className="text-brand-ink" />
                    Create Video Ads
                </h1>
                <p className="text-secondary mt-1">Generate engaging video ads from your product assets</p>
            </div>

            {/* Progress Steps */}
            <div className="mb-8 bg-panel rounded-xl shadow-sm border border-line p-6">
                <div className="grid grid-cols-3 gap-y-4 sm:flex items-center justify-between relative">
                    <div className="hidden sm:block absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-px bg-line -z-10"></div>
                    {steps.map((step) => {
                        const Icon = step.icon;
                        const isActive = step.id === currentStep;
                        const isCompleted = step.id < currentStep;

                        let isClickable = true;
                        for (let i = 1; i < step.id; i++) {
                            if (!isStepComplete(i)) {
                                isClickable = false;
                                break;
                            }
                        }

                        return (
                            <div
                                key={step.id}
                                className={`flex flex-col items-center bg-panel px-2 ${isClickable ? 'cursor-pointer group' : 'cursor-not-allowed opacity-60'}`}
                                onClick={() => isClickable && handleStepClick(step.id)}
                            >
                                <div
                                    className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 transition-all ${isActive ? 'bg-brand text-white ' :
                                        isCompleted ? 'bg-green-500 text-white group-hover:bg-green-600' :
                                            'bg-soft text-muted group-hover:bg-line-strong'
                                        }`}
                                >
                                    {isCompleted ? <Check size={20} /> : <Icon size={20} />}
                                </div>
                                <span className={`text-xs font-medium transition-colors ${isActive ? 'text-brand-ink' :
                                    isClickable ? 'text-muted group-hover:text-secondary' : 'text-faint'
                                    }`}>
                                    {step.name}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Step Content */}
            <div className="bg-panel rounded-xl shadow-sm border border-line p-8 min-h-[500px] relative">
                {/* Step 1: Brand Selection */}
                {currentStep === 1 && (
                    <BrandSelectionStep
                        brands={brands}
                        selectedBrand={wizardData.brand}
                        onSelect={(brand) => {
                            updateData('brand', brand);
                            nextStep();
                        }}
                    />
                )}

                {/* Step 2: Product Selection */}
                {currentStep === 2 && (
                    <ProductSelectionStep
                        products={wizardData.brand?.products || []}
                        selectedProduct={wizardData.product}
                        useProductShots={wizardData.useProductShots}
                        onSelect={(product) => {
                            updateData('product', product);
                            updateData('useProductShots', false);
                            nextStep();
                        }}
                        onToggleProductShots={(use) => updateData('useProductShots', use)}
                    />
                )}

                {/* Step 3: Profile Selection */}
                {currentStep === 3 && (
                    <ProfileSelectionStep
                        profiles={customerProfiles.filter(p => wizardData.brand?.profileIds?.includes(p.id))}
                        selectedProfile={wizardData.profile}
                        onSelect={(profile) => {
                            updateData('profile', profile);
                            nextStep();
                        }}
                    />
                )}

                {/* Step 4: Video Style (Placeholder) */}
                {currentStep === 4 && (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 bg-brand-soft rounded-full flex items-center justify-center mx-auto mb-6">
                            <Video className="text-brand-ink" size={32} />
                        </div>
                        <h3 className="text-xl font-bold text-foreground mb-2">Select Video Style</h3>
                        <p className="text-secondary mb-6">Video templates coming soon!</p>
                    </div>
                )}

                {/* Step 5: Generate (Placeholder) */}
                {currentStep === 5 && (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 bg-brand-soft rounded-full flex items-center justify-center mx-auto mb-6">
                            <Sparkles className="text-brand-ink" size={32} />
                        </div>
                        <h3 className="text-xl font-bold text-foreground mb-2">Generate Video</h3>
                        <p className="text-secondary mb-6">Video generation capabilities coming soon!</p>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="mt-6 flex items-center justify-between">
                <button
                    onClick={prevStep}
                    disabled={currentStep === 1}
                    className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${currentStep === 1
                        ? 'bg-inset text-faint cursor-not-allowed'
                        : 'bg-inset text-secondary hover:bg-soft'
                        }`}
                >
                    <ChevronLeft size={20} />
                    Back
                </button>

                <button
                    onClick={nextStep}
                    disabled={!canProceed() || currentStep >= steps.length}
                    className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-lg hover:bg-brand-hover font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    Continue
                    <ChevronRight size={20} />
                </button>
            </div>
        </div>
    );
}

import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Check, Briefcase, Package, Users, Image, Hash, FileText, Sparkles, Download, ChevronDown, ChevronUp, Settings, CheckCircle2, ArrowRight } from 'lucide-react';
import { useBrands } from '../context/BrandContext';
import ImageTemplateSelector from '../components/ImageTemplateSelector';
import BrandSelectionStep from '../components/steps/BrandSelectionStep';
import ProductSelectionStep from '../components/steps/ProductSelectionStep';
import ProfileSelectionStep from '../components/steps/ProfileSelectionStep';
import StyleSelector from '../components/StyleSelector';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export default function ImageAds() {
    const { brands, customerProfiles } = useBrands();
    const { showError } = useToast();
    const { authFetch } = useAuth();
    const [currentStep, setCurrentStep] = useState(1);
    const [generating, setGenerating] = useState(false);
    const [generatedCopy, setGeneratedCopy] = useState(null);
    const [generatedImages, setGeneratedImages] = useState([]);
    const [selectedCopy, setSelectedCopy] = useState(null);
    const [customImagePrompt, setCustomImagePrompt] = useState('');
    const [templateMode, setTemplateMode] = useState('style'); // 'style', 'template', or 'custom'
    const [step4CustomPrompt, setStep4CustomPrompt] = useState('');

    // Load saved campaign details from localStorage on mount
    const [wizardData, setWizardData] = useState(() => {
        const savedCampaignDetails = localStorage.getItem('imageAds_campaignDetails');
        const defaultCampaignDetails = {
            offer: '',
            urgency: '',
            messaging: ''
        };

        return {
            brand: null,
            product: null,
            profile: null,
            template: null,
            variationCount: 3,
            imageSizes: [{
                name: 'Square (Feed/Carousel)',
                width: 1080,
                height: 1080,
                aspectRatio: '1:1'
            }],
            resolution: '1K',
            campaignDetails: savedCampaignDetails
                ? JSON.parse(savedCampaignDetails)
                : defaultCampaignDetails,
            model: 'nano-banana-pro',
            useProductShots: false
        };
    });

    // Save campaign details to localStorage whenever they change
    useEffect(() => {
        if (wizardData.campaignDetails) {
            localStorage.setItem('imageAds_campaignDetails', JSON.stringify(wizardData.campaignDetails));
        }
    }, [wizardData.campaignDetails]);

    const steps = [
        { id: 1, name: 'Brand', icon: Briefcase },
        { id: 2, name: 'Product', icon: Package },
        { id: 3, name: 'Profile', icon: Users },
        { id: 4, name: 'Template', icon: Image },
        { id: 5, name: 'Variations', icon: Hash },
        { id: 6, name: 'Size', icon: Image },
        { id: 7, name: 'Campaign', icon: FileText },
        { id: 8, name: 'Review', icon: Check }
    ];

    const updateData = (field, value) => {
        setWizardData(prev => ({ ...prev, [field]: value }));
    };

    const updateCampaignDetails = (field, value) => {
        setWizardData(prev => ({
            ...prev,
            campaignDetails: { ...prev.campaignDetails, [field]: value }
        }));
    };

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

    const isStepComplete = (stepId) => {
        switch (stepId) {
            case 1: return wizardData.brand !== null;
            case 2: return wizardData.product !== null;
            case 3: return wizardData.profile !== null;
            case 4: {
                if (wizardData.template?.type === 'custom') return !!step4CustomPrompt.trim();
                return wizardData.template !== null;
            }
            case 5: return wizardData.variationCount >= 1 && wizardData.variationCount <= 10;
            case 6: return wizardData.imageSizes && wizardData.imageSizes.length > 0;
            case 7: return wizardData.campaignDetails.offer && wizardData.campaignDetails.messaging;
            default: return true;
        }
    };

    const canProceed = () => isStepComplete(currentStep);

    const handleStepClick = (stepId) => {
        // Always allow going back
        if (stepId < currentStep) {
            setCurrentStep(stepId);
            return;
        }

        // For going forward, check if all previous steps are complete
        // We check from step 1 up to stepId - 1
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

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const response = await authFetch(`${API_URL}/copy-generation/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(wizardData)
            });

            if (!response.ok) {
                throw new Error('Copy generation failed');
            }

            const data = await response.json();
            setGeneratedCopy(data);
            // Move to copy selection step
            setCurrentStep(9);
        } catch (error) {
            console.error('Copy generation error:', error);
            showError('Failed to generate copy. Please try again.');
        } finally {
            setGenerating(false);
        }
    };

    const handleImageGeneration = async (copy) => {
        setSelectedCopy(copy);
        setGenerating(true);
        try {
            const response = await authFetch(`${API_URL}/generated-ads/generate-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template: wizardData.template,
                    brand: wizardData.brand,
                    product: wizardData.product,
                    copy: copy,
                    count: wizardData.variationCount,
                    imageSizes: wizardData.imageSizes,
                    resolution: wizardData.resolution,
                    model: wizardData.model,
                    productShots: wizardData.useProductShots ? wizardData.product?.product_shots : [],
                    useProductImage: wizardData.useProductShots,
                    customPrompt: wizardData.template?.type === 'custom'
                        ? wizardData.template.customPrompt
                        : customImagePrompt
                })
            });

            if (!response.ok) {
                throw new Error('Image generation failed');
            }

            const data = await response.json();
            console.log('📸 Image generation response:', data);

            // Generate a unique bundle ID for this set of images
            const bundleId = `bundle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Add bundle ID to images
            const imagesWithBundle = (data.images || []).map(img => ({
                ...img,
                adBundleId: bundleId
            }));

            setGeneratedImages(imagesWithBundle);

            // Save generated ads to database
            try {
                const adsToSave = imagesWithBundle.map(img => ({
                    id: `ga_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    brandId: wizardData.brand?.id,
                    productId: wizardData.product?.id,
                    templateId: wizardData.template?.id,
                    imageUrl: img.url,
                    headline: copy.headline,
                    body: copy.body,
                    cta: copy.cta,
                    sizeName: img.size,
                    dimensions: img.dimensions,
                    prompt: img.prompt,
                    adBundleId: img.adBundleId
                }));

                const saveResponse = await authFetch(`${API_URL}/generated-ads/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ads: adsToSave })
                });

                if (!saveResponse.ok) {
                    throw new Error(`Batch save failed: ${saveResponse.statusText}`);
                }

                console.log('✅ Saved generated ads to database with bundle ID:', bundleId);
            } catch (saveError) {
                console.error('Failed to save ads to database:', saveError);
                // Don't fail the whole operation if saving fails
            }

            setCurrentStep(10); // Move to image result step
        } catch (error) {
            console.error('Image generation error:', error);
            showError('Failed to generate images. Please try again.');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                    <Image size={32} className="text-amber-600" />
                    Create Image Ads
                </h1>
                <p className="text-gray-600 mt-1">Generate AI-powered ads using winning templates</p>
            </div>

            {/* Progress Steps */}
            <div className="mb-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between relative">
                    <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-gray-200 -z-10"></div>
                    {steps.map((step, index) => {
                        const Icon = step.icon;
                        const isActive = step.id === currentStep;
                        const isCompleted = step.id < currentStep;

                        // Check if this step is clickable (all previous steps are complete)
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
                                className={`flex flex-col items-center bg-white px-2 ${isClickable ? 'cursor-pointer group' : 'cursor-not-allowed opacity-60'}`}
                                onClick={() => isClickable && handleStepClick(step.id)}
                            >
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-all ${isActive ? 'bg-amber-600 text-white scale-110 shadow-md' :
                                        isCompleted ? 'bg-green-500 text-white group-hover:bg-green-600' :
                                            'bg-gray-200 text-gray-500 group-hover:bg-gray-300'
                                        }`}
                                >
                                    {isCompleted ? <Check size={20} /> : <Icon size={20} />}
                                </div>
                                <span className={`text-xs font-medium transition-colors ${isActive ? 'text-amber-600' :
                                    isClickable ? 'text-gray-500 group-hover:text-gray-700' : 'text-gray-400'
                                    }`}>
                                    {step.name}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Step Content */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 min-h-[500px] relative">
                {/* Loading Overlay */}
                {generating && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center rounded-xl">
                        <div className="w-16 h-16 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin mb-4"></div>
                        <h3 className="text-xl font-bold text-gray-900">
                            {currentStep === 9 ? 'Generating High-Converting Images...' : 'Generating Ad Copy...'}
                        </h3>
                        <p className="text-gray-500 mt-2">Using AI to create your perfect ads</p>
                    </div>
                )}

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
                            // Reset product shots preference when changing product
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

                {/* Step 4: Template/Style Selection */}
                {currentStep === 4 && (
                    <div>
                        <h3 className="text-xl font-bold mb-4">Select a Template or Style</h3>
                        <p className="text-gray-600 mb-6">
                            Choose a proven ad style archetype or browse existing templates
                        </p>

                        {/* Mode Toggle */}
                        <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
                            <button
                                onClick={() => setTemplateMode('style')}
                                className={`px-6 py-2 rounded-md font-medium transition-all ${templateMode === 'style'
                                    ? 'bg-white text-amber-600 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Sparkles size={18} />
                                    Browse Styles
                                </div>
                            </button>
                            <button
                                onClick={() => setTemplateMode('template')}
                                className={`px-6 py-2 rounded-md font-medium transition-all ${templateMode === 'template'
                                    ? 'bg-white text-amber-600 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <Image size={18} />
                                    Browse Templates
                                </div>
                            </button>
                            <button
                                onClick={() => setTemplateMode('custom')}
                                className={`px-6 py-2 rounded-md font-medium transition-all ${templateMode === 'custom'
                                    ? 'bg-white text-amber-600 shadow-sm'
                                    : 'text-gray-600 hover:text-gray-900'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <FileText size={18} />
                                    Custom Prompt
                                </div>
                            </button>
                        </div>

                        {/* Conditional Rendering */}
                        {templateMode === 'style' ? (
                            <StyleSelector
                                onSelect={(style) => {
                                    updateData('template', {
                                        type: 'style',
                                        ...style
                                    });
                                    nextStep();
                                }}
                            />
                        ) : templateMode === 'template' ? (
                            <ImageTemplateSelector
                                onSelect={(template) => {
                                    updateData('template', {
                                        type: 'template',
                                        ...template
                                    });
                                    nextStep();
                                }}
                                onClose={() => { }}
                                embedded={true}
                            />
                        ) : (
                            <div className="max-w-2xl">
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                                    <p className="text-sm text-amber-800">
                                        <strong>Custom Prompt Mode:</strong> Write your own image generation prompt directly.
                                        Brand, product, and campaign details will still inform copy generation.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Image Generation Prompt *
                                    </label>
                                    <textarea
                                        value={step4CustomPrompt}
                                        onChange={(e) => {
                                            setStep4CustomPrompt(e.target.value);
                                            updateData('template', {
                                                type: 'custom',
                                                name: 'Custom Prompt',
                                                customPrompt: e.target.value,
                                            });
                                        }}
                                        placeholder="Describe the image you want to generate. E.g.: 'A luxurious skincare product on a marble surface with soft golden lighting, surrounded by fresh botanicals, premium advertising photography, 4k quality'"
                                        rows={6}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono text-sm"
                                    />
                                    <div className="flex justify-between mt-2">
                                        <p className="text-xs text-gray-500">
                                            Be descriptive about lighting, composition, mood, and style.
                                        </p>
                                        <span className="text-xs text-gray-400">
                                            {step4CustomPrompt.length} chars
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-6">
                                    <p className="text-sm font-medium text-gray-700 mb-3">Example Prompts:</p>
                                    <div className="space-y-2">
                                        {[
                                            'Professional flat lay product photography on marble surface, soft diffused lighting, minimalist style, luxury aesthetic, 4k',
                                            'Split-screen before and after transformation, clean white background, bright natural lighting, testimonial style ad',
                                            'Close-up macro shot of product texture with dramatic side lighting, dark moody background, premium feel',
                                        ].map((example, i) => (
                                            <button
                                                key={i}
                                                onClick={() => {
                                                    setStep4CustomPrompt(example);
                                                    updateData('template', {
                                                        type: 'custom',
                                                        name: 'Custom Prompt',
                                                        customPrompt: example,
                                                    });
                                                }}
                                                className="block w-full text-left px-3 py-2 text-sm text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                                            >
                                                {example}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 5: Variation Count */}
                {currentStep === 5 && (
                    <VariationCountStep
                        count={wizardData.variationCount}
                        onChange={(count) => updateData('variationCount', count)}
                    />
                )}

                {/* Step 6: Image Size Selection */}
                {currentStep === 6 && (
                    <ImageSizeStep
                        selectedSizes={wizardData.imageSizes}
                        onSelect={(sizes) => updateData('imageSizes', sizes)}
                        resolution={wizardData.resolution}
                        onResolutionChange={(res) => updateData('resolution', res)}
                        model={wizardData.model}
                        onModelChange={(m) => updateData('model', m)}
                    />
                )}

                {/* Step 7: Campaign Details */}
                {currentStep === 7 && (
                    <CampaignDetailsStep
                        details={wizardData.campaignDetails}
                        onChange={updateCampaignDetails}
                    />
                )}

                {/* Step 8: Review */}
                {currentStep === 8 && (
                    <ReviewStep wizardData={wizardData} />
                )}

                {/* Step 9: Copy Selection (after generation) */}
                {currentStep === 9 && generatedCopy && (
                    <CopySelectionStep
                        generatedCopy={generatedCopy}
                        wizardData={wizardData}
                        onBack={() => setCurrentStep(8)}
                        onRegenerate={handleGenerate}
                        isRegenerating={generating}
                        onProceed={handleImageGeneration}
                        customImagePrompt={customImagePrompt}
                        setCustomImagePrompt={setCustomImagePrompt}
                        authFetch={authFetch}
                    />
                )}

                {/* Step 10: Image Generation Result */}
                {currentStep === 10 && (
                    generatedImages.length > 0 ? (
                        <ImageGenerationStep
                            generatedImages={generatedImages}
                            wizardData={wizardData}
                            selectedCopy={selectedCopy}
                            onBack={() => setCurrentStep(9)}
                            onRestart={() => window.location.reload()}
                        />
                    ) : (
                        <div className="text-center py-12">
                            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FileText size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Generation Error</h3>
                            <p className="text-gray-600 mb-6">Something went wrong displaying the generated images.</p>
                            <button
                                onClick={() => setCurrentStep(9)}
                                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition-colors"
                            >
                                Go Back
                            </button>
                        </div>
                    )
                )}
            </div>

            {/* Footer Actions */}
            {currentStep <= 8 && (
                <div className="mt-6 flex items-center justify-between">
                    <button
                        onClick={prevStep}
                        disabled={currentStep === 1}
                        className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${currentStep === 1
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        <ChevronLeft size={20} />
                        Back
                    </button>

                    {currentStep === 8 ? (
                        <button
                            onClick={handleGenerate}
                            disabled={!canProceed() || generating}
                            className="flex items-center gap-2 px-8 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Sparkles size={20} className={generating ? 'animate-spin' : ''} />
                            {generating ? 'Generating Magic...' : 'Generate Ad Copy'}
                        </button>
                    ) : (
                        <button
                            onClick={nextStep}
                            disabled={!canProceed()}
                            className="flex items-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Continue
                            <ChevronRight size={20} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// Step Components


function VariationCountStep({ count, onChange }) {
    return (
        <div>
            <h3 className="text-xl font-bold mb-4">How Many Variations?</h3>
            <p className="text-gray-600 mb-6">Choose how many ad variations to generate (1-10)</p>

            <div className="max-w-md mx-auto">
                <div className="flex items-center gap-4 mb-6">
                    <input
                        type="range"
                        min="1"
                        max="10"
                        value={count}
                        onChange={(e) => onChange(parseInt(e.target.value))}
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
                    />
                    <div className="w-16 h-16 rounded-full bg-amber-600 text-white flex items-center justify-center text-2xl font-bold">
                        {count}
                    </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-sm text-amber-800">
                        <strong>Tip:</strong> More variations give you more options to choose from, but will take longer to generate.
                    </p>
                </div>
            </div>
        </div>
    );
}

function ImageSizeStep({ selectedSizes = [], onSelect, resolution, onResolutionChange, model, onModelChange }) {
    const [showAdvanced, setShowAdvanced] = useState(false);

    const sizeOptions = [
        {
            name: 'Square (Feed/Carousel)',
            width: 1080,
            height: 1080,
            aspectRatio: '1:1',
            description: 'Perfect for Facebook Feed and Carousel ads',
            icon: '⬜',
            required: true // Square is always required
        },
        {
            name: 'Vertical (Feed)',
            width: 1080,
            height: 1350,
            aspectRatio: '4:5',
            description: 'Optimized for mobile Facebook Feed',
            icon: '📱',
            required: false
        },
        {
            name: 'Story',
            width: 1080,
            height: 1920,
            aspectRatio: '9:16',
            description: 'Full-screen Facebook and Instagram Stories',
            icon: '📲',
            required: false
        }
    ];

    const toggleSize = (size) => {
        // Prevent unselecting Square (required)
        if (size.required) {
            return;
        }

        const isSelected = selectedSizes.some(s => s.name === size.name);
        if (isSelected) {
            onSelect(selectedSizes.filter(s => s.name !== size.name));
        } else {
            if (selectedSizes.length < 3) {
                onSelect([...selectedSizes, size]);
            }
        }
    };

    return (
        <div>
            <h3 className="text-xl font-bold mb-4">Select Image Sizes & Quality</h3>
            <p className="text-gray-600 mb-2">Square is required. Select up to 2 additional sizes.</p>
            <p className="text-sm text-amber-600 font-medium mb-6">{selectedSizes.length} of 3 selected</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
                {sizeOptions.map((size) => {
                    const isSelected = selectedSizes.some(s => s.name === size.name);
                    const isDisabled = !isSelected && selectedSizes.length >= 3;
                    const isRequired = size.required;

                    return (
                        <div
                            key={size.name}
                            onClick={() => !isDisabled && toggleSize(size)}
                            className={`p-6 rounded-xl border-2 transition-all relative ${isRequired
                                ? 'border-amber-600 bg-amber-50 shadow-lg cursor-default'
                                : isSelected
                                    ? 'border-amber-600 bg-amber-50 shadow-lg cursor-pointer'
                                    : isDisabled
                                        ? 'border-gray-200 opacity-50 cursor-not-allowed'
                                        : 'border-gray-200 hover:border-amber-300 hover:shadow-md cursor-pointer'
                                }`}
                        >
                            {/* Required Badge or Checkbox */}
                            {isRequired ? (
                                <div className="absolute top-3 right-3 px-2 py-1 bg-amber-600 text-white text-xs font-bold rounded">
                                    REQUIRED
                                </div>
                            ) : (
                                <div className={`absolute top-3 right-3 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-amber-600 border-amber-600' : 'bg-white border-gray-400'
                                    }`}>
                                    {isSelected && <Check size={14} className="text-white" />}
                                </div>
                            )}

                            <div className="text-4xl mb-3 text-center">{size.icon}</div>
                            <h4 className="font-bold text-gray-900 mb-2 text-center">{size.name}</h4>
                            <p className="text-sm text-gray-600 mb-3 text-center">{size.description}</p>
                            <div className="bg-white rounded-lg p-3 border border-gray-200">
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                    <span>Dimensions:</span>
                                    <span className="font-medium text-gray-900">{size.width}×{size.height}</span>
                                </div>
                                <div className="flex justify-between text-xs text-gray-500">
                                    <span>Aspect Ratio:</span>
                                    <span className="font-medium text-gray-900">{size.aspectRatio}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Advanced Settings Accordion */}
            <div className="max-w-4xl mx-auto mb-8">
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-gray-600 font-medium hover:text-amber-600 transition-colors mb-4"
                >
                    <Settings size={18} />
                    <span>Advanced Settings (Quality & Model)</span>
                    {showAdvanced ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {showAdvanced && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-300">
                        {/* Resolution Selector */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Sparkles className="text-amber-600" size={20} />
                                <h4 className="font-bold text-gray-900">Image Quality</h4>
                            </div>
                            <p className="text-sm text-gray-600 mb-4">Select the resolution for your generated images</p>

                            <div className="grid grid-cols-3 gap-3">
                                {['1K', '2K', '4K'].map((res) => (
                                    <button
                                        key={res}
                                        onClick={() => onResolutionChange(res)}
                                        className={`p-4 rounded-lg border-2 transition-all ${resolution === res
                                            ? 'border-amber-600 bg-amber-50 text-amber-900'
                                            : 'border-gray-200 hover:border-amber-300 text-gray-700'
                                            }`}
                                    >
                                        <div className="font-bold text-lg">{res}</div>
                                        <div className="text-xs mt-1">
                                            {res === '1K' && 'Fast & Efficient'}
                                            {res === '2K' && 'Balanced Quality'}
                                            {res === '4K' && 'Highest Quality'}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <p className="text-sm text-amber-800">
                                    <strong>Tip:</strong> Higher resolutions produce better quality but take longer to generate. 1K is recommended for quick previews.
                                </p>
                            </div>
                        </div>

                        {/* Model Selection */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                            <h3 className="text-xl font-bold mb-4">Select AI Model (Primary Image)</h3>
                            <p className="text-gray-600 mb-4">Choose the model used to generate the initial square image. Resizing always uses Nano Banana Pro Edit.</p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div
                                    onClick={() => onModelChange('nano-banana-pro')}
                                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${model === 'nano-banana-pro'
                                        ? 'border-amber-600 bg-amber-50'
                                        : 'border-gray-200 hover:border-amber-300'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-bold text-lg">Nano Banana Pro</span>
                                        {model === 'nano-banana-pro' && <Check className="text-amber-600" size={20} />}
                                    </div>
                                    <p className="text-sm text-gray-600">Fast, efficient, and great for most styles. (Default)</p>
                                </div>

                                <div
                                    onClick={() => onModelChange('imagen4')}
                                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${model === 'imagen4'
                                        ? 'border-amber-600 bg-amber-50'
                                        : 'border-gray-200 hover:border-amber-300'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-bold text-lg">Google Imagen 3</span>
                                        {model === 'imagen4' && <Check className="text-amber-600" size={20} />}
                                    </div>
                                    <p className="text-sm text-gray-600">High fidelity, photorealistic quality. Slower generation time.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function CampaignDetailsStep({ details, onChange }) {
    const offerInputRef = React.useRef(null);

    React.useEffect(() => {
        if (offerInputRef.current) {
            offerInputRef.current.focus();
        }
    }, []);

    return (
        <div>
            <h3 className="text-xl font-bold mb-4">Campaign Details</h3>
            <p className="text-gray-600 mb-6">Provide details to customize your ad copy</p>

            <div className="max-w-2xl space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Offer / Promotion *
                    </label>
                    <input
                        ref={offerInputRef}
                        type="text"
                        value={details.offer}
                        onChange={(e) => onChange('offer', e.target.value)}
                        placeholder="e.g., 50% off Black Friday, Buy 2 Get 1 Free"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Urgency / Timing
                    </label>
                    <input
                        type="text"
                        value={details.urgency}
                        onChange={(e) => onChange('urgency', e.target.value)}
                        placeholder="e.g., Limited time, Ends tonight, While supplies last"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Key Messaging *
                    </label>
                    <textarea
                        value={details.messaging}
                        onChange={(e) => onChange('messaging', e.target.value)}
                        placeholder="e.g., Science-backed results, Trusted by 10,000+ customers, Clinically proven"
                        rows={3}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Visual Angle (Optional)
                    </label>
                    <input
                        type="text"
                        value={details.angle || ''}
                        onChange={(e) => onChange('angle', e.target.value)}
                        placeholder="e.g., Low angle hero shot, Top down flat lay, Close up macro"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        Overrides the template's default subject matter/angle.
                    </p>
                </div>
            </div>
        </div>
    );
}

function ReviewStep({ wizardData }) {
    const [showPrompt, setShowPrompt] = useState(false);
    const [customPrompt, setCustomPrompt] = useState('');

    // Build the default prompt
    const buildPrompt = () => {
        const count = wizardData.variationCount || 3;
        return `You are an expert ad copywriter. Generate ${count} variations of ad copy for a Facebook/Instagram ad campaign.

BRAND VOICE: ${wizardData.brand?.voice || 'Professional and friendly'}

PRODUCT: ${wizardData.product?.name}
${wizardData.product?.description ? `Description: ${wizardData.product.description}` : ''}

TARGET AUDIENCE:
- Demographics: ${wizardData.profile?.demographics || 'General audience'}
- Pain Points: ${wizardData.profile?.painPoints || wizardData.profile?.pain_points || 'Common challenges'}
- Goals: ${wizardData.profile?.goals || 'Desired outcomes'}

CAMPAIGN DETAILS:
- Offer: ${wizardData.campaignDetails.offer}
${wizardData.campaignDetails.urgency ? `- Urgency: ${wizardData.campaignDetails.urgency}` : ''}
- Key Messaging: ${wizardData.campaignDetails.messaging}

BODY COPY STYLES (vary across variations):
1. BULLET POINTS WITH EMOJIS: Use 2-4 bullet points with emojis at the start
   - Sometimes use the same emoji (e.g., ✓ ✓ ✓ or ⭐ ⭐ ⭐)
   - Sometimes use mixed emojis (e.g., 🎯 💪 ✨ 🚀)
   - Keep each bullet concise and benefit-focused
   Example: "✓ Save 50% today\n✓ Free shipping\n✓ 30-day guarantee"

2. EMOTIONAL STORYTELLING: Longer narrative that connects emotionally
   - Tell a relatable story or paint a vivid picture
   - Use emotional triggers and sensory details
   - Build desire and urgency through narrative
   - Can be 150-200 characters for story-driven ads
   Example: "Remember that feeling when everything just clicks? When you finally found the solution you've been searching for? That's what our customers experience every day..."

INSTRUCTIONS:
Generate ${count} distinct variations. Mix both body copy styles across variations. Each variation should:
1. Match the brand voice consistently
2. Address the audience's pain points and goals
3. Incorporate the campaign offer and key messaging
4. Be compelling, conversion-focused, and ad-appropriate
5. Keep headlines under 40 characters
6. For bullet-point style: Keep body under 125 characters
7. For storytelling style: Can extend to 200 characters
8. Keep CTAs under 20 characters

Return ONLY valid JSON in this exact format:
{
  "variations": [
    {
      "headline": "Short, punchy headline",
      "body": "Compelling body copy (bullets with emojis OR emotional story)",
      "cta": "Action CTA"
    }
  ]
}`;
    };

    // Initialize prompt when component mounts or data changes
    React.useEffect(() => {
        if (!customPrompt) {
            setCustomPrompt(buildPrompt());
        }
    }, [wizardData]);

    return (
        <div>
            <h3 className="text-xl font-bold mb-4">Review Your Selections</h3>
            <p className="text-gray-600 mb-6">Verify everything looks correct before generating</p>

            <div className="grid grid-cols-2 gap-3 max-w-3xl">
                <ReviewItem
                    label="Brand"
                    value={wizardData.brand?.name}
                    icon={Briefcase}
                />
                <ReviewItem
                    label="Product"
                    value={wizardData.product?.name}
                    icon={Package}
                />
                <ReviewItem
                    label="Target Audience"
                    value={wizardData.profile?.name}
                    icon={Users}
                />
                <ReviewItem
                    label="Template"
                    value={wizardData.template?.name || wizardData.template?.template_category}
                    icon={Image}
                />
                <ReviewItem
                    label="Variations"
                    value={`${wizardData.variationCount} ads`}
                    icon={Hash}
                />
                <ReviewItem
                    label="Image Sizes"
                    value={`${wizardData.imageSizes.length} size${wizardData.imageSizes.length > 1 ? 's' : ''}`}
                    icon={Image}
                />
                <ReviewItem
                    label="Offer"
                    value={wizardData.campaignDetails.offer}
                    icon={FileText}
                />
                <ReviewItem
                    label="Messaging"
                    value={wizardData.campaignDetails.messaging}
                    icon={FileText}
                />
            </div>

            {/* AI Prompt Accordion */}
            <div className="mt-6 max-w-3xl bg-white rounded-xl shadow-sm border border-gray-200">
                <button
                    onClick={() => setShowPrompt(!showPrompt)}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-xl"
                >
                    <div className="flex items-center gap-2">
                        <Sparkles className="text-amber-600" size={18} />
                        <h4 className="font-bold text-gray-900 text-sm">AI Copy Generation Prompt</h4>
                        <span className="text-xs text-gray-500">(Advanced)</span>
                    </div>
                    <ChevronRight
                        className={`text-gray-400 transition-transform ${showPrompt ? 'rotate-90' : ''}`}
                        size={18}
                    />
                </button>

                {showPrompt && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                        <p className="text-xs text-gray-600 mb-3 mt-3">Customize the AI prompt used to generate your ad copy:</p>
                        <textarea
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            className="w-full h-64 p-3 text-xs font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                            placeholder="Enter your custom prompt..."
                        />
                        <div className="flex items-center justify-between mt-2">
                            <button
                                onClick={() => setCustomPrompt(buildPrompt())}
                                className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                            >
                                Reset to Default
                            </button>
                            <span className="text-xs text-gray-500">{customPrompt.length} characters</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-6 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4 max-w-3xl">
                <p className="text-sm text-amber-900">
                    <strong>Ready to generate!</strong> Click "Generate Ad Copy" to create {wizardData.variationCount} AI-powered ad{wizardData.variationCount > 1 ? 's' : ''} based on your selections.
                </p>
            </div>
        </div>
    );
}

function ReviewItem({ label, value, icon: Icon }) {
    return (
        <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
            <Icon className="text-amber-600 flex-shrink-0" size={18} />
            <div className="min-w-0">
                <div className="text-xs font-medium text-gray-500">{label}</div>
                <div className="text-sm text-gray-900 truncate">{value}</div>
            </div>
        </div>
    );
}

function CopySelectionStep({ generatedCopy, wizardData, onBack, onRegenerate, isRegenerating, onProceed, customImagePrompt, setCustomImagePrompt, authFetch }) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [editedCopy, setEditedCopy] = useState(null);
    const [regeneratingField, setRegeneratingField] = useState(null);
    const [showPrompt, setShowPrompt] = useState(false);

    // Build comprehensive prompt (matching backend logic)
    const buildComprehensivePrompt = () => {
        // If custom prompt mode, use the custom prompt directly
        if (wizardData.template?.type === 'custom' && wizardData.template.customPrompt) {
            return wizardData.template.customPrompt;
        }

        const currentCopy = editedCopy || generatedCopy.variations[selectedIndex];

        // Extract all context
        const productName = wizardData.product?.name || 'Product';
        const productDesc = wizardData.product?.description || '';
        const brandName = wizardData.brand?.name || '';
        const brandVoice = wizardData.brand?.voice || 'Professional';
        const brandColor = wizardData.brand?.colors?.primary || '';

        // Get template metadata
        const templateType = wizardData.template?.type;
        let mood, lighting, composition, designStyle;

        if (templateType === 'style') {
            // Style archetype - has metadata fields
            mood = wizardData.template?.mood || 'Engaging';
            lighting = wizardData.template?.lighting || 'Professional lighting';
            composition = wizardData.template?.composition || 'Balanced';
            designStyle = wizardData.template?.design_style || 'Modern';
        } else {
            // Regular template
            mood = wizardData.template?.mood || 'Engaging';
            lighting = wizardData.template?.lighting || 'Professional lighting';
            composition = wizardData.template?.composition || 'Balanced';
            designStyle = wizardData.template?.design_style || 'Modern';
        }

        // Build comprehensive prompt with Markdown-style sections
        const sections = [];

        // 1. SUBJECT MATTER & COMPOSITION (Priority)
        const subjectSection = [];
        const userAngle = wizardData.campaignDetails?.angle;

        if (userAngle) {
            subjectSection.push(`**Subject Matter:** ${userAngle}`);
        } else {
            const template = wizardData.template;
            if (template) {
                // Combine template subject details
                const details = [];
                if (template.subject_matter) details.push(template.subject_matter);
                if (template.subject) details.push(template.subject);
                if (template.topHalf && template.bottomHalf) details.push(`Top: ${template.topHalf}, Bottom: ${template.bottomHalf}`);
                if (template.leftSide && template.rightSide) details.push(`Left: ${template.leftSide}, Right: ${template.rightSide}`);
                if (template.visualLayout) details.push(`Layout: ${template.visualLayout}`);

                if (details.length > 0) subjectSection.push(`**Subject Matter:** ${details.join('. ')}`);

                // Visual Elements
                const visualElements = [];
                if (template.visual_elements) {
                    const elements = typeof template.visual_elements === 'string' ? template.visual_elements :
                        Array.isArray(template.visual_elements) ? template.visual_elements.join(', ') :
                            JSON.stringify(template.visual_elements);
                    visualElements.push(elements);
                }
                if (template.visualAnchors) {
                    visualElements.push(Array.isArray(template.visualAnchors) ? template.visualAnchors.join(', ') : template.visualAnchors);
                }
                if (template.overlays) {
                    visualElements.push(`Overlays: ${Array.isArray(template.overlays) ? template.overlays.join(', ') : template.overlays}`);
                }

                if (visualElements.length > 0) subjectSection.push(`**Visual Elements:** ${visualElements.join('. ')}`);

                // Special handling for iPhone Note style to prevent overcrowding
                if (template.id === 'iphone-note') {
                    subjectSection.push(`**Constraint:** KEEP TEXT SHORT. Maximum 15 words total. Use short, punchy bullet points for legibility.`);
                }
            }
        }

        if (composition) subjectSection.push(`**Composition:** ${composition}`);
        if (subjectSection.length > 0) sections.push(subjectSection.join('\n'));

        // 2. PRODUCT & BRAND
        const productBrandSection = [];
        productBrandSection.push(`**Product:** ${productName}${productDesc ? ` - ${productDesc}` : ''}`);
        productBrandSection.push(`**Brand:** ${brandName ? `${brandName} (${brandVoice})` : brandVoice}`);
        if (brandColor) productBrandSection.push(`**Primary Color:** ${brandColor}`);
        sections.push(productBrandSection.join('\n'));

        // 3. CONTEXT & COPY
        if (currentCopy?.headline) {
            if (wizardData.template?.id === 'iphone-note') {
                const truncatedHeadline = currentCopy.headline.split(' ').slice(0, 10).join(' ');
                sections.push(`**Context:** Visual representation of a handwritten note based on: "${truncatedHeadline}".
**IMPORTANT:** SUMMARIZE text to under 10 words for legibility.`);
            } else {
                sections.push(`**Context:** Visual representation of "${currentCopy.headline}"`);
            }
        }

        // 4. ART DIRECTION & STYLE
        sections.push(`**Art Direction:**
Mood: ${mood}
Lighting: ${lighting}
Style: ${designStyle}`);

        // 5. QUALITY STANDARDS
        sections.push(`**Quality:** High quality, photorealistic, 4k, advertising standard`);

        // Join with double newlines for clear separation
        return sections.join('\n\n');
    };

    // Auto-populate prompt on mount if empty
    React.useEffect(() => {
        if (!customImagePrompt) {
            setCustomImagePrompt(buildComprehensivePrompt());
        }
    }, []);

    const handleResetPrompt = () => {
        setCustomImagePrompt(buildComprehensivePrompt());
    };

    const currentCopy = editedCopy || generatedCopy.variations[selectedIndex];

    const handleEdit = (field, value) => {
        setEditedCopy({
            ...currentCopy,
            [field]: value
        });
    };

    const handleRegenerateField = async (field) => {
        setRegeneratingField(field);
        try {
            const response = await authFetch(`${API_URL}/copy-generation/regenerate-field`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    field,
                    currentValue: currentCopy[field],
                    brand: wizardData.brand,
                    product: wizardData.product,
                    profile: wizardData.profile,
                    template: wizardData.template,
                    campaignDetails: wizardData.campaignDetails
                })
            });

            if (!response.ok) throw new Error('Regeneration failed');

            const data = await response.json();
            handleEdit(field, data.newValue);
        } catch (error) {
            console.error('Regeneration error:', error);
        } finally {
            setRegeneratingField(null);
        }
    };

    const handleProceed = async () => {
        // Save selected copy to wizardData or state if needed
        // For now we just pass it to the next step
        onProceed(currentCopy);
    };

    const RegenerateButton = ({ field }) => (
        <button
            onClick={() => handleRegenerateField(field)}
            disabled={regeneratingField === field}
            className="ml-2 p-1 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-full transition-colors"
            title="Regenerate this field"
        >
            <Sparkles size={14} className={regeneratingField === field ? 'animate-spin text-amber-600' : ''} />
        </button>
    );

    return (
        <div>
            <h3 className="text-xl font-bold mb-2">Generated Ad Copy</h3>
            <p className="text-gray-600 mb-6">
                Select a variation and edit if needed. Generated {generatedCopy.variations.length} variations based on your template and brand.
            </p>

            {/* Variation Selector */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {generatedCopy.variations.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => {
                            setSelectedIndex(index);
                            setEditedCopy(null);
                        }}
                        className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${selectedIndex === index
                            ? 'bg-amber-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        Variation {index + 1}
                    </button>
                ))}
            </div>

            {/* Copy Preview and Edit */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Edit Form */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                            Headline
                            <RegenerateButton field="headline" />
                        </label>
                        <input
                            type="text"
                            value={currentCopy.headline}
                            onChange={(e) => handleEdit('headline', e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            placeholder="Enter headline"
                        />
                        <div className="text-xs text-gray-500 mt-1">
                            {currentCopy.headline.length} / 40 characters
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                            Body Copy
                            <RegenerateButton field="body" />
                        </label>
                        <textarea
                            value={currentCopy.body}
                            onChange={(e) => handleEdit('body', e.target.value)}
                            rows={3}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            placeholder="Enter body copy"
                        />
                        <div className="text-xs text-gray-500 mt-1">
                            {currentCopy.body.length} / 125 characters (recommended)
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                            Call to Action
                            <RegenerateButton field="cta" />
                        </label>
                        <input
                            type="text"
                            value={currentCopy.cta}
                            onChange={(e) => handleEdit('cta', e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            placeholder="Enter CTA"
                        />
                        <div className="text-xs text-gray-500 mt-1">
                            {currentCopy.cta.length} / 20 characters
                        </div>
                    </div>
                </div>

                {/* Preview */}
                <div>
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-xl p-6">
                        <div className="text-xs font-medium text-amber-600 mb-3">PREVIEW</div>
                        <div className="bg-white rounded-lg p-4 shadow-sm">
                            <div className="font-bold text-lg text-gray-900 mb-2">
                                {currentCopy.headline}
                            </div>
                            <div className="text-gray-700 text-sm mb-4">
                                {currentCopy.body}
                            </div>
                            <button className="w-full bg-amber-600 text-white font-medium py-2 px-4 rounded-lg">
                                {currentCopy.cta}
                            </button>
                        </div>
                        <div className="mt-4 text-xs text-gray-600 space-y-1">
                            <div><strong>Brand:</strong> {wizardData.brand.name}</div>
                            <div><strong>Product:</strong> {wizardData.product.name}</div>
                            <div><strong>Template:</strong> {wizardData.template?.name || 'Custom'}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Custom Image Prompt */}
            <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <button
                    onClick={() => setShowPrompt(!showPrompt)}
                    className="w-full p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <Sparkles className="text-amber-600" size={18} />
                        <h4 className="font-bold text-gray-900 text-sm">Custom Image Generation Prompt (Advanced)</h4>
                    </div>
                    {showPrompt ? <ChevronUp size={18} className="text-gray-500" /> : <ChevronDown size={18} className="text-gray-500" />}
                </button>

                {showPrompt && (
                    <div className="p-4 animate-in slide-in-from-top-2 duration-200">
                        <p className="text-xs text-gray-600 mb-3">
                            <strong>Optional:</strong> Override the AI-generated prompt. Leave empty to automatically build a comprehensive prompt using your brand, product, copy, and template details.
                        </p>
                        <textarea
                            value={customImagePrompt}
                            onChange={(e) => setCustomImagePrompt(e.target.value)}
                            placeholder="Leave empty to auto-generate comprehensive prompt from your brand, product, and copy..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm font-mono"
                            rows={4}
                        />
                        <div className="flex items-center justify-between mt-2">
                            <button
                                onClick={handleResetPrompt}
                                className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                            >
                                ↺ Reset to Generated Prompt
                            </button>
                            <span className="text-xs text-gray-500">
                                {customImagePrompt.length > 0
                                    ? `${customImagePrompt.length} characters`
                                    : '✨ Auto-generating comprehensive prompt'}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-between">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                >
                    <ChevronLeft size={20} />
                    Back to Review
                </button>
                <button
                    onClick={handleProceed}
                    className="flex items-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium shadow-lg transition-colors"
                >
                    Generate Image
                    <ChevronRight size={20} />
                </button>
            </div>
        </div>
    );
}

function ImageGenerationStep({ generatedImages, wizardData, selectedCopy, onBack, onRestart }) {
    const [selectedImageIndex, setSelectedImageIndex] = useState(null);
    const [imgError, setImgError] = useState(false);

    if (!generatedImages || generatedImages.length === 0) {
        return <div className="text-center p-8 text-red-600">Error: No image data available.</div>;
    }

    // Filter to show only square images in the main grid
    const squareImages = generatedImages.filter(img => img.size.includes('Square'));

    // If no square images found (fallback), use all images
    const displayImages = squareImages.length > 0 ? squareImages : generatedImages;

    const selectedImage = selectedImageIndex !== null ? displayImages[selectedImageIndex] : null;

    // Get all images in the same bundle as the selected image
    const bundleImages = selectedImage
        ? generatedImages.filter(img => img.adBundleId === selectedImage.adBundleId)
        : [];

    // Current image being viewed in the modal (defaults to the selected square image)
    const [viewedImage, setViewedImage] = useState(null);

    // Update viewed image when selection changes
    React.useEffect(() => {
        if (selectedImage) {
            setViewedImage(selectedImage);
        }
    }, [selectedImage]);

    const displayCopy = selectedCopy || { headline: '', body: '', cta: '' };

    return (
        <div>
            {/* Header */}
            <div className="text-center mb-8">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check size={40} />
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Ads Generated Successfully!</h2>
                <p className="text-gray-600">Click on any image to view details and download</p>
            </div>

            {/* Image Tile Gallery (Square Images Only) */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-6xl mx-auto mb-8">
                {displayImages.map((img, index) => (
                    <button
                        key={index}
                        onClick={() => setSelectedImageIndex(index)}
                        className="group relative aspect-square rounded-xl overflow-hidden border-2 border-gray-200 hover:border-amber-600 transition-all hover:shadow-xl hover:scale-105"
                    >
                        <img
                            src={img.url}
                            alt={`Ad ${index + 1}`}
                            className="w-full h-full object-cover"
                        />
                        {/* Overlay on hover */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-center p-4">
                                <Image size={32} className="mx-auto mb-2" />
                                <p className="text-sm font-medium">{img.size}</p>
                                <p className="text-xs">{img.dimensions}</p>
                            </div>
                        </div>
                        {/* Size badge */}
                        <div className="absolute bottom-2 left-2 right-2 bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1 text-xs font-medium text-gray-900 text-center">
                            {img.size}
                        </div>
                    </button>
                ))}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                >
                    <ChevronLeft size={20} />
                    Back to Copy
                </button>
                <button
                    onClick={onRestart}
                    className="px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium shadow-lg transition-colors"
                >
                    Create New Ad
                </button>
            </div>

            {/* Modal for Image Details */}
            {selectedImage && viewedImage && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setSelectedImageIndex(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                            <h3 className="text-xl font-bold text-gray-900">Ad Details</h3>
                            <button
                                onClick={() => setSelectedImageIndex(null)}
                                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
                            >
                                <span className="text-2xl text-gray-500">×</span>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Image Preview Section */}
                                <div className="space-y-4">
                                    {/* Main Image */}
                                    <div className="bg-gray-100 rounded-xl overflow-hidden aspect-square flex items-center justify-center">
                                        {imgError ? (
                                            <div className="p-8 text-center text-red-500 bg-red-50">
                                                <p className="font-bold mb-2">Failed to load image</p>
                                            </div>
                                        ) : (
                                            <img
                                                src={viewedImage.url}
                                                alt="Selected Ad"
                                                className="w-full h-full object-contain"
                                                onError={() => setImgError(true)}
                                            />
                                        )}
                                    </div>

                                    {/* Bundle Thumbnails */}
                                    {bundleImages.length > 1 && (
                                        <div>
                                            <p className="text-sm font-medium text-gray-700 mb-2">Available Sizes:</p>
                                            <div className="flex gap-2 overflow-x-auto pb-2">
                                                {bundleImages.map((img, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => {
                                                            setViewedImage(img);
                                                            setImgError(false);
                                                        }}
                                                        className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${viewedImage.url === img.url
                                                            ? 'border-amber-600 ring-2 ring-amber-200'
                                                            : 'border-gray-200 hover:border-amber-300'
                                                            }`}
                                                    >
                                                        <img
                                                            src={img.url}
                                                            alt={img.size}
                                                            className="w-full h-full object-cover"
                                                        />
                                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] py-0.5 text-center truncate px-1">
                                                            {img.size.split(' ')[0]}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Details Panel */}
                                <div className="space-y-6">
                                    {/* Ad Copy */}
                                    <div className="bg-amber-50 p-5 rounded-xl border border-amber-200">
                                        <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                            <FileText size={20} className="text-amber-600" />
                                            Ad Copy
                                        </h4>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-xs font-medium text-amber-700 uppercase">Headline</label>
                                                <p className="font-bold text-gray-900 mt-1">{displayCopy.headline}</p>
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium text-amber-700 uppercase">Body Text</label>
                                                <p className="text-gray-700 text-sm whitespace-pre-line mt-1">{displayCopy.body}</p>
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium text-amber-700 uppercase">Call to Action</label>
                                                <div className="mt-1">
                                                    <span className="inline-block px-3 py-1 bg-amber-600 text-white rounded-full text-sm font-medium">
                                                        {displayCopy.cta}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Image Details */}
                                    <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                                        <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                            <Image size={20} className="text-gray-600" />
                                            Image Details
                                        </h4>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Size:</span>
                                                <span className="font-medium text-gray-900">{viewedImage.size}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Dimensions:</span>
                                                <span className="font-medium text-gray-900">{viewedImage.dimensions}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Format:</span>
                                                <span className="font-medium text-gray-900">PNG</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Download Button */}
                                    <a
                                        href={viewedImage.url}
                                        download={`ad-${viewedImage.size}-${Date.now()}.png`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-bold flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <Download size={20} />
                                        Download Image
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

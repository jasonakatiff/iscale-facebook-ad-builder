import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Sparkles, Check, Image, FileText, Briefcase, Package, Users } from 'lucide-react';
import { useBrands } from '../context/BrandContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import ImageTemplateSelector from '../components/ImageTemplateSelector';
import BrandSelectionStep from '../components/steps/BrandSelectionStep';
import ProductSelectionStep from '../components/steps/ProductSelectionStep';
import ProfileSelectionStep from '../components/steps/ProfileSelectionStep';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export default function AdRemix() {
    const { brands, customerProfiles } = useBrands();
    const { showError } = useToast();
    const { authFetch } = useAuth();
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [blueprint, setBlueprint] = useState(null);
    const [adConcept, setAdConcept] = useState(null);

    const [wizardData, setWizardData] = useState({
        template: null,
        brand: null,
        product: null,
        profile: null,
        campaignDetails: {
            offer: '',
            urgency: '',
            messaging: ''
        }
    });

    const steps = [
        { id: 1, name: 'Template', icon: Image },
        { id: 2, name: 'Brand', icon: Briefcase },
        { id: 3, name: 'Product', icon: Package },
        { id: 4, name: 'Profile', icon: Users },
        { id: 5, name: 'Campaign', icon: FileText },
        { id: 6, name: 'Review', icon: Check }
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

    const handleDeconstruct = async () => {
        setLoading(true);
        try {
            const response = await authFetch(`${API_URL}/ad-remix/deconstruct`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template_id: wizardData.template.id })
            });

            if (!response.ok) throw new Error('Deconstruction failed');

            const data = await response.json();
            setBlueprint(data);
        } catch (error) {
            console.error('Deconstruction error:', error);
            showError('Failed to deconstruct template. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleReconstruct = async () => {
        setLoading(true);
        try {
            const response = await authFetch(`${API_URL}/ad-remix/reconstruct`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template_id: wizardData.template.id,
                    brand_id: wizardData.brand.id,
                    product_id: wizardData.product.id,
                    profile_id: wizardData.profile.id,
                    campaign_offer: wizardData.campaignDetails.offer,
                    campaign_urgency: wizardData.campaignDetails.urgency,
                    campaign_messaging: wizardData.campaignDetails.messaging
                })
            });

            if (!response.ok) throw new Error('Reconstruction failed');

            const data = await response.json();
            setAdConcept(data);
            setCurrentStep(7); // Move to results step
        } catch (error) {
            console.error('Reconstruction error:', error);
            showError('Failed to reconstruct ad. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                    <Sparkles size={32} className="text-highlight" />
                    Ad Remix Engine
                </h1>
                <p className="text-secondary mt-1">Deconstruct winning ads and reconstruct them with your brand</p>
            </div>

            {/* Progress Steps */}
            <div className="mb-8 bg-panel rounded-xl shadow-sm border border-line p-6">
                <div className="grid grid-cols-3 gap-y-4 sm:flex items-center justify-between relative">
                    <div className="hidden sm:block absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-px bg-line -z-10"></div>
                    {steps.map((step) => {
                        const Icon = step.icon;
                        const isActive = step.id === currentStep;
                        const isCompleted = step.id < currentStep;

                        return (
                            <div
                                key={step.id}
                                className="flex flex-col items-center bg-panel px-2"
                            >
                                <div
                                    className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 transition-all ${isActive ? 'bg-brand text-white ' :
                                        isCompleted ? 'bg-green-500 text-white' :
                                            'bg-soft text-muted'
                                        }`}
                                >
                                    {isCompleted ? <Check size={20} /> : <Icon size={20} />}
                                </div>
                                <span className={`text-xs font-medium ${isActive ? 'text-brand-ink' : 'text-muted'}`}>
                                    {step.name}
                                </span>
                            </div>
                        );
                    })}</div>
            </div>

            {/* Step Content */}
            <div className="bg-panel rounded-xl shadow-sm border border-line p-8 min-h-[500px]">
                {loading && (
                    <div className="absolute inset-0 bg-panel/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center rounded-xl">
                        <div className="w-16 h-16 border-4 border-highlight-line border-t-purple-600 rounded-full animate-spin mb-4"></div>
                        <h3 className="text-xl font-bold text-foreground">
                            {currentStep === 1 ? 'Analyzing Template Structure...' : 'Generating Your Ad Concept...'}
                        </h3>
                    </div>
                )}

                {/* Step 1: Template Selection */}
                {currentStep === 1 && (
                    <div>
                        <h3 className="text-xl font-bold mb-4">Select a Winning Template to Remix</h3>
                        <p className="text-secondary mb-6">Choose an ad template to deconstruct and use as your blueprint</p>
                        <ImageTemplateSelector
                            onSelect={(template) => {
                                updateData('template', template);
                                setCurrentStep(2);
                            }}
                            onClose={() => { }}
                            embedded={true}
                        />
                    </div>
                )}

                {/* Step 2: Brand Selection */}
                {currentStep === 2 && (
                    <BrandSelectionStep
                        brands={brands}
                        selectedBrand={wizardData.brand}
                        onSelect={(brand) => {
                            updateData('brand', brand);
                            setCurrentStep(3);
                        }}
                    />
                )}

                {/* Step 3: Product Selection */}
                {currentStep === 3 && (
                    <ProductSelectionStep
                        products={wizardData.brand?.products || []}
                        selectedProduct={wizardData.product}
                        useProductShots={false}
                        onSelect={(product) => {
                            updateData('product', product);
                            setCurrentStep(4);
                        }}
                        onToggleProductShots={() => { }}
                    />
                )}

                {/* Step 4: Profile Selection */}
                {currentStep === 4 && (
                    <ProfileSelectionStep
                        profiles={customerProfiles.filter(p => wizardData.brand?.profileIds?.includes(p.id))}
                        selectedProfile={wizardData.profile}
                        onSelect={(profile) => {
                            updateData('profile', profile);
                            setCurrentStep(5);
                        }}
                    />
                )}

                {/* Step 5: Campaign Details */}
                {currentStep === 5 && (
                    <div>
                        <h3 className="text-xl font-bold mb-4">Campaign Details</h3>
                        <p className="text-secondary mb-6">Provide details to customize your remixed ad</p>

                        <div className="max-w-2xl space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-secondary mb-2">
                                    Offer / Promotion *
                                </label>
                                <input
                                    type="text"
                                    value={wizardData.campaignDetails.offer}
                                    onChange={(e) => updateCampaignDetails('offer', e.target.value)}
                                    placeholder="e.g., 50% off Black Friday, Buy 2 Get 1 Free"
                                    className="w-full px-4 py-3 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-secondary mb-2">
                                    Urgency / Timing
                                </label>
                                <input
                                    type="text"
                                    value={wizardData.campaignDetails.urgency}
                                    onChange={(e) => updateCampaignDetails('urgency', e.target.value)}
                                    placeholder="e.g., Limited time, Ends tonight"
                                    className="w-full px-4 py-3 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-secondary mb-2">
                                    Key Messaging *
                                </label>
                                <textarea
                                    value={wizardData.campaignDetails.messaging}
                                    onChange={(e) => updateCampaignDetails('messaging', e.target.value)}
                                    placeholder="e.g., Science-backed results, Trusted by 10,000+ customers"
                                    rows={3}
                                    className="w-full px-4 py-3 border border-line-strong rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 6: Review & Generate */}
                {currentStep === 6 && (
                    <div>
                        <h3 className="text-xl font-bold mb-4">Review & Generate</h3>
                        <p className="text-secondary mb-6">Review your selections and generate the remixed ad concept</p>

                        <div className="space-y-4 max-w-2xl">
                            <div className="bg-subtle p-4 rounded-lg">
                                <h4 className="font-bold text-foreground mb-2">Template</h4>
                                <p className="text-secondary">{wizardData.template?.name}</p>
                            </div>

                            <div className="bg-subtle p-4 rounded-lg">
                                <h4 className="font-bold text-foreground mb-2">Brand</h4>
                                <p className="text-secondary">{wizardData.brand?.name}</p>
                            </div>

                            <div className="bg-subtle p-4 rounded-lg">
                                <h4 className="font-bold text-foreground mb-2">Product</h4>
                                <p className="text-secondary">{wizardData.product?.name}</p>
                            </div>

                            <div className="bg-subtle p-4 rounded-lg">
                                <h4 className="font-bold text-foreground mb-2">Audience</h4>
                                <p className="text-secondary">{wizardData.profile?.name}</p>
                            </div>

                            <div className="bg-subtle p-4 rounded-lg">
                                <h4 className="font-bold text-foreground mb-2">Campaign</h4>
                                <p className="text-secondary"><strong>Offer:</strong> {wizardData.campaignDetails.offer}</p>
                                {wizardData.campaignDetails.urgency && (
                                    <p className="text-secondary"><strong>Urgency:</strong> {wizardData.campaignDetails.urgency}</p>
                                )}
                                <p className="text-secondary"><strong>Messaging:</strong> {wizardData.campaignDetails.messaging}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 7: Results */}
                {currentStep === 7 && adConcept && (
                    <div>
                        <div className="text-center mb-8">
                            <div className="w-20 h-20 bg-success-soft text-success rounded-full flex items-center justify-center mx-auto mb-4">
                                <Check size={40} />
                            </div>
                            <h2 className="text-3xl font-bold text-foreground mb-2">Ad Concept Generated!</h2>
                            <p className="text-secondary">Your remixed ad concept is ready</p>
                        </div>

                        <div className="space-y-6 max-w-3xl mx-auto">
                            <div className="bg-highlight-soft border-2 border-highlight-line rounded-xl p-6">
                                <h4 className="font-bold text-highlight mb-3 flex items-center gap-2">
                                    <FileText size={20} />
                                    Headline
                                </h4>
                                <p className="text-lg font-bold text-foreground">{adConcept.headline_remix}</p>
                            </div>

                            <div className="bg-info-soft border-2 border-info-line rounded-xl p-6">
                                <h4 className="font-bold text-info mb-3">Body Copy</h4>
                                <p className="text-secondary whitespace-pre-line">{adConcept.body_copy}</p>
                            </div>

                            <div className="bg-success-soft border-2 border-success-line rounded-xl p-6">
                                <h4 className="font-bold text-success mb-3">Call to Action</h4>
                                <button className="px-6 py-3 bg-green-600 text-white rounded-lg font-bold">
                                    {adConcept.cta_button}
                                </button>
                            </div>

                            <div className="bg-brand-soft border-2 border-brand-line rounded-xl p-6">
                                <h4 className="font-bold text-brand-ink mb-3 flex items-center gap-2">
                                    <Image size={20} />
                                    Visual Description
                                </h4>
                                <p className="text-secondary">{adConcept.visual_description}</p>
                            </div>

                            <div className="bg-subtle border-2 border-line rounded-xl p-6">
                                <h4 className="font-bold text-foreground mb-3 flex items-center gap-2">
                                    <Sparkles size={20} />
                                    Image Generation Prompt
                                </h4>
                                <p className="text-sm text-secondary font-mono bg-panel p-4 rounded border border-line-strong">
                                    {adConcept.image_generation_prompt}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <div className="mt-6 flex items-center justify-between">
                <div></div>
                <div className="flex gap-3">
                    {currentStep > 1 && currentStep < 7 && (
                        <button
                            onClick={() => setCurrentStep(currentStep - 1)}
                            className="flex items-center gap-2 px-6 py-3 bg-inset text-secondary rounded-lg hover:bg-soft font-medium"
                        >
                            <ChevronLeft size={20} />
                            Back
                        </button>
                    )}

                    {currentStep === 6 && (
                        <button
                            onClick={handleReconstruct}
                            disabled={!wizardData.campaignDetails.offer || !wizardData.campaignDetails.messaging}
                            className="flex items-center gap-2 px-8 py-3 bg-brand text-white rounded-lg hover:bg-brand-hover font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Sparkles size={20} />
                            Generate Remix
                        </button>
                    )}

                    {currentStep === 7 && (
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-brand text-white rounded-lg hover:bg-brand-hover font-medium"
                        >
                            Create Another Remix
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

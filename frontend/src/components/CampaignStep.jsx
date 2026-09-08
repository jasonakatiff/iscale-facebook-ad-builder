import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Check, Loader, Plus } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { useToast } from '../context/ToastContext';
import { getCampaigns } from '../lib/facebookApi';
import { OBJECTIVES, SPECIAL_CATEGORIES, validateWizard } from '../lib/campaignWizard';
import { minorToMoney } from '../lib/money';
import { ValidationErrors } from './ValidationErrors';
import { LocationPicker } from './LocationPicker';
import { LeadRouterPicker } from './LeadRouterPicker';

const CAMPAIGN_OBJECTIVES = Object.entries(OBJECTIVES).map(([value, config]) => ({ value, label: config.label }));

const BID_STRATEGIES = [
    { value: 'LOWEST_COST_WITHOUT_CAP', label: 'Lowest Cost (Highest Volume or Value, No Cap)' },
    { value: 'LOWEST_COST_WITH_BID_CAP', label: 'Lowest Cost with Bid Cap' },
    { value: 'COST_CAP', label: 'Cost Cap (Cost Per Result Goal)' }
];

const CampaignStep = ({ onNext, onBack }) => {
    const { state, campaignData, setCampaignData, selectedAdAccount, leadRouter, setLeadRouter } = useCampaign();
    const { showError } = useToast();
    const [mode, setMode] = useState(campaignData.isExisting ? 'existing' : 'new'); // 'new' or 'existing'
    const [existingCampaigns, setExistingCampaigns] = useState([]);
    const [selectedCampaign, setSelectedCampaign] = useState(campaignData.isExisting ? campaignData : null);
    const [errors, setErrors] = useState([]);
    const loading = false;
    const [loadingCampaigns, setLoadingCampaigns] = useState(false);

    useEffect(() => {
        if (mode !== 'existing' || !selectedAdAccount) return;
        let active = true;
        getCampaigns(selectedAdAccount.id).then(campaigns => { if (active) setExistingCampaigns(campaigns); })
            .catch(error => { if (active) showError(`Error fetching campaigns: ${error.message}`); })
            .finally(() => { if (active) setLoadingCampaigns(false); });
        return () => { active = false; };
    }, [mode, selectedAdAccount, showError]);

    const handleSelectExisting = (campaign) => {
        setSelectedCampaign(campaign);

        const dailyBudget = minorToMoney(campaign.dailyBudget || 0);
        const lifetimeBudget = campaign.lifetimeBudget || '0';

        // CBO campaigns have budget set at campaign level
        // ABO campaigns have budget set at ad set level (campaign budget is 0 or null)
        const isCBO = dailyBudget > 0 || lifetimeBudget > 0;

        setCampaignData({
            ...campaign,
            budgetType: isCBO ? 'CBO' : 'ABO',
            dailyBudget: dailyBudget,
            bidStrategy: campaign.bid_strategy || '',
            fbCampaignId: campaign.id,
            isExisting: true
        });
    };

    const handleInputChange = (field, value) => {
        setCampaignData(prev => ({
            ...prev,
            [field]: value,
            isExisting: false
        }));
    };

    const handleNext = () => {
        const found = mode === 'existing' && !selectedCampaign ? [{ field: 'campaignData.name', message: 'Select a campaign.' }] : validateWizard(state, 2);
        setErrors(found);
        if (found.length) { document.getElementById(found[0].field)?.focus(); return; }
        if (!campaignData.id) setCampaignData(previous => ({ ...previous, id: crypto.randomUUID() }));
        onNext();
    };

    return (
        <div className="campaign-setup">
            <h2 className="text-lg font-semibold mb-3">Campaign Setup</h2>
            <ValidationErrors errors={errors} />
            <div className="mb-3"><LeadRouterPicker value={leadRouter} onChange={setLeadRouter} /></div>

            {/* Mode Toggle */}
            <div className="campaign-mode flex gap-3 mb-4">
                <button
                    onClick={() => {
                        setMode('new');
                        setCampaignData(prev => ({
                            ...prev,
                            id: null,
                            isExisting: false,
                            fbCampaignId: null
                        }));
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border transition-all ${mode === 'new'
                        ? 'border-amber-600 bg-brand-soft'
                        : 'border-line hover:border-brand-line'
                        }`}
                >
                    <Plus size={18} />
                    <div className="font-semibold">Create New Campaign</div>
                </button>
                <button
                    onClick={() => { setLoadingCampaigns(true); setMode('existing'); }}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border transition-all ${mode === 'existing'
                        ? 'border-amber-600 bg-brand-soft'
                        : 'border-line hover:border-brand-line'
                        }`}
                >
                    <Check size={18} />
                    <div className="font-semibold">Use Existing Campaign</div>
                </button>
            </div>

            {/* Existing Campaigns List */}
            {mode === 'existing' && (
                <div className="space-y-4 mb-6">
                    {/* Existing Campaigns */}
                    <div>
                        <h3 className="font-semibold text-secondary mb-3">Select a Campaign</h3>
                        {loadingCampaigns ? (
                            <div className="flex items-center justify-center gap-2 text-muted py-8">
                                <Loader className="animate-spin" size={20} />
                                <span>Loading campaigns from Facebook...</span>
                            </div>
                        ) : existingCampaigns.length === 0 ? (
                            <p className="text-muted text-center py-8">No campaigns found in this ad account.</p>
                        ) : (
                            existingCampaigns.map(campaign => (
                                <div
                                    key={campaign.id}
                                    onClick={() => handleSelectExisting(campaign)}
                                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all mb-2 ${selectedCampaign?.id === campaign.id
                                        ? 'border-amber-600 bg-brand-soft'
                                        : 'border-line hover:border-brand-line'
                                        }`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <div className="font-bold text-foreground">{campaign.name}</div>
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${campaign.status === 'ACTIVE' ? 'bg-success-soft text-success' :
                                                    campaign.status === 'PAUSED' ? 'bg-warning-soft text-warning' :
                                                        'bg-inset text-secondary'
                                                    }`}>
                                                    {campaign.status}
                                                </span>
                                            </div>
                                            <div className="text-sm text-muted mt-1">
                                                <span className="font-medium text-secondary">
                                                    {(campaign.dailyBudget || campaign.lifetimeBudget) ? 'CBO' : 'ABO'}
                                                </span>
                                                {' • '}{campaign.objective}
                                                {campaign.dailyBudget && ` • Daily: $${(parseInt(campaign.dailyBudget) / 100).toFixed(2)}`}
                                                {campaign.lifetimeBudget && ` • Lifetime: $${(parseInt(campaign.lifetimeBudget) / 100).toFixed(2)}`}
                                            </div>
                                        </div>
                                        {selectedCampaign?.id === campaign.id && (
                                            <Check className="text-brand-ink" size={20} />
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* New Campaign Form */}
            {mode === 'new' && (
                <div className="campaign-fields">
                    <div>
                        <label htmlFor="campaignData.name" className="block text-sm font-medium text-secondary mb-2">
                            Campaign Name *
                        </label>
                        <input
                            type="text"
                            id="campaignData.name" aria-invalid={errors.some(error => error.field === 'campaignData.name')} value={campaignData.name}
                            onChange={(e) => handleInputChange('name', e.target.value)}
                            placeholder="Summer Sale Campaign"
                            className="w-full px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label htmlFor="campaignData.objective" className="block text-sm font-medium text-secondary mb-2">
                            Campaign Objective *
                        </label>
                        <select
                            id="campaignData.objective" aria-invalid={errors.some(error => error.field === 'campaignData.objective')} value={campaignData.objective}
                            onChange={(e) => handleInputChange('objective', e.target.value)}
                            className="w-full px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        >
                            <option value="">Select objective...</option>
                            {CAMPAIGN_OBJECTIVES.map(obj => (
                                <option key={obj.value} value={obj.value}>{obj.label}</option>
                            ))}
                        </select>
                    </div>

                    <fieldset className="campaign-categories space-y-2 border-t border-line pt-3">
                        <legend className="text-sm font-medium">Special Ad Category</legend>
                        <p className="text-xs text-muted">Select every category that applies to this campaign.</p>
                        <div className="flex flex-wrap gap-x-5 gap-y-2">{SPECIAL_CATEGORIES.map(category => <label key={category} className="flex gap-2 text-sm"><input type="checkbox" checked={campaignData.specialAdCategories?.includes(category) || false} onChange={event => handleInputChange('specialAdCategories', event.target.checked ? [...(campaignData.specialAdCategories || []), category] : campaignData.specialAdCategories.filter(value => value !== category))} />{category.replaceAll('_', ' ')}</label>)}</div>
                        {!!campaignData.specialAdCategories?.length && <LocationPicker countriesOnly accountId={selectedAdAccount.id} targeting={{ geo_locations: { countries: campaignData.specialAdCategoryCountries || [] } }} onChange={targeting => handleInputChange('specialAdCategoryCountries', targeting.geo_locations.countries)} />}
                    </fieldset>

                    <div>
                        <label className="block text-sm font-medium text-secondary mb-2">
                            Budget Type *
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={() => handleInputChange('budgetType', 'ABO')}
                                className={`p-3 rounded-lg border-2 transition-all ${campaignData.budgetType === 'ABO'
                                    ? 'border-amber-600 bg-brand-soft'
                                    : 'border-line hover:border-brand-line'
                                    }`}
                            >
                                <div className="font-semibold">ABO</div>
                                <div className="text-xs text-muted">Ad Set Budget</div>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleInputChange('budgetType', 'CBO')}
                                className={`p-3 rounded-lg border-2 transition-all ${campaignData.budgetType === 'CBO'
                                    ? 'border-amber-600 bg-brand-soft'
                                    : 'border-line hover:border-brand-line'
                                    }`}
                            >
                                <div className="font-semibold">CBO</div>
                                <div className="text-xs text-muted">Campaign Budget</div>
                            </button>
                        </div>
                    </div>

                    {campaignData.budgetType === 'CBO' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-secondary mb-2">
                                    Daily Budget ({selectedAdAccount?.currency || 'USD'})
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <span className="text-muted">$</span>
                                    </div>
                                    <input
                                        type="number"
                                        id="campaignData.dailyBudget" aria-invalid={errors.some(error => error.field === 'campaignData.dailyBudget')} value={campaignData.dailyBudget || ''}
                                        onChange={(e) => handleInputChange('dailyBudget', e.target.value)}
                                        placeholder="100"
                                        min={minorToMoney(selectedAdAccount?.minDailyBudget || 1)}
                                        step="0.01"
                                        className="w-full pl-7 pr-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-secondary mb-2">
                                    Bid Strategy
                                </label>
                                <select
                                    value={campaignData.bidStrategy}
                                    onChange={(e) => handleInputChange('bidStrategy', e.target.value)}
                                    className="w-full px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                >
                                    <option value="">Select bid strategy...</option>
                                    {BID_STRATEGIES.map(strategy => (
                                        <option key={strategy.value} value={strategy.value}>{strategy.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Bid Amount - Required for Cost Cap and Bid Cap strategies */}
                            {(campaignData.bidStrategy === 'COST_CAP' || campaignData.bidStrategy === 'LOWEST_COST_WITH_BID_CAP') && (
                                <div>
                                    <label className="block text-sm font-medium text-secondary mb-2">
                                        {campaignData.bidStrategy === 'COST_CAP' ? 'Cost Cap Amount (USD)' : 'Bid Cap Amount (USD)'} *
                                    </label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <span className="text-muted">$</span>
                                        </div>
                                        <input
                                            type="number"
                                            id="campaignData.bidAmount" aria-invalid={errors.some(error => error.field === 'campaignData.bidAmount')} value={campaignData.bidAmount || ''}
                                            onChange={(e) => handleInputChange('bidAmount', e.target.value)}
                                            placeholder="10.00"
                                            min="0.01"
                                            step="0.01"
                                            className="w-full pl-7 pr-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                        />
                                    </div>
                                    <p className="text-xs text-muted mt-1">
                                        {campaignData.bidStrategy === 'COST_CAP'
                                            ? 'Maximum average cost per result you want to maintain'
                                            : 'Maximum bid amount for each auction'}
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Navigation */}
            <div className="campaign-actions mt-4 flex justify-between border-t border-line pt-3">
                {onBack && (
                    <button
                        onClick={onBack}
                        className="px-4 py-2.5 text-secondary hover:text-foreground font-medium"
                    >
                        Back
                    </button>
                )}
                <button
                    onClick={handleNext}
                    disabled={loading}
                    className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-brand text-white rounded-lg font-medium hover:bg-brand-hover disabled:bg-line-strong disabled:cursor-not-allowed"
                >
                    {loading ? 'Saving...' : 'Next Step'} <ChevronRight size={20} />
                </button>
            </div>
        </div>
    );
};

export default CampaignStep;

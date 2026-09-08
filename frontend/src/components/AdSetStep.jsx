import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { useToast } from '../context/ToastContext';
import { getAdSets, getPixels, getCustomAudiences } from '../lib/facebookApi';
import { OBJECTIVES, validateWizard } from '../lib/campaignWizard';
import { minorToMoney } from '../lib/money';
import { SearchableSelect } from './SearchableSelect';
import { LocationPicker } from './LocationPicker';
import { PlacementPicker } from './PlacementPicker';
import { ValidationErrors } from './ValidationErrors';

const inputClass =
    'w-full px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-amber-500';
const BID_STRATEGIES = ['LOWEST_COST_WITHOUT_CAP', 'LOWEST_COST_WITH_BID_CAP', 'COST_CAP'];
const GOAL_NAMES = {
    OFFSITE_CONVERSIONS: 'Website conversions',
    LINK_CLICKS: 'Link clicks',
    LANDING_PAGE_VIEWS: 'Landing page views',
    IMPRESSIONS: 'Impressions',
    REACH: 'Reach',
    POST_ENGAGEMENT: 'Post engagement',
    THRUPLAY: 'ThruPlay',
    VIDEO_VIEWS: 'Video views',
};

export default function AdSetStep({ onNext, onBack }) {
    const { state, campaignData, adsetData, setAdsetData, selectedAdAccount } = useCampaign();
    const { showError } = useToast();
    const [mode, setMode] = useState(adsetData.isExisting ? 'existing' : 'new');
    const [adsets, setAdsets] = useState([]);
    const [pixels, setPixels] = useState([]);
    const [audiences, setAudiences] = useState([]);
    const [errors, setErrors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lookupError, setLookupError] = useState('');
    const config = OBJECTIVES[campaignData.objective];
    const currency = selectedAdAccount?.currency || 'USD';
    const minimum = minorToMoney(selectedAdAccount?.minDailyBudget || 1);
    const update = (field, value) =>
        setAdsetData((previous) => ({ ...previous, [field]: value, isExisting: false }));
    const updateTargeting = (targeting) => update('targeting', targeting);
    useEffect(() => {
        let active = true;
        Promise.allSettled([
            getPixels(selectedAdAccount.id),
            getCustomAudiences(selectedAdAccount.id),
            campaignData.fbCampaignId
                ? getAdSets(campaignData.fbCampaignId, selectedAdAccount.id)
                : Promise.resolve([]),
        ]).then((results) => {
            if (!active) return;
            const setters = [setPixels, setAudiences, setAdsets];
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') setters[index](result.value);
                else
                    setLookupError(
                        (previous) =>
                            `${previous}${previous ? ' ' : ''}${['Pixels', 'Custom audiences', 'Ad sets'][index]}: ${result.reason.message}`,
                    );
            });
            setLoading(false);
        });
        return () => {
            active = false;
        };
    }, [selectedAdAccount.id, campaignData.fbCampaignId]);
    const selectExisting = (id) => {
        const adset = adsets.find((item) => item.id === id);
        if (!adset) return;
        setAdsetData((previous) => ({
            ...previous,
            ...adset,
            id: adset.id,
            fbAdsetId: adset.id,
            name: adset.name,
            optimizationGoal: adset.optimization_goal,
            dailyBudget: minorToMoney(adset.daily_budget || 0),
            bidAmount: minorToMoney(adset.bid_amount || 0),
            pixelId: adset.promoted_object?.pixel_id || '',
            conversionEvent: adset.promoted_object?.custom_event_type || '',
            isExisting: true,
        }));
    };
    const next = () => {
        const found =
            mode === 'existing' && !adsetData.fbAdsetId
                ? [{ field: 'adsetData.name', message: 'Select an existing ad set.' }]
                : validateWizard(state, 3);
        setErrors(found);
        if (found.length) {
            document.getElementById(found[0].field)?.focus();
            return;
        }
        if (!adsetData.id) setAdsetData((previous) => ({ ...previous, id: crypto.randomUUID() }));
        onNext();
    };
    const field = (name, label, children) => (
        <div>
            <label
                htmlFor={`adsetData.${name}`}
                className="block text-sm font-medium text-secondary mb-2"
            >
                {label}
            </label>
            {children}
            {errors
                .filter((error) => error.field === `adsetData.${name}`)
                .map((error) => (
                    <p key={error.message} className="text-sm text-danger mt-1">
                        {error.message}
                    </p>
                ))}
        </div>
    );
    const inputProps = (name) => ({
        id: `adsetData.${name}`,
        'aria-invalid': errors.some((error) => error.field === `adsetData.${name}`),
        className: `${inputClass} ${errors.some((error) => error.field === `adsetData.${name}`) ? 'border-red-500' : ''}`,
    });
    const addAudience = (fieldName, id) => {
        if (!id) return;
        const opposite =
            fieldName === 'custom_audiences' ? 'excluded_custom_audiences' : 'custom_audiences';
        if (adsetData.targeting[opposite]?.some((item) => item.id === id)) {
            showError('An audience cannot be both included and excluded.');
            return;
        }
        const audience = audiences.find((item) => item.id === id);
        if (audience && !adsetData.targeting[fieldName]?.some((item) => item.id === id))
            updateTargeting({
                ...adsetData.targeting,
                [fieldName]: [
                    ...(adsetData.targeting[fieldName] || []),
                    { id, name: audience.name },
                ],
            });
    };
    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">Ad Set Setup</h2>
            <ValidationErrors errors={errors} />
            <div className="flex gap-3 mb-6">
                <button
                    type="button"
                    onClick={() => {
                        setMode('new');
                        setAdsetData((previous) => ({
                            ...previous,
                            id: null,
                            fbAdsetId: null,
                            isExisting: false,
                        }));
                    }}
                    className={`flex-1 border rounded-lg p-3 ${mode === 'new' ? 'border-amber-600 bg-brand-soft' : 'border-line'}`}
                >
                    Create New Ad Set
                </button>
                <button
                    type="button"
                    disabled={!campaignData.isExisting}
                    onClick={() => setMode('existing')}
                    className={`flex-1 border rounded-lg p-3 disabled:opacity-50 ${mode === 'existing' ? 'border-amber-600 bg-brand-soft' : 'border-line'}`}
                >
                    Use Existing Ad Set
                </button>
            </div>
            {lookupError && (
                <p role="alert" className="mb-4 text-danger text-sm">
                    {lookupError}
                </p>
            )}
            {mode === 'existing' ? (
                <SearchableSelect
                    label="Existing ad set"
                    options={adsets}
                    value={adsetData.fbAdsetId || ''}
                    onChange={selectExisting}
                    loading={loading}
                />
            ) : (
                <div className="space-y-6">
                    {field(
                        'name',
                        'Ad Set Name *',
                        <input
                            {...inputProps('name')}
                            value={adsetData.name}
                            onChange={(e) => update('name', e.target.value)}
                        />,
                    )}
                    {campaignData.budgetType === 'ABO' && (
                        <>
                            {field(
                                'dailyBudget',
                                `Daily Budget (${currency}) *`,
                                <>
                                    <input
                                        {...inputProps('dailyBudget')}
                                        type="number"
                                        min={minimum}
                                        step="0.01"
                                        value={adsetData.dailyBudget}
                                        onChange={(e) => update('dailyBudget', e.target.value)}
                                    />
                                    <p className="text-xs text-muted mt-1">
                                        Account minimum:{' '}
                                        {selectedAdAccount?.minDailyBudget == null
                                            ? 'Unavailable — sync required'
                                            : `${minimum} ${currency}`}
                                    </p>
                                </>,
                            )}
                            {field(
                                'bidStrategy',
                                'Bid strategy',
                                <select
                                    {...inputProps('bidStrategy')}
                                    value={adsetData.bidStrategy}
                                    onChange={(e) => update('bidStrategy', e.target.value)}
                                >
                                    {BID_STRATEGIES.map((value) => (
                                        <option key={value} value={value}>
                                            {value.replaceAll('_', ' ')}
                                        </option>
                                    ))}
                                </select>,
                            )}
                            {['COST_CAP', 'LOWEST_COST_WITH_BID_CAP'].includes(
                                adsetData.bidStrategy,
                            ) &&
                                field(
                                    'bidAmount',
                                    `Bid Amount (${currency}) *`,
                                    <input
                                        {...inputProps('bidAmount')}
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={adsetData.bidAmount}
                                        onChange={(e) => update('bidAmount', e.target.value)}
                                    />,
                                )}
                        </>
                    )}
                    <div className="border-t border-line pt-6 space-y-4">
                        <h3 className="font-semibold">Schedule & Optimization</h3>
                        <p className="text-sm text-muted">
                            Campaign objective: {config?.label || campaignData.objective}
                        </p>
                        {field(
                            'optimizationGoal',
                            'Optimization Goal *',
                            <select
                                {...inputProps('optimizationGoal')}
                                value={adsetData.optimizationGoal}
                                onChange={(e) => {
                                    update('optimizationGoal', e.target.value);
                                    if (e.target.value !== 'OFFSITE_CONVERSIONS')
                                        update('conversionEvent', '');
                                    else update('conversionEvent', config.events[0]);
                                }}
                            >
                                {config?.goals.map((goal) => (
                                    <option key={goal} value={goal}>
                                        {GOAL_NAMES[goal]}
                                    </option>
                                ))}
                            </select>,
                        )}
                        {adsetData.optimizationGoal === 'OFFSITE_CONVERSIONS' && (
                            <>
                                <SearchableSelect
                                    label="Facebook Pixel"
                                    value={adsetData.pixelId}
                                    options={pixels}
                                    onChange={(value) => update('pixelId', value)}
                                    loading={loading}
                                    required
                                    error={
                                        errors.find((error) => error.field === 'adsetData.pixelId')
                                            ?.message
                                    }
                                />
                                {field(
                                    'conversionEvent',
                                    'Conversion Event *',
                                    <select
                                        {...inputProps('conversionEvent')}
                                        value={adsetData.conversionEvent}
                                        onChange={(e) => update('conversionEvent', e.target.value)}
                                    >
                                        {config?.events.map((event) => (
                                            <option key={event} value={event}>
                                                {event.replaceAll('_', ' ')}
                                            </option>
                                        ))}
                                    </select>,
                                )}
                                {field(
                                    'attributionSetting',
                                    'Attribution window',
                                    <select
                                        {...inputProps('attributionSetting')}
                                        value={adsetData.attributionSetting}
                                        onChange={(e) =>
                                            update('attributionSetting', e.target.value)
                                        }
                                    >
                                        <option value="1d_click">1-day click</option>
                                        <option value="7d_click">7-day click</option>
                                        <option value="1d_click_1d_view">
                                            1-day click or 1-day view
                                        </option>
                                        <option value="7d_click_1d_view">
                                            7-day click or 1-day view
                                        </option>
                                    </select>,
                                )}
                            </>
                        )}
                        {field(
                            'startTime',
                            `Start Date and Time (${selectedAdAccount?.timezone || 'timezone unavailable'}) *`,
                            <input
                                {...inputProps('startTime')}
                                type="datetime-local"
                                value={adsetData.startTime}
                                onChange={(e) => update('startTime', e.target.value)}
                            />,
                        )}
                        <p className="text-xs text-muted">
                            Entered in the ad account timezone. Defaults to tomorrow at 1:00 AM in
                            that timezone.
                        </p>
                    </div>
                    <div
                        id="adsetData.targeting"
                        tabIndex={-1}
                        className="border-t border-line pt-6 space-y-6"
                    >
                        <LocationPicker
                            targeting={adsetData.targeting}
                            onChange={updateTargeting}
                            accountId={selectedAdAccount.id}
                        />
                        <div className="grid sm:grid-cols-3 gap-4">
                            <label className="text-sm font-medium">
                                Minimum age
                                <input
                                    aria-label="Minimum age"
                                    className={inputClass}
                                    type="number"
                                    min="18"
                                    max="65"
                                    value={adsetData.targeting.ageMin ?? 18}
                                    onChange={(e) =>
                                        updateTargeting({
                                            ...adsetData.targeting,
                                            ageMin: parseInt(e.target.value, 10) || 18,
                                        })
                                    }
                                />
                            </label>
                            <label className="text-sm font-medium">
                                Maximum age
                                <input
                                    aria-label="Maximum age"
                                    className={inputClass}
                                    type="number"
                                    min="18"
                                    max="65"
                                    value={adsetData.targeting.ageMax ?? 65}
                                    onChange={(e) =>
                                        updateTargeting({
                                            ...adsetData.targeting,
                                            ageMax: parseInt(e.target.value, 10) || 65,
                                        })
                                    }
                                />
                            </label>
                            <label className="text-sm font-medium">
                                Gender
                                <select
                                    className={inputClass}
                                    value={adsetData.targeting.genders?.[0] || ''}
                                    onChange={(e) =>
                                        updateTargeting({
                                            ...adsetData.targeting,
                                            genders: e.target.value
                                                ? [parseInt(e.target.value, 10)]
                                                : [],
                                        })
                                    }
                                >
                                    <option value="">All</option>
                                    <option value="1">Men</option>
                                    <option value="2">Women</option>
                                </select>
                            </label>
                        </div>
                        <label className="flex gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={adsetData.advantageAudience === 1}
                                onChange={(e) =>
                                    update('advantageAudience', e.target.checked ? 1 : 0)
                                }
                            />
                            Use Advantage+ Audience
                        </label>
                        {['custom_audiences', 'excluded_custom_audiences'].map((fieldName) => (
                            <div key={fieldName}>
                                <SearchableSelect
                                    label={
                                        fieldName === 'custom_audiences'
                                            ? 'Include Custom Audiences / lookalikes'
                                            : 'Exclude Custom Audiences / lookalikes'
                                    }
                                    value=""
                                    options={audiences.map((audience) => ({
                                        ...audience,
                                        name: `${audience.name}${audience.subtype === 'LOOKALIKE' ? ' (Lookalike)' : ''}`,
                                    }))}
                                    onChange={(id) => addAudience(fieldName, id)}
                                    loading={loading}
                                />
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {(adsetData.targeting[fieldName] || []).map((audience) => (
                                        <span
                                            key={audience.id}
                                            className="bg-inset rounded px-3 py-1 text-sm"
                                        >
                                            {audience.name}
                                            <button
                                                type="button"
                                                aria-label={`Remove ${audience.name}`}
                                                onClick={() =>
                                                    updateTargeting({
                                                        ...adsetData.targeting,
                                                        [fieldName]: adsetData.targeting[
                                                            fieldName
                                                        ].filter((item) => item.id !== audience.id),
                                                    })
                                                }
                                                className="ml-2"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <PlacementPicker
                            targeting={adsetData.targeting}
                            onChange={updateTargeting}
                        />
                    </div>
                </div>
            )}
            <div className="mt-8 flex justify-between">
                <button onClick={onBack} className="px-6 py-3 text-secondary">
                    Back
                </button>
                <button
                    onClick={next}
                    className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-lg"
                >
                    Next Step <ChevronRight size={20} />
                </button>
            </div>
        </div>
    );
}

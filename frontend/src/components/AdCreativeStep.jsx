import { CreativePicker } from './CreativePicker';
import { useEffect, useState, useCallback } from 'react';
import { ChevronRight } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { getPages, getInstagramAccounts, facebookRequest } from '../lib/facebookApi';
import { defaultTrackingParameters, validateWizard } from '../lib/campaignWizard';
import { SearchableSelect } from './SearchableSelect';
import { ValidationErrors } from './ValidationErrors';
import { TrackingParameters } from './TrackingParameters';

const CTA_OPTIONS = [
    'LEARN_MORE',
    'SHOP_NOW',
    'SIGN_UP',
    'CONTACT_US',
    'DOWNLOAD',
    'BOOK_NOW',
    'BUY_TICKETS',
    'GET_QUOTE',
    'DONATE_NOW',
];
const inputClass =
    'w-full px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-amber-500';

export default function AdCreativeStep({ onNext, onBack }) {
    const { state, creativeData, setCreativeData, selectedAdAccount, adsetData } = useCampaign();
    const [pages, setPages] = useState([]);
    const [instagram, setInstagram] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lookupErrors, setLookupErrors] = useState([]);
    const [errors, setErrors] = useState([]);
    const [creativeBusy, setCreativeBusy] = useState(false);
    const changeCreatives = useCallback(change => setCreativeData(previous => ({ ...previous, creatives: change(previous.creatives) })), [setCreativeData]);
    const [retry, setRetry] = useState(0);
    const update = (field, value) =>
        setCreativeData((previous) => ({ ...previous, [field]: value }));
    useEffect(() => {
        let active = true;
        Promise.allSettled([
            getPages(selectedAdAccount.id),
            getInstagramAccounts(selectedAdAccount.id),
            facebookRequest(
                `/tracking-defaults?ad_account_id=${encodeURIComponent(selectedAdAccount.id)}`,
            ),
        ]).then((results) => {
            if (!active) return;
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    setLookupErrors((previous) => [
                        ...previous,
                        `${['Facebook Pages', 'Instagram accounts', 'Tracking defaults'][index]}: ${result.reason.message}`,
                    ]);
                    return;
                }
                if (index === 0) setPages(result.value);
                if (index === 1)
                    setInstagram(
                        result.value.map((account) => ({
                            id: account.id,
                            name: account.username || account.name || account.id,
                        })),
                    );
                if (index === 2 && result.value.urlParameters !== null)
                    setCreativeData((previous) =>
                        previous.urlParameters === defaultTrackingParameters
                            ? { ...previous, urlParameters: result.value.urlParameters }
                            : previous,
                    );
            });
            setLoading(false);
        });
        return () => {
            active = false;
        };
    }, [selectedAdAccount.id, retry, setCreativeData]);
    useEffect(() => {
        if (adsetData.name)
            setCreativeData((previous) =>
                previous.creativeName ? previous : { ...previous, creativeName: adsetData.name },
            );
    }, [adsetData.name, setCreativeData]);
    const next = () => {
        const found = validateWizard(state, 4);
        if (creativeBusy || creativeData.creatives.some((item) => item.needsUpload || item.asset?.analysis_status !== 'ready'))
            found.push({
                field: 'creativeData.creatives',
                message: 'Select saved creative and complete metadata analysis before continuing.',
            });
        setErrors(found);
        if (found.length) {
            document.getElementById(found[0].field)?.focus();
            return;
        }
        onNext();
    };
    const count =
        creativeData.creatives.length *
        creativeData.headlines.filter((text) => text.trim()).length *
        creativeData.bodies.filter((text) => text.trim()).length;
    const invalid = (field) => errors.some((error) => error.field === `creativeData.${field}`);
    return (
        <div>
            <h2 className="text-2xl font-bold mb-2">Ad Creative - Standard Ads</h2>
            <p className="text-secondary mb-6">
                Create one ad for every combination of media × nonempty headline × nonempty primary
                text.
            </p>
            <ValidationErrors errors={errors} />
            {lookupErrors.length > 0 && (
                <div role="alert" className="text-danger text-sm mb-4">
                    {lookupErrors.map((error) => (
                        <p key={error}>{error}</p>
                    ))}
                    <button
                        type="button"
                        onClick={() => {
                            setLoading(true);
                            setLookupErrors([]);
                            setRetry((value) => value + 1);
                        }}
                        className="underline"
                    >
                        Retry loading accounts
                    </button>
                </div>
            )}
            <div className="space-y-6">
                <div>
                    <label
                        htmlFor="creativeData.creativeName"
                        className="block text-sm font-medium mb-2"
                    >
                        Creative Name *
                    </label>
                    <input
                        id="creativeData.creativeName"
                        aria-invalid={invalid('creativeName')}
                        className={inputClass}
                        value={creativeData.creativeName}
                        onChange={(event) => update('creativeName', event.target.value)}
                    />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                    <SearchableSelect
                        label="Facebook Page"
                        value={creativeData.pageId}
                        options={pages}
                        onChange={(id) => update('pageId', id)}
                        loading={loading}
                        required
                        error={
                            errors.find((error) => error.field === 'creativeData.pageId')?.message
                        }
                        placeholder="Search Facebook Pages..."
                    />
                    <SearchableSelect
                        label="Instagram account"
                        value={creativeData.instagramId || ''}
                        options={[{ id: '', name: 'Use Facebook Page (default)' }, ...instagram]}
                        onChange={(id) => update('instagramId', id || null)}
                        loading={loading}
                        error={
                            errors.find((error) => error.field === 'creativeData.instagramId')
                                ?.message
                        }
                        placeholder="Search Instagram accounts..."
                    />
                </div>
                <div id="creativeData.creatives" tabIndex={-1}>
                    <CreativePicker selected={creativeData.creatives} onChange={changeCreatives} onBusyChange={setCreativeBusy} />
                </div>
                {['bodies', 'headlines'].map((field) => (
                    <div
                        key={field}
                        id={`creativeData.${field}`}
                        tabIndex={-1}
                        className="space-y-3"
                    >
                        <div className="flex justify-between">
                            <h3 className="font-medium">
                                {field === 'bodies' ? 'Primary text' : 'Headlines'} *
                            </h3>
                            <button
                                type="button"
                                onClick={() => update(field, [...creativeData[field], ''])}
                                disabled={creativeData[field].length >= 3}
                                className="text-sm text-brand-ink disabled:opacity-40"
                            >
                                Add {field === 'bodies' ? 'primary text' : 'headline'}
                            </button>
                        </div>
                        {creativeData[field].map((text, index) => (
                            <div key={index} className="flex gap-2">
                                {field === 'bodies' ? (
                                    <textarea
                                        aria-label={`Primary text ${index + 1}`}
                                        aria-invalid={invalid(field)}
                                        className={inputClass}
                                        rows={3}
                                        value={text}
                                        onChange={(event) =>
                                            update(
                                                field,
                                                creativeData[field].map((value, i) =>
                                                    i === index ? event.target.value : value,
                                                ),
                                            )
                                        }
                                    />
                                ) : (
                                    <input
                                        aria-label={`Headline ${index + 1}`}
                                        aria-invalid={invalid(field)}
                                        className={inputClass}
                                        value={text}
                                        onChange={(event) =>
                                            update(
                                                field,
                                                creativeData[field].map((value, i) =>
                                                    i === index ? event.target.value : value,
                                                ),
                                            )
                                        }
                                    />
                                )}
                                {creativeData[field].length > 1 && (
                                    <button
                                        type="button"
                                        aria-label={`Remove ${field} ${index + 1}`}
                                        onClick={() =>
                                            update(
                                                field,
                                                creativeData[field].filter((_, i) => i !== index),
                                            )
                                        }
                                        className="px-2 text-danger"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                ))}
                <p className="bg-brand-soft border border-brand-line p-4 rounded-lg font-medium">
                    {count} ads will be created ({creativeData.creatives.length} media ×{' '}
                    {creativeData.headlines.filter((text) => text.trim()).length} headlines ×{' '}
                    {creativeData.bodies.filter((text) => text.trim()).length} primary texts).
                </p>
                <div>
                    <label
                        htmlFor="creativeData.description"
                        className="block text-sm font-medium mb-2"
                    >
                        Description
                    </label>
                    <input
                        id="creativeData.description"
                        value={creativeData.description}
                        onChange={(event) => update('description', event.target.value)}
                        className={inputClass}
                    />
                </div>
                <div>
                    <label htmlFor="creativeData.cta" className="block text-sm font-medium mb-2">
                        Call to Action
                    </label>
                    <select
                        id="creativeData.cta"
                        value={creativeData.cta}
                        onChange={(event) => update('cta', event.target.value)}
                        className={inputClass}
                    >
                        {CTA_OPTIONS.map((cta) => (
                            <option key={cta} value={cta}>
                                {cta.replaceAll('_', ' ')}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label
                        htmlFor="creativeData.websiteUrl"
                        className="block text-sm font-medium mb-2"
                    >
                        Website URL (Landing Page) *
                    </label>
                    <input
                        id="creativeData.websiteUrl"
                        type="url"
                        aria-invalid={invalid('websiteUrl')}
                        value={creativeData.websiteUrl}
                        onChange={(event) => update('websiteUrl', event.target.value)}
                        placeholder="https://yourwebsite.com/landing"
                        className={`${inputClass} ${invalid('websiteUrl') ? 'border-red-500' : ''}`}
                    />
                </div>
                <TrackingParameters
                    value={creativeData.urlParameters || ''}
                    onChange={(value) => update('urlParameters', value)}
                    accountId={selectedAdAccount.id}
                />
            </div>
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

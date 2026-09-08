import { useEffect, useState } from 'react';
import { ChevronRight, Upload } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { useToast } from '../context/ToastContext';
import { getPages, getInstagramAccounts, facebookRequest } from '../lib/facebookApi';
import { defaultTrackingParameters, validateWizard, MEDIA_LIMITS } from '../lib/campaignWizard';
import { SearchableSelect } from './SearchableSelect';
import { ValidationErrors } from './ValidationErrors';
import { TrackingParameters } from './TrackingParameters';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
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
    const { showError } = useToast();
    const [pages, setPages] = useState([]);
    const [instagram, setInstagram] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lookupErrors, setLookupErrors] = useState([]);
    const [errors, setErrors] = useState([]);
    const [dragging, setDragging] = useState(false);
    const [retry, setRetry] = useState(0);
    const update = (field, value) =>
        setCreativeData((previous) => ({ ...previous, [field]: value }));
    const needsInstagram =
        !adsetData.targeting.publisher_platforms ||
        adsetData.targeting.publisher_platforms.includes('instagram');
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
    const upload = (files) => {
        const creatives = [];
        for (const file of files) {
            const isVideo = VIDEO_TYPES.includes(file.type);
            if (!isVideo && !IMAGE_TYPES.includes(file.type)) {
                showError(`${file.name}: choose a supported image or video.`);
                continue;
            }
            if (file.size > MEDIA_LIMITS[isVideo ? 'video' : 'image']) {
                showError(
                    `${file.name}: ${isVideo ? 'videos must be 500 MB' : 'images must be 10 MB'} or smaller.`,
                );
                continue;
            }
            creatives.push({
                id: crypto.randomUUID(),
                name: file.name,
                file,
                previewUrl: URL.createObjectURL(file),
                mediaType: isVideo ? 'video' : 'image',
            });
        }
        setCreativeData((previous) => ({
            ...previous,
            creatives: [...previous.creatives.filter((item) => !item.needsUpload), ...creatives],
        }));
    };
    const next = () => {
        const found = validateWizard(state, 4);
        if (creativeData.creatives.some((item) => item.needsUpload))
            found.push({
                field: 'creativeData.creatives',
                message: 'Re-upload missing media files before continuing.',
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
                        options={instagram}
                        onChange={(id) => update('instagramId', id || null)}
                        loading={loading}
                        required={needsInstagram}
                        error={
                            errors.find((error) => error.field === 'creativeData.instagramId')
                                ?.message
                        }
                        placeholder="Search Instagram accounts..."
                    />
                </div>
                <div
                    id="creativeData.creatives"
                    tabIndex={-1}
                    className={`border-2 border-dashed rounded-xl p-6 text-center ${dragging ? 'border-amber-500 bg-brand-soft' : 'border-line-strong'}`}
                    onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                        event.preventDefault();
                        setDragging(false);
                        upload(Array.from(event.dataTransfer.files));
                    }}
                >
                    <Upload size={28} className="mx-auto text-faint mb-2" />
                    <label className="cursor-pointer text-brand-ink font-medium">
                        Upload images or videos
                        <input
                            aria-label="Upload images or videos"
                            type="file"
                            multiple
                            accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(',')}
                            className="block mx-auto mt-3 max-w-full text-sm"
                            onChange={(event) => {
                                upload(Array.from(event.target.files));
                                event.target.value = '';
                            }}
                        />
                    </label>
                    <p className="text-xs text-muted mt-2">
                        Or drop files here. Images: up to 10 MB each.
                    </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {creativeData.creatives.map((creative) => (
                        <div
                            key={creative.id}
                            className="border border-line rounded-lg overflow-hidden"
                        >
                            {creative.needsUpload ? (
                                <p className="p-4 text-sm text-danger">
                                    Re-upload {creative.name}
                                </p>
                            ) : creative.mediaType === 'video' ? (
                                <video
                                    src={creative.previewUrl || creative.videoUrl}
                                    className="w-full h-28 object-cover"
                                    controls
                                />
                            ) : (
                                <img
                                    src={creative.previewUrl || creative.imageUrl}
                                    alt={creative.name}
                                    className="w-full h-28 object-cover"
                                />
                            )}
                            <div className="p-2 text-xs flex items-center justify-between gap-2">
                                <span className="truncate">{creative.name}</span>
                                <button
                                    type="button"
                                    aria-label={`Remove ${creative.name}`}
                                    onClick={() => {
                                        if (creative.previewUrl?.startsWith('blob:'))
                                            URL.revokeObjectURL(creative.previewUrl);
                                        update(
                                            'creatives',
                                            creativeData.creatives.filter(
                                                (item) => item.id !== creative.id,
                                            ),
                                        );
                                    }}
                                    className="text-danger"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
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

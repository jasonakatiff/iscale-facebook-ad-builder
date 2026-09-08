import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { preflightCampaign } from '../lib/facebookApi';
import { publishCampaign } from '../lib/publishCampaign';
import { validateWizard } from '../lib/campaignWizard';
import { ValidationErrors } from './ValidationErrors';
import { minorToMoney } from '../lib/money';
import { usePlatformApi } from '../lib/platformApi';
import { validateLeadRouterSelection } from '../lib/leadrouter';

export function CampaignReview({ onBack }) {
    const nativeApi = usePlatformApi();
    const { state, publishProgress, savePublishProgress, resetWizard } = useCampaign();
    const [review, setReview] = useState(null);
    const [error, setError] = useState('');
    const [errors, setErrors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [publishing, setPublishing] = useState(false);
    const [status, setStatus] = useState('');
    const [attempt, setAttempt] = useState(0);
    const busy = useRef(false);
    const { selectedAdAccount, campaignData, adsetData, creativeData, adsData, leadRouter } = state;
    const draft = useMemo(
        () => ({
            selectedAdAccount,
            campaignData,
            adsetData,
            creativeData,
            adsData,
        }),
        [selectedAdAccount, campaignData, adsetData, creativeData, adsData],
    );
    const complete = publishProgress?.complete;
    useEffect(() => {
        if (complete) {
            setLoading(false);
            return;
        }
        let active = true;
        const found = validateWizard(draft);
        setErrors(found);
        setReview(null);
        setError('');
        if (found.length) {
            setLoading(false);
            return;
        }
        setLoading(true);
        Promise.all([preflightCampaign(draft), validateLeadRouterSelection(nativeApi, leadRouter)])
            .then(([result]) => {
                if (active) setReview(result);
            })
            .catch((err) => {
                if (active) setError(err.message);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [draft, attempt, complete, nativeApi, leadRouter]);
    const submit = async () => {
        if (busy.current || !review || publishProgress?.complete || publishProgress?.uncertain)
            return;
        busy.current = true;
        setPublishing(true);
        setError('');
        try {
            const latestReview = await preflightCampaign(state);
            if (JSON.stringify(latestReview) !== JSON.stringify(review)) {
                setReview(latestReview);
                setError(
                    'Ad account settings changed. Review the updated settings before creating ads.',
                );
                return;
            }
            await publishCampaign(state, savePublishProgress, setStatus, nativeApi);
        } catch (err) {
            setError(err.message);
        } finally {
            busy.current = false;
            setPublishing(false);
        }
    };
    if (publishProgress?.complete)
        return (
            <div className="text-center py-10">
                <CheckCircle2 size={48} className="mx-auto text-success mb-4" />
                <h2 className="text-2xl font-bold mb-3">
                    {state.adsData.length} paused ads {publishProgress.queued ? 'queued' : 'created'}
                </h2>
                <p className="text-secondary">
                    {publishProgress.queued ? 'Your ads will post at the shared cadence. Follow their progress in the posting queue.' : 'Review and activate them in Meta Ads Manager when ready.'}
                </p>
                <p className="text-sm text-muted mt-3">
                    Campaign: {publishProgress.campaignId} · Ad set: {publishProgress.adsetId}
                </p>
                {publishProgress.queued && <Link to="/posting-queue" className="studio-button mt-4">View posting queue</Link>}
                <button
                    onClick={resetWizard}
                    className="mt-6 px-5 py-3 bg-brand text-white rounded-lg"
                >
                    Start a new campaign
                </button>
            </div>
        );
    return (
        <div>
            <h2 className="text-2xl font-bold mb-2">Review & Launch</h2>
            {leadRouter && (
                <p className="text-sm text-brand-ink mb-3">
                    LeadRouter: {leadRouter.campaign.name} ·{' '}
                    {leadRouter.campaign.offerName || 'No offer name'} · Private campaign
                    association
                </p>
            )}
            <p className="text-secondary mb-6">
                Confirm the campaign, targeting, identity, and every ad below. New objects will be
                created PAUSED. Ads enter the shared posting queue after campaign and ad set setup.
            </p>
            <ValidationErrors errors={errors} />
            {loading && (
                <p role="status" className="flex items-center gap-2 text-muted py-6">
                    <Loader className="animate-spin" size={20} />
                    Checking settings with the ad account…
                </p>
            )}
            {error && (
                <div
                    role="alert"
                    className="p-4 bg-danger-soft border border-danger-line text-danger rounded-lg mb-4"
                >
                    <p>{error}</p>
                    {!publishProgress?.uncertain && (
                        <button
                            onClick={() => setAttempt((value) => value + 1)}
                            className="underline mt-2"
                        >
                            Check settings again
                        </button>
                    )}
                </div>
            )}
            {publishProgress?.uncertain && (
                <div
                    role="alert"
                    className="p-4 bg-brand-soft border border-brand-line rounded-lg mb-4"
                >
                    <p className="font-medium">Publication needs reconciliation</p>
                    <p className="text-sm mt-1">
                        The result of “{publishProgress.uncertain}” is unknown. Check Ads Manager
                        before creating another draft. This draft will not repeat that request.
                    </p>
                    <p className="text-xs mt-2">
                        Known campaign: {publishProgress.campaignId || 'No ID received'} · Ad set:{' '}
                        {publishProgress.adsetId || 'No ID received'}
                    </p>
                </div>
            )}
            {review && (
                <div className="space-y-5">
                    <div className="p-4 bg-subtle border border-line rounded-lg">
                        <p className="font-semibold">{review.account.name}</p>
                        <p className="text-sm text-muted">
                            {review.account.currency} · {review.account.timezone_name}
                        </p>
                    </div>
                    {[
                        ['Campaign', review.campaign],
                        ['Ad set', review.adset],
                    ].map(([label, payload]) => (
                        <section key={label} className="border border-line rounded-lg p-4">
                            <div className="flex justify-between">
                                <h3 className="font-semibold">
                                    {label}: {payload.name}
                                </h3>
                                <span className="text-xs px-2 py-1 bg-brand-soft rounded">
                                    {payload.status}
                                </span>
                            </div>
                            <dl className="grid sm:grid-cols-2 gap-3 text-sm mt-3">
                                {Object.entries(payload)
                                    .filter(
                                        ([key]) => !['name', 'status', 'targeting'].includes(key),
                                    )
                                    .map(([key, value]) => (
                                        <div key={key}>
                                            <dt className="text-xs text-muted">
                                                {key.replaceAll('_', ' ')}
                                            </dt>
                                            <dd className="break-words">
                                                {[
                                                    'daily_budget',
                                                    'lifetime_budget',
                                                    'bid_amount',
                                                ].includes(key)
                                                    ? `${minorToMoney(value)} ${review.account.currency}`
                                                    : key === 'start_time'
                                                      ? `${new Date(value).toLocaleString('en-US', { timeZone: review.account.timezone_name })} (${review.account.timezone_name})`
                                                      : typeof value === 'object'
                                                        ? Array.isArray(value) && !value.length
                                                            ? 'None'
                                                            : JSON.stringify(value)
                                                        : String(value)}
                                            </dd>
                                        </div>
                                    ))}
                            </dl>
                            {payload.targeting && (
                                <div className="mt-4">
                                    <h4 className="text-sm font-medium mb-2">
                                        Targeting and placements
                                    </h4>
                                    <pre className="text-xs bg-subtle p-3 rounded whitespace-pre-wrap break-words">
                                        {JSON.stringify(payload.targeting, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </section>
                    ))}
                    <section>
                        <h3 className="font-semibold mb-3">{review.ads.length} ads · PAUSED</h3>
                        <div className="space-y-3">
                            {review.ads.map((ad, index) => (
                                <div key={index} className="border border-line rounded-lg p-4">
                                    <h4 className="font-semibold">{ad.name}</h4>
                                    <p className="mt-2 text-sm font-medium">{ad.headline}</p>
                                    <p className="mt-1 text-sm whitespace-pre-wrap">
                                        {ad.primary_text}
                                    </p>
                                    <dl className="grid sm:grid-cols-2 gap-2 text-sm mt-3">
                                        {Object.entries(ad)
                                            .filter(
                                                ([key]) =>
                                                    !['name', 'headline', 'primary_text'].includes(
                                                        key,
                                                    ),
                                            )
                                            .map(([key, value]) => (
                                                <div key={key}>
                                                    <dt className="text-xs text-muted">
                                                        {key.replaceAll('_', ' ')}
                                                    </dt>
                                                    <dd className="break-all">{value || 'None'}</dd>
                                                </div>
                                            ))}
                                    </dl>
                                </div>
                            ))}
                        </div>
                    </section>
                    <details className="border-t pt-3">
                        <summary className="text-sm cursor-pointer text-secondary">
                            All outgoing settings
                        </summary>
                        <pre className="text-xs mt-3 whitespace-pre-wrap break-words">
                            {JSON.stringify(review, null, 2)}
                        </pre>
                    </details>
                </div>
            )}
            {publishing && (
                <p role="status" className="mt-4 flex items-center gap-2">
                    <Loader className="animate-spin" size={18} />
                    {status}
                </p>
            )}
            <div className="mt-8 flex justify-between gap-4">
                <button
                    onClick={onBack}
                    disabled={
                        publishing || !!publishProgress?.campaignId || !!publishProgress?.uncertain
                    }
                    className="px-6 py-3 text-secondary disabled:opacity-40"
                >
                    Back
                </button>
                <button
                    onClick={submit}
                    disabled={!review || loading || publishing || !!publishProgress?.uncertain}
                    className="px-6 py-3 bg-green-700 text-white rounded-lg disabled:opacity-40"
                >
                    {publishing
                        ? 'Queueing paused ads…'
                        : `Queue ${state.adsData.length} paused ads on Facebook`}
                </button>
            </div>
        </div>
    );
}

import { useState } from 'react';
import { Check } from 'lucide-react';
import { CampaignProvider, useCampaign } from '../context/CampaignContext';
import AdAccountStep from '../components/AdAccountStep';
import CampaignStep from '../components/CampaignStep';
import AdSetStep from '../components/AdSetStep';
import AdCreativeStep from '../components/AdCreativeStep';
import BulkAdCreation from '../components/BulkAdCreation';
import { CampaignReview } from '../components/CampaignReview';
import { CampaignPresetLibrary } from '../components/CampaignPresetLibrary';
import ConfirmationModal from '../components/ConfirmationModal';
import {
    MetaConnectionPanel,
    useMetaConnection,
} from '../components/MetaConnectionPanel';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

function CampaignWizard({ meta }) {
    const {
        currentStep,
        setCurrentStep,
        resetWizard,
        ready,
        draftStatus,
        draftError,
        publishProgress,
    } = useCampaign();
    const [discarding, setDiscarding] = useState(false);
    const steps = [
        'Ad Account',
        'Campaign',
        'Ad Set',
        'Creative',
        'Bulk Ads',
        'Review & Launch',
    ];
    const next = () =>
        setCurrentStep((step) => Math.min(step + 1, steps.length));
    const back = () => setCurrentStep((step) => Math.max(step - 1, 1));
    if (!ready)
        return (
            <p role="status" className="p-8 text-muted">
                Restoring campaign draft…
            </p>
        );
    return (
        <div className="campaign-workspace">
            <div className="studio-page-header">
                <div>
                    <h1 className="studio-heading">Facebook Campaigns</h1>
                    <p className="studio-description">
                        Bring the details together. Review before anything goes
                        live.
                    </p>
                </div>
                <div className="flex flex-col items-start sm:items-end gap-2">
                    <p role="status" className="draft-state">
                        {draftStatus}
                    </p>
                    <button
                        type="button"
                        onClick={() => setDiscarding(true)}
                        className="text-xs text-muted hover:text-danger underline underline-offset-4"
                    >
                        Discard draft
                    </button>
                </div>
            </div>
            <MetaConnectionPanel meta={meta} compact />
            {draftError && (
                <p
                    role="alert"
                    className="p-4 mb-5 bg-danger-soft border border-danger-line text-danger rounded-lg text-sm"
                >
                    {draftError}
                </p>
            )}
            <div className="studio-panel">
                <div className="campaign-progress">
                    <div className="md:hidden flex justify-between gap-3 text-xs text-muted mb-4">
                        <span>
                            Step {currentStep} of {steps.length}
                        </span>
                        <span className="text-brand-ink font-medium">
                            {steps[currentStep - 1]}
                        </span>
                    </div>
                    <ol aria-label="Campaign progress">
                        {steps.map((label, index) => (
                            <li
                                key={label}
                                aria-current={
                                    index + 1 === currentStep
                                        ? 'step'
                                        : undefined
                                }
                                data-complete={index + 1 < currentStep}
                                aria-label={`Step ${index + 1}: ${label}`}
                            >
                                <span className="campaign-step-number">
                                    {index + 1 < currentStep ? (
                                        <Check size={13} strokeWidth={2} />
                                    ) : (
                                        index + 1
                                    )}
                                </span>
                                <span className="campaign-step-label">
                                    {label}
                                </span>
                            </li>
                        ))}
                    </ol>
                </div>
                <div className="campaign-form">
                    {currentStep > 1 && currentStep < 6 && (
                        <CampaignPresetLibrary />
                    )}
                    {currentStep === 1 && <AdAccountStep onNext={next} />}
                    {currentStep === 2 && (
                        <CampaignStep onNext={next} onBack={back} />
                    )}
                    {currentStep === 3 && (
                        <AdSetStep onNext={next} onBack={back} />
                    )}
                    {currentStep === 4 && (
                        <AdCreativeStep onNext={next} onBack={back} />
                    )}
                    {currentStep === 5 && (
                        <BulkAdCreation onNext={next} onBack={back} />
                    )}
                    {currentStep === 6 && <CampaignReview onBack={back} />}
                </div>
            </div>
            <ConfirmationModal
                isOpen={discarding}
                onClose={() => setDiscarding(false)}
                onConfirm={resetWizard}
                title="Discard campaign draft?"
                message={
                    publishProgress
                        ? 'This clears the browser draft. Objects already created on Facebook remain in the ad account.'
                        : 'This removes the saved settings and uploaded media from this browser draft.'
                }
                confirmText="Discard"
            />
        </div>
    );
}

export default function FacebookCampaigns() {
    const meta = useMetaConnection();
    const { user } = useAuth();
    if (!meta.canUseCampaign)
        return (
            <div className="campaign-workspace">
                <div className="studio-page-header">
                    <div>
                        <h1 className="studio-heading">Facebook Campaigns</h1>
                        <p className="studio-description">
                            Connect and select an available account before
                            configuring deployment.
                        </p>
                    </div>
                </div>
                <MetaConnectionPanel meta={meta} compact />
                <p className="text-sm text-muted">
                    Your saved drafts remain available when account access is
                    restored.
                </p>
                <Link className="studio-button mt-4" to="/build-creatives">
                    Build creatives
                </Link>
            </div>
        );
    const scope =
        meta.connection?.source === 'managed'
            ? 'system'
            : meta.connection?.ad_account_id || 'system';
    return (
        <CampaignProvider
            key={`${user?.id}:${scope}`}
            persist
            draftScope={scope}
        >
            <CampaignWizard meta={meta} />
        </CampaignProvider>
    );
}

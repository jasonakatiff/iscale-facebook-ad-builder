import React, { useCallback, useEffect, useState } from 'react';
import { Check, Target, Users, Image as ImageIcon, Zap, CheckCircle, CreditCard, Megaphone, CheckCircle2, ArrowRight } from 'lucide-react';
import { CampaignProvider } from '../context/CampaignContext';
import AdAccountStep from '../components/AdAccountStep';
import CampaignStep from '../components/CampaignStep';
import AdSetStep from '../components/AdSetStep';
import AdCreativeStep from '../components/AdCreativeStep';
import BulkAdCreation from '../components/BulkAdCreation';
import ConnectAccountCard from '../components/ConnectAccountCard';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const FacebookCampaignWizard = () => {
    const { authFetch } = useAuth();
    const { showError, showSuccess } = useToast();
    const [currentStep, setCurrentStep] = useState(1);
    const [connection, setConnection] = useState(null);
    const [connections, setConnections] = useState([]);
    const [connectionLoading, setConnectionLoading] = useState(true);
    const [selectingAccount, setSelectingAccount] = useState(false);
    const [selectingAccountId, setSelectingAccountId] = useState(null);
    const [disconnecting, setDisconnecting] = useState(false);
    const [formData, setFormData] = useState({
        adAccountId: null,
        campaignId: null,
        adSetId: null,
        creativeId: null,
    });

    const steps = [
        { id: 1, label: 'Ad Account', icon: CreditCard },
        { id: 2, label: 'Campaign', icon: Target },
        { id: 3, label: 'Ad Set', icon: Users },
        { id: 4, label: 'Creative', icon: ImageIcon },
        { id: 5, label: 'Bulk Ads', icon: Megaphone },
        { id: 6, label: 'Review & Launch', icon: CheckCircle2 },
    ];

    // Sprint 8: surface lapsed/expiring Meta user tokens so the operator
    // reconnects before campaigns start failing with raw Meta 401s. Lapsed
    // tokens can't be refreshed server-side without a fresh user grant.
    const metaTokenWarning = (() => {
        if (!connection?.connected || !connection?.token_expires_at) return null;
        const expiry = new Date(connection.token_expires_at).getTime();
        if (!Number.isFinite(expiry)) return null;
        const daysLeft = (expiry - Date.now()) / 86400000;
        if (daysLeft <= 0) return 'Access token has expired. Reconnect Meta Ads to keep reporting and campaign actions working.';
        if (daysLeft <= 7) return `Access token expires in ${Math.ceil(daysLeft)} day${daysLeft > 1 ? 's' : ''}. Reconnect soon to avoid interruption.`;
        return null;
    })();

    const loadConnection = useCallback(async () => {
        setConnectionLoading(true);
        try {
            const response = await authFetch(`${API_URL}/facebook/connection`);
            if (response.ok) setConnection(await response.json());
        } catch (error) {
            showError(error.message || 'Failed to load Meta Ads connection');
        } finally {
            setConnectionLoading(false);
        }
    }, [authFetch, showError]);

    const loadConnections = useCallback(async () => {
        try {
            const response = await authFetch(`${API_URL}/facebook/connections`);
            if (response.ok) {
                const data = await response.json();
                const candidates = data.connections || [];
                setConnections(candidates);
                if (candidates.length > 0 && !candidates.some((candidate) => candidate.selected)) {
                    setSelectingAccount(true);
                }
            }
        } catch (error) {
            console.error('Failed to load Meta Ads account choices', error);
        }
    }, [authFetch]);

    useEffect(() => {
        loadConnection();
        loadConnections();
        const query = new URLSearchParams(window.location.search);
        if (query.get('connected') === '1') {
            showSuccess('Meta Ads account connected');
            window.history.replaceState({}, '', window.location.pathname);
        } else if (query.get('select') === '1') {
            setSelectingAccount(true);
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [loadConnection, loadConnections, showSuccess]);

    const connectMeta = async () => {
        try {
            const response = await authFetch(`${API_URL}/facebook/oauth/start`);
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || 'Failed to start Meta connection');
            }
            window.location.href = (await response.json()).oauth_url;
        } catch (error) {
            showError(error.message || 'Failed to start Meta connection');
        }
    };

    const disconnectMeta = async () => {
        setDisconnecting(true);
        try {
            const response = await authFetch(`${API_URL}/facebook/connection`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to disconnect Meta Ads');
            setConnection({ connected: false });
            setConnections((current) => current.map((candidate) => ({ ...candidate, selected: false })));
            showSuccess('Meta Ads disconnected');
        } catch (error) {
            showError(error.message || 'Failed to disconnect Meta Ads');
        } finally {
            setDisconnecting(false);
        }
    };

    const selectMetaAccount = async (adAccountId) => {
        setSelectingAccountId(adAccountId);
        try {
            const response = await authFetch(`${API_URL}/facebook/connection/select`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ad_account_id: adAccountId }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || 'Failed to select Meta ad account');
            }
            setConnection(await response.json());
            setConnections((current) => current.map((candidate) => ({
                ...candidate,
                selected: candidate.ad_account_id === adAccountId,
            })));
            setSelectingAccount(false);
            showSuccess('Meta ad account selected');
        } catch (error) {
            showError(error.message || 'Failed to select Meta ad account');
        } finally {
            setSelectingAccountId(null);
        }
    };

    const handleNext = () => {
        // Guard: don't advance past a step whose required choice is missing —
        // the user would land on the next step with no data to act on.
        if (!isStepValid()) {
            showError('Complete this step before continuing (pick the required selection first).');
            return;
        }
        if (currentStep < steps.length) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    const isStepValid = () => {
        switch (currentStep) {
            case 1: return !!formData.adAccountId;
            case 2: return !!formData.campaignId;
            case 3: return !!formData.adSetId;
            case 4: return !!formData.creativeId;
            default: return true;
        }
    };

    return (
        <CampaignProvider>
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                        <Megaphone size={32} className="text-amber-600" />
                        Facebook Campaigns
                    </h1>
                    <p className="text-gray-600">Create and manage your Facebook ad campaigns</p>
                </div>

                {!connectionLoading && (
                    <div className="space-y-3">
                        <ConnectAccountCard
                            platformName="Meta Ads"
                            icon={Megaphone}
                            connected={!!connection?.connected}
                            accountLabel={connection?.account_name || connection?.ad_account_id}
                            connectedAt={connection?.connected_at}
                            onConnect={connectMeta}
                            onDisconnect={disconnectMeta}
                            disconnecting={disconnecting}
                            warning={metaTokenWarning}
                        />
                        {connection?.connected && connections.length > 1 && !selectingAccount && (
                            <button type="button" onClick={() => setSelectingAccount(true)} className="text-sm font-medium text-amber-700 hover:text-amber-900">
                                Change Meta ad account
                            </button>
                        )}
                    </div>
                )}

                {selectingAccount && connections.length > 0 && (
                    <section aria-labelledby="meta-account-heading" className="border-y border-gray-200 py-5">
                        <h2 id="meta-account-heading" className="text-lg font-bold text-gray-900 mb-3">Choose a Meta ad account</h2>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {connections.map((candidate) => (
                                <button
                                    key={candidate.ad_account_id}
                                    type="button"
                                    onClick={() => selectMetaAccount(candidate.ad_account_id)}
                                    disabled={selectingAccountId !== null}
                                    aria-pressed={candidate.selected}
                                    className={`min-h-16 border px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:opacity-60 ${candidate.selected ? 'border-amber-600 bg-amber-50' : 'border-gray-300 bg-white hover:border-amber-500'}`}
                                >
                                    <span className="block font-semibold text-gray-900">{candidate.account_name || 'Meta ad account'}</span>
                                    <span className="block text-sm text-gray-500">{candidate.ad_account_id}</span>
                                    {selectingAccountId === candidate.ad_account_id && <span className="block text-xs text-amber-700 mt-1">Selecting…</span>}
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {/* Wizard Steps */}
                {connection?.connected && <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex justify-between items-center mb-8 relative">
                        {/* Progress Bar Background */}
                        <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-100 -z-10 rounded-full" />

                        {/* Progress Bar Fill */}
                        <div
                            className="absolute top-1/2 left-0 h-1 bg-amber-600 -z-10 rounded-full transition-all duration-500 ease-in-out"
                            style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
                        />

                        {steps.map((step) => {
                            const isCompleted = step.id < currentStep;
                            const isCurrent = step.id === currentStep;

                            return (
                                <div key={step.id} className="flex flex-col items-center gap-2 bg-white px-2">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${isCompleted || isCurrent
                                            ? 'bg-amber-600 text-white shadow-md scale-110'
                                            : 'bg-gray-100 text-gray-400'
                                            }`}
                                    >
                                        {isCompleted ? (
                                            <CheckCircle2 size={20} />
                                        ) : (
                                            <step.icon size={20} />
                                        )}
                                    </div>
                                    <span
                                        className={`text-sm font-medium transition-colors duration-300 ${isCurrent ? 'text-amber-900' : 'text-gray-500'
                                            }`}
                                    >
                                        {step.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Step Content */}
                    <div className="min-h-[400px]">
                        {currentStep === 1 && (
                            <AdAccountStep
                                selectedAccount={formData.adAccountId}
                                onAccountSelect={(id) => setFormData({ ...formData, adAccountId: id })}
                                onNext={handleNext}
                            />
                        )}
                        {currentStep === 2 && (
                            <CampaignStep
                                adAccountId={formData.adAccountId}
                                selectedCampaign={formData.campaignId}
                                onCampaignSelect={(id) => setFormData({ ...formData, campaignId: id })}
                                onNext={handleNext}
                                onBack={handleBack}
                            />
                        )}
                        {currentStep === 3 && (
                            <AdSetStep
                                adAccountId={formData.adAccountId}
                                campaignId={formData.campaignId}
                                selectedAdSet={formData.adSetId}
                                onAdSetSelect={(id) => setFormData({ ...formData, adSetId: id })}
                                onNext={handleNext}
                                onBack={handleBack}
                            />
                        )}
                        {currentStep === 4 && (
                            <AdCreativeStep
                                adAccountId={formData.adAccountId}
                                selectedCreative={formData.creativeId}
                                onCreativeSelect={(id) => setFormData({ ...formData, creativeId: id })}
                                onNext={handleNext}
                                onBack={handleBack}
                            />
                        )}
                        {currentStep === 5 && (
                            <BulkAdCreation
                                onNext={handleNext}
                                onBack={handleBack}
                            />
                        )}
                        {currentStep === 6 && (
                            <div className="text-center py-12">
                                <CheckCircle2 className="mx-auto mb-4 text-amber-500" size={64} />
                                <h2 className="text-3xl font-bold mb-4">Campaign Ready to Launch!</h2>
                                <p className="text-gray-600 mb-8">
                                    Review your settings and launch your Facebook ad campaign.
                                </p>
                            </div>
                        )}
                    </div>


                </div>}
            </div>
        </CampaignProvider>
    );
};

export default FacebookCampaignWizard;

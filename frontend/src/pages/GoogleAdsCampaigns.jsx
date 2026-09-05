import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Plus, Play, Pause } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ConnectAccountCard from '../components/ConnectAccountCard';
import PerformanceTable from '../components/PerformanceTable';
import ConfirmationModal from '../components/ConfirmationModal';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const CAMPAIGN_COLUMNS = [
    { key: 'name', label: 'Campaign', numeric: false },
    { key: 'status', label: 'Status', numeric: false },
    { key: 'impressions', label: 'Impressions', numeric: true },
    { key: 'clicks', label: 'Clicks', numeric: true },
    { key: 'cost', label: 'Cost', numeric: true, format: (v) => `$${Number(v).toFixed(2)}` },
    { key: 'conversions', label: 'Conversions', numeric: true },
];

export default function GoogleAdsCampaigns() {
    const { authFetch } = useAuth();
    const { showError, showSuccess } = useToast();

    const [connection, setConnection] = useState(null);
    const [connections, setConnections] = useState([]);
    const [connectionLoading, setConnectionLoading] = useState(true);
    const [disconnecting, setDisconnecting] = useState(false);
    const [selectingAccount, setSelectingAccount] = useState(false);
    const [selectingCustomerId, setSelectingCustomerId] = useState(null);
    const [campaigns, setCampaigns] = useState([]);
    const [campaignsLoading, setCampaignsLoading] = useState(false);
    const [campaignError, setCampaignError] = useState(null);
    const [datePreset, setDatePreset] = useState('last_30d');

    // Create-campaign form
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newBudget, setNewBudget] = useState('');
    const [newKeywords, setNewKeywords] = useState('');
    const [creating, setCreating] = useState(false);
    const [createPreview, setCreatePreview] = useState(null); // { name, budgetMicros, keywords, message }

    // Pause/enable toggle confirmation
    const [statusChangePreview, setStatusChangePreview] = useState(null); // { campaign, targetAction }
    const [statusChanging, setStatusChanging] = useState(false);

    const loadConnection = useCallback(async () => {
        setConnectionLoading(true);
        try {
            const response = await authFetch(`${API_URL}/google-ads/connection`);
            if (response.ok) {
                setConnection(await response.json());
            }
        } catch (error) {
            console.error('Failed to load Google Ads connection', error);
        } finally {
            setConnectionLoading(false);
        }
    }, [authFetch]);

    const loadConnections = useCallback(async () => {
        try {
            const response = await authFetch(`${API_URL}/google-ads/connections`);
            if (response.ok) {
                const data = await response.json();
                const candidates = data.connections || [];
                setConnections(candidates);
                if (candidates.length > 0 && !candidates.some((candidate) => candidate.selected)) {
                    setSelectingAccount(true);
                }
            }
        } catch (error) {
            console.error('Failed to load Google Ads account choices', error);
        }
    }, [authFetch]);

    const loadCampaigns = useCallback(async () => {
        setCampaignsLoading(true);
        setCampaignError(null);
        try {
            const response = await authFetch(`${API_URL}/google-ads/campaigns?date_preset=${datePreset}`);
            if (response.ok) {
                const data = await response.json();
                setCampaigns(data.campaigns || []);
            } else if (response.status !== 404) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || 'Failed to load Google Ads campaigns');
            }
        } catch (error) {
            const message = error.message || 'Failed to load Google Ads campaigns';
            setCampaignError(message);
            showError(message);
        } finally {
            setCampaignsLoading(false);
        }
    }, [authFetch, datePreset, showError]);

    useEffect(() => {
        loadConnection();
        loadConnections();
        // Query param set by the OAuth callback redirect
        const query = new URLSearchParams(window.location.search);
        if (query.get('connected') === '1') {
            showSuccess('Google Ads account connected');
            window.history.replaceState({}, '', window.location.pathname);
        } else if (query.get('select') === '1') {
            setSelectingAccount(true);
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [loadConnection, loadConnections, showSuccess]);

    useEffect(() => {
        if (connection?.connected) {
            loadCampaigns();
        }
    }, [connection, loadCampaigns]);

    const handleConnect = async () => {
        try {
            const response = await authFetch(`${API_URL}/google-ads/oauth/start`);
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || 'Failed to start Google Ads connection');
            }
            const { oauth_url } = await response.json();
            window.location.href = oauth_url;
        } catch (error) {
            showError(error.message || 'Failed to start Google Ads connection');
        }
    };

    const handleDisconnect = async () => {
        setDisconnecting(true);
        try {
            await authFetch(`${API_URL}/google-ads/connection`, { method: 'DELETE' });
            setConnection({ connected: false });
            setCampaigns([]);
            showSuccess('Google Ads account disconnected');
        } catch (error) {
            showError('Failed to disconnect');
        } finally {
            setDisconnecting(false);
        }
    };

    const formatCustomerId = (customerId) => customerId.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');

    const handleSelectAccount = async (customerId) => {
        setSelectingCustomerId(customerId);
        try {
            const response = await authFetch(`${API_URL}/google-ads/connection/select`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customer_id: customerId }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || 'Failed to select Google Ads account');
            }
            setConnection(await response.json());
            setCampaigns([]);
            setCampaignError(null);
            setConnections((current) => current.map((candidate) => ({
                ...candidate,
                selected: candidate.customer_id === customerId,
            })));
            setSelectingAccount(false);
            showSuccess(`Google Ads account ${formatCustomerId(customerId)} selected`);
        } catch (error) {
            showError(error.message || 'Failed to select Google Ads account');
        } finally {
            setSelectingCustomerId(null);
        }
    };

    const handleReviewCreate = (event) => {
        event.preventDefault();
        const name = newName.trim();
        const budgetDollars = parseFloat(newBudget);
        if (!name || !budgetDollars || budgetDollars <= 0) {
            showError('Enter a campaign name and a daily budget greater than $0');
            return;
        }
        const keywords = newKeywords
            .split(/[,\n]/)
            .map((k) => k.trim())
            .filter(Boolean);
        const budgetMicros = Math.round(budgetDollars * 1_000_000);
        const message = `Create "${name}" as a Search campaign with a daily budget of $${budgetDollars.toFixed(2)}. `
            + 'It will be created PAUSED -- no spending starts until you explicitly enable it.'
            + (keywords.length ? ` Keywords: ${keywords.join(', ')}.` : '');
        setCreatePreview({ name, budgetMicros, keywords, message });
    };

    const handleConfirmCreate = async () => {
        if (!createPreview) return;
        setCreating(true);
        try {
            const response = await authFetch(`${API_URL}/google-ads/campaigns`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: createPreview.name,
                    daily_budget_micros: createPreview.budgetMicros,
                    keywords: createPreview.keywords,
                    confirm: true,
                }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || 'Failed to create campaign');
            }
            showSuccess('Campaign created (paused) -- enable it when you\'re ready to spend');
            setNewName('');
            setNewBudget('');
            setNewKeywords('');
            setShowCreateForm(false);
            loadCampaigns();
        } catch (error) {
            showError(error.message || 'Failed to create campaign');
        } finally {
            setCreating(false);
            setCreatePreview(null);
        }
    };

    const handleRequestStatusChange = (campaign) => {
        const isEnabled = campaign.status === 'ENABLED';
        setStatusChangePreview({
            campaign,
            action: isEnabled ? 'pause' : 'enable',
            title: isEnabled ? 'Pause campaign?' : 'Enable campaign?',
            message: isEnabled
                ? `Pause "${campaign.name}"? It will stop serving ads and spending immediately.`
                : `Enable "${campaign.name}"? This starts serving ads and spending against its budget immediately.`,
        });
    };

    const handleConfirmStatusChange = async () => {
        if (!statusChangePreview) return;
        const { campaign, action } = statusChangePreview;
        setStatusChanging(true);
        try {
            const response = await authFetch(`${API_URL}/google-ads/campaigns/${campaign.id}/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirm: true }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || `Failed to ${action} campaign`);
            }
            showSuccess(action === 'pause' ? 'Campaign paused' : 'Campaign enabled');
            loadCampaigns();
        } catch (error) {
            showError(error.message || `Failed to ${action} campaign`);
        } finally {
            setStatusChanging(false);
            setStatusChangePreview(null);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                        <TrendingUp size={32} className="text-amber-600" />
                        Google Ads
                    </h1>
                    <p className="text-gray-600">Connect a Google Ads account to see campaign performance</p>
                </div>
                {connection?.connected && (
                    <button
                        onClick={() => setShowCreateForm((v) => !v)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors shadow-sm shrink-0"
                    >
                        <Plus size={18} />
                        Create campaign
                    </button>
                )}
            </div>

            {!connectionLoading && (
                <div className="space-y-3">
                    <ConnectAccountCard
                        platformName="Google Ads"
                        icon={TrendingUp}
                        connected={!!connection?.connected}
                        accountLabel={connection?.account_name || (connection?.customer_id && formatCustomerId(connection.customer_id))}
                        connectedAt={connection?.connected_at}
                        onConnect={handleConnect}
                        onDisconnect={handleDisconnect}
                        disconnecting={disconnecting}
                    />
                    {connection?.connected && connections.length > 1 && !selectingAccount && (
                        <button
                            type="button"
                            onClick={() => setSelectingAccount(true)}
                            className="text-sm font-medium text-amber-700 hover:text-amber-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
                        >
                            Change Google Ads account
                        </button>
                    )}
                </div>
            )}

            {selectingAccount && connections.length > 0 && (
                <section aria-labelledby="google-account-heading" className="border-y border-gray-200 py-5">
                    <div className="flex items-center justify-between gap-4 mb-3">
                        <h2 id="google-account-heading" className="text-lg font-bold text-gray-900">Choose a Google Ads account</h2>
                        {connection?.connected && (
                            <button type="button" onClick={() => setSelectingAccount(false)} className="text-sm text-gray-600 hover:text-gray-900">
                                Cancel
                            </button>
                        )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {connections.map((candidate) => (
                            <button
                                key={candidate.customer_id}
                                type="button"
                                onClick={() => handleSelectAccount(candidate.customer_id)}
                                disabled={selectingCustomerId !== null}
                                aria-pressed={candidate.selected}
                                className={`min-h-16 border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:opacity-60 ${candidate.selected ? 'border-amber-600 bg-amber-50' : 'border-gray-300 bg-white hover:border-amber-500'}`}
                            >
                                <span className="block font-semibold text-gray-900">
                                    {candidate.account_name || `Account ${formatCustomerId(candidate.customer_id)}`}
                                </span>
                                {candidate.account_name && <span className="block text-sm text-gray-500">{formatCustomerId(candidate.customer_id)}</span>}
                                {selectingCustomerId === candidate.customer_id && <span className="block text-xs text-amber-700 mt-1">Selecting…</span>}
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {campaignError && connection?.connected && (
                <section role="alert" className="border border-amber-300 bg-amber-50 px-4 py-4 text-amber-950">
                    <h2 className="font-bold">Google Ads data is not available yet</h2>
                    <p className="mt-1 text-sm leading-6">{campaignError}</p>
                    {campaignError.includes('developer token is only approved') && (
                        <p className="mt-2 text-sm leading-6">
                            The account is connected correctly. Google must approve Basic or Standard API access before production campaigns can be read.
                        </p>
                    )}
                </section>
            )}

            {showCreateForm && connection?.connected && (
                <form onSubmit={handleReviewCreate} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
                    <h2 className="text-lg font-bold text-gray-900">New Search campaign</h2>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign name</label>
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="e.g. Spring Sale - Search"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Daily budget (USD)</label>
                            <input
                                type="number"
                                min="1"
                                step="0.01"
                                value={newBudget}
                                onChange={(e) => setNewBudget(e.target.value)}
                                placeholder="e.g. 25"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Keywords (optional, comma or newline separated)</label>
                        <textarea
                            value={newKeywords}
                            onChange={(e) => setNewKeywords(e.target.value)}
                            rows={3}
                            placeholder="running shoes, trail shoes, marathon training"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />
                    </div>
                    <p className="text-xs text-gray-500">The campaign is created PAUSED. Nothing spends until you enable it from the table below.</p>
                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => setShowCreateForm(false)}
                            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors shadow-sm"
                        >
                            Review &amp; create
                        </button>
                    </div>
                </form>
            )}

            {connection?.connected && !campaignError && (
                <PerformanceTable
                    rows={campaigns}
                    columns={CAMPAIGN_COLUMNS}
                    loading={campaignsLoading}
                    datePreset={datePreset}
                    onDatePresetChange={setDatePreset}
                    emptyMessage="No campaigns found for this date range."
                    renderActions={(campaign) => (
                        <button
                            onClick={() => handleRequestStatusChange(campaign)}
                            disabled={!['ENABLED', 'PAUSED'].includes(campaign.status)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:border-amber-500 hover:text-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {campaign.status === 'ENABLED' ? <Pause size={13} /> : <Play size={13} />}
                            {campaign.status === 'ENABLED' ? 'Pause' : 'Enable'}
                        </button>
                    )}
                />
            )}

            <ConfirmationModal
                isOpen={!!createPreview}
                onClose={() => setCreatePreview(null)}
                onConfirm={handleConfirmCreate}
                title="Create this campaign?"
                message={createPreview?.message}
                confirmText={creating ? 'Creating…' : 'Create campaign'}
                isDestructive={false}
                icon={Plus}
            />

            <ConfirmationModal
                isOpen={!!statusChangePreview}
                onClose={() => setStatusChangePreview(null)}
                onConfirm={handleConfirmStatusChange}
                title={statusChangePreview?.title}
                message={statusChangePreview?.message}
                confirmText={statusChanging ? 'Please wait…' : (statusChangePreview?.action === 'pause' ? 'Pause' : 'Enable')}
                isDestructive={statusChangePreview?.action === 'pause'}
                icon={statusChangePreview?.action === 'pause' ? Pause : Play}
            />
        </div>
    );
}

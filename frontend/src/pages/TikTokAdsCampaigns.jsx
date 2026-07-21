import React, { useCallback, useEffect, useState } from 'react';
import { Music2, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ConnectAccountCard from '../components/ConnectAccountCard';
import ConfirmationModal from '../components/ConfirmationModal';
import PerformanceTable from '../components/PerformanceTable';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const CAMPAIGN_COLUMNS = [
    { key: 'campaign_name', label: 'Campaign', numeric: false },
    { key: 'impressions', label: 'Impressions', numeric: true },
    { key: 'clicks', label: 'Clicks', numeric: true },
    { key: 'spend', label: 'Spend', numeric: true, format: (value) => `$${Number(value || 0).toFixed(2)}` },
    { key: 'conversion', label: 'Conversions', numeric: true },
];

export default function TikTokAdsCampaigns() {
    const { authFetch } = useAuth();
    const { showError, showSuccess } = useToast();
    const [connection, setConnection] = useState(null);
    const [loadingConnection, setLoadingConnection] = useState(true);
    const [campaigns, setCampaigns] = useState([]);
    const [loadingCampaigns, setLoadingCampaigns] = useState(false);
    const [datePreset, setDatePreset] = useState('last_30d');
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [name, setName] = useState('');
    const [dailyBudget, setDailyBudget] = useState('');
    const [preview, setPreview] = useState(null);

    const loadConnection = useCallback(async () => {
        setLoadingConnection(true);
        try {
            const response = await authFetch(`${API_URL}/tiktok-ads/connection`);
            if (response.ok) setConnection(await response.json());
        } catch {
            showError('Failed to load TikTok Ads connection');
        } finally {
            setLoadingConnection(false);
        }
    }, [authFetch, showError]);

    const loadCampaigns = useCallback(async () => {
        if (!connection?.connected) return;
        setLoadingCampaigns(true);
        try {
            const response = await authFetch(`${API_URL}/tiktok-ads/campaigns?date_preset=${datePreset}`);
            if (response.ok) {
                const data = await response.json();
                setCampaigns(data.campaigns || []);
            } else if (response.status !== 404 && response.status !== 503) {
                const error = await response.json().catch(() => ({}));
                showError(error.detail || 'Failed to load TikTok campaigns');
            }
        } finally {
            setLoadingCampaigns(false);
        }
    }, [authFetch, connection?.connected, datePreset, showError]);

    useEffect(() => { loadConnection(); }, [loadConnection]);
    useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

    const connect = async () => {
        try {
            const response = await authFetch(`${API_URL}/tiktok-ads/oauth/start`);
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || 'Failed to start TikTok connection');
            }
            window.location.href = (await response.json()).oauth_url;
        } catch (error) {
            showError(error.message || 'Failed to start TikTok connection');
        }
    };

    const disconnect = async () => {
        try {
            const response = await authFetch(`${API_URL}/tiktok-ads/connection`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to disconnect TikTok Ads');
            setConnection({ connected: false });
            setCampaigns([]);
            showSuccess('TikTok Ads disconnected');
        } catch (error) {
            showError(error.message || 'Failed to disconnect TikTok Ads');
        }
    };

    const reviewCreate = (event) => {
        event.preventDefault();
        const budget = Number(dailyBudget);
        if (!name.trim() || !Number.isFinite(budget) || budget <= 0) {
            showError('Enter a campaign name and a daily budget greater than $0');
            return;
        }
        setPreview({ name: name.trim(), dailyBudget: budget });
    };

    const create = async () => {
        if (!preview) return;
        try {
            const response = await authFetch(`${API_URL}/tiktok-ads/campaigns`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: preview.name, daily_budget: preview.dailyBudget, confirm: true }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || 'Failed to create TikTok campaign');
            }
            showSuccess('TikTok campaign created paused');
            setName(''); setDailyBudget(''); setShowCreateForm(false);
            loadCampaigns();
        } catch (error) {
            showError(error.message || 'Failed to create TikTok campaign');
        } finally {
            setPreview(null);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3"><Music2 size={32} className="text-amber-600" />TikTok Ads</h1>
                    <p className="text-gray-600">Connect a TikTok advertiser to manage and measure campaigns</p>
                </div>
                {connection?.connected && <button onClick={() => setShowCreateForm((visible) => !visible)} className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700"><Plus size={18} />Create campaign</button>}
            </div>

            {!loadingConnection && <ConnectAccountCard platformName="TikTok Ads" icon={Music2} connected={!!connection?.connected} accountLabel={connection?.account_name || connection?.advertiser_id} connectedAt={connection?.connected_at} onConnect={connect} onDisconnect={disconnect} />}

            {showCreateForm && <form onSubmit={reviewCreate} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
                <h2 className="text-lg font-bold text-gray-900">New TikTok campaign</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                    <label className="text-sm font-medium text-gray-700">Campaign name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" /></label>
                    <label className="text-sm font-medium text-gray-700">Daily budget (USD)<input type="number" min="1" step="0.01" value={dailyBudget} onChange={(event) => setDailyBudget(event.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" /></label>
                </div>
                <p className="text-xs text-gray-500">The campaign will be created PAUSED. It cannot spend until enabled in TikTok Ads Manager.</p>
                <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowCreateForm(false)} className="px-4 py-2 text-gray-700">Cancel</button><button type="submit" className="px-4 py-2 bg-amber-600 text-white rounded-lg">Review &amp; create</button></div>
            </form>}

            {connection?.connected && <PerformanceTable rows={campaigns.map((row) => ({ ...row, id: row.campaign_id }))} columns={CAMPAIGN_COLUMNS} loading={loadingCampaigns} datePreset={datePreset} onDatePresetChange={setDatePreset} emptyMessage="No TikTok campaigns found for this date range." />}

            <ConfirmationModal isOpen={!!preview} onClose={() => setPreview(null)} onConfirm={create} title="Create this TikTok campaign?" message={preview ? `Create "${preview.name}" with a $${preview.dailyBudget.toFixed(2)} daily budget. It will remain PAUSED until explicitly enabled.` : ''} confirmText="Create paused campaign" isDestructive={false} icon={Plus} />
        </div>
    );
}

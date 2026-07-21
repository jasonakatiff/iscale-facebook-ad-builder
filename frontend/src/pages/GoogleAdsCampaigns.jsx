import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ConnectAccountCard from '../components/ConnectAccountCard';
import PerformanceTable from '../components/PerformanceTable';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export default function GoogleAdsCampaigns() {
    const { authFetch } = useAuth();
    const { showError, showSuccess } = useToast();

    const [connection, setConnection] = useState(null);
    const [connectionLoading, setConnectionLoading] = useState(true);
    const [disconnecting, setDisconnecting] = useState(false);
    const [campaigns, setCampaigns] = useState([]);
    const [campaignsLoading, setCampaignsLoading] = useState(false);
    const [datePreset, setDatePreset] = useState('last_30d');

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

    const loadCampaigns = useCallback(async () => {
        setCampaignsLoading(true);
        try {
            const response = await authFetch(`${API_URL}/google-ads/campaigns?date_preset=${datePreset}`);
            if (response.ok) {
                const data = await response.json();
                setCampaigns(data.campaigns || []);
            } else if (response.status !== 404) {
                const error = await response.json().catch(() => ({}));
                showError(error.detail || 'Failed to load Google Ads campaigns');
            }
        } catch (error) {
            showError('Failed to load Google Ads campaigns');
        } finally {
            setCampaignsLoading(false);
        }
    }, [authFetch, datePreset, showError]);

    useEffect(() => {
        loadConnection();
        // Query param set by the OAuth callback redirect
        if (new URLSearchParams(window.location.search).get('connected') === '1') {
            showSuccess('Google Ads account connected');
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, [loadConnection, showSuccess]);

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

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                    <TrendingUp size={32} className="text-amber-600" />
                    Google Ads
                </h1>
                <p className="text-gray-600">Connect a Google Ads account to see campaign performance</p>
            </div>

            {!connectionLoading && (
                <ConnectAccountCard
                    platformName="Google Ads"
                    icon={TrendingUp}
                    connected={!!connection?.connected}
                    accountLabel={connection?.account_name || connection?.customer_id}
                    connectedAt={connection?.connected_at}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    disconnecting={disconnecting}
                />
            )}

            {connection?.connected && (
                <PerformanceTable
                    rows={campaigns}
                    loading={campaignsLoading}
                    datePreset={datePreset}
                    onDatePresetChange={setDatePreset}
                    emptyMessage="No campaigns found for this date range."
                />
            )}
        </div>
    );
}

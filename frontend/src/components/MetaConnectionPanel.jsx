import { useCallback, useEffect, useRef, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { clearAdAccountCache } from '../lib/facebookApi';
import { canUseMetaConnection } from '../lib/metaConnection';
import ConnectAccountCard from './ConnectAccountCard';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const MAX_TIMEOUT_MS = 2147483647;

// eslint-disable-next-line react-refresh/only-export-components
export function useMetaConnection() {
    const { authFetch } = useAuth();
    const { showError, showSuccess } = useToast();
    const [connection, setConnectionState] = useState(null);
    const [connectionCheckedAt, setConnectionCheckedAt] = useState(() => Date.now());
    const [connections, setConnections] = useState([]);
    const [connectionLoading, setConnectionLoading] = useState(true);
    const [connectionError, setConnectionError] = useState('');
    const [selectingAccount, setSelectingAccount] = useState(false);
    const [selectingAccountId, setSelectingAccountId] = useState(null);
    const [disconnecting, setDisconnecting] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const requestVersion = useRef(0);
    const actionPending = useRef(false);
    const callbackSelection = useRef(new URLSearchParams(window.location.search).get('select') === '1');
    const setConnection = useCallback((next) => {
        clearAdAccountCache();
        setConnectionState(next);
    }, []);
    // Sprint 8: surface lapsed/expiring Meta user tokens so the operator
    // reconnects before campaigns start failing with raw Meta 401s. Lapsed
    // tokens can't be refreshed server-side without a fresh user grant.
    const metaTokenWarning = (() => {
        if (connection?.error?.message) return connection.error.message;
        if (!connection?.token_expires_at) return null;
        const expiry = new Date(connection.token_expires_at).getTime();
        if (!Number.isFinite(expiry)) return 'Token expiry could not be verified. Reconnect your personal Meta account.';
        const daysLeft = (expiry - connectionCheckedAt) / 86400000;
        if (daysLeft <= 0)
            return 'Access token has expired. Reconnect Meta Ads to keep reporting and campaign actions working.';
        if (daysLeft <= 7)
            return `Access token expires in ${Math.ceil(daysLeft)} day${daysLeft > 1 ? 's' : ''}. Reconnect soon to avoid interruption.`;
        return null;
    })();

    const refreshConnection = useCallback(async () => {
        const version = ++requestVersion.current;
        setConnectionLoading(true);
        setConnectionError('');
        try {
            const [currentResponse, choicesResponse] = await Promise.all([
                authFetch(`${API_URL}/facebook/connection`),
                authFetch(`${API_URL}/facebook/connections`),
            ]);
            if (!currentResponse.ok || !choicesResponse.ok)
                throw new Error('Unable to verify Meta connection. Retry to load your account access.');
            const [current, choices] = await Promise.all([currentResponse.json(), choicesResponse.json()]);
            if (typeof current?.connected !== 'boolean' || !Array.isArray(choices.connections))
                throw new Error('Unable to verify Meta connection. The account response was incomplete.');
            if (version !== requestVersion.current) return;
            setConnectionCheckedAt(Date.now());
            setConnection(current);
            setConnections(choices.connections);
            setSelectingAccount(current.state === 'selection_required' || callbackSelection.current);
            callbackSelection.current = false;
        } catch (error) {
            if (version !== requestVersion.current) return;
            setConnectionError(error.message || 'Unable to verify Meta connection. Retry to continue.');
        } finally {
            if (version === requestVersion.current) setConnectionLoading(false);
        }
    }, [authFetch, setConnection]);

    useEffect(() => {
        refreshConnection();
        const query = new URLSearchParams(window.location.search);
        if (query.get('connected') === '1') {
            showSuccess('Meta Ads account connected');
            window.history.replaceState({}, '', window.location.pathname);
        } else if (query.get('select') === '1') {
            setSelectingAccount(true);
            window.history.replaceState({}, '', window.location.pathname);
        }
        return () => { requestVersion.current += 1; };
    }, [refreshConnection, showSuccess]);

    useEffect(() => {
        if (selectingAccountId || disconnecting || connecting) return;
        if (!connection?.token_expires_at || !canUseMetaConnection(connection)) return;
        const delay = Date.parse(connection.token_expires_at) - Date.now();
        const timer = setTimeout(refreshConnection, Math.min(Math.max(delay, 0) + 1, MAX_TIMEOUT_MS));
        return () => clearTimeout(timer);
    }, [connection, refreshConnection, selectingAccountId, disconnecting, connecting]);

    const connectMeta = async () => {
        if (actionPending.current || connection?.oauth_available === false) return;
        actionPending.current = true;
        setConnecting(true);
        try {
            const response = await authFetch(`${API_URL}/facebook/oauth/start`);
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || 'Failed to start Meta connection');
            }
            window.location.href = (await response.json()).oauth_url;
        } catch (error) {
            showError(error.message || 'Failed to start Meta connection');
            setConnectionCheckedAt(Date.now());
            setConnecting(false);
            actionPending.current = false;
        }
    };

    const disconnectMeta = async () => {
        if (actionPending.current || connection?.source === 'managed') return;
        actionPending.current = true;
        requestVersion.current += 1;
        setDisconnecting(true);
        try {
            const response = await authFetch(`${API_URL}/facebook/connection`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Failed to disconnect Meta Ads');
            await refreshConnection();
            showSuccess('Personal Meta connection disconnected');
        } catch (error) {
            showError(error.message || 'Failed to disconnect Meta Ads');
        } finally {
            setConnectionCheckedAt(Date.now());
            setDisconnecting(false);
            actionPending.current = false;
        }
    };

    const selectMetaAccount = async (adAccountId) => {
        if (actionPending.current) return;
        actionPending.current = true;
        const version = ++requestVersion.current;
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
            const selected = await response.json();
            if (version !== requestVersion.current) return;
            setConnectionCheckedAt(Date.now());
            setConnection(selected);
            setConnections((current) =>
                current.map((candidate) => ({
                    ...candidate,
                    selected: candidate.ad_account_id === adAccountId,
                })),
            );
            setSelectingAccount(false);
            setConnectionLoading(false);
            setConnectionError('');
            showSuccess('Meta ad account selected');
        } catch (error) {
            if (version === requestVersion.current) showError(error.message || 'Failed to select Meta ad account');
        } finally {
            setConnectionCheckedAt(Date.now());
            setSelectingAccountId(null);
            actionPending.current = false;
        }
    };

    return {
        connection,
        connections,
        connectionLoading,
        connectionError,
        refreshConnection,
        connecting,
        connectionCheckedAt,
        canUseCampaign: canUseMetaConnection(connection, connectionCheckedAt) && !connectionLoading && !connectionError && !selectingAccount && !selectingAccountId && !disconnecting && !connecting,
        selectingAccount,
        setSelectingAccount,
        selectingAccountId,
        disconnecting,
        metaTokenWarning,
        connectMeta,
        disconnectMeta,
        selectMetaAccount,
    };
}

export function MetaConnectionPanel({ meta, compact = false }) {
    const {
        connection,
        connectionCheckedAt,
        connections,
        connectionLoading,
        connectionError,
        refreshConnection,
        connecting,
        selectingAccount,
        setSelectingAccount,
        selectingAccountId,
        disconnecting,
        metaTokenWarning,
        connectMeta,
        disconnectMeta,
        selectMetaAccount,
    } = meta;
    if (connectionLoading) return <p role="status" className="p-6 text-muted">Loading Meta connection…</p>;
    if (connectionError) return (
        <div role="alert" className="studio-panel p-6 mb-6 border-danger-line">
            <h2 className="font-semibold mb-2">Unable to verify Meta connection</h2>
            <p className="text-sm text-muted mb-4">{connectionError}</p>
            <button type="button" className="studio-button" onClick={refreshConnection}>Retry Meta connection</button>
        </div>
    );
    if (connecting) return <p role="status" className="studio-panel p-6 mb-6">Connecting to Meta…</p>;
    const usable = canUseMetaConnection(connection, connectionCheckedAt);
    const expiry = Date.parse(connection?.token_expires_at);
    const expired = connection?.state === 'expired' || (Number.isFinite(expiry) && expiry <= connectionCheckedAt);
    const statusLabel = usable
        ? connection?.source === 'managed' ? 'Connected through workspace' : 'Connected'
        : expired ? 'Connection expired'
            : connection?.state === 'unavailable' ? 'Connection unavailable'
                : connection?.state === 'selection_required' ? 'Account selection required' : 'Not connected';
    return (
        <div className={compact ? "meta-panel-compact" : "mb-6"}>
            {!connectionLoading && (
                <div className={compact ? "meta-summary" : "space-y-3"}>
                    <ConnectAccountCard
                        compact={compact}
                        platformName="Meta Ads"
                        icon={Megaphone}
                        connected={usable}
                        statusLabel={statusLabel}
                        accountLabel={connection?.account_name || connection?.ad_account_id}
                        connectedAt={connection?.connected_at}
                        onConnect={connectMeta}
                        onDisconnect={connection?.source === 'managed' || connection?.can_disconnect === false ? undefined : disconnectMeta}
                        connectLabel={expired || connection?.state === 'unavailable' ? 'Reconnect' : 'Connect'}
                        connectDisabled={connection?.oauth_available === false}
                        disconnecting={disconnecting}
                        warning={metaTokenWarning}
                    />
                    {usable && connection?.source === 'managed' && <p className="text-xs text-muted">Your workspace administrator manages this connection.</p>}
                    {connection?.oauth_available === false && <p role="status" className="text-sm text-muted">Personal Meta connections will be available after setup.</p>}
                    {usable && connections.length > (connection?.source === 'managed' ? 0 : 1) && !selectingAccount && (
                        <button
                            type="button"
                            onClick={() => setSelectingAccount(true)}
                            className="text-sm font-medium text-brand-ink hover:text-brand-ink"
                        >
                            {connection?.source === 'managed' ? 'Choose a personal Meta account' : 'Change Meta ad account'}
                        </button>
                    )}
                </div>
            )}

            {selectingAccount && connections.length > 0 && (
                <section
                    aria-labelledby="meta-account-heading"
                    className="border-y border-line py-5"
                >
                    <h2
                        id="meta-account-heading"
                        className="text-lg font-bold text-foreground mb-3"
                    >
                        Choose a Meta ad account
                    </h2>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {connections.map((candidate) => (
                            <button
                                key={candidate.ad_account_id}
                                type="button"
                                onClick={() => selectMetaAccount(candidate.ad_account_id)}
                                disabled={selectingAccountId !== null}
                                aria-pressed={candidate.selected}
                                className={`min-h-16 border px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:opacity-60 ${candidate.selected ? 'border-amber-600 bg-brand-soft' : 'border-line-strong bg-panel hover:border-amber-500'}`}
                            >
                                <span className="block font-semibold text-foreground">
                                    {candidate.account_name || 'Meta ad account'}
                                </span>
                                <span className="block text-sm text-muted">
                                    {candidate.ad_account_id}
                                </span>
                                {selectingAccountId === candidate.ad_account_id && (
                                    <span className="block text-xs text-brand-ink mt-1">
                                        Selecting…
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                    {usable && <button type="button" className="studio-button mt-3" onClick={() => setSelectingAccount(false)}>Keep current account</button>}
                </section>
            )}
        </div>
    );
}

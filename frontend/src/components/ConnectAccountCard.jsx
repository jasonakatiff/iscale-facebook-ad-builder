import React from 'react';
import { CheckCircle2, Unplug, ExternalLink, AlertTriangle } from 'lucide-react';

/**
 * Reusable "Connect Account" card for Google Ads, TikTok Ads, and Meta OAuth.
 * Composes into GoogleAdsCampaigns.jsx / TikTokAdsCampaigns.jsx / the
 * cross-platform Overview page — don't reimplement per-platform markup.
 * `warning` (optional): action-needed line shown under the status —
 * e.g. a lapsed/expiring OAuth token that the operator should reconnect.
 */
export default function ConnectAccountCard({
    platformName,
    icon,
    connected,
    accountLabel,
    connectedAt,
    onConnect,
    onDisconnect,
    disconnecting = false,
    warning,
    statusLabel,
    connectLabel = 'Connect',
    connectDisabled = false,
    compact = false,
}) {
    const Icon = icon;
    return (
        <div className={`bg-panel rounded-xl border border-line ${compact ? "connect-card-compact" : "shadow-sm p-6"}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-4 min-w-0">
                    <div className={`p-3 rounded-lg flex-shrink-0 ${connected ? 'bg-success-soft' : 'bg-brand-soft'}`}>
                        <Icon size={24} className={connected ? 'text-success' : 'text-brand-ink'} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-bold text-foreground">{platformName}</h3>
                        {connected ? (
                            <p className="text-sm text-secondary flex items-center gap-1">
                                <CheckCircle2 size={14} className="text-success" />
                                {statusLabel || 'Connected'}{accountLabel ? ` — ${accountLabel}` : ''}
                            </p>
                        ) : (
                            <p className="text-sm text-muted">{statusLabel || 'Not connected'}</p>
                        )}
                        {connected && connectedAt && (
                            <p className="text-xs text-faint mt-0.5">
                                Since {new Date(connectedAt).toLocaleDateString()}
                            </p>
                        )}
                        {warning && (
                            <p role="status" className="mt-1.5 flex items-start gap-1.5 text-xs text-brand-ink bg-brand-soft border border-brand-line rounded-lg px-2.5 py-1.5">
                                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                                <span>{warning}</span>
                            </p>
                        )}
                    </div>
                </div>

                {connected ? onDisconnect && (
                    <button
                        onClick={onDisconnect}
                        disabled={disconnecting}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-danger border border-danger-line rounded-lg hover:bg-danger-soft transition-colors disabled:opacity-50 flex-shrink-0 self-start sm:self-auto"
                    >
                        <Unplug size={16} />
                        {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                ) : (
                    <button
                        onClick={onConnect}
                        disabled={connectDisabled}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 flex-shrink-0 self-start sm:self-auto"
                    >
                        {connectLabel}
                        <ExternalLink size={16} />
                    </button>
                )}
            </div>
        </div>
    );
}

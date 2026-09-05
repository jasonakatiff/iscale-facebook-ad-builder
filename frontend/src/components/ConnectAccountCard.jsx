import React from 'react';
import { CheckCircle2, Unplug, ExternalLink, AlertTriangle } from 'lucide-react';

/**
 * Reusable "Connect Account" card for any ad platform OAuth flow (Google Ads
 * first, TikTok Ads in Sprint 3, Meta if it's ever retrofitted onto OAuth).
 * Composes into GoogleAdsCampaigns.jsx / TikTokAdsCampaigns.jsx / the
 * cross-platform Overview page — don't reimplement per-platform markup.
 * `warning` (optional, Sprint 8): action-needed line shown under the status —
 * e.g. a lapsed/expiring OAuth token that the operator should reconnect.
 */
export default function ConnectAccountCard({
    platformName,
    icon: Icon,
    connected,
    accountLabel,
    connectedAt,
    onConnect,
    onDisconnect,
    disconnecting = false,
    warning,
}) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-4 min-w-0">
                    <div className={`p-3 rounded-lg flex-shrink-0 ${connected ? 'bg-green-50' : 'bg-amber-50'}`}>
                        <Icon size={24} className={connected ? 'text-green-600' : 'text-amber-600'} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-bold text-gray-900">{platformName}</h3>
                        {connected ? (
                            <p className="text-sm text-gray-600 flex items-center gap-1">
                                <CheckCircle2 size={14} className="text-green-600" />
                                Connected{accountLabel ? ` — ${accountLabel}` : ''}
                            </p>
                        ) : (
                            <p className="text-sm text-gray-500">Not connected</p>
                        )}
                        {connected && connectedAt && (
                            <p className="text-xs text-gray-400 mt-0.5">
                                Since {new Date(connectedAt).toLocaleDateString()}
                            </p>
                        )}
                        {warning && (
                            <p role="status" className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                                <span>{warning}</span>
                            </p>
                        )}
                    </div>
                </div>

                {connected ? (
                    <button
                        onClick={onDisconnect}
                        disabled={disconnecting}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 flex-shrink-0 self-start sm:self-auto"
                    >
                        <Unplug size={16} />
                        {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                ) : (
                    <button
                        onClick={onConnect}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors flex-shrink-0 self-start sm:self-auto"
                    >
                        Connect
                        <ExternalLink size={16} />
                    </button>
                )}
            </div>
        </div>
    );
}

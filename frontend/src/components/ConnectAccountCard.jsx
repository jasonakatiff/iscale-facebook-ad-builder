import React from 'react';
import { CheckCircle2, Unplug, ExternalLink } from 'lucide-react';

/**
 * Reusable "Connect Account" card for any ad platform OAuth flow (Google Ads
 * first, TikTok Ads in Sprint 3, Meta if it's ever retrofitted onto OAuth).
 * Composes into GoogleAdsCampaigns.jsx / TikTokAdsCampaigns.jsx / the
 * cross-platform Overview page — don't reimplement per-platform markup.
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
}) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${connected ? 'bg-green-50' : 'bg-amber-50'}`}>
                        <Icon size={24} className={connected ? 'text-green-600' : 'text-amber-600'} />
                    </div>
                    <div>
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
                    </div>
                </div>

                {connected ? (
                    <button
                        onClick={onDisconnect}
                        disabled={disconnecting}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                        <Unplug size={16} />
                        {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                ) : (
                    <button
                        onClick={onConnect}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
                    >
                        Connect
                        <ExternalLink size={16} />
                    </button>
                )}
            </div>
        </div>
    );
}

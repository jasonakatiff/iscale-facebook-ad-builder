import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { TRACKING_MACROS } from '../lib/campaignWizard';
import { facebookRequest } from '../lib/facebookApi';

export function TrackingParameters({ value, onChange, accountId }) {
    const { hasRole } = useAuth();
    const { showSuccess, showError } = useToast();
    const [saving, setSaving] = useState(false);
    const save = async (scope) => {
        setSaving(true);
        try {
            await facebookRequest(
                `/tracking-defaults?scope=${scope}&ad_account_id=${encodeURIComponent(accountId)}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ urlParameters: value }),
                },
            );
            showSuccess(
                scope === 'system'
                    ? 'System tracking defaults saved.'
                    : 'Tracking defaults saved for this account.',
            );
        } catch (error) {
            showError(error.message);
        } finally {
            setSaving(false);
        }
    };
    return (
        <div className="space-y-3">
            <label htmlFor="creativeData.urlParameters" className="block text-sm font-medium">
                URL parameters
            </label>
            <textarea
                id="creativeData.urlParameters"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-line-strong rounded-lg font-mono text-sm focus:ring-2 focus:ring-amber-500"
            />
            <p className="text-xs text-muted">
                Keep the landing page URL separate. Insert Meta tracking macros below.
            </p>
            <div className="flex flex-wrap gap-2">
                {Object.entries(TRACKING_MACROS).map(([name, macro]) => (
                    <button
                        type="button"
                        key={name}
                        onClick={() => {
                            const parts = (value || '').split('&').filter(Boolean);
                            const entry = `${name}=${macro}`;
                            const index = parts.findIndex((part) => part.split('=')[0] === name);
                            if (index < 0) parts.push(entry);
                            else parts[index] = entry;
                            onChange(parts.join('&'));
                        }}
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-brand-soft"
                    >
                        {name}
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
                <button
                    type="button"
                    disabled={saving}
                    onClick={() => save('account')}
                    className="text-brand-ink underline"
                >
                    Save for this ad account
                </button>
                {hasRole('admin') && (
                    <button
                        type="button"
                        disabled={saving}
                        onClick={() => save('system')}
                        className="text-brand-ink underline"
                    >
                        Save as system default
                    </button>
                )}
            </div>
        </div>
    );
}

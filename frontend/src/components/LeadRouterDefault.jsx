import { useEffect, useState } from 'react';
import { usePlatformApi } from '../lib/platformApi';
import { useWorkspaceData } from '../lib/workspaceApi';
import { useToast } from '../context/ToastContext';
import { LeadRouterPicker } from './LeadRouterPicker';

export function LeadRouterDefault({ resourceType, resourceId }) {
    const api = usePlatformApi();
    const { showSuccess, showError } = useToast();
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState(null);
    const [saving, setSaving] = useState(false);
    const path = `/leadrouter/defaults/${resourceType}/${resourceId}`;
    const saved = useWorkspaceData(api, open && resourceId ? path : null, {
        poll: false,
    });
    useEffect(() => {
        if (saved.data) setValue(saved.data.data);
    }, [saved.data]);
    const save = async () => {
        setSaving(true);
        try {
            await api(path, {
                method: value ? 'PUT' : 'DELETE',
                ...(value
                    ? {
                          body: JSON.stringify({
                              campaignId: value.campaign.id,
                              connectionId: value.connectionId,
                          }),
                      }
                    : {}),
            });
            saved.reload();
            showSuccess(`Your LeadRouter ${resourceType} default was saved.`);
        } catch (error) {
            showError(error.message);
        } finally {
            setSaving(false);
        }
    };
    if (!resourceId) return null;
    return (
        <details
            className="border-t border-line pt-3 text-sm"
            open={open}
            onToggle={(event) => setOpen(event.currentTarget.open)}
        >
            <summary className="cursor-pointer font-medium">LeadRouter default</summary>
            {open && (
                <div className="space-y-3 mt-3">
                    <p className="text-xs text-muted">
                        Saved separately for your user. Product defaults take precedence over brand
                        defaults.
                    </p>
                    {saved.loading && <p role="status">Loading saved default…</p>}
                    {saved.error && (
                        <p role="alert" className="text-danger">
                            {saved.error}{' '}
                            <button type="button" className="underline" onClick={saved.reload}>
                                Retry
                            </button>
                        </p>
                    )}
                    {!saved.loading && !saved.error && (
                        <LeadRouterPicker value={value} onChange={setValue} expanded />
                    )}
                    <button
                        type="button"
                        className="studio-button"
                        onClick={save}
                        disabled={saving || saved.loading || !!saved.error}
                    >
                        Save LeadRouter default
                    </button>
                </div>
            )}
        </details>
    );
}

export function LeadRouterBrief({ brandId, productId, onUseOffer }) {
    const api = usePlatformApi();
    const [value, setValue] = useState(null);
    const query = new URLSearchParams();
    if (brandId) query.set('brandId', brandId);
    if (productId) query.set('productId', productId);
    const saved = useWorkspaceData(api, `/leadrouter/defaults/resolve?${query}`, {
        poll: false,
    });
    return (
        <div className="space-y-3 mb-5">
            <LeadRouterPicker value={value} onChange={setValue} />
            {saved.error && (
                <p role="alert" className="text-sm text-danger">
                    LeadRouter defaults: {saved.error}
                </p>
            )}
            {saved.data?.data && !value && (
                <button
                    type="button"
                    className="text-sm text-brand-ink underline"
                    onClick={() => setValue(saved.data.data)}
                >
                    Use {saved.data.data.resourceType} default: {saved.data.data.campaign.name}
                </button>
            )}
            {value && <UseLeadRouterOffer value={value} onUseOffer={onUseOffer} />}
        </div>
    );
}

function UseLeadRouterOffer({ value, onUseOffer }) {
    const api = usePlatformApi();
    const { showError } = useToast();
    const [busy, setBusy] = useState(false);
    const apply = async () => {
        setBusy(true);
        try {
            const result = await api(
                `/leadrouter/campaigns/${value.campaign.id}?connectionId=${value.connectionId}`,
            );
            if (result.data.status !== 'active')
                throw new Error('Choose an active LeadRouter campaign.');
            onUseOffer(result.data.offerName || result.data.name);
        } catch (error) {
            showError(error.message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <button type="button" className="studio-button" onClick={apply} disabled={busy}>
            Use LeadRouter offer in brief
        </button>
    );
}

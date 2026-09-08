import { useEffect, useState } from 'react';
import { useCampaign } from '../context/CampaignContext';
import { useToast } from '../context/ToastContext';
import { facebookRequest } from '../lib/facebookApi';
import { presetFromState, applyPreset } from '../lib/campaignWizard';
import { SearchableSelect } from './SearchableSelect';
import ConfirmationModal from './ConfirmationModal';

export function CampaignPresetLibrary() {
    const { state, setState, selectedAdAccount, publishProgress } =
        useCampaign();
    const { showSuccess, showError } = useToast();
    const [presets, setPresets] = useState([]);
    const [selected, setSelected] = useState('');
    const [name, setName] = useState('');
    const [vertical, setVertical] = useState('');
    const [loading, setLoading] = useState(false);
    const [refresh, setRefresh] = useState(0);
    const [deleting, setDeleting] = useState(false);
    const accountId = selectedAdAccount?.id;
    useEffect(() => {
        if (!accountId) return;
        let active = true;
        setSelected('');
        setLoading(true);
        facebookRequest(
            `/presets?ad_account_id=${encodeURIComponent(accountId)}&limit=200`,
        )
            .then((result) => {
                if (active) setPresets(result.data);
            })
            .catch((error) => {
                if (active) showError(error.message);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [accountId, refresh, showError]);
    if (!selectedAdAccount || publishProgress) return null;
    const save = async (update) => {
        if (!name.trim()) {
            showError('Enter a preset name.');
            return;
        }
        setLoading(true);
        try {
            await facebookRequest(
                update ? `/presets/${selected}` : '/presets',
                {
                    method: update ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name.trim(),
                        vertical: vertical.trim(),
                        ad_account_id: selectedAdAccount.id,
                        settings: presetFromState(state),
                    }),
                },
            );
            showSuccess('Campaign settings saved.');
            setRefresh((value) => value + 1);
        } catch (error) {
            showError(error.message);
        } finally {
            setLoading(false);
        }
    };
    return (
        <details className="campaign-presets border border-line rounded-lg px-3 py-2 mb-4">
            <summary className="font-medium cursor-pointer">
                Saved settings library
            </summary>
            <div className="space-y-4 mt-4">
                <SearchableSelect
                    label="Saved settings for this ad account"
                    value={selected}
                    options={presets.map((preset) => ({
                        ...preset,
                        name: `${preset.name}${preset.vertical ? ` · ${preset.vertical}` : ''}`,
                    }))}
                    onChange={(id) => {
                        setSelected(id);
                        const preset = presets.find((item) => item.id === id);
                        setName(preset?.name || '');
                        setVertical(preset?.vertical || '');
                    }}
                    loading={loading}
                />
                <div className="flex gap-3 text-sm">
                    <button
                        disabled={!selected || loading}
                        className="text-brand-ink underline disabled:opacity-40"
                        onClick={() => {
                            try {
                                setState((previous) =>
                                    applyPreset(
                                        previous,
                                        presets.find(
                                            (item) => item.id === selected,
                                        ),
                                    ),
                                );
                                showSuccess(
                                    'Settings loaded. Review the Page, pixel, and targeting before publishing.',
                                );
                            } catch (error) {
                                showError(error.message);
                            }
                        }}
                    >
                        Load settings
                    </button>
                    <button
                        disabled={!selected || loading}
                        className="text-danger underline disabled:opacity-40"
                        onClick={() => setDeleting(true)}
                    >
                        Delete preset
                    </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-sm">
                        Preset name
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="block mt-1 w-full border border-line-strong rounded-lg px-3 py-2"
                        />
                    </label>
                    <label className="text-sm">
                        Vertical / offer
                        <input
                            value={vertical}
                            onChange={(event) =>
                                setVertical(event.target.value)
                            }
                            className="block mt-1 w-full border border-line-strong rounded-lg px-3 py-2"
                        />
                    </label>
                </div>
                <div className="flex gap-3">
                    <button
                        disabled={loading}
                        onClick={() => save(false)}
                        className="px-3 py-2 rounded-lg bg-brand text-white text-sm"
                    >
                        Save current settings as new
                    </button>
                    {selected && (
                        <button
                            disabled={loading}
                            onClick={() => save(true)}
                            className="px-3 py-2 rounded-lg border border-line-strong text-sm"
                        >
                            Update selected preset
                        </button>
                    )}
                </div>
            </div>
            <ConfirmationModal
                isOpen={deleting}
                onClose={() => setDeleting(false)}
                title="Delete saved settings?"
                message="This removes the preset from your library."
                onConfirm={async () => {
                    try {
                        await facebookRequest(`/presets/${selected}`, {
                            method: 'DELETE',
                        });
                        setRefresh((value) => value + 1);
                        showSuccess('Preset deleted.');
                    } catch (error) {
                        showError(error.message);
                    }
                }}
            />
        </details>
    );
}

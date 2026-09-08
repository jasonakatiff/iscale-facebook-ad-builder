import { useEffect, useState } from 'react';
import { ChevronRight, Trash2 } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { buildAdVariants, validateWizard } from '../lib/campaignWizard';
import { ValidationErrors } from './ValidationErrors';

export default function BulkAdCreation({ onNext, onBack }) {
    const { state, setState, creativeData, adsData, setAdsData } = useCampaign();
    const [errors, setErrors] = useState([]);
    const source = JSON.stringify([
        creativeData.creatives.map(({ id, name }) => ({ id, name })),
        creativeData.headlines,
        creativeData.bodies,
    ]);
    useEffect(() => {
        setState((previous) =>
            previous.adsSource === source
                ? previous
                : {
                      ...previous,
                      adsData: buildAdVariants(previous.creativeData, previous.adsData),
                      adsSource: source,
                  },
        );
    }, [source, setState]);
    const next = () => {
        const found = validateWizard(state, 5);
        setErrors(found);
        if (!found.length) onNext();
    };
    return (
        <div>
            <h2 className="text-2xl font-bold mb-2">Bulk Ads</h2>
            <p className="text-secondary mb-6">
                Review the {adsData.length} media × headline × primary text combinations. Edit names
                before they are used in attribution.
            </p>
            <ValidationErrors errors={errors} />
            <div className="space-y-3">
                {adsData.map((ad, index) => {
                    const creative = creativeData.creatives.find(
                        (item) => item.id === ad.creativeId,
                    );
                    return (
                        <div
                            key={ad.id}
                            className="flex items-start gap-3 border border-line rounded-lg p-3"
                        >
                            {creative?.mediaType === 'video' ? (
                                <video
                                    src={creative.previewUrl || creative.videoUrl}
                                    className="w-16 h-16 object-cover rounded"
                                />
                            ) : (
                                <img
                                    src={creative?.previewUrl || creative?.imageUrl}
                                    alt={creative?.name || 'Ad media'}
                                    className="w-16 h-16 object-cover rounded"
                                />
                            )}
                            <div className="flex-1 min-w-0">
                                <label htmlFor={ad.id} className="block text-xs text-muted mb-1">
                                    Ad {index + 1} name
                                </label>
                                <input
                                    id={ad.id}
                                    value={ad.name}
                                    onChange={(event) =>
                                        setAdsData((previous) =>
                                            previous.map((item) =>
                                                item.id === ad.id
                                                    ? { ...item, name: event.target.value }
                                                    : item,
                                            ),
                                        )
                                    }
                                    className="w-full px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-amber-500"
                                />
                                <p className="text-sm mt-2 font-medium">
                                    {creativeData.headlines[ad.headlineIndex]}
                                </p>
                                <p className="text-xs text-muted line-clamp-2">
                                    {creativeData.bodies[ad.bodyIndex]}
                                </p>
                            </div>
                            <button
                                type="button"
                                aria-label={`Remove ad ${index + 1}`}
                                onClick={() =>
                                    setAdsData((previous) =>
                                        previous.filter((item) => item.id !== ad.id),
                                    )
                                }
                                className="p-2 text-danger"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    );
                })}
            </div>
            <div className="mt-8 flex justify-between">
                <button onClick={onBack} className="px-6 py-3 text-secondary">
                    Back
                </button>
                <button
                    onClick={next}
                    className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-lg"
                >
                    Review & Launch <ChevronRight size={20} />
                </button>
            </div>
        </div>
    );
}

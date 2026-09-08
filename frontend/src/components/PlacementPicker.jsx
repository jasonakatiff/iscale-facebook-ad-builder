import { PLACEMENTS } from '../lib/campaignWizard';

export function PlacementPicker({ targeting, onChange }) {
    const platforms = targeting.publisher_platforms || Object.keys(PLACEMENTS);
    const update = (platform, positions) =>
        onChange({
            ...targeting,
            publisher_platforms: positions.length
                ? [...new Set([...platforms, platform])]
                : platforms.filter((p) => p !== platform),
            [`${platform}_positions`]: positions,
        });
    return (
        <fieldset className="space-y-4">
            <legend className="font-semibold mb-2">Placements</legend>
            <p className="text-sm text-muted">
                Checked placements are included. Uncheck any placement to exclude it.
            </p>
            {Object.entries(PLACEMENTS).map(([platform, config]) => {
                const enabled = platforms.includes(platform);
                const positions =
                    targeting[`${platform}_positions`] || Object.keys(config.positions);
                return (
                    <div key={platform} className="border border-line rounded-lg p-4">
                        <label className="font-medium flex gap-2">
                            <input
                                type="checkbox"
                                checked={enabled}
                                onChange={(e) =>
                                    update(
                                        platform,
                                        e.target.checked ? Object.keys(config.positions) : [],
                                    )
                                }
                            />
                            {config.label}
                        </label>
                        {enabled && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                {Object.entries(config.positions).map(([position, label]) => (
                                    <label key={position} className="text-sm flex gap-2">
                                        <input
                                            type="checkbox"
                                            aria-label={`${config.label} ${label}`}
                                            checked={positions.includes(position)}
                                            onChange={(e) =>
                                                update(
                                                    platform,
                                                    e.target.checked
                                                        ? [...positions, position]
                                                        : positions.filter((p) => p !== position),
                                                )
                                            }
                                        />
                                        {label}
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </fieldset>
    );
}

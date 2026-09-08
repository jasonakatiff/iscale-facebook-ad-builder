import { useEffect, useState } from 'react';
import { searchLocations } from '../lib/facebookApi';

const GEO_KEYS = {
    country: 'countries',
    region: 'regions',
    city: 'cities',
    geo_market: 'geo_markets',
};
export function LocationPicker({ targeting, onChange, accountId, countriesOnly = false }) {
    const [query, setQuery] = useState('');
    const [mode, setMode] = useState('include');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        let cancelled = false;
        setResults([]);
        setError('');
        if (query.trim().length < 2 || !accountId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const timer = setTimeout(async () => {
            try {
                const data = await searchLocations(
                    query.trim(),
                    countriesOnly ? 'country' : 'country,region,city,geo_market',
                    accountId,
                );
                if (!cancelled) setResults(data);
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, accountId, countriesOnly]);
    const side = mode === 'include' ? 'geo_locations' : 'excluded_geo_locations';
    const select = (location) => {
        const kind = GEO_KEYS[location.type];
        if (!kind) return;
        const current = targeting[side]?.[kind] || [];
        const key = String(location.key);
        if (!current.some((value) => String(value.key || value) === key)) {
            const value =
                kind === 'countries' ? key : { key, name: location.name, type: location.type };
            onChange({ ...targeting, [side]: { ...targeting[side], [kind]: [...current, value] } });
        }
        setQuery('');
    };
    const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
    return (
        <fieldset className="space-y-3">
            <legend className="font-medium mb-2">
                {countriesOnly ? 'Category countries' : 'Locations'}
            </legend>
            <div className="flex flex-wrap gap-2">
                {!countriesOnly && (
                    <select
                        aria-label="Location inclusion"
                        value={mode}
                        onChange={(event) => setMode(event.target.value)}
                        className="border border-line-strong rounded-lg px-3 py-2"
                    >
                        <option value="include">Include</option>
                        <option value="exclude">Exclude</option>
                    </select>
                )}
                <div className="relative flex-1 min-w-48">
                    <input
                        aria-label={
                            countriesOnly ? 'Search category countries' : 'Search locations'
                        }
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={
                            countriesOnly
                                ? 'Search countries...'
                                : 'Search countries, states, cities...'
                        }
                        className="w-full border border-line-strong rounded-lg px-4 py-2 focus:ring-2 focus:ring-amber-500"
                    />
                    {query.length >= 2 && (
                        <div className="absolute z-20 bg-panel border border-line shadow-sm rounded-lg w-full max-h-60 overflow-auto">
                            {loading ? (
                                <p role="status" className="p-3 text-sm text-muted">
                                    Searching locations…
                                </p>
                            ) : error ? (
                                <p role="alert" className="p-3 text-sm text-danger">
                                    {error}
                                </p>
                            ) : results.length ? (
                                results.map((location) => (
                                    <button
                                        key={`${location.type}-${location.key}`}
                                        type="button"
                                        onClick={() => select(location)}
                                        className="block text-left w-full px-4 py-2 hover:bg-brand-soft"
                                    >
                                        <span className="block font-medium">{location.name}</span>
                                        <span className="text-xs text-muted">
                                            {location.type} ·{' '}
                                            {location.region ||
                                                location.country_name ||
                                                location.country_code}
                                        </span>
                                    </button>
                                ))
                            ) : (
                                <p className="p-3 text-sm text-muted">No matching locations</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {['geo_locations', ...(countriesOnly ? [] : ['excluded_geo_locations'])].map((field) =>
                Object.values(GEO_KEYS).map((kind) =>
                    (targeting[field]?.[kind] || []).map((value) => {
                        const key = String(value.key || value);
                        const name =
                            value.name || (kind === 'countries' ? countryNames.of(key) : key);
                        return (
                            <div
                                key={`${field}-${kind}-${key}`}
                                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm border ${field === 'geo_locations' ? 'bg-subtle border-line' : 'bg-danger-soft border-danger-line'}`}
                            >
                                <span>
                                    {name}{' '}
                                    <span className="text-xs text-muted">
                                        · {field === 'geo_locations' ? 'Included' : 'Excluded'}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    aria-label={`Remove ${name}`}
                                    onClick={() =>
                                        onChange({
                                            ...targeting,
                                            [field]: {
                                                ...targeting[field],
                                                [kind]: targeting[field][kind].filter(
                                                    (item) => String(item.key || item) !== key,
                                                ),
                                            },
                                        })
                                    }
                                    className="px-2 text-muted hover:text-danger"
                                >
                                    ×
                                </button>
                            </div>
                        );
                    }),
                ),
            )}
        </fieldset>
    );
}

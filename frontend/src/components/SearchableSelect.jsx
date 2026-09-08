import { useId, useState } from 'react';

export function SearchableSelect({
    label,
    value,
    options,
    onChange,
    loading = false,
    error = '',
    placeholder = 'Search...',
    required = false,
    disabled = false,
}) {
    const id = useId();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const filtered = [...options]
        .sort((a, b) => a.name.localeCompare(b.name))
        .filter((option) =>
            `${option.name} ${option.id}`.toLowerCase().includes(query.toLowerCase()),
        );
    const selected = options.find((option) => option.id === value);
    const select = (next) => {
        onChange(next);
        setOpen(false);
        setQuery('');
        setActive(-1);
    };
    return (
        <div
            className="relative"
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
            }}
        >
            <label htmlFor={id} className="block text-sm font-medium text-secondary mb-2">
                {label}
                {required ? ' *' : ''}
            </label>
            <div className="flex gap-2">
                <input
                    id={id}
                    role="combobox"
                    aria-label={label}
                    aria-expanded={open}
                    aria-controls={`${id}-list`}
                    aria-autocomplete="list"
                    aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
                    aria-invalid={!!error}
                    autoComplete="off"
                    value={open ? query : selected?.name || ''}
                    placeholder={loading ? 'Loading...' : placeholder}
                    disabled={loading || disabled}
                    onFocus={() => {
                        setOpen(true);
                        setQuery('');
                    }}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setOpen(true);
                        setActive(-1);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') setOpen(false);
                        if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            setOpen(true);
                            setActive((index) => Math.min(index + 1, filtered.length - 1));
                        }
                        if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            setActive((index) => Math.max(0, index - 1));
                        }
                        if (event.key === 'Enter' && open && filtered[active]) {
                            event.preventDefault();
                            select(filtered[active].id);
                        }
                    }}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500 ${error ? 'border-red-500' : 'border-line-strong'}`}
                />
                {value && (
                    <button
                        type="button"
                        onClick={() => select('')}
                        aria-label={`Clear ${label}`}
                        className="text-muted px-2"
                    >
                        ×
                    </button>
                )}
            </div>
            {open && !loading && (
                <ul
                    id={`${id}-list`}
                    role="listbox"
                    aria-label={label}
                    className="absolute z-30 w-full mt-1 bg-panel border border-line rounded-lg shadow-sm max-h-60 overflow-auto"
                >
                    {filtered.map((option, index) => (
                        <li
                            id={`${id}-${index}`}
                            key={option.id}
                            role="option"
                            aria-selected={value === option.id}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => select(option.id)}
                            className={`px-4 py-2 cursor-pointer hover:bg-brand-soft ${active === index ? 'bg-brand-soft' : ''}`}
                        >
                            {option.name}
                        </li>
                    ))}
                    {!filtered.length && <li className="p-3 text-muted">No results</li>}
                </ul>
            )}
            {error && <p className="text-sm text-danger mt-1">{error}</p>}
        </div>
    );
}

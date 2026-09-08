import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchableSelect } from './SearchableSelect';
import {
    LEADROUTER_SETTINGS_PATH,
    leadRouterSelection,
    useLeadRouterCatalog,
} from '../lib/leadrouter';

export function LeadRouterPicker({ value, onChange, expanded = false, includeInactive = false }) {
    const [open, setOpen] = useState(expanded);
    const { connection, catalog } = useLeadRouterCatalog(open);
    const connected = connection.data?.data;
    const rows = catalog.data?.data || [];
    const validConnection = value?.connectionId === connected?.id;
    const selected = validConnection ? rows.find((row) => row.id === value?.campaign.id) : null;
    const options = rows
        .filter((row) => includeInactive || row.status === 'active')
        .map((row) => ({
            id: row.id,
            name: `${row.name}${row.offerName ? ` · ${row.offerName}` : ''}${row.displayId ? ` · #${row.displayId}` : ''}`,
        }));
    return (
        <details
            className="border border-line rounded-lg px-3 py-2 text-sm"
            open={open}
            onToggle={(event) => setOpen(event.currentTarget.open)}
        >
            <summary className="cursor-pointer font-medium">
                LeadRouter
                {value ? ` · ${value.campaign.name}` : ' · Optional campaign link'}
            </summary>
            {open && (
                <div className="space-y-3 pt-3">
                    {(connection.loading || catalog.loading) && (
                        <p role="status" className="text-muted">
                            Loading LeadRouter…
                        </p>
                    )}
                    {(connection.error || catalog.error) && (
                        <div role="alert" className="text-danger">
                            {connection.error || catalog.error}{' '}
                            <button
                                type="button"
                                className="underline"
                                onClick={() => {
                                    connection.reload();
                                    catalog.reload();
                                }}
                            >
                                Retry LeadRouter
                            </button>
                        </div>
                    )}
                    {!connection.loading && !connection.error && !connected && (
                        <p className="text-muted">
                            Connect your LeadRouter account to choose campaigns and reuse defaults.
                        </p>
                    )}
                    {connected && (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                                <span>{connected.accountName} · Private to your user</span>
                                <button
                                    type="button"
                                    className="underline"
                                    disabled={catalog.loading}
                                    onClick={catalog.reload}
                                >
                                    Refresh campaigns
                                </button>
                            </div>
                            <SearchableSelect
                                label="LeadRouter campaign"
                                value={selected?.id || ''}
                                options={options}
                                loading={catalog.loading}
                                placeholder="Search campaigns or offers…"
                                onChange={(id) =>
                                    onChange(
                                        leadRouterSelection(
                                            connected.id,
                                            rows.find((row) => row.id === id),
                                        ),
                                    )
                                }
                            />
                            {value && !catalog.loading && !catalog.error && !selected && (
                                <p role="alert" className="text-danger">
                                    The saved campaign is unavailable or the connection changed.
                                    Choose another campaign or clear the link.
                                </p>
                            )}
                            {selected && (
                                <p className="text-xs text-muted">
                                    {selected.verticalName || 'No vertical'} · {selected.status}
                                    {selected.leadCount !== null
                                        ? ` · ${selected.leadCount.toLocaleString()} lifetime leads`
                                        : ''}
                                </p>
                            )}
                            {catalog.data?.fetchedAt && (
                                <p className="text-xs text-muted">
                                    Fetched {new Date(catalog.data.fetchedAt).toLocaleString()} ·
                                    Refresh on demand
                                </p>
                            )}
                            {!catalog.loading && !catalog.error && !options.length && (
                                <p className="text-muted">
                                    No {includeInactive ? '' : 'active '}campaigns are available to
                                    this key.
                                </p>
                            )}
                        </>
                    )}
                    <div className="flex flex-wrap gap-4 text-xs">
                        <Link className="text-brand-ink underline" to={LEADROUTER_SETTINGS_PATH}>
                            Configure LeadRouter
                        </Link>
                        {value && (
                            <button
                                type="button"
                                className="underline"
                                onClick={() => onChange(null)}
                            >
                                Clear LeadRouter link
                            </button>
                        )}
                    </div>
                </div>
            )}
        </details>
    );
}

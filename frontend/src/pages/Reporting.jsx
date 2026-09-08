import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchableSelect } from '../components/SearchableSelect';
import {
    LEADROUTER_SETTINGS_PATH,
    LEADROUTER_ORIGIN,
    useLeadRouterCatalog,
} from '../lib/leadrouter';
import { usePlatformApi } from '../lib/platformApi';
import { useWorkspaceData } from '../lib/workspaceApi';

export default function Reporting() {
    const [selectedId, setSelectedId] = useState('');
    const { connection, catalog } = useLeadRouterCatalog(true);
    const api = usePlatformApi();
    const associations = useWorkspaceData(api, '/leadrouter/defaults', {
        all: true,
        poll: false,
    });
    const rows = catalog.data?.data || [];
    const selected = rows.find((row) => row.id === selectedId);
    const linked = (associations.data || []).filter(
        (row) => row.resourceType === 'campaign' && row.campaign.id === selectedId,
    );
    return (
        <div className="space-y-5">
            <header className="studio-page-header">
                <div>
                    <h1 className="studio-heading">Campaign Reporting</h1>
                    <p className="studio-description">
                        LeadRouter campaign activity and your linked BreadWinner campaigns.
                    </p>
                </div>
                <Link className="studio-button" to={LEADROUTER_SETTINGS_PATH}>
                    Configure LeadRouter
                </Link>
            </header>
            <section className="studio-panel p-5 space-y-4" aria-label="LeadRouter reporting">
                <div className="flex flex-wrap justify-between gap-3">
                    <h2 className="font-semibold">LeadRouter campaigns</h2>
                    <button
                        className="studio-button"
                        disabled={catalog.loading || connection.loading}
                        onClick={() => {
                            connection.reload();
                            catalog.reload();
                            associations.reload();
                        }}
                    >
                        Refresh LeadRouter
                    </button>
                </div>
                {(connection.loading || catalog.loading) && (
                    <p role="status">Loading LeadRouter…</p>
                )}
                {(connection.error || catalog.error) && (
                    <p role="alert" className="text-danger">
                        {connection.error || catalog.error}
                    </p>
                )}
                {!connection.loading && !connection.error && !connection.data?.data && (
                    <p className="text-muted">
                        Connect LeadRouter to see your campaign activity here.
                    </p>
                )}
                {connection.data?.data && !catalog.error && (
                    <>
                        <SearchableSelect
                            label="LeadRouter reporting campaign"
                            value={selectedId}
                            options={rows.map((row) => ({
                                id: row.id,
                                name: `${row.name} · ${row.offerName || 'No offer'}`,
                            }))}
                            onChange={setSelectedId}
                            loading={catalog.loading}
                        />
                        {!catalog.loading && !rows.length && (
                            <p>No campaigns are available to this LeadRouter key.</p>
                        )}
                        {selected && (
                            <div className="grid sm:grid-cols-3 gap-4">
                                <Metric
                                    label="Lifetime leads"
                                    value={
                                        selected.leadCount === null
                                            ? 'Unavailable'
                                            : selected.leadCount.toLocaleString()
                                    }
                                />
                                <Metric label="Campaign status" value={selected.status} />
                                <Metric
                                    label="Offer"
                                    value={selected.offerName || 'No offer name'}
                                />
                            </div>
                        )}
                        <p className="text-xs text-muted">
                            Source: LeadRouter campaign API. Counts cover the campaign’s lifetime
                            and are not attributed to individual BreadWinner ads.{' '}
                            {catalog.data?.fetchedAt
                                ? `Fetched ${new Date(catalog.data.fetchedAt).toLocaleString()}.`
                                : ''}
                        </p>
                    </>
                )}
            </section>
            {selected && (
                <section className="studio-panel p-5 space-y-3">
                    <h2 className="font-semibold">Your BreadWinner campaign links</h2>
                    {associations.loading && <p role="status">Loading campaign links…</p>}
                    {associations.error && (
                        <p role="alert" className="text-danger">
                            {associations.error}
                        </p>
                    )}
                    {!associations.loading &&
                        !associations.error &&
                        (linked.length ? (
                            <ul className="space-y-2">
                                {linked.map((row) => (
                                    <li key={row.resourceId} className="text-sm break-all">
                                        BreadWinner campaign {row.resourceId} · Saved{' '}
                                        {new Date(row.updatedAt).toLocaleString()}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted">
                                No published BreadWinner campaigns are linked to this campaign for
                                your user.
                            </p>
                        ))}
                </section>
            )}
            <div className="flex flex-wrap gap-4 text-sm text-brand-ink underline">
                <a href={LEADROUTER_ORIGIN} target="_blank" rel="noreferrer">
                    Open LeadRouter
                </a>
                <Link to="/dashboard">Meta performance dashboard</Link>
                <Link to="/help">Tracking and integration guide</Link>
            </div>
        </div>
    );
}

function Metric({ label, value }) {
    return (
        <div className="rounded-lg border border-line p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="text-lg font-semibold mt-2">{value}</p>
        </div>
    );
}

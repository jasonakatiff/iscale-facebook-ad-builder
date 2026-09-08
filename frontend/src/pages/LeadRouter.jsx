import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlatformApi } from '../lib/platformApi';
import { useWorkspaceData } from '../lib/workspaceApi';
import { useToast } from '../context/ToastContext';
import { useBrands } from '../context/BrandContext';
import { SearchableSelect } from '../components/SearchableSelect';
import { LeadRouterPicker } from '../components/LeadRouterPicker';
import { LeadRouterDefault } from '../components/LeadRouterDefault';
import ConfirmationModal from '../components/ConfirmationModal';

export default function LeadRouter() {
    const api = usePlatformApi();
    const { brands } = useBrands();
    const { showSuccess, showError } = useToast();
    const connection = useWorkspaceData(api, '/leadrouter/connection', {
        poll: false,
    });
    const [accountType, setAccountType] = useState('partner');
    const [apiKey, setApiKey] = useState('');
    const [busy, setBusy] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const [selection, setSelection] = useState(null);
    const [brandId, setBrandId] = useState('');
    const [productId, setProductId] = useState('');
    const connected = connection.data?.data;
    const products = brands.find((brand) => brand.id === brandId)?.products || [];
    const connect = async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
            await api('/leadrouter/connection', {
                method: 'PUT',
                body: JSON.stringify({ accountType, apiKey }),
            });
            setApiKey('');
            connection.reload();
            showSuccess('LeadRouter connected.');
        } catch (error) {
            setApiKey('');
            showError(error.message);
        } finally {
            setBusy(false);
        }
    };
    const disconnect = async () => {
        await api('/leadrouter/connection', { method: 'DELETE' });
        setSelection(null);
        connection.reload();
        showSuccess('LeadRouter disconnected.');
    };
    return (
        <div className="space-y-5 max-w-5xl">
            <header className="studio-page-header">
                <div>
                    <h1 className="studio-heading">LeadRouter</h1>
                    <p className="studio-description">
                        Connect once. Use your campaigns across creative briefs, ad deployment, and
                        reporting.
                    </p>
                </div>
                <Link className="studio-button" to="/help">
                    Integration guide
                </Link>
            </header>
            <section className="studio-panel p-5 space-y-4" aria-label="LeadRouter connection">
                <div>
                    <h2 className="font-semibold">Your native connection</h2>
                    <p className="text-sm text-muted mt-1">
                        Private to your BreadWinner user. Keys are encrypted on the server.
                    </p>
                </div>
                {connection.loading && <p role="status">Loading connection…</p>}
                {connection.error && (
                    <p role="alert" className="text-danger">
                        {connection.error}{' '}
                        <button type="button" className="underline" onClick={connection.reload}>
                            Retry connection
                        </button>
                    </p>
                )}
                {!connection.loading &&
                    !connection.error &&
                    (connected ? (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-success font-medium">
                                    Connected · {connected.accountName}
                                </p>
                                <p className="text-sm text-muted">
                                    {connected.accountType === 'partner'
                                        ? 'Partner account'
                                        : 'Organization API access'}{' '}
                                    · Campaigns refresh when requested
                                </p>
                            </div>
                            <button
                                type="button"
                                className="studio-button"
                                onClick={() => setDisconnecting(true)}
                            >
                                Disconnect LeadRouter
                            </button>
                        </div>
                    ) : (
                        <form className="space-y-4" onSubmit={connect}>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="text-sm font-medium">
                                    Account type
                                    <select
                                        className="help-input mt-2"
                                        value={accountType}
                                        onChange={(event) => setAccountType(event.target.value)}
                                        disabled={busy}
                                    >
                                        <option value="partner">Partner account</option>
                                        <option value="organization">Organization API key</option>
                                    </select>
                                </label>
                                <label className="text-sm font-medium">
                                    LeadRouter API key
                                    <input
                                        className="help-input mt-2"
                                        type="password"
                                        autoComplete="off"
                                        required
                                        minLength={16}
                                        maxLength={512}
                                        placeholder="lr_…"
                                        value={apiKey}
                                        onChange={(event) => setApiKey(event.target.value)}
                                        disabled={busy}
                                    />
                                </label>
                            </div>
                            <p className="text-xs text-muted">
                                Use a LeadRouter portal or organization key with campaign read
                                access. A lead-posting key cannot list campaigns.
                            </p>
                            <button className="studio-button primary" disabled={busy}>
                                {busy ? 'Checking LeadRouter…' : 'Connect LeadRouter'}
                            </button>
                        </form>
                    ))}
            </section>
            {connected && (
                <>
                    <LeadRouterPicker
                        key={connected.id}
                        value={selection}
                        onChange={setSelection}
                        expanded
                        includeInactive
                    />
                    <section
                        className="studio-panel p-5 space-y-4"
                        aria-label="LeadRouter catalog defaults"
                    >
                        <h2 className="font-semibold">Brand and product defaults</h2>
                        <p className="text-sm text-muted">
                            Choose a brand or product, then save the LeadRouter campaign you reuse
                            in its creative briefs.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <SearchableSelect
                                label="Brand for LeadRouter default"
                                value={brandId}
                                options={brands}
                                onChange={(id) => {
                                    setBrandId(id);
                                    setProductId('');
                                }}
                            />
                            <SearchableSelect
                                label="Product for LeadRouter default"
                                value={productId}
                                options={products}
                                onChange={setProductId}
                            />
                        </div>
                        {brandId && (
                            <LeadRouterDefault
                                key={`${connected.id}:${productId || brandId}`}
                                resourceType={productId ? 'product' : 'brand'}
                                resourceId={productId || brandId}
                            />
                        )}
                    </section>
                </>
            )}
            <section className="studio-panel p-5 text-sm space-y-3">
                <h2 className="font-semibold">Built into your workflow</h2>
                <div className="flex flex-wrap gap-4 text-brand-ink underline">
                    <Link to="/image-ads">Image creative briefs</Link>
                    <Link to="/facebook-campaigns">Facebook campaign setup</Link>
                    <Link to="/reporting">LeadRouter reporting</Link>
                </div>
                <p className="text-muted">
                    Campaign links organize your work. Delivering leads requires your landing page
                    or form to use LeadRouter’s posting integration.
                </p>
            </section>
            <ConfirmationModal
                isOpen={disconnecting}
                onClose={() => setDisconnecting(false)}
                onConfirm={disconnect}
                title="Disconnect LeadRouter?"
                confirmText="Disconnect"
                message="This removes your saved key and personal brand, product, and campaign links from BreadWinner. Your LeadRouter account and existing ads remain available. Reconnect with a new key to switch accounts."
            />
        </div>
    );
}

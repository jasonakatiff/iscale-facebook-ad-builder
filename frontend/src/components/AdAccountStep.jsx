import { useEffect, useState } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { getAdAccounts } from '../lib/facebookApi';
import { SearchableSelect } from './SearchableSelect';

export default function AdAccountStep({ onNext }) {
    const { selectedAdAccount, setSelectedAdAccount, setState } = useCampaign();
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [refresh, setRefresh] = useState(0);
    useEffect(() => {
        let active = true;
        getAdAccounts(refresh > 0)
            .then((data) => {
                if (!active) return;
                setAccounts(data);
                setState((previous) => {
                    if (!previous.selectedAdAccount) return previous;
                    const current = data.find(
                        (account) => account.id === previous.selectedAdAccount.id,
                    );
                    return current
                        ? { ...previous, selectedAdAccount: current }
                        : { ...previous, selectedAdAccount: null };
                });
            })
            .catch((err) => {
                if (active) setError(err.message);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [refresh, setState]);
    return (
        <div>
            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-bold mb-2">Select Ad Account</h2>
                    <p className="text-secondary">
                        Choose the account for this campaign. Account data is cached for one hour.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setLoading(true);
                        setError('');
                        setRefresh((value) => value + 1);
                    }}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 border border-line-strong rounded-lg disabled:opacity-50"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    Sync
                </button>
            </div>
            {loading && (
                <p role="status" className="mb-3 text-sm text-muted">
                    Loading ad accounts…
                </p>
            )}
            {!loading && !error && accounts.length === 0 && (
                <p role="status" className="mb-3 text-sm text-muted">
                    No accessible ad accounts. Ask your account administrator to grant access, then Sync.
                </p>
            )}
            <SearchableSelect
                label="Ad Account"
                value={selectedAdAccount?.id || ''}
                options={accounts}
                onChange={(id) =>
                    setSelectedAdAccount(accounts.find((account) => account.id === id) || null)
                }
                loading={loading && !accounts.length}
                error={error}
                required
                placeholder="Search ad accounts by name or ID..."
            />
            {selectedAdAccount && (
                <dl className="grid sm:grid-cols-3 gap-4 mt-6 p-4 bg-subtle border border-line rounded-lg">
                    <div>
                        <dt className="text-xs text-muted">Account ID</dt>
                        <dd>{selectedAdAccount.accountId}</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted">Currency</dt>
                        <dd>{selectedAdAccount.currency}</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted">Schedule timezone</dt>
                        <dd>{selectedAdAccount.timezone || 'Unavailable — sync required'}</dd>
                    </div>
                </dl>
            )}
            <div className="mt-8 flex justify-end">
                <button
                    onClick={() =>
                        selectedAdAccount ? onNext() : setError('Select an ad account to continue.')
                    }
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-lg disabled:opacity-50"
                >
                    Next Step <ChevronRight size={20} />
                </button>
            </div>
        </div>
    );
}

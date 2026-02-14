import { useToast } from '../context/ToastContext';
import React, { useState, useEffect } from 'react';
import { ChevronRight, Loader, Building2, CreditCard, TrendingUp, Calendar, DollarSign, AlertCircle } from 'lucide-react';
import { useCampaign } from '../context/CampaignContext';
import { getAdAccounts } from '../lib/facebookApi';

const AdAccountStep = ({ onNext }) => {
    const { showWarning } = useToast();
    const { selectedAdAccount, setSelectedAdAccount } = useCampaign();
    const [adAccounts, setAdAccounts] = useState([]);
    const [loadingAccounts, setLoadingAccounts] = useState(true);
    const [accountsError, setAccountsError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);

    useEffect(() => {
        fetchAdAccounts();
    }, []);

    const fetchAdAccounts = async () => {
        setLoadingAccounts(true);
        setAccountsError(null);
        try {
            const accounts = await getAdAccounts();
            setAdAccounts(accounts);

            // Try to restore last selected account from localStorage
            const lastAccountId = localStorage.getItem('lastSelectedAdAccountId');
            if (lastAccountId) {
                const lastAccount = accounts.find(a => a.id === lastAccountId);
                if (lastAccount) {
                    setSelectedAdAccount(lastAccount);
                    setSearchQuery(lastAccount.name);
                } else if (accounts.length > 0) {
                    setSelectedAdAccount(accounts[0]);
                    setSearchQuery(accounts[0].name);
                }
            } else if (accounts.length > 0 && !selectedAdAccount) {
                setSelectedAdAccount(accounts[0]);
                setSearchQuery(accounts[0].name);
            }
        } catch (error) {
            console.error('Error fetching ad accounts:', error);
            setAccountsError(error.message);
        } finally {
            setLoadingAccounts(false);
        }
    };

    // Filter ad accounts based on search query
    const filteredAccounts = adAccounts.filter(account =>
        account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        account.accountId.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleAccountSelect = (account) => {
        setSelectedAdAccount(account);
        setSearchQuery(account.name);
        setShowDropdown(false);
        // Save to localStorage for next time
        if (account) {
            localStorage.setItem('lastSelectedAdAccountId', account.id);
        }
    };

    const handleNext = () => {
        if (!selectedAdAccount) {
            showWarning('Please select an ad account');
            return;
        }
        onNext();
    };

    const formatCurrency = (amount, currency) => {
        if (!amount || amount === '0' || amount === 0) return null;
        const value = parseInt(amount) / 100; // Facebook returns amounts in cents
        return `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const formatAge = (days) => {
        if (!days || days === 0) return null;
        if (days < 30) return `${days} days`;
        if (days < 365) return `${Math.floor(days / 30)} months`;
        return `${Math.floor(days / 365)} years`;
    };

    return (
        <div>
            <h2 className="text-2xl font-bold mb-2">Select Ad Account</h2>
            <p className="text-gray-600 mb-6">
                Choose which Facebook ad account you want to use for this campaign.
            </p>

            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ad Account *
                </label>
                {loadingAccounts ? (
                    <div className="flex items-center gap-2 text-gray-500">
                        <Loader className="animate-spin" size={16} />
                        <span>Loading ad accounts...</span>
                    </div>
                ) : accountsError ? (
                    <div className="text-red-600 text-sm">
                        Error loading ad accounts: {accountsError}
                        <button
                            onClick={fetchAdAccounts}
                            className="ml-2 text-amber-600 hover:underline"
                        >
                            Retry
                        </button>
                    </div>
                ) : adAccounts.length === 0 ? (
                    <div className="text-gray-500 text-sm">
                        No ad accounts found. Please check your access token.
                    </div>
                ) : (
                    <div className="relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setShowDropdown(true);
                            }}
                            onFocus={() => {
                                setShowDropdown(true);
                                if (selectedAdAccount && searchQuery === selectedAdAccount.name) {
                                    setSearchQuery('');
                                }
                            }}
                            placeholder="Search ad accounts by name or ID..."
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        />

                        {showDropdown && filteredAccounts.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                {filteredAccounts.map(account => (
                                    <div
                                        key={account.id}
                                        onClick={() => handleAccountSelect(account)}
                                        className={`px-4 py-3 cursor-pointer hover:bg-amber-50 border-b border-gray-100 last:border-b-0 ${selectedAdAccount?.id === account.id ? 'bg-amber-50' : ''
                                            }`}
                                    >
                                        <div className="font-medium text-gray-900">{account.name}</div>
                                        <div className="text-sm text-gray-500">
                                            ID: {account.accountId} • {account.currency} • {account.status === 1 ? 'Active' : 'Inactive'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {showDropdown && searchQuery && filteredAccounts.length === 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-gray-500 text-sm">
                                No accounts match "{searchQuery}"
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Account Details Card */}
            {selectedAdAccount && !showDropdown && (
                <div className="mt-6 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-amber-100 to-orange-100 p-4 border-b border-amber-200">
                        <h3 className="text-lg font-bold text-amber-900">{selectedAdAccount.name}</h3>
                        <div className="flex items-center gap-4 mt-2 text-amber-700 text-sm">
                            <span>ID: {selectedAdAccount.accountId}</span>
                            <span>•</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${selectedAdAccount.status === 1 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>
                                {selectedAdAccount.status === 1 ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    </div>

                    {/* Account Details Grid */}
                    <div className="grid grid-cols-2 gap-4 p-4">
                        {/* Currency & Timezone */}
                        <div className="flex items-start gap-3">
                            <DollarSign className="text-gray-400 mt-0.5" size={18} />
                            <div>
                                <div className="text-xs text-gray-500 font-medium">Currency</div>
                                <div className="text-sm text-gray-900">{selectedAdAccount.currency}</div>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <Calendar className="text-gray-400 mt-0.5" size={18} />
                            <div>
                                <div className="text-xs text-gray-500 font-medium">Timezone</div>
                                <div className="text-sm text-gray-900">{selectedAdAccount.timezone}</div>
                            </div>
                        </div>

                        {/* Balance */}
                        {selectedAdAccount.balance && (
                            <div className="flex items-start gap-3">
                                <CreditCard className="text-gray-400 mt-0.5" size={18} />
                                <div>
                                    <div className="text-xs text-gray-500 font-medium">Balance</div>
                                    <div className="text-sm font-semibold text-gray-900">
                                        {formatCurrency(selectedAdAccount.balance, selectedAdAccount.currency) || '$0.00'}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Total Spent */}
                        {selectedAdAccount.amountSpent && (
                            <div className="flex items-start gap-3">
                                <TrendingUp className="text-gray-400 mt-0.5" size={18} />
                                <div>
                                    <div className="text-xs text-gray-500 font-medium">Total Spent</div>
                                    <div className="text-sm font-semibold text-gray-900">
                                        {formatCurrency(selectedAdAccount.amountSpent, selectedAdAccount.currency) || '$0.00'}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Business Name - only if exists */}
                        {selectedAdAccount.businessName && (
                            <div className="col-span-2 flex items-start gap-3">
                                <Building2 className="text-gray-400 mt-0.5" size={18} />
                                <div>
                                    <div className="text-xs text-gray-500 font-medium">Business</div>
                                    <div className="text-sm text-gray-900">{selectedAdAccount.businessName}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Navigation */}
            <div className="mt-8 flex justify-end">
                <button
                    onClick={handleNext}
                    disabled={!selectedAdAccount}
                    className="flex items-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                    Next Step <ChevronRight size={20} />
                </button>
            </div>
        </div>
    );
};

export default AdAccountStep;

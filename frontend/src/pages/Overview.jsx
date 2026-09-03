import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LayoutDashboard, Target, TrendingUp, Music2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import PerformanceTable from '../components/PerformanceTable';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const PLATFORM_COLORS = {
    meta: '#1877F2',
    google: '#F59E0B',
    tiktok: '#111827',
};

const PLATFORM_LABELS = {
    meta: 'Meta',
    google: 'Google Ads',
    tiktok: 'TikTok Ads',
};

const OVERVIEW_COLUMNS = [
    { key: 'platform', label: 'Platform', numeric: false, format: (v) => PLATFORM_LABELS[v] || v },
    { key: 'campaign_name', label: 'Campaign', numeric: false },
    { key: 'impressions', label: 'Impressions', numeric: true },
    { key: 'clicks', label: 'Clicks', numeric: true },
    { key: 'spend', label: 'Spend', numeric: true, format: (v) => `$${Number(v).toFixed(2)}` },
    { key: 'conversions', label: 'Conversions', numeric: true },
    { key: 'cpa', label: 'CPA', numeric: true, format: (v) => (v == null ? '—' : `$${Number(v).toFixed(2)}`) },
];

/**
 * Combined Meta + Google Ads landing page (Sprint 2). Rows come pre-normalized
 * from GET /api/v1/overview -- this component only aggregates spend-by-platform
 * for the chart and renders the flat table. If a platform isn't connected, its
 * `errors` entry is shown as an inline notice instead of hiding the whole page.
 */
export default function Overview() {
    const { authFetch } = useAuth();
    const { showError } = useToast();

    const [campaigns, setCampaigns] = useState([]);
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(true);
    const [datePreset, setDatePreset] = useState('last_30d');

    const loadOverview = useCallback(async () => {
        setLoading(true);
        try {
            const response = await authFetch(`${API_URL}/overview?date_preset=${datePreset}`);
            if (response.ok) {
                const data = await response.json();
                setCampaigns(data.campaigns || []);
                setErrors(data.errors || {});
            } else {
                const error = await response.json().catch(() => ({}));
                showError(error.detail || 'Failed to load overview');
            }
        } catch (error) {
            showError('Failed to load overview');
        } finally {
            setLoading(false);
        }
    }, [authFetch, datePreset, showError]);

    useEffect(() => {
        loadOverview();
    }, [loadOverview]);

    const spendByPlatform = useMemo(() => {
        const totals = {};
        for (const row of campaigns) {
            totals[row.platform] = (totals[row.platform] || 0) + (row.spend || 0);
        }
        return Object.entries(totals).map(([platform, spend]) => ({
            platform: PLATFORM_LABELS[platform] || platform,
            spend: Number(spend.toFixed(2)),
            fill: PLATFORM_COLORS[platform] || '#9CA3AF',
        }));
    }, [campaigns]);

    const errorEntries = Object.entries(errors).filter(([, message]) => !!message);

    return (
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
            <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2 flex items-center gap-3">
                    <LayoutDashboard size={28} className="text-amber-600 sm:hidden" />
                    <LayoutDashboard size={32} className="text-amber-600 hidden sm:block" />
                    Overview
                </h1>
                <p className="text-sm sm:text-base text-gray-600">Meta and Google Ads campaign performance, side by side</p>
            </div>

            {errorEntries.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
                    {errorEntries.map(([platform, message]) => (
                        <p key={platform} className="text-sm text-amber-800">
                            <span className="font-semibold">{PLATFORM_LABELS[platform] || platform}:</span> {message}
                        </p>
                    ))}
                </div>
            )}

            {!loading && spendByPlatform.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">Spend by platform</h2>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={spendByPlatform}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="platform" />
                            <YAxis tickFormatter={(v) => `$${v}`} />
                            <Tooltip formatter={(value) => [`$${value}`, 'Spend']} />
                            <Legend />
                            <Bar dataKey="spend" name="Spend" radius={[4, 4, 0, 0]}>
                                {spendByPlatform.map((entry) => (
                                    <Cell key={entry.platform} fill={entry.fill} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Empty state CTA: a fresh account lands here with zero
                connections — give the operator a direct action instead of a
                bare "no campaigns" table. */}
            {!loading && campaigns.length === 0 && (
                <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-6 sm:p-8 text-center">
                    <h2 className="text-lg font-bold text-gray-900">Connect your first ad account</h2>
                    <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">
                        Link Meta Ads, Google Ads, or TikTok Ads to see cross-platform performance here.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center mt-5">
                        <Link to="/facebook-campaigns" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition-colors">
                            <Target size={18} /> Connect Meta Ads
                        </Link>
                        <Link to="/google-ads" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-amber-300 text-amber-800 rounded-lg font-medium hover:bg-amber-50 transition-colors">
                            <TrendingUp size={18} /> Connect Google Ads
                        </Link>
                        <Link to="/tiktok-ads" className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-amber-300 text-amber-800 rounded-lg font-medium hover:bg-amber-50 transition-colors">
                            <Music2 size={18} /> Connect TikTok Ads
                        </Link>
                    </div>
                </div>
            )}

            <PerformanceTable
                rows={campaigns.map((row, index) => ({ ...row, id: `${row.platform}-${index}` }))}
                columns={OVERVIEW_COLUMNS}
                loading={loading}
                datePreset={datePreset}
                onDatePresetChange={setDatePreset}
                emptyMessage={campaigns.length === 0 ? '' : 'No campaigns in this date range.'}
            />
        </div>
    );
}

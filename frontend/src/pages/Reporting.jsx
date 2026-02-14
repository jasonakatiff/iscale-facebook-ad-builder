import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
    BarChart3,
    Eye,
    MousePointer,
    TrendingUp,
    DollarSign,
    CreditCard,
    Percent,
    Target,
    Loader2,
    AlertTriangle,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Calendar,
    Filter,
} from 'lucide-react';
import { getClickflareStatus, getClickflareReports } from '../api/clickflare';
import { useToast } from '../context/ToastContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const getDateRange = (preset) => {
    const to = new Date();
    const from = new Date();
    switch (preset) {
        case '7d':
            from.setDate(to.getDate() - 7);
            break;
        case '30d':
            from.setDate(to.getDate() - 30);
            break;
        case '90d':
            from.setDate(to.getDate() - 90);
            break;
        default:
            from.setDate(to.getDate() - 7);
    }
    return { from: formatDate(from), to: formatDate(to) };
};

const fmtNum = (n) => {
    if (n == null || isNaN(n)) return '0';
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const fmtCurrency = (n) => {
    if (n == null || isNaN(n)) return '$0.00';
    return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtPercent = (n) => {
    if (n == null || isNaN(n)) return '0.00%';
    return Number(n).toFixed(2) + '%';
};

const safeDiv = (a, b) => (b && b !== 0 ? a / b : 0);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const StatCard = ({ title, value, icon: Icon, iconBg, iconColor }) => (
    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${iconBg}`}>
                <Icon size={22} className={iconColor} />
            </div>
            <div className="min-w-0">
                <p className="text-sm text-gray-500 font-medium truncate">{title}</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
            </div>
        </div>
    </div>
);

const SortIcon = ({ column, sortConfig }) => {
    if (sortConfig.key !== column) return <ArrowUpDown size={14} className="text-gray-300" />;
    return sortConfig.direction === 'asc'
        ? <ArrowUp size={14} className="text-amber-600" />
        : <ArrowDown size={14} className="text-amber-600" />;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const Reporting = () => {
    const { showError } = useToast();

    // Clickflare status
    const [configured, setConfigured] = useState(null); // null = loading
    const [statusLoading, setStatusLoading] = useState(true);

    // Data
    const [reportData, setReportData] = useState(null);
    const [dataLoading, setDataLoading] = useState(false);

    // Filters
    const [datePreset, setDatePreset] = useState('7d');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [groupBy, setGroupBy] = useState('campaign');

    // Sort
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'desc' });

    // ---- Check Clickflare status on mount ----
    useEffect(() => {
        (async () => {
            try {
                const status = await getClickflareStatus();
                setConfigured(!!status?.configured);
            } catch {
                setConfigured(false);
            } finally {
                setStatusLoading(false);
            }
        })();
    }, []);

    // ---- Fetch report data when filters change ----
    const fetchReport = useCallback(async () => {
        if (!configured) return;

        let dateFrom, dateTo;
        if (datePreset === 'custom') {
            if (!customFrom || !customTo) return;
            dateFrom = customFrom;
            dateTo = customTo;
        } else {
            const range = getDateRange(datePreset);
            dateFrom = range.from;
            dateTo = range.to;
        }

        setDataLoading(true);
        try {
            const response = await getClickflareReports(dateFrom, dateTo, groupBy);
            // Resilient data extraction
            const rows = response?.data || response?.rows || (Array.isArray(response) ? response : []);
            setReportData(Array.isArray(rows) ? rows : []);
        } catch (err) {
            console.error('Failed to fetch Clickflare reports:', err);
            showError('Failed to load reporting data. Please try again.');
            setReportData([]);
        } finally {
            setDataLoading(false);
        }
    }, [configured, datePreset, customFrom, customTo, groupBy, showError]);

    useEffect(() => {
        if (configured) {
            fetchReport();
        }
    }, [configured, fetchReport]);

    // ---- Compute summary stats from rows ----
    const summary = useMemo(() => {
        if (!reportData || reportData.length === 0) {
            return { visits: 0, clicks: 0, conversions: 0, revenue: 0, cost: 0, roi: 0, cpc: 0, cpa: 0 };
        }
        const totals = reportData.reduce(
            (acc, row) => {
                acc.visits += Number(row.visits || row.impressions || 0);
                acc.clicks += Number(row.clicks || 0);
                acc.conversions += Number(row.conversions || row.cv || 0);
                acc.revenue += Number(row.revenue || row.payout || 0);
                acc.cost += Number(row.cost || row.spend || 0);
                return acc;
            },
            { visits: 0, clicks: 0, conversions: 0, revenue: 0, cost: 0 },
        );

        totals.roi = safeDiv((totals.revenue - totals.cost), totals.cost) * 100;
        totals.cpc = safeDiv(totals.cost, totals.clicks);
        totals.cpa = safeDiv(totals.cost, totals.conversions);
        return totals;
    }, [reportData]);

    // ---- Sorting ----
    const handleSort = (key) => {
        setSortConfig((prev) => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
        }));
    };

    const sortedRows = useMemo(() => {
        if (!reportData || reportData.length === 0) return [];
        if (!sortConfig.key) return reportData;

        return [...reportData].sort((a, b) => {
            let aVal = a[sortConfig.key] ?? '';
            let bVal = b[sortConfig.key] ?? '';
            // Try numeric comparison
            const aNum = Number(aVal);
            const bNum = Number(bVal);
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
            }
            // String comparison
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [reportData, sortConfig]);

    // ---- Determine table columns based on groupBy ----
    const groupColumn = useMemo(() => {
        switch (groupBy) {
            case 'campaign': return { key: 'campaign_name', label: 'Campaign' };
            case 'day': return { key: 'date', label: 'Date' };
            case 'country': return { key: 'country', label: 'Country' };
            case 'device': return { key: 'device', label: 'Device' };
            default: return { key: 'campaign_name', label: 'Campaign' };
        }
    }, [groupBy]);

    const metricColumns = [
        { key: 'visits', label: 'Visits', fmt: fmtNum },
        { key: 'clicks', label: 'Clicks', fmt: fmtNum },
        { key: 'conversions', label: 'Conv.', fmt: fmtNum },
        { key: 'revenue', label: 'Revenue', fmt: fmtCurrency },
        { key: 'cost', label: 'Cost', fmt: fmtCurrency },
        { key: 'roi', label: 'ROI', fmt: fmtPercent },
        { key: 'cpc', label: 'CPC', fmt: fmtCurrency },
    ];

    // Enrich each row with computed fields
    const enrichedRows = useMemo(() => {
        return sortedRows.map((row) => {
            const visits = Number(row.visits || row.impressions || 0);
            const clicks = Number(row.clicks || 0);
            const conversions = Number(row.conversions || row.cv || 0);
            const revenue = Number(row.revenue || row.payout || 0);
            const cost = Number(row.cost || row.spend || 0);
            const roi = safeDiv((revenue - cost), cost) * 100;
            const cpc = safeDiv(cost, clicks);
            return {
                ...row,
                visits,
                clicks,
                conversions,
                revenue,
                cost,
                roi,
                cpc,
                // Fallback group key: try common field names
                [groupColumn.key]: row[groupColumn.key]
                    || row.name
                    || row.campaign
                    || row.label
                    || row.group
                    || '-',
            };
        });
    }, [sortedRows, groupColumn.key]);

    // ---- Loading / status check ----
    if (statusLoading) {
        return (
            <div className="max-w-7xl mx-auto flex items-center justify-center py-32">
                <Loader2 size={32} className="animate-spin text-amber-600" />
            </div>
        );
    }

    // ---- Not configured ----
    if (!configured) {
        return (
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                        <BarChart3 size={32} className="text-amber-600" />
                        Reporting
                    </h1>
                    <p className="text-gray-600 mt-2">Track performance across all your campaigns</p>
                </div>

                {/* Setup prompt */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
                    <AlertTriangle size={48} className="mx-auto text-amber-500 mb-4" />
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Clickflare Not Configured</h2>
                    <p className="text-gray-600 mb-6 max-w-md mx-auto">
                        Connect your Clickflare account to start tracking real campaign performance data, conversions, and ROI.
                    </p>
                    <Link
                        to="/settings"
                        className="inline-flex items-center gap-2 bg-amber-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-amber-700 transition-colors"
                    >
                        Go to Settings
                    </Link>
                </div>
            </div>
        );
    }

    // ---- Configured: full reporting UI ----
    const statCards = [
        { title: 'Visits', value: fmtNum(summary.visits), icon: Eye, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
        { title: 'Clicks', value: fmtNum(summary.clicks), icon: MousePointer, iconBg: 'bg-purple-50', iconColor: 'text-purple-600' },
        { title: 'Conversions', value: fmtNum(summary.conversions), icon: TrendingUp, iconBg: 'bg-green-50', iconColor: 'text-green-600' },
        { title: 'Revenue', value: fmtCurrency(summary.revenue), icon: DollarSign, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
        { title: 'Cost', value: fmtCurrency(summary.cost), icon: CreditCard, iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
        { title: 'ROI', value: fmtPercent(summary.roi), icon: Percent, iconBg: 'bg-purple-50', iconColor: 'text-purple-600' },
        { title: 'CPC', value: fmtCurrency(summary.cpc), icon: MousePointer, iconBg: 'bg-green-50', iconColor: 'text-green-600' },
        { title: 'CPA', value: fmtCurrency(summary.cpa), icon: Target, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
    ];

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                    <BarChart3 size={32} className="text-amber-600" />
                    Reporting
                </h1>
                <p className="text-gray-600 mt-2">Track performance across all your campaigns</p>
            </div>

            {/* Filters bar */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-end gap-4">
                {/* Date range */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
                        <Calendar size={12} /> Date Range
                    </label>
                    <select
                        value={datePreset}
                        onChange={(e) => setDatePreset(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    >
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="90d">Last 90 Days</option>
                        <option value="custom">Custom</option>
                    </select>
                </div>

                {datePreset === 'custom' && (
                    <>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-gray-500">From</label>
                            <input
                                type="date"
                                value={customFrom}
                                onChange={(e) => setCustomFrom(e.target.value)}
                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-gray-500">To</label>
                            <input
                                type="date"
                                value={customTo}
                                onChange={(e) => setCustomTo(e.target.value)}
                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            />
                        </div>
                    </>
                )}

                {/* Group by */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
                        <Filter size={12} /> Group By
                    </label>
                    <select
                        value={groupBy}
                        onChange={(e) => setGroupBy(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    >
                        <option value="campaign">Campaign</option>
                        <option value="day">Day</option>
                        <option value="country">Country</option>
                        <option value="device">Device</option>
                    </select>
                </div>
            </div>

            {/* Loading overlay for data */}
            {dataLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={32} className="animate-spin text-amber-600" />
                    <span className="ml-3 text-gray-500 font-medium">Loading report data...</span>
                </div>
            ) : (
                <>
                    {/* Summary stat cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {statCards.map((card) => (
                            <StatCard key={card.title} {...card} />
                        ))}
                    </div>

                    {/* Performance data table */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h2 className="text-lg font-bold text-gray-900">Performance Data</h2>
                        </div>

                        {!reportData || reportData.length === 0 ? (
                            <div className="px-6 py-16 text-center">
                                <BarChart3 size={40} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500 font-medium">No data available for the selected period.</p>
                                <p className="text-gray-400 text-sm mt-1">Try adjusting your date range or filters.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 text-left">
                                            <th
                                                className="px-6 py-3 font-semibold text-gray-600 cursor-pointer hover:text-amber-600 transition-colors select-none"
                                                onClick={() => handleSort(groupColumn.key)}
                                            >
                                                <span className="inline-flex items-center gap-1">
                                                    {groupColumn.label}
                                                    <SortIcon column={groupColumn.key} sortConfig={sortConfig} />
                                                </span>
                                            </th>
                                            {metricColumns.map((col) => (
                                                <th
                                                    key={col.key}
                                                    className="px-4 py-3 font-semibold text-gray-600 text-right cursor-pointer hover:text-amber-600 transition-colors select-none"
                                                    onClick={() => handleSort(col.key)}
                                                >
                                                    <span className="inline-flex items-center gap-1 justify-end">
                                                        {col.label}
                                                        <SortIcon column={col.key} sortConfig={sortConfig} />
                                                    </span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {enrichedRows.map((row, idx) => (
                                            <tr
                                                key={idx}
                                                className={`hover:bg-amber-50/40 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                                            >
                                                <td className="px-6 py-3 font-medium text-gray-900 whitespace-nowrap max-w-xs truncate">
                                                    {row[groupColumn.key]}
                                                </td>
                                                {metricColumns.map((col) => (
                                                    <td key={col.key} className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                                                        {col.fmt(row[col.key])}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default Reporting;

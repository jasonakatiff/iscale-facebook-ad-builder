import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

import Overview from './Overview';

const authFetch = vi.fn();
const showError = vi.fn();

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ authFetch }),
}));

vi.mock('../context/ToastContext', () => ({
    useToast: () => ({ showError }),
}));

vi.mock('../components/PerformanceTable', () => ({
    default: ({ rows, loading }) => (
        <div data-testid="performance-table">
            {loading ? 'Loading' : rows.map((row) => row.campaign_name).join(', ')}
        </div>
    ),
}));

vi.mock('react-router-dom', () => ({
    Link: ({ to, children }) => <a href={to}>{children}</a>,
}));

vi.mock('recharts', () => ({
    BarChart: ({ children }) => <div>{children}</div>,
    Bar: ({ children }) => <div>{children}</div>,
    Cell: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
}));

describe('Overview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders cross-platform rows and a non-blocking platform error', async () => {
        authFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                campaigns: [
                    {
                        platform: 'google',
                        campaign_name: 'Search launch',
                        spend: 22.5,
                        impressions: 200,
                        clicks: 12,
                        conversions: 3,
                        cpa: 7.5,
                    },
                    {
                        platform: 'meta',
                        campaign_name: 'Retargeting',
                        spend: 10,
                        impressions: 100,
                        clicks: 8,
                        conversions: 2,
                        cpa: 5,
                    },
                ],
                errors: { meta: 'Meta account is not configured' },
            }),
        });

        render(<Overview />);

        await waitFor(() => {
            expect(screen.getByTestId('performance-table')).toHaveTextContent('Search launch, Retargeting');
        });

        expect(screen.getByText('Overview')).toBeInTheDocument();
        expect(screen.getByText(/Meta:/)).toBeInTheDocument();
        expect(screen.getByText(/Meta account is not configured/)).toBeInTheDocument();
        expect(authFetch).toHaveBeenCalledWith(expect.stringContaining('/overview?date_preset=last_30d'));
        expect(showError).not.toHaveBeenCalled();
    });
});

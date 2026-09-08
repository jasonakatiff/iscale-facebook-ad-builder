import { useEffect, useState } from 'react';
import { Search, Wand2, Target, ArrowUpRight, ArrowRight, Clock3, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const workflow = [
    {
        label: 'Find your next angle',
        description: 'Explore competitor ads and save ideas worth building on.',
        icon: Search,
        path: '/research',
        action: 'Explore research',
    },
    {
        label: 'Make the creative',
        description: 'Turn your brand, product, and winning references into new ads.',
        icon: Wand2,
        path: '/build-creatives',
        action: 'Build creatives',
    },
    {
        label: 'Prepare the campaign',
        description: 'Set your audience, review every detail, and create paused ads.',
        icon: Target,
        path: '/facebook-campaigns',
        action: 'Create a campaign',
    },
];

export default function Dashboard() {
    const { authFetch } = useAuth();
    const [statsData, setStatsData] = useState(null);
    const [statsError, setStatsError] = useState('');
    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const response = await authFetch(`${API_URL}/dashboard/stats`);
                if (!response.ok) throw new Error('Unable to load dashboard activity.');
                const data = await response.json();
                if (active) setStatsData(data);
            } catch (error) {
                if (active) setStatsError(error.message);
            }
        };
        load();
        return () => {
            active = false;
        };
    }, [authFetch]);
    const stats = [
        ['Campaigns', 'campaigns_count', '/facebook-campaigns'],
        ['Generated ads', 'generated_ads_count', '/generated-ads'],
        ['Brands', 'brands_count', '/brands'],
        ['Winning templates', 'templates_count', '/winning-ads'],
    ];
    return (
        <div className="max-w-6xl mx-auto">
            <div className="studio-page-header">
                <div>
                    <p className="studio-eyebrow">Your workspace, at a glance</p>
                    <h1 className="studio-heading">Dashboard</h1>
                    <p className="studio-description">
                        A clear view of what you’ve made and where to go next.
                    </p>
                </div>
                <Link to="/build-creatives" className="studio-button primary">
                    <Plus size={16} />
                    Build creatives
                </Link>
            </div>
            {statsError && (
                <p
                    role="alert"
                    className="p-4 mb-5 bg-danger-soft text-danger border border-danger-line rounded-lg text-sm"
                >
                    {statsError}
                </p>
            )}
            <div className="inventory-strip">
                {stats.map(([label, key, path]) => (
                    <Link key={key} to={path} className="inventory-item group">
                        <div className="inventory-label">
                            <span>{label}</span>
                            <ArrowUpRight size={13} className="opacity-0 group-hover:opacity-100" />
                        </div>
                        <p className="inventory-value">
                            {statsData ? new Intl.NumberFormat().format(statsData[key] || 0) : '—'}
                        </p>
                    </Link>
                ))}
            </div>
            <h2 className="studio-section-label">Move your next campaign forward</h2>
            <div className="workflow-grid">
                {workflow.map((item, index) => {
                    const { label, description, icon: Icon, path, action } = item;
                    return (
                        <Link key={path} to={path} className="workflow-card group">
                            <div className="flex items-center justify-between">
                                <span className="workflow-icon">
                                    <Icon size={19} strokeWidth={1.7} />
                                </span>
                                <span className="workflow-index">0{index + 1}</span>
                            </div>
                            <div>
                                <h3>{label}</h3>
                                <p>{description}</p>
                            </div>
                            <span className="flex items-center justify-between text-xs text-secondary font-medium mt-auto">
                                {action}
                                <ArrowRight
                                    size={15}
                                    className="text-muted group-hover:text-brand-ink"
                                />
                            </span>
                        </Link>
                    );
                })}
            </div>
            <section className="studio-panel">
                <div className="panel-heading">
                    <h2>Recent Activity</h2>
                    <Link to="/facebook-campaigns" className="inline-flex items-center gap-2">
                        Campaign workspace
                        <ArrowUpRight size={13} />
                    </Link>
                </div>
                {!statsData && !statsError ? (
                    <p role="status" className="empty-workspace">
                        Loading recent activity…
                    </p>
                ) : statsData?.recent_activity?.length ? (
                    <ul>
                        {statsData.recent_activity.map((activity) => (
                            <li key={activity.id} className="activity-row">
                                <span className="w-8 h-8 rounded-lg bg-subtle text-muted grid place-items-center shrink-0">
                                    <Target size={15} />
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-xs truncate">{activity.name}</p>
                                    <p className="text-[11px] text-muted mt-1">
                                        Campaign created ·{' '}
                                        {new Date(activity.created_at).toLocaleString()}
                                    </p>
                                </div>
                                <span className="activity-status">{activity.status}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="empty-workspace">
                        <Clock3 size={24} strokeWidth={1.4} className="mx-auto mb-3 text-faint" />
                        <p className="font-medium text-secondary">
                            Your campaign activity starts here
                        </p>
                        <p className="text-xs mt-2">
                            Create your first campaign to keep track of your work.
                        </p>
                    </div>
                )}
            </section>
        </div>
    );
}

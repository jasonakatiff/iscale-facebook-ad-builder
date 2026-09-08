import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import {
    BarChart3,
    Wand2,
    Settings,
    Link2,
    LogOut,
    PanelLeftClose,
    PanelLeftOpen,
    Search,
    ChevronDown,
    ChevronRight,
    UserCog,
    Menu,
    X,
    BookOpen,
    KeyRound,
    Palette,
    Puzzle,
    GitBranch,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ThemeSwitch } from './ThemeSwitch';
import { BrandMark } from './BrandMark';
import { PoweredBy } from './PoweredBy';
import { APP_NAME } from '../lib/branding';
import { TelemetryFeedback } from './TelemetryFeedback';
import { DeliveryNotifications } from './DeliveryNotifications';

const sections = [
    {
        label: 'Workspace',
        items: [
            {
                icon: Search,
                label: 'Research',
                path: '/research',
                children: [
                    {
                        label: 'Scrape Brand Ads',
                        path: '/research/brand-scrapes',
                    },
                    { label: 'Research Settings', path: '/research/settings' },
                ],
            },
            {
                icon: Wand2,
                label: 'Creative Building',
                path: '/build-creatives',
                children: [
                    { label: 'Image Ads', path: '/image-ads' },
                    { label: 'Video Ads', path: '/video-ads' },
                    { label: 'Ad Remix', path: '/ad-remix' },
                    { label: 'Winning Ads', path: '/winning-ads' },
                    { label: 'Generated Ads', path: '/generated-ads' },
                    { label: 'Creative Library', path: '/creative-library' },
                    { label: 'Brands', path: '/brands' },
                    { label: 'Products', path: '/products' },
                    { label: 'Customer Profiles', path: '/profiles' },
                ],
            },
            {
                icon: GitBranch,
                label: 'Ad Deployment',
                path: '/facebook-campaigns',
                children: [
                    {
                        label: 'Facebook Campaigns',
                        path: '/facebook-campaigns',
                    },
                    { label: 'Posting queue', path: '/posting-queue' },
                    { label: 'Google Ads', path: '/google-ads' },
                    { label: 'TikTok Ads', path: '/tiktok-ads' },
                ],
            },
            {
                icon: BarChart3,
                label: 'Performance Reports',
                path: '/overview',
                children: [
                    { label: 'Overview', path: '/overview' },
                    { label: 'Dashboard', path: '/' },
                    { label: 'Reporting', path: '/reporting' },
                    { label: 'Creative analytics', path: '/creative-analytics' },
                ],
            },
        ],
    },
];
const routeLabels = {
    '/image-ads': 'Image Ads',
    '/video-ads': 'Video Ads',
    '/ad-remix': 'Ad Remix',
    '/reporting': 'Reporting',
    '/creative-analytics': 'Creative analytics',
    '/settings': 'Settings',
    '/connections': 'Connections',
    '/settings/leadrouter': 'LeadRouter',
    '/settings/api-keys': 'API Keys',
    '/help': 'Help & API Docs',
    '/telemetry': 'Telemetry',
    '/themes': 'Themes',
    '/plugins': 'Plugins',
    '/users': 'User Management',
};
for (const section of sections)
    for (const item of section.items) {
        routeLabels[item.path] = item.label;
        for (const child of item.children || [])
            routeLabels[child.path] = child.label;
    }

export default function Layout() {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { user, logout, hasRole } = useAuth();
    const { showSuccess, showError } = useToast();
    const [expandedMenus, setExpandedMenus] = useState({});
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const sidebar = useRef(null);
    const mobileTrigger = useRef(null);
    const collapsed = isCollapsed && !mobileOpen;

    useEffect(() => {
        if (!mobileOpen) return;
        const trigger = mobileTrigger.current;
        sidebar.current?.querySelector('button, a')?.focus();
        const viewport = window.matchMedia('(min-width: 768px)');
        const resize = (event) => {
            if (event.matches) setMobileOpen(false);
        };
        viewport.addEventListener('change', resize);
        return () => {
            viewport.removeEventListener('change', resize);
            requestAnimationFrame(() => trigger?.focus());
        };
    }, [mobileOpen]);

    const handleLogout = async () => {
        try {
            await logout();
            showSuccess('Logged out successfully');
            navigate('/login');
        } catch (error) {
            showError(error.message || 'Unable to log out.');
        }
    };
    const drawerKeys = (event) => {
        if (!mobileOpen) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            setMobileOpen(false);
        }
        if (event.key !== 'Tab') return;
        const focusable = [
            ...sidebar.current.querySelectorAll('a, button'),
        ].filter(
            (element) => element.getClientRects().length && !element.disabled,
        );
        const first = focusable[0],
            last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    };
    const navLink = (item, child = false) => {
        const Icon = item.icon;
        const active =
            pathname === item.path ||
            (!child &&
                item.children?.some((entry) => entry.path === pathname)) ||
            (!child &&
                item.path === '/build-creatives' &&
                ['/image-ads', '/video-ads', '/ad-remix'].includes(pathname));
        return (
            <Link
                to={item.path}
                onClick={() => {
                    setMobileOpen(false);
                    if (item.children)
                        setExpandedMenus((previous) => ({
                            ...previous,
                            [item.label]: true,
                        }));
                }}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                title={collapsed ? item.label : undefined}
                className={`nav-link ${active ? 'is-active' : ''}`}
            >
                {Icon && (
                    <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                )}
                {!collapsed && <span>{item.label}</span>}
            </Link>
        );
    };
    const initials = (user?.name || user?.email || 'BW')
        .split(/[\s@]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();

    return (
        <div className="studio-shell">
            <a href="#workspace-content" className="studio-skip-link">
                Skip to content
            </a>
            {mobileOpen && (
                <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Close navigation backdrop"
                    onClick={() => setMobileOpen(false)}
                    className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
                />
            )}
            <aside
                ref={sidebar}
                onKeyDown={drawerKeys}
                className={`studio-sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}
                role={mobileOpen ? 'dialog' : undefined}
                aria-modal={mobileOpen || undefined}
                aria-label="Workspace navigation"
            >
                <div className="sidebar-brand justify-between">
                    <Link
                        to="/"
                        onClick={() => setMobileOpen(false)}
                        aria-label={`${APP_NAME} home`}
                    >
                        <BrandMark compact={collapsed} />
                    </Link>
                    <button
                        type="button"
                        className="icon-button md:hidden"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Close navigation"
                    >
                        <X size={18} />
                    </button>
                </div>
                <nav className="sidebar-nav" aria-label="Main navigation">
                    {sections.map((section) => (
                        <div key={section.label} className="nav-section">
                            <p className="nav-label">{section.label}</p>
                            {section.items.map((item) => {
                                const activeChild = item.children?.some(
                                    (child) => child.path === pathname,
                                );
                                const expanded =
                                    expandedMenus[item.label] ?? activeChild;
                                return (
                                    <div key={item.path}>
                                        <div className="nav-group-row">
                                            {navLink(item)}
                                            {item.children && !collapsed && (
                                                <button
                                                    type="button"
                                                    className="nav-expand"
                                                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.label}`}
                                                    aria-expanded={!!expanded}
                                                    onClick={() =>
                                                        setExpandedMenus(
                                                            (previous) => ({
                                                                ...previous,
                                                                [item.label]:
                                                                    !expanded,
                                                            }),
                                                        )
                                                    }
                                                >
                                                    {expanded ? (
                                                        <ChevronDown
                                                            size={14}
                                                        />
                                                    ) : (
                                                        <ChevronRight
                                                            size={14}
                                                        />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                        {item.children &&
                                            !collapsed &&
                                            expanded && (
                                                <div className="nav-submenu">
                                                    {item.children.map(
                                                        (child) => (
                                                            <div
                                                                key={child.path}
                                                            >
                                                                {navLink(
                                                                    child,
                                                                    true,
                                                                )}
                                                            </div>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </nav>
                <div className="sidebar-footer">
                    {navLink({ icon: Puzzle, label: 'Plugins', path: '/plugins' })}
                    {hasRole('admin') && navLink({ icon: BarChart3, label: 'Telemetry', path: '/telemetry' })}
                    {hasRole('admin') &&
                        navLink({
                            icon: UserCog,
                            label: 'User Management',
                            path: '/users',
                        })}
                    {navLink({
                        icon: Settings,
                        label: 'Settings',
                        path: '/settings',
                    })}
                    {navLink({
                        icon: Link2,
                        label: 'Connections',
                        path: '/connections',
                    })}
                    {navLink({
                        icon: KeyRound,
                        label: 'API Keys',
                        path: '/settings/api-keys',
                    })}
                    {navLink({
                        icon: Palette,
                        label: 'Themes',
                        path: '/themes',
                    })}
                    {navLink({
                        icon: BookOpen,
                        label: 'Help & API Docs',
                        path: '/help',
                    })}
                    <div className="user-summary">
                        <span className="user-avatar" aria-hidden="true">
                            {initials}
                        </span>
                        {!collapsed && (
                            <>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-foreground truncate">
                                        {user?.name || 'Your workspace'}
                                    </p>
                                    <p className="text-[10px] text-muted truncate mt-1">
                                        {user?.email}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="icon-button"
                                    aria-label="Logout"
                                    title="Logout"
                                    onClick={handleLogout}
                                >
                                    <LogOut size={16} />
                                </button>
                            </>
                        )}
                    </div>
                    {collapsed && (
                        <button
                            type="button"
                            className="nav-link mt-2"
                            aria-label="Logout"
                            title="Logout"
                            onClick={handleLogout}
                        >
                            <LogOut size={17} />
                        </button>
                    )}
                </div>
            </aside>
            <main className="studio-main" inert={mobileOpen || undefined}>
                <header className="workspace-bar">
                    <div className="workspace-breadcrumb">
                        <button
                            type="button"
                            ref={mobileTrigger}
                            className="icon-button md:hidden"
                            aria-label="Open navigation"
                            aria-expanded={mobileOpen}
                            onClick={() => setMobileOpen(true)}
                        >
                            <Menu size={19} />
                        </button>
                        <button
                            type="button"
                            className="icon-button hidden md:inline-flex"
                            aria-label={
                                isCollapsed
                                    ? 'Expand navigation'
                                    : 'Collapse navigation'
                            }
                            onClick={() => setIsCollapsed((value) => !value)}
                        >
                            {isCollapsed ? (
                                <PanelLeftOpen size={18} />
                            ) : (
                                <PanelLeftClose size={18} />
                            )}
                        </button>
                        <span>Workspace</span>
                        <span aria-hidden="true">/</span>
                        <strong>{routeLabels[pathname] || APP_NAME}</strong>
                    </div>
                    <div className="flex items-center gap-3"><DeliveryNotifications /><ThemeSwitch /></div>
                </header>
                <div
                    id="workspace-content"
                    tabIndex={-1}
                    className="workspace-content"
                >
                    <Outlet />
                    <TelemetryFeedback />
                    <footer className="workspace-footer">
                        <PoweredBy />
                    </footer>
                </div>
            </main>
        </div>
    );
}

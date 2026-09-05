import React, { useEffect, useState } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, BarChart3, Package, Users, Video, Wand2, Settings, LogOut, Image, ShoppingBag, Target, ChevronLeft, ChevronRight, FileImage, Search, ChevronDown, UserCog, TrendingUp, Music2, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { APP_NAME, APP_LOGO, APP_TAGLINE } from '../lib/branding';

export default function Layout() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout, hasRole } = useAuth();
    const { showSuccess } = useToast();
    const [expandedMenus, setExpandedMenus] = useState({ Brands: false, Research: false });
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    // Mobile off-canvas nav. md+ always shows the desktop sidebar; the
    // mobile drawer shares the exact same markup (className toggles only).
    const [mobileOpen, setMobileOpen] = useState(false);

    // Close the drawer whenever the route changes (tap-through navigation).
    useEffect(() => {
        setMobileOpen(false);
    }, [location.pathname]);

    const handleLogout = async () => {
        await logout();
        showSuccess('Logged out successfully');
        navigate('/login');
    };

    const menuItems = [
        { icon: LayoutDashboard, label: 'Overview', path: '/' },
        { icon: BarChart3, label: 'Dashboard', path: '/dashboard' },
        {
            icon: Search,
            label: 'Research',
            subItems: [
                { label: 'Research', path: '/research' },
                { label: 'Scrape Brand Ads', path: '/research/brand-scrapes' },
                { label: 'Settings', path: '/research/settings' }
            ]
        },
        { icon: Wand2, label: 'Build Creatives', path: '/build-creatives' },
        {
            icon: ShoppingBag,
            label: 'Brands',
            subItems: [
                { label: 'Brands', path: '/brands' },
                { label: 'Products', path: '/products' },
                { label: 'Customer Profiles', path: '/profiles' }
            ]
        },
        { icon: Image, label: 'Winning Ads', path: '/winning-ads' },
        { icon: FileImage, label: 'Generated Ads', path: '/generated-ads' },
        { icon: Target, label: 'Facebook Campaigns', path: '/facebook-campaigns' },
        { icon: TrendingUp, label: 'Google Ads', path: '/google-ads' },
        { icon: Music2, label: 'TikTok Ads', path: '/tiktok-ads' },
    ];

    const toggleMenu = (label) => {
        setExpandedMenus(prev => ({
            ...prev,
            [label]: !prev[label]
        }));
    };

    return (
        <div className="flex h-screen bg-[#FFFAF0]">
            {/* Mobile top bar */}
            <header className="md:hidden fixed top-0 inset-x-0 z-40 bg-white border-b border-amber-200 flex items-center justify-between px-4 h-14 shadow-sm">
                <button
                    onClick={() => setMobileOpen(true)}
                    aria-label="Open navigation menu"
                    className="p-2 -ml-2 rounded-lg text-amber-800 hover:bg-amber-50"
                >
                    <Menu size={22} />
                </button>
                <div className="flex items-center gap-2 min-w-0">
                    <img src={APP_LOGO} alt={APP_NAME} className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                    <span className="font-bold text-amber-900 truncate text-sm">{APP_NAME}</span>
                </div>
                <span className="w-8" aria-hidden="true" />
            </header>

            {/* Mobile drawer backdrop */}
            {mobileOpen && (
                <div
                    className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                    onClick={() => setMobileOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* Sidebar — desktop: static; mobile: off-canvas drawer */}
            <aside className={`${isCollapsed ? 'w-20' : 'w-64'} bg-white border-r border-amber-200 flex-col shadow-sm transition-all duration-300 ease-in-out relative
                fixed md:static inset-y-0 left-0 z-50 -translate-x-full md:translate-x-0
                ${mobileOpen ? 'translate-x-0 flex' : 'md:flex'}`}>
                {/* Toggle Button (desktop collapse / mobile close) */}
                <button
                    onClick={() => (window.matchMedia('(min-width: 768px)').matches ? setIsCollapsed(!isCollapsed) : setMobileOpen(false))}
                    className={`absolute -right-3 top-9 bg-white border border-amber-200 rounded-full p-1 shadow-sm hover:bg-amber-50 text-amber-600 z-10 hidden md:block`}
                    title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
                <button
                    onClick={() => setMobileOpen(false)}
                    className="absolute right-3 top-4 p-1 rounded-lg text-gray-400 hover:text-amber-700 hover:bg-amber-50 md:hidden"
                    aria-label="Close navigation menu"
                >
                    <X size={20} />
                </button>

                <div className={`p-6 border-b border-amber-100 ${isCollapsed ? 'px-4' : ''}`}>
                    <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
                        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center overflow-hidden border border-amber-200 flex-shrink-0">
                            <img src={APP_LOGO} alt={APP_NAME} className="w-full h-full object-cover" />
                        </div>
                        {!isCollapsed && (
                            <div className="overflow-hidden whitespace-nowrap">
                                <h1 className="text-xl font-bold text-amber-900">{APP_NAME}</h1>
                                <p className="text-xs text-amber-600">{APP_TAGLINE}</p>
                            </div>
                        )}
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto overflow-x-hidden">
                    {menuItems.map((item) => {
                        const Icon = item.icon;

                        // Handle items with submenus
                        if (item.subItems) {
                            const isExpanded = expandedMenus[item.label];
                            const isActive = item.subItems.some(sub => location.pathname === sub.path);

                            return (
                                <div key={item.label} className="space-y-1">
                                    <button
                                        onClick={() => {
                                            if (!isCollapsed) toggleMenu(item.label);
                                            // Navigate to first subitem
                                            if (item.subItems?.[0]?.path) {
                                                navigate(item.subItems[0].path);
                                            }
                                        }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
                                            ? 'bg-amber-50 text-amber-900 font-medium'
                                            : 'text-gray-600 hover:bg-amber-50 hover:text-amber-800'
                                            } ${isCollapsed ? 'justify-center px-2' : ''}`}
                                        title={isCollapsed ? item.label : ''}
                                    >
                                        <Icon size={20} className={`transition-colors flex-shrink-0 ${isActive ? 'text-amber-600' : 'text-gray-400 group-hover:text-amber-600'}`} />
                                        {!isCollapsed && (
                                            <>
                                                <span className="flex-1 text-left whitespace-nowrap overflow-hidden">{item.label}</span>
                                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                            </>
                                        )}
                                    </button>

                                    {/* Submenu Items */}
                                    {!isCollapsed && isExpanded && (
                                        <div className="pl-11 space-y-1">
                                            {item.subItems.map(subItem => {
                                                const isSubActive = location.pathname === subItem.path;
                                                return (
                                                    <Link
                                                        key={subItem.path}
                                                        to={subItem.path}
                                                        className={`block px-3 py-2 rounded-lg text-sm transition-colors ${isSubActive
                                                            ? 'text-amber-700 bg-amber-50 font-medium'
                                                            : 'text-gray-500 hover:text-amber-700 hover:bg-amber-50'
                                                            }`}
                                                    >
                                                        {subItem.label}
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        // Regular menu items
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
                                    ? 'bg-amber-100 text-amber-900 font-medium shadow-sm'
                                    : 'text-gray-600 hover:bg-amber-50 hover:text-amber-800'
                                    } ${isCollapsed ? 'justify-center px-2' : ''}`}
                                title={isCollapsed ? item.label : ''}
                            >
                                <Icon size={20} className={`transition-colors flex-shrink-0 ${isActive ? 'text-amber-600' : 'text-gray-400 group-hover:text-amber-600'}`} />
                                {!isCollapsed && <span className="whitespace-nowrap overflow-hidden">{item.label}</span>}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-amber-100">
                    {/* User Management - Admin Only */}
                    {hasRole('admin') && (
                        <Link
                            to="/users"
                            className={`flex items-center gap-3 px-4 py-3 w-full rounded-xl transition-colors group ${
                                location.pathname === '/users'
                                    ? 'bg-amber-100 text-amber-900 font-medium shadow-sm'
                                    : 'text-gray-600 hover:bg-amber-50 hover:text-amber-800'
                            } ${isCollapsed ? 'justify-center px-2' : ''}`}
                            title={isCollapsed ? 'User Management' : ''}
                        >
                            <UserCog size={20} className={`flex-shrink-0 ${
                                location.pathname === '/users'
                                    ? 'text-amber-600'
                                    : 'text-gray-400 group-hover:text-amber-600'
                            }`} />
                            {!isCollapsed && <span className="whitespace-nowrap overflow-hidden">User Management</span>}
                        </Link>
                    )}
                    <Link
                        to="/settings"
                        className={`flex items-center gap-3 px-4 py-3 w-full rounded-xl transition-colors group ${
                            location.pathname === '/settings'
                                ? 'bg-amber-100 text-amber-900 font-medium shadow-sm'
                                : 'text-gray-600 hover:bg-amber-50 hover:text-amber-800'
                        } ${isCollapsed ? 'justify-center px-2' : ''}`}
                        title={isCollapsed ? 'Settings' : ''}
                    >
                        <Settings size={20} className={`flex-shrink-0 ${
                            location.pathname === '/settings'
                                ? 'text-amber-600'
                                : 'text-gray-400 group-hover:text-amber-600'
                        }`} />
                        {!isCollapsed && <span className="whitespace-nowrap overflow-hidden">Settings</span>}
                    </Link>

                    {/* User Info */}
                    {!isCollapsed && user && (
                        <div className="px-4 py-3 mt-2 bg-amber-50 rounded-xl">
                            <div className="text-sm font-medium text-amber-900 truncate">
                                {user.name || user.email}
                            </div>
                            <div className="text-xs text-amber-600 truncate">{user.email}</div>
                        </div>
                    )}

                    <button
                        onClick={handleLogout}
                        className={`flex items-center gap-3 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-xl transition-colors mt-1 ${isCollapsed ? 'justify-center px-2' : ''}`}
                        title={isCollapsed ? 'Logout' : ''}
                    >
                        <LogOut size={20} className="flex-shrink-0" />
                        {!isCollapsed && <span className="whitespace-nowrap overflow-hidden">Logout</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
                <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

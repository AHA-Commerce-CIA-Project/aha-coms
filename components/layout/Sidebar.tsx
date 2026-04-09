'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
    LayoutDashboard,
    CheckSquare,
    FileText,
    ChevronLeft,
    ChevronRight,
    Zap,
    Inbox,
    BarChart3,
    ExternalLink,
    Users,
    Hash,
    Bookmark,
    RotateCcw,
    Settings,
    Activity,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

const navItems = [
    { href: '/', icon: LayoutDashboard, label: 'Dashboard', disabled: false },
    { href: '/tasks', icon: CheckSquare, label: 'My Tasks', disabled: false },
    { href: '/nexus', icon: Inbox, label: 'List Task Queue', disabled: false },
    { href: '/channels', icon: Hash, label: 'Channels', disabled: false, hasBadge: true },
    { href: '/orbit', icon: RotateCcw, label: 'AHA ORBIT', disabled: false, hasBadge: true, badgeKey: 'orbit' },
    { href: '/later', icon: Bookmark, label: 'Later', disabled: false },
    { href: '/request', icon: ExternalLink, label: 'Request Form', disabled: false },
];

const leaderNavItems = [
    { href: '/analytics', icon: BarChart3, label: 'Analytics', disabled: false, requireLeader: true },
    { href: '/activity-log', icon: Activity, label: 'Activity Log', disabled: false, requireLeader: true },
    { href: '/orbit/manage', icon: Settings, label: 'Manage Orbit', disabled: false, requireLeader: true },
    { href: '/users', icon: Users, label: 'User Control Panel', disabled: false, requireLeader: true },
];

export function Sidebar() {
    const pathname = usePathname();
    const { sidebarOpen, toggleSidebar } = useAppStore();
    const { isLeader, user } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);
    const [orbitUnclaimedCount, setOrbitUnclaimedCount] = useState(0);

    // Poll badge counts
    useEffect(() => {
        if (!user) return;

        const fetchBadges = async () => {
            try {
                const [channelRes, orbitRes] = await Promise.all([
                    fetch('/api/channels/unread'),
                    fetch('/api/orbit/unclaimed'),
                ]);
                if (channelRes.ok) {
                    const data = await channelRes.json();
                    setUnreadCount(data.unreadCount || 0);
                }
                if (orbitRes.ok) {
                    const data = await orbitRes.json();
                    setOrbitUnclaimedCount(data.unclaimedCount || 0);
                }
            } catch { }
        };

        fetchBadges();
        const interval = setInterval(fetchBadges, 5000);
        return () => clearInterval(interval);
    }, [user]);

    const allNavItems = isLeader ? [...navItems.slice(0, 4), ...leaderNavItems, ...navItems.slice(4)] : navItems;

    return (
        <aside
            className={cn(
                'fixed left-0 top-0 z-40 h-screen bg-white border-r border-slate-200 transition-all duration-300 ease-in-out',
                sidebarOpen ? 'w-64' : 'w-20'
            )}
        >
            {/* Logo */}
            <div className="flex items-center h-16 px-4 border-b border-slate-200">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                        <img src="/aha-logo.png" alt="AHA Fast Logo" className="w-full h-full object-contain" />
                    </div>
                    {sidebarOpen && (
                        <div className="overflow-hidden">
                            <div className="flex items-baseline">
                                <h1 className="text-2xl font-extrabold text-[#0F0E7F] tracking-tight">
                                    AHA
                                </h1>
                                <span className="text-2xl font-medium text-[#0F0E7F] ml-1.5 tracking-tight">
                                    Fast
                                </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium -mt-0.5 tracking-wide">FBI Assignment Smart Tracker</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation */}
            <nav className="py-4 pr-4 space-y-1.5">
                {allNavItems.map((item) => {
                    const isActive = pathname === item.href
                        || (item.href === '/channels' && pathname.startsWith('/channels'))
                        || (item.href === '/orbit' && pathname === '/orbit')
                        || (item.href === '/orbit/manage' && pathname.startsWith('/orbit/manage'));
                    const badgeKey = (item as any).badgeKey;
                    const badgeCount = badgeKey === 'orbit' ? orbitUnclaimedCount : unreadCount;
                    const showBadge = (item as any).hasBadge && badgeCount > 0;

                    if (item.disabled) {
                        return (
                            <div
                                key={item.href}
                                className="flex items-center gap-3 pl-6 pr-4 py-3 rounded-r-2xl text-slate-400 cursor-not-allowed opacity-50"
                            >
                                <item.icon className="w-5 h-5 flex-shrink-0" />
                                {sidebarOpen && (
                                    <span className="font-medium whitespace-nowrap">{item.label}</span>
                                )}
                            </div>
                        );
                    }

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-3 pl-6 pr-4 py-3 rounded-r-full transition-all duration-200 group font-medium relative',
                                isActive
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                            )}
                        >
                            <div className="relative flex-shrink-0">
                                <item.icon
                                    className={cn(
                                        'w-5 h-5 transition-colors',
                                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600'
                                    )}
                                />
                                {showBadge && !sidebarOpen && (
                                    <span className={cn(
                                        "absolute -top-2 -right-2 min-w-[16px] h-4 flex items-center justify-center px-1 text-[9px] font-bold text-white rounded-full",
                                        badgeKey === 'orbit' ? 'bg-amber-500' : 'bg-rose-500'
                                    )}>
                                        {badgeCount > 9 ? '9+' : badgeCount}
                                    </span>
                                )}
                            </div>
                            {sidebarOpen && (
                                <span className="font-medium whitespace-nowrap flex-1">{item.label}</span>
                            )}
                            {showBadge && sidebarOpen && (
                                <span className={cn(
                                    'min-w-[20px] h-5 flex items-center justify-center px-1.5 text-[10px] font-bold rounded-full',
                                    isActive
                                        ? 'bg-white/20 text-white'
                                        : badgeKey === 'orbit' ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'
                                )}>
                                    {badgeCount > 99 ? '99+' : badgeCount}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Toggle Button */}
            <button
                onClick={toggleSidebar}
                className="absolute -right-3 top-20 w-6 h-6 bg-white border border-slate-200 shadow-sm rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors z-50"
            >
                {sidebarOpen ? (
                    <ChevronLeft className="w-4 h-4" />
                ) : (
                    <ChevronRight className="w-4 h-4" />
                )}
            </button>

            {/* Footer */}
            {sidebarOpen && (
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200">
                    <div className="text-xs font-medium text-slate-400 text-center">
                        © 2026 AHA Factual Business Intelligence
                    </div>
                </div>
            )}
        </aside>
    );
}


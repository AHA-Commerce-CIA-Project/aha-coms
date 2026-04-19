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
    HardDrive,
    Home,
    ArrowLeft,
    MessageCircle,
    Sparkles,
    Mail,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

interface NavItem {
    href: string;
    icon: any;
    label: string;
    disabled?: boolean;
    hasBadge?: boolean;
    badgeKey?: string;
    requireLeader?: boolean;
    isExternal?: boolean;
}

interface NavSection {
    label: string;
    items: NavItem[];
    backToHome?: boolean;
}

// Sub-app menus — sidebar shows ONLY the section relevant to the current route
const sectionConfigs: Record<string, NavSection> = {
    comss: {
        label: 'AHA COMSS',
        items: [
            { href: '/', icon: LayoutDashboard, label: 'Home' },
            { href: '/changelog', icon: Sparkles, label: "What's New", hasBadge: true, badgeKey: 'changelog' },
        ],
    },
    fast: {
        label: 'AHA Fast',
        backToHome: true,
        items: [
            { href: '/fast', icon: LayoutDashboard, label: 'Dashboard' },
            { href: '/tasks', icon: CheckSquare, label: 'Tasks', hasBadge: true, badgeKey: 'tasks' },
            { href: '/analytics', icon: BarChart3, label: 'Analytics', requireLeader: true },
            { href: '/activity-log', icon: Activity, label: 'Activity Log', requireLeader: true },
            { href: '/later', icon: Bookmark, label: 'Later' },
        ],
    },
    chat: {
        label: 'Chat',
        backToHome: true,
        items: [
            { href: '/channels', icon: Hash, label: 'Channels', hasBadge: true, badgeKey: 'chat' },
            { href: '/messages', icon: MessageCircle, label: 'Direct Messages', hasBadge: true, badgeKey: 'dm' },
        ],
    },
    orbit: {
        label: 'AHA Orbit',
        backToHome: true,
        items: [
            { href: '/orbit', icon: RotateCcw, label: 'AHA ORBIT', hasBadge: true, badgeKey: 'orbit' },
            { href: '/orbit/manage', icon: Settings, label: 'Manage Orbit', requireLeader: true },
            { href: '/orbit/analytics', icon: BarChart3, label: 'Orbit Analytics', requireLeader: true },
        ],
    },
    request: {
        label: 'Request Form',
        backToHome: true,
        items: [
            { href: '/request', icon: ExternalLink, label: 'Request Form' },
        ],
    },
    users: {
        label: 'User Control Panel',
        backToHome: true,
        items: [
            { href: '/users', icon: Users, label: 'User Control Panel', requireLeader: true },
        ],
    },
};

// Determine which section the current pathname belongs to
function getCurrentSection(pathname: string): keyof typeof sectionConfigs {
    if (pathname === '/') return 'comss';
    if (pathname.startsWith('/channels') || pathname.startsWith('/messages') || pathname.startsWith('/chat')) return 'chat';
    if (pathname.startsWith('/fast') || pathname.startsWith('/tasks') || pathname.startsWith('/nexus')
        || pathname.startsWith('/analytics')
        || pathname.startsWith('/activity-log') || pathname.startsWith('/later')) return 'fast';
    if (pathname.startsWith('/orbit')) return 'orbit';
    if (pathname.startsWith('/request')) return 'request';
    if (pathname.startsWith('/users')) return 'users';
    return 'comss';
}

export function Sidebar() {
    const pathname = usePathname();
    const { sidebarOpen, toggleSidebar } = useAppStore();
    const { isLeader, isMaster, user } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);
    const [orbitUnclaimedCount, setOrbitUnclaimedCount] = useState(0);
    const [changelogUnseenCount, setChangelogUnseenCount] = useState(0);
    const [dmUnreadCount, setDmUnreadCount] = useState(0);
    const [storageInfo, setStorageInfo] = useState<{ usedGB: number; totalGB: number; availableGB: number; usagePercent: number } | null>(null);

    // Poll badge counts
    useEffect(() => {
        if (!user) return;

        const fetchBadges = async () => {
            try {
                const [channelRes, orbitRes, changelogRes, dmRes] = await Promise.all([
                    fetch('/api/channels/unread'),
                    fetch('/api/orbit/unclaimed'),
                    fetch('/api/changelog'),
                    fetch('/api/chat/unread'),
                ]);
                if (channelRes.ok) {
                    const data = await channelRes.json();
                    setUnreadCount(data.unreadCount || 0);
                }
                if (orbitRes.ok) {
                    const data = await orbitRes.json();
                    setOrbitUnclaimedCount(data.unclaimedCount || 0);
                }
                if (changelogRes.ok) {
                    const data = await changelogRes.json();
                    setChangelogUnseenCount(data.unseenCount || 0);
                }
                if (dmRes.ok) {
                    const data = await dmRes.json();
                    setDmUnreadCount(data.unreadCount || 0);
                }
            } catch { }
        };

        fetchBadges();
        const interval = setInterval(fetchBadges, 5000);
        return () => clearInterval(interval);
    }, [user]);

    // Fetch storage info
    useEffect(() => {
        if (!user) return;
        const fetchStorage = async () => {
            try {
                const res = await fetch('/api/storage');
                if (res.ok) {
                    const data = await res.json();
                    setStorageInfo(data.database);
                }
            } catch { }
        };
        fetchStorage();
        const interval = setInterval(fetchStorage, 60000);
        return () => clearInterval(interval);
    }, [user]);

    // Get only the section relevant to the current page
    const currentSectionKey = getCurrentSection(pathname);
    const currentSection = sectionConfigs[currentSectionKey];
    const filteredItems = currentSection.items.filter(item => !item.requireLeader || isLeader);
    const visibleSection = filteredItems.length > 0 ? { ...currentSection, items: filteredItems } : null;

    return (
        <aside
            className={cn(
                'fixed left-0 top-0 z-40 h-screen bg-white border-r border-slate-200 transition-all duration-300 ease-in-out',
                sidebarOpen ? 'w-64' : 'w-20'
            )}
        >
            {/* Logo */}
            <a href="/" className="flex items-center h-16 px-4 border-b border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                        <img src="/aha-logo.png?v=2" alt="AHA Fast Logo" className="w-full h-full object-contain" />
                    </div>
                    {sidebarOpen && (
                        <div className="overflow-hidden">
                            <div className="flex items-baseline">
                                <h1 className="text-2xl font-extrabold text-[#0F0E7F] tracking-tight">
                                    AHA
                                </h1>
                                <span className="text-2xl font-medium text-[#0F0E7F] ml-1.5 tracking-tight">
                                    COMSS
                                </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium -mt-0.5 tracking-wide">Company Support Systems</p>
                        </div>
                    )}
                </div>
            </a>

            {/* Navigation - Single section based on current route */}
            <nav className="py-4 pr-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                {visibleSection && (
                    <div>
                        {/* Back to Home link for sub-app sections */}
                        {visibleSection.backToHome && (
                            <Link
                                href="/"
                                className="flex items-center gap-2 pl-6 pr-4 py-2 mb-3 text-xs font-semibold text-slate-400 hover:text-indigo-600 transition-colors"
                            >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                {sidebarOpen && <span>Back to AHA COMSS</span>}
                            </Link>
                        )}
                        {sidebarOpen && (
                            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-6 pb-2">
                                {visibleSection.label}
                            </h3>
                        )}
                        <div className="space-y-1">
                            {visibleSection.items.map((item) => {
                                const isActive = pathname === item.href
                                    || (item.href === '/channels' && pathname.startsWith('/channels'))
                                    || (item.href === '/tasks' && (pathname === '/tasks' || pathname === '/nexus'))
                                    || (item.href === '/orbit' && pathname === '/orbit')
                                    || (item.href === '/orbit/manage' && pathname.startsWith('/orbit/manage'))
                                    || (item.href === '/fast' && pathname === '/fast');
                                const badgeKey = item.badgeKey;
                                const badgeCount = badgeKey === 'orbit'
                                    ? orbitUnclaimedCount
                                    : badgeKey === 'changelog'
                                        ? changelogUnseenCount
                                        : badgeKey === 'chat'
                                            ? unreadCount + dmUnreadCount
                                            : badgeKey === 'dm'
                                                ? dmUnreadCount
                                                : badgeKey === 'tasks'
                                                    ? 0 // tasks badge reserved for future use
                                                    : unreadCount;
                                const showBadge = item.hasBadge && badgeCount > 0;

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

                                const linkClasses = cn(
                                    'flex items-center gap-3 pl-6 pr-4 py-2.5 rounded-r-full transition-all duration-200 group font-medium relative',
                                    isActive
                                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                );

                                const linkContent = (
                                    <>
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
                                                    badgeKey === 'orbit' ? 'bg-amber-500'
                                                        : badgeKey === 'changelog' ? 'bg-indigo-500'
                                                            : badgeKey === 'chat' ? 'bg-rose-500'
                                                                : 'bg-rose-500'
                                                )}>
                                                    {badgeCount > 9 ? '9+' : badgeCount}
                                                </span>
                                            )}
                                        </div>
                                        {sidebarOpen && (
                                            <span className="font-medium whitespace-nowrap flex-1 text-sm">{item.label}</span>
                                        )}
                                        {item.isExternal && sidebarOpen && (
                                            <ExternalLink className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                        )}
                                        {showBadge && sidebarOpen && (
                                            <span className={cn(
                                                'min-w-[20px] h-5 flex items-center justify-center px-1.5 text-[10px] font-bold rounded-full',
                                                isActive
                                                    ? 'bg-white/20 text-white'
                                                    : badgeKey === 'orbit' ? 'bg-amber-500 text-white'
                                                        : badgeKey === 'changelog' ? 'bg-indigo-500 text-white'
                                                            : 'bg-rose-500 text-white'
                                            )}>
                                                {badgeCount > 99 ? '99+' : badgeCount}
                                            </span>
                                        )}
                                    </>
                                );

                                if (item.isExternal) {
                                    return (
                                        <a
                                            key={item.href}
                                            href={item.href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={linkClasses}
                                        >
                                            {linkContent}
                                        </a>
                                    );
                                }

                                return (
                                    <Link key={item.href} href={item.href} className={linkClasses}>
                                        {linkContent}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                )}
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
            {sidebarOpen ? (
                <div className="absolute bottom-0 left-0 right-0 px-4 py-3 border-t border-slate-200">
                    {isMaster && storageInfo && (
                        <div className="mb-2.5 px-2 py-2 bg-slate-50/80 rounded-lg">
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5">
                                    <HardDrive className="w-3 h-3 text-slate-400" />
                                    <span className="text-[10px] font-semibold text-slate-500">Storage</span>
                                </div>
                                <span className="text-[10px] font-medium text-slate-400">
                                    {storageInfo.usedGB} / {storageInfo.totalGB} GB
                                </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-200/60 rounded-full overflow-hidden">
                                <div
                                    className={cn(
                                        'h-full rounded-full transition-all duration-500',
                                        storageInfo.usagePercent > 80 ? 'bg-red-500' :
                                        storageInfo.usagePercent > 60 ? 'bg-amber-500' : 'bg-indigo-500'
                                    )}
                                    style={{ width: `${Math.min(storageInfo.usagePercent, 100)}%` }}
                                />
                            </div>
                        </div>
                    )}
                    <div className="text-[10px] font-medium text-slate-400 text-center">
                        © 2026 AHA Factual Business Intelligence
                    </div>
                </div>
            ) : (
                <div className="absolute bottom-0 left-0 right-0 p-2 border-t border-slate-200 flex flex-col items-center gap-2">
                    {isMaster && storageInfo && (
                        <div className="relative group cursor-default">
                            <HardDrive className={cn(
                                'w-4 h-4',
                                storageInfo.usagePercent > 80 ? 'text-red-500' :
                                storageInfo.usagePercent > 60 ? 'text-amber-500' : 'text-slate-400'
                            )} />
                            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-white text-[10px] rounded-lg px-3 py-1.5 whitespace-nowrap z-50 shadow-lg">
                                {storageInfo.usedGB} / {storageInfo.totalGB} GB
                            </div>
                        </div>
                    )}
                </div>
            )}
        </aside>
    );
}


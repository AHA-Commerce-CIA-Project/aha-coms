'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
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
    MessageCircle,
    Sparkles,
    Shield,
    Send,
    Trophy,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useAuth } from '@/lib/auth/use-auth';
import { cn } from '@/lib/utils';

interface SubItem {
    href: string;
    label: string;
}

interface NavItem {
    href: string;
    icon: any;
    label: string;
    disabled?: boolean;
    hasBadge?: boolean;
    badgeKey?: string;
    requireLeader?: boolean;
    isExternal?: boolean;
    // When set, clicking the item runs an action instead of navigating.
    actionKey?: 'direct-assign';
    // When provided, hovering the item reveals a flyout panel with these links.
    subItems?: SubItem[];
}

interface NavSection {
    label: string;
    items: NavItem[];
}

// Each module's contextual sidebar — rendered beneath the TopNav module tabs
const sectionConfigs: Record<string, NavSection> = {
    fast: {
        label: 'AHA Fast',
        items: [
            { href: '/fast', icon: LayoutDashboard, label: 'Dashboard' },
            { href: '/tasks', icon: CheckSquare, label: 'Tasks', hasBadge: true, badgeKey: 'tasks', subItems: [
                { href: '/tasks', label: 'My Tasks' },
                { href: '/my-request', label: 'My Request' },
                { href: '/nexus', label: 'Task Queue' },
                { href: '/team-inbox', label: 'Task Inbox' },
                { href: '/orbit', label: 'AHA Orbit' },
            ] },
            // Unified Messages workspace — DMs and Channels live in a single
            // Slack-style left pane on /messages. Badge sums both DM and channel unread.
            { href: '/messages', icon: MessageCircle, label: 'Messages', hasBadge: true, badgeKey: 'messages' },
            { href: '/analytics', icon: BarChart3, label: 'Analytics', requireLeader: true },
            { href: '/activity-log', icon: Activity, label: 'Activity Log', requireLeader: true },
            // Later moved into the Messages workspace as a top-level tab
            // alongside "Messages" — see app/messages/page.tsx.
        ],
    },
    orbit: {
        label: 'AHA Orbit',
        items: [
            { href: '/orbit', icon: RotateCcw, label: 'ORBIT', hasBadge: true, badgeKey: 'orbit' },
            { href: '/orbit/milestones', icon: Trophy, label: 'Milestones' },
            { href: '/orbit/manage', icon: Settings, label: 'Manage Orbit', requireLeader: true },
            { href: '/orbit/analytics', icon: BarChart3, label: 'Orbit Analytics', requireLeader: true },
        ],
    },
    request: {
        label: 'Request Form',
        items: [
            { href: '/request', icon: FileText, label: 'Submit Request' },
        ],
    },
    users: {
        label: 'User Control Panel',
        items: [
            { href: '/users', icon: Users, label: 'Users', requireLeader: true },
            { href: '/users?tab=teams', icon: Users, label: 'Teams', requireLeader: true },
            { href: '/users?tab=roles', icon: Shield, label: 'Roles', requireLeader: true },
        ],
    },
    changelog: {
        label: 'Changelog',
        items: [
            { href: '/changelog', icon: Sparkles, label: 'Changelog', hasBadge: true, badgeKey: 'changelog' },
        ],
    },
};

// Determine which section the current pathname belongs to.
// AHA Orbit lives as a tab inside Tasks now, so /orbit shares the Fast sidebar.
// /orbit/manage and /orbit/analytics still resolve to the orbit-admin section so
// leaders see those tools when configuring routine tasks.
function getCurrentSection(pathname: string): keyof typeof sectionConfigs {
    if (pathname.startsWith('/orbit/manage') || pathname.startsWith('/orbit/analytics') || pathname.startsWith('/orbit/milestones')) return 'orbit';
    if (pathname.startsWith('/request')) return 'request';
    if (pathname.startsWith('/users')) return 'users';
    if (pathname.startsWith('/changelog')) return 'changelog';
    return 'fast';
}

export function Sidebar() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentTab = searchParams.get('tab');
    const { sidebarOpen, sidebarHovered, toggleSidebar, setSidebarHovered, setDirectAssignOpen } = useAppStore();
    const { isLeader, isMaster, user } = useAuth();
    // Hover-driven expansion. The sidebar lifts its hover state into the store so
    // AppShell can reflow the page width to match. Toggle button still pins it open
    // via `sidebarOpen` — `expanded = pinned || hovered`.
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleMouseEnter = () => {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        setSidebarHovered(true);
    };
    const handleMouseLeave = () => {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        // Small delay prevents flicker if the cursor briefly leaves and comes back
        // (e.g., crossing a 1px gap between the sidebar and its toggle button).
        closeTimerRef.current = setTimeout(() => setSidebarHovered(false), 150);
    };
    useEffect(() => () => {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    }, []);
    const expanded = sidebarOpen || sidebarHovered;
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
                    fetch('/fast/api/channels/unread'),
                    fetch('/fast/api/orbit/unclaimed'),
                    fetch('/fast/api/changelog'),
                    fetch('/fast/api/chat/unread'),
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
                const res = await fetch('/fast/api/storage');
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
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={cn(
                // Hidden on mobile — TopNav module tabs handle navigation there.
                // The sidebar's contextual sub-items still appear on tablets/desktop.
                'hidden md:block',
                'fixed left-0 top-16 z-40 bg-white border-r border-slate-200 transition-all duration-300 ease-in-out',
                'h-[calc(100vh-4rem)]',
                expanded ? 'w-64 shadow-xl' : 'w-20'
            )}
        >
            {/* Navigation - contextual sub-items for the active module.
                overflow:visible is required so per-item hover flyouts (which sit at
                left-full) are not clipped by the nav box. Item count is small so we
                don't need vertical scrolling here. */}
            <nav className="py-4 pr-4 space-y-4 overflow-visible">
                {visibleSection && (
                    <div>
                        {expanded && (
                            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-6 pb-2">
                                {visibleSection.label}
                            </h3>
                        )}
                        <div className="space-y-1">
                            {visibleSection.items.map((item) => {
                                const [itemPath, itemQuery] = item.href.split('?');
                                const itemTab = itemQuery ? new URLSearchParams(itemQuery).get('tab') : null;
                                const isActive = (pathname === itemPath && (itemTab ? currentTab === itemTab : !currentTab))
                                    || (item.href === '/messages' && (pathname.startsWith('/messages') || pathname.startsWith('/channels')))
                                    || (item.href === '/tasks' && (pathname === '/tasks' || pathname === '/nexus' || pathname === '/orbit'))
                                    || (item.href === '/orbit' && pathname === '/orbit')
                                    || (item.href === '/orbit/manage' && pathname.startsWith('/orbit/manage'));
                                const badgeKey = item.badgeKey;
                                const badgeCount = badgeKey === 'orbit'
                                    ? orbitUnclaimedCount
                                    : badgeKey === 'changelog'
                                        ? changelogUnseenCount
                                        : badgeKey === 'messages'
                                            ? unreadCount + dmUnreadCount
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
                                            {expanded && (
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
                                            {showBadge && !expanded && (
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
                                        {expanded && (
                                            <span className="font-medium whitespace-nowrap flex-1 text-sm">{item.label}</span>
                                        )}
                                        {item.isExternal && expanded && (
                                            <ExternalLink className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                        )}
                                        {showBadge && expanded && (
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

                                // Flyout panel for items that have subItems. CSS `:hover`
                                // propagates from descendants (including absolute-positioned
                                // ones), so hovering the flyout keeps it open even though it
                                // sits visually outside the sidebar.
                                const flyout = item.subItems && item.subItems.length > 0 && (
                                    <div className="absolute left-full top-0 hidden group-hover/item:block pl-1 z-[60]">
                                        <div className="bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 w-52 overflow-hidden">
                                            <div className="px-4 pb-2 pt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
                                                {item.label}
                                            </div>
                                            {item.subItems!.map((sub) => {
                                                const isSubActive = pathname === sub.href;
                                                return (
                                                    <Link
                                                        key={sub.href}
                                                        href={sub.href}
                                                        className={cn(
                                                            'block px-4 py-2 text-sm font-medium transition-colors',
                                                            isSubActive
                                                                ? 'text-indigo-600 bg-indigo-50'
                                                                : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900',
                                                        )}
                                                    >
                                                        {sub.label}
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );

                                if (item.isExternal) {
                                    return (
                                        <div key={item.href} className="relative group/item">
                                            <a
                                                href={item.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={linkClasses}
                                            >
                                                {linkContent}
                                            </a>
                                            {flyout}
                                        </div>
                                    );
                                }

                                if (item.actionKey === 'direct-assign') {
                                    return (
                                        <div key={item.href} className="relative group/item">
                                            <button
                                                type="button"
                                                onClick={() => setDirectAssignOpen(true)}
                                                className={cn(linkClasses, 'w-full text-left')}
                                            >
                                                {linkContent}
                                            </button>
                                            {flyout}
                                        </div>
                                    );
                                }

                                return (
                                    <div key={item.href} className="relative group/item">
                                        <Link href={item.href} className={linkClasses}>
                                            {linkContent}
                                        </Link>
                                        {flyout}
                                    </div>
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
            {expanded ? (
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


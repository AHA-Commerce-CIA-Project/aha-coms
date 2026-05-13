'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard, CheckSquare, Hash, MessageCircle, Menu,
    BarChart3, Activity, Bookmark, FileText, Users, Sparkles, Shield, LogOut, X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/use-auth';
import { cn } from '@/lib/utils';

interface TabDef {
    href: string;
    icon: any;
    label: string;
    badgeKey?: 'tasks' | 'messages' | 'changelog';
    /** A path is "active" when pathname startsWith any of these. */
    activePaths: string[];
}

const PRIMARY_TABS: TabDef[] = [
    { href: '/fast', icon: LayoutDashboard, label: 'Home', activePaths: ['/fast'] },
    { href: '/tasks', icon: CheckSquare, label: 'Tasks', badgeKey: 'tasks', activePaths: ['/tasks', '/my-request', '/nexus', '/team-inbox', '/orbit'] },
    // Unified Messages workspace — DMs and channels share one tab now.
    { href: '/messages', icon: MessageCircle, label: 'Messages', badgeKey: 'messages', activePaths: ['/messages', '/channels'] },
];

interface MoreItem {
    href?: string;
    onClick?: () => void;
    icon: any;
    label: string;
    requireLeader?: boolean;
    badgeKey?: 'changelog';
}

/** Bottom tab bar — only renders below md. Desktop keeps the existing Sidebar.
 *  Five-slot pattern: 4 primary destinations + a "More" sheet for everything else. */
export function BottomNav() {
    const pathname = usePathname();
    const router = useRouter();
    const { user, isLeader, signOut } = useAuth();

    const [moreOpen, setMoreOpen] = useState(false);

    // The Messages tab badge sums channel + DM unread, since they're now one nav entry.
    const [badges, setBadges] = useState({ tasks: 0, messages: 0, changelog: 0 });

    // Reuse the same endpoints the Sidebar polls so badge state stays in sync
    // even though the two nav surfaces fetch independently. Cheap — endpoints
    // are tiny aggregates.
    useEffect(() => {
        if (!user) return;
        const tick = async () => {
            try {
                const [channelRes, dmRes, changelogRes] = await Promise.all([
                    fetch('/fast/api/channels/unread'),
                    fetch('/fast/api/chat/unread'),
                    fetch('/fast/api/changelog'),
                ]);
                const next = { ...badges };
                const channelUnread = channelRes.ok ? ((await channelRes.json()).unreadCount || 0) : 0;
                const dmUnread = dmRes.ok ? ((await dmRes.json()).unreadCount || 0) : 0;
                next.messages = channelUnread + dmUnread;
                if (changelogRes.ok) next.changelog = (await changelogRes.json()).unseenCount || 0;
                setBadges(next);
            } catch {}
        };
        tick();
        const id = setInterval(tick, 5000);
        return () => clearInterval(id);
    // We deliberately don't depend on `badges` — would loop. The poll always reads fresh values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    if (!user) return null;

    const isActive = (paths: string[]) => paths.some(p => pathname === p || pathname.startsWith(p + '/'));

    const moreItems: MoreItem[] = [
        { href: '/request', icon: FileText, label: 'Submit Request' },
        { href: '/analytics', icon: BarChart3, label: 'Analytics', requireLeader: true },
        { href: '/activity-log', icon: Activity, label: 'Activity Log', requireLeader: true },
        { href: '/users', icon: Users, label: 'Users', requireLeader: true },
        { href: '/users?tab=teams', icon: Users, label: 'Teams', requireLeader: true },
        { href: '/users?tab=roles', icon: Shield, label: 'Roles', requireLeader: true },
        { href: '/changelog', icon: Sparkles, label: 'Changelog', badgeKey: 'changelog' },
        { onClick: () => { signOut(); setMoreOpen(false); }, icon: LogOut, label: 'Sign out' },
    ].filter(it => !it.requireLeader || isLeader);

    const moreActive = !PRIMARY_TABS.some(t => isActive(t.activePaths));
    const totalMoreBadge = badges.changelog;

    return (
        <>
            {/* Bottom tab bar — only below md (desktop keeps the Sidebar) */}
            <nav
                className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-[0_-1px_4px_rgba(15,23,42,0.04)]"
                // Honour iOS safe-area inset so the bar isn't covered by the home indicator.
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
                <ul className="flex items-stretch justify-around">
                    {PRIMARY_TABS.map(tab => {
                        const Icon = tab.icon;
                        const active = isActive(tab.activePaths);
                        const badge = tab.badgeKey ? badges[tab.badgeKey] : 0;
                        return (
                            <li key={tab.href} className="flex-1">
                                <Link
                                    href={tab.href}
                                    className={cn(
                                        'flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors',
                                        active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600',
                                    )}
                                >
                                    <span className="relative">
                                        <Icon className={cn('w-5 h-5', active && 'stroke-[2.5]')} />
                                        {badge > 0 && (
                                            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                                                {badge > 99 ? '99+' : badge}
                                            </span>
                                        )}
                                    </span>
                                    <span className={cn('text-[10px] leading-none font-medium', active && 'font-semibold')}>{tab.label}</span>
                                </Link>
                            </li>
                        );
                    })}
                    <li className="flex-1">
                        <button
                            type="button"
                            onClick={() => setMoreOpen(true)}
                            className={cn(
                                'w-full flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors',
                                moreActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600',
                            )}
                            aria-label="More navigation"
                        >
                            <span className="relative">
                                <Menu className="w-5 h-5" />
                                {totalMoreBadge > 0 && (
                                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                                        {totalMoreBadge > 99 ? '99+' : totalMoreBadge}
                                    </span>
                                )}
                            </span>
                            <span className="text-[10px] leading-none font-medium">More</span>
                        </button>
                    </li>
                </ul>
            </nav>

            {/* Slide-up "More" sheet */}
            {moreOpen && (
                <div
                    className="md:hidden fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end"
                    onClick={() => setMoreOpen(false)}
                >
                    <div
                        className="w-full bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto"
                        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Drag handle + header */}
                        <div className="flex items-center justify-between px-4 pt-3 pb-2">
                            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto" />
                            <button
                                type="button"
                                onClick={() => setMoreOpen(false)}
                                className="absolute right-3 top-3 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                                aria-label="Close"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-4 pb-2">
                            <h3 className="text-base font-bold text-slate-900">More</h3>
                            <p className="text-xs text-slate-500">All your other destinations</p>
                        </div>
                        <ul className="divide-y divide-slate-100">
                            {moreItems.map((item, i) => {
                                const Icon = item.icon;
                                const badge = item.badgeKey ? badges[item.badgeKey] : 0;
                                const content = (
                                    <span className="flex items-center gap-3 px-4 py-3.5 text-slate-700 hover:bg-slate-50 transition-colors">
                                        <Icon className="w-5 h-5 text-slate-500 flex-shrink-0" />
                                        <span className="flex-1 text-sm font-medium">{item.label}</span>
                                        {badge > 0 && (
                                            <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                                                {badge > 99 ? '99+' : badge}
                                            </span>
                                        )}
                                    </span>
                                );
                                if (item.href) {
                                    return (
                                        <li key={i}>
                                            <Link
                                                href={item.href}
                                                onClick={() => setMoreOpen(false)}
                                                className="block"
                                            >
                                                {content}
                                            </Link>
                                        </li>
                                    );
                                }
                                return (
                                    <li key={i}>
                                        <button
                                            type="button"
                                            onClick={item.onClick}
                                            className="block w-full text-left"
                                        >
                                            {content}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>
            )}
        </>
    );
}

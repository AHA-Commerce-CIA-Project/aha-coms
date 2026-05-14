'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import {
    Zap,
    RotateCcw,
    FileText,
    Users,
    Sparkles,
    Bell,
    Sun,
    Moon,
    Shield,
    User,
    LogOut,
    CheckCheck,
    Trash2,
    Check,
    UserPlus,
    CheckCircle2,
    ChevronRight,
    AtSign,
    MessageSquare,
    ClipboardList,
    X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/use-auth';
import { useTheme } from '@/lib/theme-context';
import { cn } from '@/lib/utils';
import { htmlToPlainText } from '@/lib/sanitize';

interface NotifItem {
    id: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    created_at: string;
    data: any;
}

interface SubItem {
    label: string;
    href: string;
    requireLeader?: boolean;
    // Nested level — when present, hovering this row reveals a side flyout.
    subItems?: SubItem[];
}

interface ModuleTab {
    key: string;
    label: string;
    href: string;
    icon: any;
    matchPaths: string[];
    requireLeader?: boolean;
    subItems?: SubItem[];
}

const MODULES: ModuleTab[] = [
    {
        key: 'fast', label: 'AHA Fast', href: '/fast', icon: Zap,
        // Orbit lives under AHA Fast now — surfaced via the My Tasks / Task Queue / AHA Orbit tab row
        // instead of a top-bar module.
        matchPaths: ['/fast', '/tasks', '/my-request', '/nexus', '/analytics', '/activity-log', '/later', '/channels', '/messages', '/orbit', '/team-inbox'],
        subItems: [
            { label: 'Dashboard', href: '/fast' },
            {
                label: 'Tasks', href: '/tasks',
                subItems: [
                    { label: 'My Tasks', href: '/tasks' },
                    { label: 'My Request', href: '/my-request' },
                    { label: 'Task Queue', href: '/nexus' },
                    { label: 'Task Inbox', href: '/team-inbox' },
                    { label: 'AHA Orbit', href: '/orbit' },
                ],
            },
            { label: 'Messages', href: '/messages' },
            { label: 'Channels', href: '/channels' },
            { label: 'Analytics', href: '/analytics', requireLeader: true },
            { label: 'Activity Log', href: '/activity-log', requireLeader: true },
            { label: 'Later', href: '/later' },
        ],
    },
    {
        key: 'request', label: 'Request Form', href: '/request', icon: FileText,
        matchPaths: ['/request'],
    },
    {
        key: 'users', label: 'User Control Panel', href: '/users', icon: Users,
        matchPaths: ['/users'], requireLeader: true,
        subItems: [
            { label: 'Users', href: '/users' },
            { label: 'Teams', href: '/users?tab=teams' },
            { label: 'Roles', href: '/users?tab=roles' },
        ],
    },
];

export function TopNav() {
    const pathname = usePathname();
    const router = useRouter();
    const { user, profile, isLeader, signOut } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [showDropdown, setShowDropdown] = useState(false);
    const [showNotifs, setShowNotifs] = useState(false);
    const [notifications, setNotifications] = useState<NotifItem[]>([]);
    const [notifTab, setNotifTab] = useState<'all' | 'dms'>('all');
    const [hoveredModule, setHoveredModule] = useState<string | null>(null);
    const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const notifRef = useRef<HTMLDivElement>(null);
    const userMenuRef = useRef<HTMLDivElement>(null);
    // Toast notifications — popups for high-signal events only.
    // Excludes generic channel posts, lifecycle, meetings, orbit, etc.
    const TOAST_TYPES = useRef(new Set([
        'task_assigned',         // queue task assigned to me (Form > Task Queue)
        'direct_assign_posted',  // new direct-assign card in my team's channel
        'mention',               // @-mentioned in channel/thread
        'channel_reply',         // someone replied in a thread I'm in
        'task_comment',          // someone commented on my task
        'dm_message',            // new DM
        'task_pending',          // a task I requested or am assigned to was paused
        'task_resumed',          // a paused task I'm involved in is moving again
        'task_pending_disputed', // requester overrode my pause and resumed the task
    ]));
    const [toasts, setToasts] = useState<NotifItem[]>([]);
    // Tracks which notification IDs we've already considered for toasting, so
    // a polling refresh doesn't re-show a toast for an already-seen item. We
    // also use this to skip toasts on first load (the user just landed —
    // raining 9 toasts at once is hostile).
    const seenIdsRef = useRef<Set<string>>(new Set());
    const isFirstFetchRef = useRef(true);
    const toastTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    const openModuleDropdown = (key: string) => {
        if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
        setHoveredModule(key);
    };
    const scheduleModuleClose = () => {
        if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
        hoverCloseTimer.current = setTimeout(() => setHoveredModule(null), 120);
    };

    const displayName = profile?.name || 'User';
    const displayRole = profile?.role || 'member';
    const unreadCount = notifications.filter(n => !n.read).length;

    const visibleModules = MODULES.filter(m => !m.requireLeader || isLeader);
    const activeModule = visibleModules.find(m => m.matchPaths.some(p => pathname.startsWith(p)));

    const dismissToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
        const timer = toastTimersRef.current[id];
        if (timer) {
            clearTimeout(timer);
            delete toastTimersRef.current[id];
        }
    };

    // Push a single fresh notification into state + (optionally) the toast queue.
    // Used by both the initial fetch and the SSE stream so the two paths share
    // dedup logic via seenIdsRef.
    const ingestNotification = (n: NotifItem, allowToast: boolean) => {
        if (seenIdsRef.current.has(n.id)) return;
        seenIdsRef.current.add(n.id);
        setNotifications(prev => prev.some(p => p.id === n.id) ? prev : [n, ...prev].slice(0, 30));
        if (allowToast && !n.read && TOAST_TYPES.current.has(n.type)) {
            setToasts(prev => prev.some(t => t.id === n.id) ? prev : [n, ...prev].slice(0, 5));
            toastTimersRef.current[n.id] = setTimeout(() => dismissToast(n.id), 7000);
        }
    };

    // Initial fetch — populates the bell dropdown without firing toasts (we
    // don't want a stack of popups when the user lands on the page).
    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/fast/api/notifications');
                if (!res.ok || cancelled) return;
                const fetched: NotifItem[] = await res.json();
                setNotifications(fetched);
                fetched.forEach(n => seenIdsRef.current.add(n.id));
                isFirstFetchRef.current = false;
            } catch { }
        })();
        return () => { cancelled = true; };
    }, [user]);

    // Real-time stream — pushes new notifications immediately, no 30s polling.
    // Falls back automatically: if the stream drops, EventSource auto-reconnects.
    // The connection-open boundary uses seenIdsRef to ignore anything we've
    // already loaded via the initial fetch.
    useEffect(() => {
        if (!user) return;
        const es = new EventSource('/api/notifications/stream');
        es.addEventListener('notification', (ev: MessageEvent) => {
            try {
                const n: NotifItem = JSON.parse(ev.data);
                // Only allow toasts after the first fetch has settled — protects
                // against a flurry of legacy-but-unread events on connect.
                ingestNotification(n, !isFirstFetchRef.current);
            } catch { }
        });
        es.onerror = () => {
            // Browser will auto-retry; nothing to do besides log if needed.
        };
        return () => { es.close(); };
    }, [user]);

    // Clear timers on unmount.
    useEffect(() => () => {
        Object.values(toastTimersRef.current).forEach(clearTimeout);
        toastTimersRef.current = {};
    }, []);

    // Close popovers on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
            if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setShowDropdown(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Tab filter — DMs tab shows only direct-message notifications so they
    // don't crowd out task assignments and @-mentions in the All tab.
    const isDmType = (t: string) => t === 'dm_message';
    const tabFilter = (n: NotifItem) => notifTab === 'all' ? true : isDmType(n.type);
    const visibleNotifications = notifications.filter(tabFilter);
    const allUnreadCount = notifications.filter(n => !n.read).length;
    const dmUnreadCount = notifications.filter(n => !n.read && isDmType(n.type)).length;
    const visibleUnreadCount = notifTab === 'dms' ? dmUnreadCount : allUnreadCount;

    const markAllRead = async () => {
        try {
            await fetch('/fast/api/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                // When sitting on the DMs tab, only mark DM notifications as
                // read — leave task / @mention unread state untouched.
                body: JSON.stringify(notifTab === 'dms'
                    ? { markAllRead: true, type: 'dm_message' }
                    : { markAllRead: true }),
            });
            setNotifications(prev => prev.map(n =>
                tabFilter(n) ? { ...n, read: true } : n
            ));
        } catch { }
    };

    const clearAll = async () => {
        try {
            const url = notifTab === 'dms'
                ? '/api/notifications?type=dm_message'
                : '/api/notifications';
            await fetch(url, { method: 'DELETE' });
            setNotifications(prev => notifTab === 'dms'
                ? prev.filter(n => !isDmType(n.type))
                : []);
        } catch { }
    };

    const markOneRead = async (id: string) => {
        try {
            await fetch('/fast/api/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        } catch { }
    };

    const getNotifIcon = (title: string) => {
        if (title.includes('Request')) return <FileText className="w-4 h-4 text-sky-400" />;
        if (title.includes('Claimed')) return <UserPlus className="w-4 h-4 text-indigo-400" />;
        if (title.includes('Completed')) return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
        return <Bell className="w-4 h-4 text-slate-400" />;
    };

    const handleNotifClick = async (n: NotifItem) => {
        if (!n.read) await markOneRead(n.id);
        setShowNotifs(false);
        if (n.data?.meeting_id) {
            const params = new URLSearchParams();
            if (n.data.meeting_date) params.set('date', n.data.meeting_date);
            params.set('meetingId', n.data.meeting_id);
            router.push(`/tasks?${params.toString()}`);
        } else if (n.type === 'direct_assign_posted' && n.data?.task_id) {
            // Direct-assigned notifications cut straight to the task detail —
            // the notification text already gives channel context, no need to
            // round-trip through the Team Inbox.
            router.push(`/tasks?task=${n.data.task_id}`);
        } else if (n.data?.channel_id && n.data?.message_id) {
            router.push(`/messages?channel=${n.data.channel_id}&highlight=${n.data.message_id}`);
        } else if (n.data?.channel_id) {
            router.push(`/messages?channel=${n.data.channel_id}`);
        } else if (n.type === 'task_comment' && n.data?.task_id) {
            const commentQS = n.data.comment_id ? `&comment=${n.data.comment_id}` : '';
            router.push(`/tasks?task=${n.data.task_id}&focus=comments${commentQS}`);
        } else if (n.data?.task_id) {
            router.push(`/nexus?highlight=${n.data.task_id}`);
        } else if (n.data?.task_token) {
            router.push(`/nexus?highlight_token=${n.data.task_token}`);
        }
    };

    const timeAgo = (d: string) => {
        const diff = Date.now() - new Date(d).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    };

    return (
        <header className="h-16 bg-[#0F0E7F] flex items-center px-4 sticky top-0 md:top-9 z-40 shadow-md">
            {/* Logo — clicking goes to default module */}
            <Link href="/" className="flex items-center gap-2.5 pr-6 shrink-0">
                <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center p-1">
                    <img src="/fast/aha-logo.png?v=2" alt="AHA" className="w-full h-full object-contain" />
                </div>
                <div className="hidden sm:flex items-baseline">
                    <span className="text-xl font-extrabold text-white tracking-tight">AHA</span>
                    <span className="text-xl font-medium text-white/90 ml-1 tracking-tight">COMSS</span>
                </div>
            </Link>

            {/* Horizontal module tabs — scrollable on mobile so they don't crush
                the notification + avatar at the right edge. */}
            <nav className="flex items-center gap-0.5 sm:gap-1 flex-1 min-w-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                {visibleModules.map(m => {
                    const isActive = activeModule?.key === m.key;
                    const Icon = m.icon;
                    const subItems = (m.subItems || []).filter(s => !s.requireLeader || isLeader);
                    const hasDropdown = subItems.length > 0;
                    const isOpen = hoveredModule === m.key;
                    return (
                        <div
                            key={m.key}
                            className="relative"
                            onMouseEnter={() => hasDropdown && openModuleDropdown(m.key)}
                            onMouseLeave={scheduleModuleClose}
                        >
                            <Link
                                href={m.href}
                                className={cn(
                                    'relative flex items-center gap-2 px-3 sm:px-4 h-16 text-sm sm:text-base font-bold transition-colors whitespace-nowrap',
                                    isActive
                                        ? 'text-white bg-white/10'
                                        : 'text-white/80 hover:text-white hover:bg-white/5'
                                )}
                            >
                                <Icon className="w-5 h-5 flex-shrink-0" />
                                <span className="hidden sm:inline">{m.label}</span>
                                {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
                            </Link>
                            {hasDropdown && isOpen && (
                                <div
                                    className="absolute left-0 top-full min-w-[240px] bg-white border border-slate-200 rounded-xl shadow-xl z-50"
                                    onMouseEnter={() => openModuleDropdown(m.key)}
                                    onMouseLeave={scheduleModuleClose}
                                >
                                    <div className="py-1">
                                        {subItems.map(s => {
                                            const nested = (s.subItems || []).filter((n) => !n.requireLeader || isLeader);
                                            if (nested.length > 0) {
                                                return (
                                                    <div key={s.href} className="relative group/sub">
                                                        <Link
                                                            href={s.href}
                                                            onClick={() => setHoveredModule(null)}
                                                            className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                                                        >
                                                            <span>{s.label}</span>
                                                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                                        </Link>
                                                        <div className="absolute left-full top-0 hidden group-hover/sub:block pl-1 z-[60]">
                                                            <div className="bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[200px]">
                                                                {nested.map((n) => (
                                                                    <Link
                                                                        key={n.href}
                                                                        href={n.href}
                                                                        onClick={() => setHoveredModule(null)}
                                                                        className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                                                                    >
                                                                        {n.label}
                                                                    </Link>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return (
                                                <Link
                                                    key={s.href}
                                                    href={s.href}
                                                    onClick={() => setHoveredModule(null)}
                                                    className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                                                >
                                                    {s.label}
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            {/* Right cluster — fast-specific only; theme toggle + profile/identity
                live in the suite ServiceBar above (Phase 6 chrome cleanup, 2026-05-14).
                Profile Settings + Changelog moved to the Sidebar footer in the same pass. */}
            <div className="flex items-center gap-1 pl-4 shrink-0">
                {/* Notifications */}
                <div className="relative" ref={notifRef}>
                    <button
                        onClick={() => { setShowNotifs(!showNotifs); setShowDropdown(false); }}
                        className="relative p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <Bell className="w-5 h-5" />
                        {unreadCount > 0 && (
                            <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-rose-500 text-white rounded-full">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>
                    {showNotifs && (
                        <div className="absolute right-0 top-full mt-2 w-96 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                                <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
                                <div className="flex items-center gap-3">
                                    {visibleUnreadCount > 0 && (
                                        <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700">
                                            <CheckCheck className="w-3.5 h-3.5" />
                                            Mark all read
                                        </button>
                                    )}
                                    {visibleNotifications.length > 0 && (
                                        <button onClick={clearAll} className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600">
                                            <Trash2 className="w-3.5 h-3.5" />
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>
                            {/* Tabs — All / DMs. DMs filter keeps task and @-mention
                                notifications visible without DM noise drowning them out. */}
                            <div className="flex items-center gap-1 px-3 pt-2 pb-1 border-b border-slate-100">
                                {([
                                    { key: 'all' as const, label: 'All', count: allUnreadCount },
                                    { key: 'dms' as const, label: 'DMs', count: dmUnreadCount },
                                ]).map(t => {
                                    const active = notifTab === t.key;
                                    return (
                                        <button
                                            key={t.key}
                                            onClick={() => setNotifTab(t.key)}
                                            className={cn(
                                                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                                                active
                                                    ? 'bg-indigo-50 text-indigo-700'
                                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                                            )}
                                        >
                                            {t.label}
                                            {t.count > 0 && (
                                                <span className={cn(
                                                    'min-w-[18px] h-[18px] inline-flex items-center justify-center px-1 text-[10px] font-bold rounded-full',
                                                    active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                                                )}>
                                                    {t.count > 99 ? '99+' : t.count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="max-h-80 overflow-y-auto">
                                {visibleNotifications.length === 0 ? (
                                    <div className="px-4 py-8 text-center">
                                        <Bell className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                                        <p className="text-sm text-slate-500">
                                            {notifTab === 'dms' ? 'No DM notifications' : 'No notifications yet'}
                                        </p>
                                    </div>
                                ) : (
                                    visibleNotifications.map(n => (
                                        <div
                                            key={n.id}
                                            onClick={() => handleNotifClick(n)}
                                            className={`px-4 py-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${!n.read ? 'bg-indigo-50/50' : ''}`}
                                        >
                                            <div className="flex gap-3">
                                                <div className="mt-0.5">{getNotifIcon(n.title)}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-medium text-slate-800">{n.title}</p>
                                                        {!n.read && <span className="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0" />}
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-0.5 truncate">{htmlToPlainText(n.message)}</p>
                                                    <p className="text-xs text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                                                </div>
                                                {!n.read && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); markOneRead(n.id); }}
                                                        title="Mark as read"
                                                        className="flex-shrink-0 mt-0.5 p-1.5 text-slate-500 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg"
                                                    >
                                                        <Check className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Profile menu removed in the 2026-05-14 chrome cleanup — the
                    suite ServiceBar's AccountWidget covers name/role/email,
                    Manage Account, and Sign out as cross-app surfaces. Profile
                    Settings and Changelog moved to the Sidebar footer (fast-
                    specific destinations live with fast's in-app nav). */}
            </div>

            {/* Toast popups — anchored just under the topnav, top-right. Only
                fires for high-signal events (new task, mention/reply, task
                comment, DM); everything else stays in the bell dropdown. */}
            {toasts.length > 0 && (
                <div className="fixed top-[72px] right-3 z-[60] flex flex-col gap-2 w-[min(22rem,calc(100vw-1.5rem))] pointer-events-none">
                    {toasts.map(n => {
                        const isTask = n.type === 'task_assigned' || n.type === 'direct_assign_posted';
                        const isMention = n.type === 'mention';
                        const isReply = n.type === 'channel_reply' || n.type === 'task_comment';
                        const accent = isTask
                            ? 'from-indigo-500 to-violet-500'
                            : isMention
                                ? 'from-amber-500 to-orange-500'
                                : isReply
                                    ? 'from-sky-500 to-cyan-500'
                                    : 'from-emerald-500 to-teal-500';
                        const Icon = isTask ? ClipboardList : isMention ? AtSign : isReply ? MessageSquare : Bell;
                        return (
                            <div
                                key={n.id}
                                className="pointer-events-auto bg-white border border-slate-200 rounded-xl shadow-lg flex overflow-hidden animate-in slide-in-from-right duration-200"
                            >
                                <div className={cn('w-10 flex-shrink-0 bg-gradient-to-br flex items-center justify-center', accent)}>
                                    <Icon className="w-4 h-4 text-white" />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { dismissToast(n.id); handleNotifClick(n); }}
                                    className="flex-1 min-w-0 text-left px-3 py-2.5 hover:bg-slate-50 transition-colors"
                                >
                                    <div className="text-[13px] font-bold text-slate-900 truncate">{n.title}</div>
                                    <div className="text-xs text-slate-600 truncate">
                                        {htmlToPlainText(n.message || '')}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">{timeAgo(n.created_at)}</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => dismissToast(n.id)}
                                    className="px-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                    aria-label="Dismiss"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </header>
    );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import {
    RotateCcw,
    FileText,
    Users,
    Bell,
    CheckCheck,
    Trash2,
    Check,
    UserPlus,
    CheckCircle2,
    ChevronRight,
    ChevronDown,
    AtSign,
    MessageSquare,
    ClipboardList,
    X,
    Sun,
    Moon,
    LogOut,
    Zap,
    Trophy,
    Settings,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/use-auth';
import { useTheme } from '@/lib/theme-context';
import { cn } from '@/lib/utils';
import { htmlToPlainText } from '@/lib/sanitize';

// Cross-app pills sit just right of the logo and link OUT of fast (full URLs
// resolved at runtime from /api/userinfo's appCatalog; the static fallback
// renders pre-auth so the strip never looks empty during first paint). The
// portal pill was retired — the "AHA COMS" wordmark logo to the left is the
// canonical portal-home affordance now. Labels are normalised to the short
// all-caps form the design calls for ('AHA Fast' → 'FAST'), and each pill
// carries the app's brand glyph (Zap for FAST, Trophy for HEROES per the
// heroes-web brand mark documented in apps/heroes-web/README.md).
interface CrossAppEntry { slug: string; label: string; url: string; icon?: any; }

const iconForSlug = (slug: string): any => {
    if (slug === 'fast') return Zap;
    if (slug === 'heroes') return Trophy;
    return undefined;
};

const CROSS_APP_FALLBACK: CrossAppEntry[] = [
    { slug: 'fast', label: 'FAST', url: 'https://aha-coms.web.app/fast', icon: Zap },
    { slug: 'heroes', label: 'HEROES', url: 'https://aha-coms.web.app/heroes/', icon: Trophy },
];

// FAST top-nav mega menu. Two tiers:
//   • Tier-1 (vertical primary list inside the FAST dropdown) varies
//     by role — members see Dashboard / Task / Message; leader-tier
//     callers (Leader / Master / Admin per useAuth().isLeader)
//     additionally see Analytics + Activity Log.
//   • Tier-2 flies out to the right on hover when the Tier-1 item is
//     a `group` — Task and Message are the only groups today.
//
// Definitions stay declarative so role-gated additions / future
// sub-routes don't have to touch the render path.
type FastTier2Item = { label: string; href: string };
type FastTier1Item =
    | { kind: 'link'; key: string; label: string; href: string }
    | { kind: 'group'; key: string; label: string; children: FastTier2Item[] };

const FAST_MENU_BASE: FastTier1Item[] = [
    { kind: 'link', key: 'dashboard', label: 'Dashboard', href: '/dashboard' },
    {
        kind: 'group',
        key: 'task',
        label: 'Task',
        children: [
            { label: 'My Task',    href: '/tasks' },
            { label: 'My Request', href: '/my-request' },
            { label: 'Task Queue', href: '/nexus' },
            { label: 'Task Inbox', href: '/team-inbox' },
            { label: 'AHA Orbit',  href: '/orbit' },
        ],
    },
    {
        kind: 'group',
        key: 'message',
        label: 'Message',
        children: [
            { label: 'Channels',       href: '/channels' },
            { label: 'Direct Message', href: '/messages' },
            { label: 'Later',          href: '/later' },
        ],
    },
];

const FAST_MENU_LEADER_EXTRA: FastTier1Item[] = [
    { kind: 'link', key: 'analytics', label: 'Analytics', href: '/analytics' },
    { kind: 'link', key: 'activity',  label: 'Activity Log', href: '/activity-log' },
];

const PORTAL_ORIGIN =
    process.env.NEXT_PUBLIC_PORTAL_ORIGIN || 'https://aha-coms.web.app';

const pillLabel = (raw: string) => raw.replace(/^AHA\s+/i, '').toUpperCase();

interface NotifItem {
    id: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    created_at: string;
    data: any;
}

export function TopNav() {
    const pathname = usePathname();
    const router = useRouter();
    const { user, profile, isLeader, appCatalog, signOut } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [showNotifs, setShowNotifs] = useState(false);
    const [showAccount, setShowAccount] = useState(false);
    // Settings row in the avatar popover expands inline to reveal three
    // children: Profile Settings, Request Form, User Control Panel. The
    // last two used to live in the in-app module tabs row directly under
    // the top nav; they were folded in here on 2026-05-20 to reclaim
    // header real estate.
    const [settingsExpanded, setSettingsExpanded] = useState(false);
    const [notifications, setNotifications] = useState<NotifItem[]>([]);
    const [notifTab, setNotifTab] = useState<'all' | 'dms'>('all');
    // FAST cross-app pill is a sub-route dropdown when this app is the
    // active one (Tier-1 + Tier-2 flyout described below).
    const [fastDropdownOpen, setFastDropdownOpen] = useState(false);
    const fastDropdownCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Tier-2 flyout state — keys off the group's `key` ('task' / 'message')
    // so only one flyout can be open at a time. Separate timer because the
    // flyout needs its own hover-grace so the cursor can travel from the
    // Tier-1 row across the small gap into the Tier-2 panel without the
    // panel closing mid-traversal.
    const [fastFlyoutKey, setFastFlyoutKey] = useState<string | null>(null);
    const fastFlyoutCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const notifRef = useRef<HTMLDivElement>(null);
    const accountRef = useRef<HTMLDivElement>(null);

    // Cross-app pill source: live appCatalog from /api/userinfo when the auth
    // fetch has settled, static fallback before then so the row paints. The
    // portal slug is filtered out — the brand wordmark on the left is the
    // portal-home affordance, so a separate pill would be a redundant trip.
    const crossApps: CrossAppEntry[] = appCatalog.length > 0
        ? appCatalog
            .filter(a => a.slug !== 'portal')
            .map(a => ({ slug: a.slug, label: pillLabel(a.label), url: a.url, icon: iconForSlug(a.slug) }))
        : CROSS_APP_FALLBACK;
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

    const unreadCount = notifications.filter(n => !n.read).length;

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
        const es = new EventSource('/fast/api/notifications/stream');
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
            if (accountRef.current && !accountRef.current.contains(e.target as Node)) setShowAccount(false);
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
                ? '/fast/api/notifications?type=dm_message'
                : '/fast/api/notifications';
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
        // Single header line — the previous SuiteServiceBar (cross-app strip
        // above this bar) was folded in here, which is also why this bar no
        // longer needs the `md:top-9` sticky offset that reserved its 36px.
        <header className="h-16 bg-[#0F0E7F] flex items-center px-4 sticky top-0 z-40 shadow-md">
            {/* Logo — "AHA COMS" wordmark is the portal-home link, replacing
                the retired COMS pill. Plain <a> (not next/link) because the
                target is the portal origin served via Firebase Hosting
                rewrite, not a fast-internal route. */}
            <a
                href={`${PORTAL_ORIGIN}/portal`}
                aria-label="AHA COMS — return to portal"
                className="flex items-center gap-2.5 pr-4 sm:pr-5 shrink-0"
            >
                <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center p-1">
                    <img src="/fast/aha-logo.png?v=2" alt="AHA" className="w-full h-full object-contain" />
                </div>
                <div className="hidden sm:flex items-baseline">
                    <span className="text-xl font-extrabold text-white tracking-tight">AHA</span>
                    <span className="text-xl font-medium text-white/90 ml-1 tracking-tight">COMS</span>
                </div>
            </a>

            {/* Cross-app pills — leave fast for COMS / Heroes via real URLs.
                FAST is always marked active here since this bar only renders
                inside fast. The FAST pill is special: it's the current app,
                so clicking the pill's URL would be a no-op navigation —
                instead the pill is the trigger for a sub-route dropdown
                (My Tasks / My Request / Task Queue / Task Inbox / AHA Orbit).
                Other apps stay plain `<a>` (next/link can't cross origins;
                they're served via Firebase Hosting rewrites). */}
            <nav
                aria-label="Switch app"
                className="flex items-center gap-1 mr-2 sm:mr-4 shrink-0"
            >
                {crossApps.map(app => {
                    const isActive = app.slug === 'fast';
                    const PillIcon = app.icon;
                    if (isActive) {
                        // FAST pill becomes a tiered mega-menu trigger inside
                        // fast. Hover opens; click toggles. 200ms close
                        // timers on both tiers give the cursor time to
                        // traverse between the trigger, the Tier-1 panel,
                        // and the Tier-2 flyout without the menu folding
                        // up mid-traversal. The Tier-2 flyout is also
                        // closable explicitly (mouse-enter on a non-group
                        // Tier-1 row drops the flyout), so the menu never
                        // stays in a dual-open state with a stale flyout
                        // pointing at the wrong column.
                        const openFast = () => {
                            if (fastDropdownCloseTimer.current) {
                                clearTimeout(fastDropdownCloseTimer.current);
                                fastDropdownCloseTimer.current = null;
                            }
                            setFastDropdownOpen(true);
                        };
                        const scheduleFastClose = () => {
                            if (fastDropdownCloseTimer.current) clearTimeout(fastDropdownCloseTimer.current);
                            fastDropdownCloseTimer.current = setTimeout(() => {
                                setFastDropdownOpen(false);
                                setFastFlyoutKey(null);
                            }, 200);
                        };
                        const openFlyout = (key: string) => {
                            if (fastFlyoutCloseTimer.current) {
                                clearTimeout(fastFlyoutCloseTimer.current);
                                fastFlyoutCloseTimer.current = null;
                            }
                            setFastFlyoutKey(key);
                        };
                        const scheduleFlyoutClose = () => {
                            if (fastFlyoutCloseTimer.current) clearTimeout(fastFlyoutCloseTimer.current);
                            fastFlyoutCloseTimer.current = setTimeout(() => setFastFlyoutKey(null), 200);
                        };
                        // Compose the role-gated Tier-1 list once per
                        // render. Leader / Master / Admin all flip
                        // isLeader=true (see use-auth.tsx:153 — admin is
                        // a strict subset of leader for this check), so a
                        // single boolean covers the three privileged
                        // tiers from the brief.
                        const fastMenu: FastTier1Item[] = isLeader
                            ? [...FAST_MENU_BASE, ...FAST_MENU_LEADER_EXTRA]
                            : FAST_MENU_BASE;
                        return (
                            <div
                                key={app.slug}
                                className="relative"
                                onMouseEnter={openFast}
                                onMouseLeave={scheduleFastClose}
                            >
                                <button
                                    type="button"
                                    onClick={() => setFastDropdownOpen(v => !v)}
                                    aria-haspopup="menu"
                                    aria-expanded={fastDropdownOpen}
                                    aria-current="page"
                                    className={cn(
                                        'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold uppercase tracking-wide rounded-full transition-colors whitespace-nowrap',
                                        'bg-white text-[#0F0E7F] shadow-sm',
                                    )}
                                >
                                    {PillIcon && <PillIcon className="w-3.5 h-3.5" />}
                                    {app.label}
                                    <ChevronDown
                                        className={cn(
                                            'w-3.5 h-3.5 transition-transform',
                                            fastDropdownOpen && 'rotate-180',
                                        )}
                                    />
                                </button>
                                {fastDropdownOpen && (
                                    // Tier-1 panel. z-[999] keeps the menu
                                    // above every layout canvas surface
                                    // (modal portals at z-95 / z-100 stay
                                    // above only when explicitly opened on
                                    // top — see CreatePersonalCardModal).
                                    // Solid bg-white ensures the layered
                                    // structure can't bleed through any
                                    // semi-transparent ancestor.
                                    <div
                                        role="menu"
                                        onMouseEnter={openFast}
                                        onMouseLeave={scheduleFastClose}
                                        className="absolute top-full left-0 mt-1 min-w-[200px] bg-white border border-slate-200 rounded-xl shadow-xl z-[999] overflow-visible"
                                    >
                                        <div className="py-1">
                                            {fastMenu.map(item => {
                                                if (item.kind === 'link') {
                                                    const isItemActive = pathname === item.href
                                                        || pathname?.startsWith(item.href + '/');
                                                    return (
                                                        <Link
                                                            key={item.key}
                                                            href={item.href}
                                                            role="menuitem"
                                                            onMouseEnter={() => setFastFlyoutKey(null)}
                                                            onClick={() => {
                                                                setFastDropdownOpen(false);
                                                                setFastFlyoutKey(null);
                                                            }}
                                                            className={cn(
                                                                'block px-4 py-2 text-sm font-medium transition-colors',
                                                                isItemActive
                                                                    ? 'bg-indigo-50 text-indigo-700'
                                                                    : 'text-slate-700 hover:bg-slate-50',
                                                            )}
                                                        >
                                                            {item.label}
                                                        </Link>
                                                    );
                                                }
                                                // Group — Tier-1 row plus
                                                // a side flyout when this
                                                // group is the active one.
                                                const isFlyoutOpen = fastFlyoutKey === item.key;
                                                const isGroupActive = item.children.some(c =>
                                                    pathname === c.href || pathname?.startsWith(c.href + '/'),
                                                );
                                                return (
                                                    <div
                                                        key={item.key}
                                                        className="relative"
                                                        onMouseEnter={() => openFlyout(item.key)}
                                                        onMouseLeave={scheduleFlyoutClose}
                                                    >
                                                        <button
                                                            type="button"
                                                            aria-haspopup="menu"
                                                            aria-expanded={isFlyoutOpen}
                                                            className={cn(
                                                                'w-full flex items-center justify-between px-4 py-2 text-sm font-medium transition-colors',
                                                                isFlyoutOpen || isGroupActive
                                                                    ? 'bg-indigo-50 text-indigo-700'
                                                                    : 'text-slate-700 hover:bg-slate-50',
                                                            )}
                                                        >
                                                            <span>{item.label}</span>
                                                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                                        </button>
                                                        {isFlyoutOpen && (
                                                            // Tier-2 flyout. Sits to the right of
                                                            // the Tier-1 row; pl-1 gives a tiny
                                                            // pointer-events bridge so cursor
                                                            // travel from row → panel doesn't
                                                            // exit the menu region. z-[1000]
                                                            // sits just above the Tier-1 panel.
                                                            <div
                                                                role="menu"
                                                                onMouseEnter={() => openFlyout(item.key)}
                                                                onMouseLeave={scheduleFlyoutClose}
                                                                className="absolute left-full top-0 pl-1 z-[1000]"
                                                            >
                                                                <div className="bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[200px]">
                                                                    {item.children.map(c => {
                                                                        const isChildActive = pathname === c.href
                                                                            || pathname?.startsWith(c.href + '/');
                                                                        return (
                                                                            <Link
                                                                                key={c.href}
                                                                                href={c.href}
                                                                                role="menuitem"
                                                                                onClick={() => {
                                                                                    setFastDropdownOpen(false);
                                                                                    setFastFlyoutKey(null);
                                                                                }}
                                                                                className={cn(
                                                                                    'block px-4 py-2 text-sm font-medium transition-colors',
                                                                                    isChildActive
                                                                                        ? 'bg-indigo-50 text-indigo-700'
                                                                                        : 'text-slate-700 hover:bg-slate-50',
                                                                                )}
                                                                            >
                                                                                {c.label}
                                                                            </Link>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    }
                    // Non-FAST pills (HEROES, future apps) stay as plain
                    // cross-origin links — no dropdown here. Persistent
                    // `bg-white/5` keeps the pill silhouette readable at rest
                    // against the deep-indigo nav so it doesn't look like
                    // raw text next to the solid white FAST pill.
                    return (
                        <a
                            key={app.slug}
                            href={app.url}
                            className={cn(
                                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold uppercase tracking-wide rounded-full transition-colors whitespace-nowrap',
                                'text-white/80 bg-white/5 hover:text-white hover:bg-white/15',
                            )}
                        >
                            {PillIcon && <PillIcon className="w-3.5 h-3.5" />}
                            {app.label}
                        </a>
                    );
                })}
            </nav>

            {/* In-app module tabs (Request Form, User Control Panel) were
                folded out on 2026-05-20 — both destinations now live as
                children under the Settings entry in the avatar popover.
                A flex spacer keeps the right cluster pushed to the edge. */}
            <div className="flex-1 min-w-0" />

            {/* Right cluster — bell, theme toggle, and account popover. The
                suite ServiceBar that previously hosted theme + AccountWidget
                was folded into this bar in the header consolidation; both
                surfaces moved here so sign-out and dark mode stay reachable
                without the second header row. Profile Settings + Changelog
                still live in the Sidebar footer per the 2026-05-14 cleanup. */}
            <div className="flex items-center gap-1 pl-4 shrink-0">
                {/* Notifications */}
                <div className="relative" ref={notifRef}>
                    <button
                        onClick={() => setShowNotifs(!showNotifs)}
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

                {/* Theme toggle — single source of dark mode after the
                    SuiteServiceBar fold-in. Icon flips to the *target* mode
                    so users see what they're switching TO. */}
                <button
                    type="button"
                    onClick={toggleTheme}
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                    {theme === 'dark'
                        ? <Sun className="w-5 h-5" />
                        : <Moon className="w-5 h-5" />}
                </button>

                {/* Account — avatar + first name trigger, popover carries
                    name/email/role + Manage account + Sign out. Cross-app
                    switcher lives in the pills row instead, so the popover
                    here intentionally omits it. */}
                {user && (
                    <div className="relative" ref={accountRef}>
                        <button
                            type="button"
                            onClick={() => setShowAccount(v => !v)}
                            aria-label="Account menu"
                            aria-haspopup="menu"
                            aria-expanded={showAccount}
                            className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 ml-1 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            {profile?.avatar_url ? (
                                <img
                                    src={profile.avatar_url}
                                    alt=""
                                    className="w-7 h-7 rounded-full object-cover ring-1 ring-white/30"
                                />
                            ) : (
                                <div className="w-7 h-7 rounded-full bg-white/15 ring-1 ring-white/30 flex items-center justify-center text-[11px] font-bold">
                                    {user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                                </div>
                            )}
                            <span className="hidden sm:inline text-sm font-semibold whitespace-nowrap">
                                {user.name.split(' ')[0]}
                            </span>
                        </button>

                        {showAccount && (
                            <div
                                role="menu"
                                className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50"
                            >
                                <div className="px-4 py-3 border-b border-slate-100">
                                    <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
                                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                                    <span className="mt-1.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                        {user.portalRole || user.role}
                                    </span>
                                </div>
                                <div className="p-1">
                                    <a
                                        href={`${PORTAL_ORIGIN}/profile`}
                                        onClick={() => setShowAccount(false)}
                                        role="menuitem"
                                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                                    >
                                        Manage account
                                    </a>
                                    {/* Settings parent — click toggles an inline
                                        expander revealing the three destinations
                                        folded in from the in-app module tabs row:
                                        Profile Settings, Request Form, and (for
                                        leaders) User Control Panel. */}
                                    <button
                                        type="button"
                                        onClick={() => setSettingsExpanded(v => !v)}
                                        aria-expanded={settingsExpanded}
                                        role="menuitem"
                                        className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                                    >
                                        <Settings className="w-4 h-4 text-slate-500" />
                                        <span className="flex-1 text-left">Settings</span>
                                        <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', settingsExpanded && 'rotate-180')} />
                                    </button>
                                    {settingsExpanded && (
                                        <div className="ml-2 pl-3 border-l border-slate-100 space-y-0.5">
                                            <Link
                                                href="/profile"
                                                onClick={() => { setShowAccount(false); setSettingsExpanded(false); }}
                                                role="menuitem"
                                                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                                            >
                                                Profile Settings
                                            </Link>
                                            <Link
                                                href="/request"
                                                onClick={() => { setShowAccount(false); setSettingsExpanded(false); }}
                                                role="menuitem"
                                                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                                            >
                                                <FileText className="w-3.5 h-3.5 text-slate-400" />
                                                Request Form
                                            </Link>
                                            {isLeader && (
                                                <Link
                                                    href="/users"
                                                    onClick={() => { setShowAccount(false); setSettingsExpanded(false); }}
                                                    role="menuitem"
                                                    className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                                                >
                                                    <Users className="w-3.5 h-3.5 text-slate-400" />
                                                    User Control Panel
                                                </Link>
                                            )}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => { setShowAccount(false); signOut(); }}
                                        role="menuitem"
                                        className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                                    >
                                        <LogOut className="w-4 h-4 text-slate-500" />
                                        Sign out
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
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

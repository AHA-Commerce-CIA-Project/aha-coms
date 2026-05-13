'use client';

// Slack-style left-pane index for the unified /messages workspace.
// Renders two collapsible sections — Channels (with optional purpose split)
// and Direct Messages — populated by the parent page. Click handlers are
// callbacks; this component is purely presentational + collapse state.

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Hash, Lock, ChevronDown, ChevronRight, Plus, Search, MoreHorizontal, Check, ListFilter, ArrowDownAZ, Clock, MailCheck, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PresenceDot } from '@/components/PresenceDot';

export interface IndexChannel {
    id: string;
    name: string;
    isPrivate?: boolean;
    purpose?: 'discussion' | 'assign_task';
    unreadCount?: number;
    lastMessageAt?: string | null;
    /** User-specific pin (PinnedChannel row exists for this user+channel).
     *  Pinned channels float to the top in a dedicated section and are
     *  removed from the regular Channels / Assign Task groups below so a
     *  channel never appears twice. */
    isPinned?: boolean;
}

export interface IndexDm {
    id: string;
    otherUserId: string | null;
    otherName: string;
    otherImage: string | null;
    otherLastSeenAt?: string | null;
    unreadCount?: number;
    lastMessageAt?: string | null;
    snippet?: string;
}

type SectionKey = 'pinned' | 'channels' | 'assign_task' | 'dms';
type FilterMode = 'all' | 'unread';
type SortMode = 'recency' | 'alpha';

interface SectionPrefs {
    filter: FilterMode;
    sort: SortMode;
}
type AllPrefs = Record<SectionKey, SectionPrefs>;

const COLLAPSE_KEY = 'messages-index-collapsed';
const PREFS_KEY = 'messages-index-prefs-v1';
const DEFAULT_PREFS: AllPrefs = {
    pinned: { filter: 'all', sort: 'recency' },
    channels: { filter: 'all', sort: 'recency' },
    assign_task: { filter: 'all', sort: 'recency' },
    dms: { filter: 'all', sort: 'recency' },
};

function loadCollapsed(): Set<SectionKey> {
    if (typeof window === 'undefined') return new Set();
    try {
        const raw = window.localStorage.getItem(COLLAPSE_KEY);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr : []);
    } catch {
        return new Set();
    }
}

function saveCollapsed(s: Set<SectionKey>) {
    try {
        window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(Array.from(s)));
    } catch {}
}

function loadPrefs(): AllPrefs {
    if (typeof window === 'undefined') return DEFAULT_PREFS;
    try {
        const raw = window.localStorage.getItem(PREFS_KEY);
        if (!raw) return DEFAULT_PREFS;
        const parsed = JSON.parse(raw);
        // Shallow-merge so a partial saved value doesn't lose default fields.
        return {
            pinned: { ...DEFAULT_PREFS.pinned, ...(parsed?.pinned || {}) },
            channels: { ...DEFAULT_PREFS.channels, ...(parsed?.channels || {}) },
            assign_task: { ...DEFAULT_PREFS.assign_task, ...(parsed?.assign_task || {}) },
            dms: { ...DEFAULT_PREFS.dms, ...(parsed?.dms || {}) },
        };
    } catch {
        return DEFAULT_PREFS;
    }
}

function savePrefs(p: AllPrefs) {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch {}
}

// Rank that sinks null timestamps to the bottom for recency sort.
function tsRank(s: string | null | undefined): number {
    return s ? new Date(s).getTime() : -Infinity;
}

function applyChannelPrefs<T extends { name: string; unreadCount?: number; lastMessageAt?: string | null }>(
    items: T[],
    prefs: SectionPrefs,
): T[] {
    let out = items;
    if (prefs.filter === 'unread') out = out.filter((c) => (c.unreadCount ?? 0) > 0);
    out = [...out].sort((a, b) => {
        if (prefs.sort === 'alpha') return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        return tsRank(b.lastMessageAt) - tsRank(a.lastMessageAt);
    });
    return out;
}

function applyDmPrefs(items: IndexDm[], prefs: SectionPrefs): IndexDm[] {
    let out = items;
    if (prefs.filter === 'unread') out = out.filter((d) => (d.unreadCount ?? 0) > 0);
    out = [...out].sort((a, b) => {
        if (prefs.sort === 'alpha') return a.otherName.localeCompare(b.otherName, undefined, { sensitivity: 'base' });
        return tsRank(b.lastMessageAt) - tsRank(a.lastMessageAt);
    });
    return out;
}

interface MessagesIndexProps {
    channels: IndexChannel[];
    dms: IndexDm[];
    activeChannelId: string | null;
    activeDmId: string | null;
    loading: boolean;
    onSelectChannel: (channel: IndexChannel) => void;
    onSelectDm: (dm: IndexDm) => void;
    onCreateChannel: () => void;
    onNewDm: () => void;
    canCreateChannel: boolean;
}

export function MessagesIndex({
    channels,
    dms,
    activeChannelId,
    activeDmId,
    loading,
    onSelectChannel,
    onSelectDm,
    onCreateChannel,
    onNewDm,
    canCreateChannel,
}: MessagesIndexProps) {
    const [collapsed, setCollapsed] = useState<Set<SectionKey>>(new Set());
    const [search, setSearch] = useState('');
    const [prefs, setPrefs] = useState<AllPrefs>(DEFAULT_PREFS);
    const [marking, setMarking] = useState<SectionKey | null>(null);

    useEffect(() => { setCollapsed(loadCollapsed()); }, []);
    useEffect(() => { setPrefs(loadPrefs()); }, []);

    const toggle = (k: SectionKey) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k); else next.add(k);
            saveCollapsed(next);
            return next;
        });
    };

    const updatePrefs = (k: SectionKey, patch: Partial<SectionPrefs>) => {
        setPrefs((prev) => {
            const next: AllPrefs = { ...prev, [k]: { ...prev[k], ...patch } };
            savePrefs(next);
            return next;
        });
    };

    // Best-effort "Mark all as read" — fan out per-item read endpoints since
    // we don't have a bulk endpoint. Network errors are swallowed; the worst
    // case is some items keep their unread count until the next SSE/poll tick.
    const markSectionRead = async (k: SectionKey) => {
        if (marking) return;
        setMarking(k);
        try {
            if (k === 'dms') {
                const targets = dms.filter((d) => (d.unreadCount ?? 0) > 0);
                await Promise.all(targets.map((d) =>
                    fetch(`/api/chat/conversations/${d.id}/read`, { method: 'PUT' }).catch(() => {})
                ));
            } else {
                const purpose = k === 'assign_task' ? 'assign_task' : 'discussion';
                const targets = channels.filter((c) => (c.unreadCount ?? 0) > 0 && (c.purpose || 'discussion') === purpose);
                await Promise.all(targets.map((c) =>
                    fetch(`/api/channels/${c.id}/read`, { method: 'PUT' }).catch(() => {})
                ));
            }
        } finally {
            setMarking(null);
        }
    };

    const q = search.trim().toLowerCase();
    const filteredChannels = q ? channels.filter(c => c.name.toLowerCase().includes(q)) : channels;
    const filteredDms = q ? dms.filter(d => d.otherName.toLowerCase().includes(q)) : dms;

    // Pinned channels float to the top in their own section. They're filtered
    // OUT of the discussion / assign-task groups below so a channel never
    // appears twice — only its row in Pinned remains. Pinned is always sorted
    // by recency (most-recently-active first) regardless of section prefs.
    const pinnedChannels = applyChannelPrefs(
        filteredChannels.filter(c => c.isPinned),
        prefs.pinned,
    );

    // Two un-pinned channel groups: regular (discussion) + assign_task. The
    // split keeps task channels visually distinct without forcing a hard tab
    // switch like the old standalone /channels page did. Section prefs
    // (filter/sort) are applied per group so a user can sort Channels A-Z
    // while keeping Assign Task sorted by recency.
    const discussionChannels = applyChannelPrefs(
        filteredChannels.filter(c => !c.isPinned && c.purpose !== 'assign_task'),
        prefs.channels,
    );
    const assignTaskChannels = applyChannelPrefs(
        filteredChannels.filter(c => !c.isPinned && c.purpose === 'assign_task'),
        prefs.assign_task,
    );
    const sortedDms = applyDmPrefs(filteredDms, prefs.dms);

    return (
        <div className="flex flex-col h-full bg-white border-r border-slate-200">
            {/* Search header — the workspace title is now the [Messages] [Later]
                pill toggle in the parent, so we don't duplicate it here. */}
            <div className="px-4 pt-3 pb-3 border-b border-slate-100">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search channels & people"
                        className="w-full pl-8 pr-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
                {pinnedChannels.length > 0 && (
                    <SectionGroup
                        label="Pinned"
                        sectionKey="pinned"
                        collapsed={collapsed.has('pinned')}
                        onToggle={toggle}
                        count={pinnedChannels.reduce((s, c) => s + (c.unreadCount || 0), 0)}
                    >
                        {pinnedChannels.map((c) => (
                            <ChannelItem
                                key={c.id}
                                channel={c}
                                active={c.id === activeChannelId}
                                onClick={() => onSelectChannel(c)}
                            />
                        ))}
                    </SectionGroup>
                )}

                <SectionGroup
                    label="Channels"
                    sectionKey="channels"
                    collapsed={collapsed.has('channels')}
                    onToggle={toggle}
                    onAdd={canCreateChannel ? onCreateChannel : undefined}
                    addTitle="Create channel"
                    count={discussionChannels.reduce((s, c) => s + (c.unreadCount || 0), 0)}
                    prefs={prefs.channels}
                    onPrefsChange={(patch) => updatePrefs('channels', patch)}
                    onMarkAllRead={() => markSectionRead('channels')}
                    marking={marking === 'channels'}
                >
                    {loading ? (
                        <ChannelSkeleton />
                    ) : discussionChannels.length === 0 ? (
                        <EmptyHint text={q ? 'No matches' : prefs.channels.filter === 'unread' ? 'No unread channels' : 'No channels yet'} />
                    ) : (
                        discussionChannels.map((c) => (
                            <ChannelItem
                                key={c.id}
                                channel={c}
                                active={c.id === activeChannelId}
                                onClick={() => onSelectChannel(c)}
                            />
                        ))
                    )}
                </SectionGroup>

                {(assignTaskChannels.length > 0 || loading || prefs.assign_task.filter === 'unread') && (
                    <SectionGroup
                        label="Assign Task"
                        sectionKey="assign_task"
                        collapsed={collapsed.has('assign_task')}
                        onToggle={toggle}
                        count={assignTaskChannels.reduce((s, c) => s + (c.unreadCount || 0), 0)}
                        prefs={prefs.assign_task}
                        onPrefsChange={(patch) => updatePrefs('assign_task', patch)}
                        onMarkAllRead={() => markSectionRead('assign_task')}
                        marking={marking === 'assign_task'}
                    >
                        {assignTaskChannels.length === 0 && !loading ? (
                            <EmptyHint text={prefs.assign_task.filter === 'unread' ? 'No unread task channels' : 'No task channels'} />
                        ) : (
                            assignTaskChannels.map((c) => (
                                <ChannelItem
                                    key={c.id}
                                    channel={c}
                                    active={c.id === activeChannelId}
                                    onClick={() => onSelectChannel(c)}
                                />
                            ))
                        )}
                    </SectionGroup>
                )}

                <SectionGroup
                    label="Direct messages"
                    sectionKey="dms"
                    collapsed={collapsed.has('dms')}
                    onToggle={toggle}
                    onAdd={onNewDm}
                    addTitle="New direct message"
                    count={sortedDms.reduce((s, d) => s + (d.unreadCount || 0), 0)}
                    prefs={prefs.dms}
                    onPrefsChange={(patch) => updatePrefs('dms', patch)}
                    onMarkAllRead={() => markSectionRead('dms')}
                    marking={marking === 'dms'}
                >
                    {loading ? (
                        <DmSkeleton />
                    ) : sortedDms.length === 0 ? (
                        <EmptyHint text={q ? 'No matches' : prefs.dms.filter === 'unread' ? 'No unread DMs' : 'No direct messages yet'} />
                    ) : (
                        sortedDms.map((d) => (
                            <DmItem
                                key={d.id}
                                dm={d}
                                active={d.id === activeDmId}
                                onClick={() => onSelectDm(d)}
                            />
                        ))
                    )}
                </SectionGroup>

            </div>
        </div>
    );
}

interface SectionGroupProps {
    label: string;
    sectionKey: SectionKey;
    collapsed: boolean;
    onToggle: (k: SectionKey) => void;
    onAdd?: () => void;
    addTitle?: string;
    count?: number;
    prefs?: SectionPrefs;
    onPrefsChange?: (patch: Partial<SectionPrefs>) => void;
    onMarkAllRead?: () => void;
    marking?: boolean;
    children: React.ReactNode;
}

function SectionGroup({ label, sectionKey, collapsed, onToggle, onAdd, addTitle, count, prefs, onPrefsChange, onMarkAllRead, marking, children }: SectionGroupProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

    return (
        <div className="mb-2">
            <div className="flex items-center group px-3 py-1">
                <button
                    type="button"
                    onClick={() => onToggle(sectionKey)}
                    className="flex items-center gap-1 flex-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 transition-colors"
                >
                    {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    <span>{label}</span>
                    {/* Section badge surfaces the rolled-up unread count only when the
                        section is collapsed. When expanded, the per-row badges below
                        carry the same information without duplication. */}
                    {collapsed && count && count > 0 ? (
                        <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold text-white bg-rose-500 rounded-full">
                            {count > 99 ? '99+' : count}
                        </span>
                    ) : null}
                </button>
                <div className="flex items-center gap-0.5">
                    {prefs && onPrefsChange && (
                        <button
                            ref={menuTriggerRef}
                            type="button"
                            onClick={() => setMenuOpen((v) => !v)}
                            // Stay visible when menu is open so the trigger doesn't disappear under the cursor.
                            className={cn(
                                'p-0.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all',
                                menuOpen ? 'opacity-100 bg-slate-100 text-indigo-600' : 'opacity-0 group-hover:opacity-100',
                            )}
                            title={`${label} settings`}
                            aria-label={`${label} settings`}
                            aria-expanded={menuOpen}
                        >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onAdd && (
                        <button
                            type="button"
                            onClick={onAdd}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-all"
                            title={addTitle}
                        >
                            <Plus className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>
            {!collapsed && <div className="space-y-0.5">{children}</div>}

            {prefs && onPrefsChange && (
                <SectionMenu
                    open={menuOpen}
                    anchorRef={menuTriggerRef}
                    onClose={() => setMenuOpen(false)}
                    prefs={prefs}
                    onChange={onPrefsChange}
                    onMarkAllRead={onMarkAllRead}
                    marking={!!marking}
                />
            )}
        </div>
    );
}

interface SectionMenuProps {
    open: boolean;
    anchorRef: React.RefObject<HTMLElement>;
    onClose: () => void;
    prefs: SectionPrefs;
    onChange: (patch: Partial<SectionPrefs>) => void;
    onMarkAllRead?: () => void;
    marking: boolean;
}

function SectionMenu({ open, anchorRef, onClose, prefs, onChange, onMarkAllRead, marking }: SectionMenuProps) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    // Position the menu just below the trigger, right-aligned to it. Portalled
    // to body so the parent's `overflow-y-auto` doesn't clip the popover.
    useLayoutEffect(() => {
        if (!open) { setCoords(null); return; }
        const compute = () => {
            const a = anchorRef.current;
            if (!a) return;
            const r = a.getBoundingClientRect();
            const W = 220;
            const H = 220;
            const M = 8;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let top = r.bottom + 4;
            if (top + H > vh - M) top = Math.max(M, r.top - H - 4);
            let left = r.right - W;
            if (left < M) left = M;
            if (left + W > vw - M) left = vw - W - M;
            setCoords({ top, left });
        };
        compute();
        window.addEventListener('resize', compute);
        return () => window.removeEventListener('resize', compute);
    }, [open, anchorRef]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (ref.current?.contains(target)) return;
            if (anchorRef.current?.contains(target)) return;
            onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open, onClose, anchorRef]);

    if (!open || !mounted) return null;

    const ui = (
        <div
            ref={ref}
            style={coords
                ? { top: coords.top, left: coords.left, visibility: 'visible' }
                : { visibility: 'hidden' }}
            className="fixed w-[220px] bg-white border border-slate-200 rounded-xl shadow-lg z-[125] overflow-hidden"
            onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
        >
            <MenuGroup label="Filter">
                <MenuOption
                    icon={<ListFilter className="w-3.5 h-3.5" />}
                    label="All"
                    selected={prefs.filter === 'all'}
                    onClick={() => onChange({ filter: 'all' })}
                />
                <MenuOption
                    icon={<ListFilter className="w-3.5 h-3.5" />}
                    label="Unreads"
                    selected={prefs.filter === 'unread'}
                    onClick={() => onChange({ filter: 'unread' })}
                />
            </MenuGroup>
            <div className="border-t border-slate-100" />
            <MenuGroup label="Sort">
                <MenuOption
                    icon={<Clock className="w-3.5 h-3.5" />}
                    label="Recency"
                    selected={prefs.sort === 'recency'}
                    onClick={() => onChange({ sort: 'recency' })}
                />
                <MenuOption
                    icon={<ArrowDownAZ className="w-3.5 h-3.5" />}
                    label="A–Z"
                    selected={prefs.sort === 'alpha'}
                    onClick={() => onChange({ sort: 'alpha' })}
                />
            </MenuGroup>
            {onMarkAllRead && (
                <>
                    <div className="border-t border-slate-100" />
                    <button
                        type="button"
                        onClick={() => { onMarkAllRead(); onClose(); }}
                        disabled={marking}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                        <MailCheck className="w-3.5 h-3.5 text-slate-400" />
                        {marking ? 'Marking…' : 'Mark all as read'}
                    </button>
                </>
            )}
        </div>
    );

    return createPortal(ui, document.body);
}

function MenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="py-1">
            <p className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
            {children}
        </div>
    );
}

function MenuOption({ icon, label, selected, onClick }: { icon: React.ReactNode; label: string; selected: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors',
                selected ? 'text-indigo-600 font-semibold' : 'text-slate-700',
            )}
        >
            <span className="text-slate-400 group-hover:text-slate-500">{icon}</span>
            <span className="flex-1 text-left">{label}</span>
            {selected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
        </button>
    );
}

function ChannelItem({ channel, active, onClick }: { channel: IndexChannel; active: boolean; onClick: () => void }) {
    const hasUnread = (channel.unreadCount ?? 0) > 0;
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex items-center gap-2 w-full px-4 py-1.5 text-sm transition-colors',
                active
                    ? 'bg-indigo-600 text-white font-semibold'
                    : hasUnread
                        ? 'text-slate-900 font-bold hover:bg-slate-100'
                        : 'text-slate-700 hover:bg-slate-100'
            )}
        >
            {channel.isPrivate ? (
                <Lock className={cn(
                    'w-3.5 h-3.5 flex-shrink-0',
                    active ? 'text-white' : hasUnread ? 'text-slate-700' : 'text-slate-400',
                )} />
            ) : (
                <Hash className={cn(
                    'w-3.5 h-3.5 flex-shrink-0',
                    active ? 'text-white' : hasUnread ? 'text-slate-700' : 'text-slate-400',
                )} />
            )}
            <span className="flex-1 truncate text-left">{channel.name}</span>
            {channel.isPinned && (
                // Small indigo pin next to pinned rows. Keeps the visual cue
                // even when a pinned channel is collapsed under "Pinned" or
                // the user has scrolled past the section label.
                <Pin className={cn(
                    'w-3 h-3 flex-shrink-0',
                    active ? 'text-white/80' : 'text-indigo-500',
                )} />
            )}
            {hasUnread && !active && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold text-white bg-rose-500 rounded-full">
                    {(channel.unreadCount ?? 0) > 99 ? '99+' : channel.unreadCount}
                </span>
            )}
        </button>
    );
}

function DmItem({ dm, active, onClick }: { dm: IndexDm; active: boolean; onClick: () => void }) {
    const hasUnread = (dm.unreadCount ?? 0) > 0;
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex items-center gap-2 w-full px-4 py-1.5 text-sm transition-colors',
                active
                    ? 'bg-indigo-600 text-white font-semibold'
                    : hasUnread
                        ? 'text-slate-900 font-bold hover:bg-slate-100'
                        : 'text-slate-700 hover:bg-slate-100'
            )}
        >
            <div className="relative flex-shrink-0">
                {dm.otherImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={dm.otherImage} alt={dm.otherName} className="w-5 h-5 rounded-full object-cover" />
                ) : (
                    <div className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                        active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                    )}>
                        {dm.otherName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                )}
                <PresenceDot lastSeenAt={dm.otherLastSeenAt || null} size="sm" />
            </div>
            <span className="flex-1 truncate text-left">{dm.otherName}</span>
            {hasUnread && !active && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold text-white bg-rose-500 rounded-full">
                    {(dm.unreadCount ?? 0) > 99 ? '99+' : dm.unreadCount}
                </span>
            )}
        </button>
    );
}

function EmptyHint({ text }: { text: string }) {
    return <div className="px-4 py-2 text-xs text-slate-400 italic">{text}</div>;
}

function ChannelSkeleton() {
    return (
        <div className="space-y-1 px-4 py-1">
            {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 rounded bg-slate-100" />
                    <div className="flex-1 h-3 bg-slate-100 rounded" />
                </div>
            ))}
        </div>
    );
}

function DmSkeleton() {
    return (
        <div className="space-y-1 px-4 py-1">
            {[0, 1].map(i => (
                <div key={i} className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-slate-100" />
                    <div className="flex-1 h-3 bg-slate-100 rounded" />
                </div>
            ))}
        </div>
    );
}

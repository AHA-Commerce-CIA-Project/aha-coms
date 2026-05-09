'use client';

// Slack-style left-pane index for the unified /messages workspace.
// Renders two collapsible sections — Channels (with optional purpose split)
// and Direct Messages — populated by the parent page. Click handlers are
// callbacks; this component is purely presentational + collapse state.

import { useState, useEffect } from 'react';
import { Hash, Lock, ChevronDown, ChevronRight, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PresenceDot } from '@/components/PresenceDot';

export interface IndexChannel {
    id: string;
    name: string;
    isPrivate?: boolean;
    purpose?: 'discussion' | 'assign_task';
    unreadCount?: number;
}

export interface IndexDm {
    id: string;
    otherUserId: string | null;
    otherName: string;
    otherImage: string | null;
    otherLastSeenAt?: string | null;
    unreadCount?: number;
    snippet?: string;
}

type SectionKey = 'channels' | 'assign_task' | 'dms';

const COLLAPSE_KEY = 'messages-index-collapsed';

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

    useEffect(() => { setCollapsed(loadCollapsed()); }, []);

    const toggle = (k: SectionKey) => {
        setCollapsed(prev => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k); else next.add(k);
            saveCollapsed(next);
            return next;
        });
    };

    const q = search.trim().toLowerCase();
    const filteredChannels = q ? channels.filter(c => c.name.toLowerCase().includes(q)) : channels;
    const filteredDms = q ? dms.filter(d => d.otherName.toLowerCase().includes(q)) : dms;

    // Two channel groups: regular (discussion) + assign_task. The split keeps
    // task channels visually distinct without forcing a hard tab switch like
    // the old standalone /channels page did.
    const discussionChannels = filteredChannels.filter(c => c.purpose !== 'assign_task');
    const assignTaskChannels = filteredChannels.filter(c => c.purpose === 'assign_task');

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
                <SectionGroup
                    label="Channels"
                    sectionKey="channels"
                    collapsed={collapsed.has('channels')}
                    onToggle={toggle}
                    onAdd={canCreateChannel ? onCreateChannel : undefined}
                    addTitle="Create channel"
                    count={discussionChannels.reduce((s, c) => s + (c.unreadCount || 0), 0)}
                >
                    {loading ? (
                        <ChannelSkeleton />
                    ) : discussionChannels.length === 0 ? (
                        <EmptyHint text={q ? 'No matches' : 'No channels yet'} />
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

                {(assignTaskChannels.length > 0 || loading) && (
                    <SectionGroup
                        label="Assign Task"
                        sectionKey="assign_task"
                        collapsed={collapsed.has('assign_task')}
                        onToggle={toggle}
                        count={assignTaskChannels.reduce((s, c) => s + (c.unreadCount || 0), 0)}
                    >
                        {assignTaskChannels.length === 0 && !loading ? (
                            <EmptyHint text="No task channels" />
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
                    count={filteredDms.reduce((s, d) => s + (d.unreadCount || 0), 0)}
                >
                    {loading ? (
                        <DmSkeleton />
                    ) : filteredDms.length === 0 ? (
                        <EmptyHint text={q ? 'No matches' : 'No direct messages yet'} />
                    ) : (
                        filteredDms.map((d) => (
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
    children: React.ReactNode;
}

function SectionGroup({ label, sectionKey, collapsed, onToggle, onAdd, addTitle, count, children }: SectionGroupProps) {
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
                    {count && count > 0 ? (
                        <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold text-white bg-rose-500 rounded-full">
                            {count > 99 ? '99+' : count}
                        </span>
                    ) : null}
                </button>
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
            {!collapsed && <div className="space-y-0.5">{children}</div>}
        </div>
    );
}

function ChannelItem({ channel, active, onClick }: { channel: IndexChannel; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex items-center gap-2 w-full px-4 py-1.5 text-sm transition-colors',
                active
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-700 hover:bg-slate-100'
            )}
        >
            {channel.isPrivate ? (
                <Lock className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-white' : 'text-slate-400')} />
            ) : (
                <Hash className={cn('w-3.5 h-3.5 flex-shrink-0', active ? 'text-white' : 'text-slate-400')} />
            )}
            <span className="flex-1 truncate text-left">{channel.name}</span>
            {(channel.unreadCount ?? 0) > 0 && !active && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-bold text-white bg-rose-500 rounded-full">
                    {(channel.unreadCount ?? 0) > 99 ? '99+' : channel.unreadCount}
                </span>
            )}
        </button>
    );
}

function DmItem({ dm, active, onClick }: { dm: IndexDm; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex items-center gap-2 w-full px-4 py-1.5 text-sm transition-colors',
                active ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-700 hover:bg-slate-100'
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
            {(dm.unreadCount ?? 0) > 0 && !active && (
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

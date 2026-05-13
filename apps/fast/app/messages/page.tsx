'use client';

// Unified Messages workspace — replaces the old standalone /channels and
// /messages pages. Layout is Slack-inspired:
//   left  → MessagesIndex (collapsible Channels + Direct messages list)
//   right → ChannelPane when ?channel=<id>, DmPane when ?conv=<id> or ?with=<userId>,
//           empty hint otherwise
//
// Both inner panes are extracted from the legacy pages so all their existing
// logic (SSE feed, typing indicators, reply threads, drafts, deep-links) keeps
// working unchanged. This page just wires the index + URL routing on top.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Hash, MessageCircle, ChevronLeft, Bookmark, MessageSquare, ListTodo } from 'lucide-react';
import { useAuth } from '@/lib/auth/use-auth';
import { MessagesIndex, IndexChannel, IndexDm } from '@/components/messaging/MessagesIndex';
import { LaterIndex } from '@/components/messaging/LaterIndex';
import { ChannelPane } from '@/components/messaging/ChannelPane';
import { DmPane } from '@/components/messaging/DmPane';
import { LaterPane } from '@/components/messaging/LaterPane';
import { CreateChannelModal } from '@/components/channels/CreateChannelModal';
import { ChannelHeader } from '@/components/channels/ChannelHeader';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

interface ChannelRow {
    id: string;
    name: string;
    isPrivate?: boolean;
    purpose?: 'discussion' | 'assign_task';
    updatedAt?: string;
    isPinned?: boolean;
}

interface ConvoRow {
    id: string;
    otherUser: { id: string; name: string; image: string | null; lastSeenAt?: string | null } | null;
    unreadCount?: number;
    updatedAt: string;
}

export default function MessagesPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>}>
            <MessagesWorkspace />
        </Suspense>
    );
}

function MessagesWorkspace() {
    const router = useRouter();
    const params = useSearchParams();
    const { user, isLeader } = useAuth();
    // Inline channel header — ChannelPane publishes this when a channel is
    // selected so we can render its name/description/search/kebab next to the
    // Messages | Later tabs instead of consuming a second vertical row.
    const chatHeader = useAppStore((s) => s.chatHeader);
    // Channel-pin tick: ChannelPane bumps this after a user toggles a pin so
    // the sidebar list refetches and the Pinned section reflects the change
    // without waiting on the 60s safety interval.
    const channelPinTick = useAppStore((s) => s.channelPinTick);

    const channelId = params.get('channel');
    const convId = params.get('conv');
    const withUserId = params.get('with');
    const newDm = params.get('new') === '1';
    // ?later=messages|tasks renders the Later experience inline. (Posted cards
    // moved out to the dedicated /my-request page.)
    const laterTabParam = params.get('later');
    const laterTab = (laterTabParam === 'tasks' || laterTabParam === 'messages')
        ? laterTabParam
        : null;
    const isChannelMode = !!channelId;
    const isDmMode = !!convId || !!withUserId || newDm;
    const isLaterMode = !!laterTab;

    const [channels, setChannels] = useState<ChannelRow[]>([]);
    const [perChannelUnread, setPerChannelUnread] = useState<Record<string, number>>({});
    const [convos, setConvos] = useState<ConvoRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateChannel, setShowCreateChannel] = useState(false);
    // LaterPane reports its saved-item counts so the lifted tab row in the
    // right-column header can render badges without re-fetching the lists.
    const [laterCounts, setLaterCounts] = useState<{ messages: number; tasks: number }>({ messages: 0, tasks: 0 });
    // Track which DM is active when ?with=<userId> is set — convos[].id from
    // the matching otherUser, so MessagesIndex can highlight the correct row.
    const activeDmId = useMemo(() => {
        if (convId) return convId;
        if (withUserId) {
            const match = convos.find((c) => c.otherUser?.id === withUserId);
            return match?.id || null;
        }
        return null;
    }, [convId, withUserId, convos]);

    // Fetch both purposes (discussion + assign_task) so the index shows
    // everything the user has access to. The previous /channels page split
    // these into a tab toggle; the unified workspace shows both groups.
    const fetchChannels = useCallback(async () => {
        try {
            const [d, a] = await Promise.all([
                fetch('/api/channels?purpose=discussion').then((r) => (r.ok ? r.json() : [])),
                fetch('/api/channels?purpose=assign_task').then((r) => (r.ok ? r.json() : [])),
            ]);
            const tagged = [
                ...d.map((c: ChannelRow) => ({ ...c, purpose: 'discussion' as const })),
                ...a.map((c: ChannelRow) => ({ ...c, purpose: 'assign_task' as const })),
            ];
            setChannels(tagged);
        } catch {}
    }, []);

    const fetchConvos = useCallback(async () => {
        try {
            const res = await fetch('/api/chat/conversations');
            if (res.ok) setConvos(await res.json());
        } catch {}
    }, []);

    const fetchUnread = useCallback(async () => {
        try {
            const res = await fetch('/api/channels/unread');
            if (res.ok) {
                const data = await res.json();
                setPerChannelUnread(data.perChannel || {});
            }
        } catch {}
    }, []);

    useEffect(() => {
        if (!user) return;
        Promise.all([fetchChannels(), fetchConvos(), fetchUnread()]).finally(() => setLoading(false));
        // Real-time updates via SSE — far less network chatter than the old
        // 15s polling loop. /api/channels/stream emits an 'unread' event
        // whenever a new channel message lands; we use it as a signal to
        // refetch the per-channel unread map so the index badges stay live.
        // /api/chat/stream does the same for DMs — we refetch the convo list
        // (which carries unreadCount per row) on every message tick.
        const channelSse = new EventSource('/api/channels/stream');
        channelSse.addEventListener('unread', () => {
            fetchUnread();
        });
        const dmSse = new EventSource('/api/chat/stream');
        dmSse.addEventListener('messages', () => {
            fetchConvos();
        });
        // Lightweight 60s safety net catches anything the SSE missed (network
        // hiccup, tab backgrounded, etc.) — not the primary refresh path.
        const safety = setInterval(() => {
            fetchChannels();
            fetchConvos();
            fetchUnread();
        }, 60000);
        return () => {
            channelSse.close();
            dmSse.close();
            clearInterval(safety);
        };
    }, [user, fetchChannels, fetchConvos, fetchUnread]);

    // Refetch channels whenever a pin toggle bumps the tick. Skip the first
    // render (tick === 0) so we don't double-fetch alongside the mount-time
    // load above.
    useEffect(() => {
        if (channelPinTick === 0) return;
        fetchChannels();
    }, [channelPinTick, fetchChannels]);

    // Build the index lists from the fetched data. Channel unread badges come
    // from /api/channels/unread; DM unread is on the convo row directly.
    const indexChannels: IndexChannel[] = useMemo(
        () => channels.map((c) => ({
            id: c.id,
            name: c.name,
            isPrivate: c.isPrivate,
            purpose: c.purpose,
            unreadCount: perChannelUnread[c.id] || 0,
            // Channel.updatedAt is bumped on every new message (see
            // /api/channels/[channelId]/messages/route.ts), so it's a faithful
            // proxy for "last activity" without a join.
            lastMessageAt: c.updatedAt || null,
            isPinned: c.isPinned ?? false,
        })),
        [channels, perChannelUnread],
    );
    const indexDms: IndexDm[] = useMemo(
        () => convos
            .filter((c) => c.otherUser)
            .map((c) => ({
                id: c.id,
                otherUserId: c.otherUser?.id || null,
                otherName: c.otherUser?.name || 'Unknown',
                otherImage: c.otherUser?.image || null,
                otherLastSeenAt: c.otherUser?.lastSeenAt || null,
                unreadCount: c.unreadCount || 0,
                lastMessageAt: c.updatedAt || null,
            })),
        [convos],
    );

    const goChannel = useCallback((c: IndexChannel) => {
        router.push(`/messages?channel=${encodeURIComponent(c.id)}`);
    }, [router]);

    const goDm = useCallback((d: IndexDm) => {
        // DmPane already handles ?with=<userId>: it finds the existing convo
        // (or starts a new one) and selects it. ?conv= isn't currently wired
        // into DmPane, so use ?with= which is the well-tested path.
        if (d.otherUserId) {
            router.push(`/messages?with=${encodeURIComponent(d.otherUserId)}`);
        } else {
            router.push(`/messages?conv=${encodeURIComponent(d.id)}`);
        }
    }, [router]);

    const startNewDm = useCallback(() => {
        // Hand off to DmPane's "new DM" picker by setting a flag in the URL.
        // The DmPane reads ?new=1 on mount and opens its existing modal.
        router.push('/messages?new=1');
    }, [router]);

    // Later sub-items render LaterPane inline in the right pane via ?later=<tab>
    // — the user stays in the unified workspace instead of navigating to /later.
    const goLater = useCallback((tab: 'messages' | 'tasks') => {
        router.push(`/messages?later=${tab}`);
    }, [router]);

    // On mobile the index pane and the active conversation share the screen —
    // when a conversation is selected, hide the index. Back arrow restores it.
    const showIndexOnMobile = !isChannelMode && !isDmMode && !isLaterMode;

    return (
        // Slack-style 2-column workspace: the unified top bar is gone — instead each
        // column is a self-contained flex column with its own header at the top.
        // Negate AppShell's px-6 + pb-6 so the white pane runs flush to the viewport
        // edges. Mobile keeps the BottomNav reservation so the composer doesn't slide
        // under the nav.
        <div className="flex -mx-3 sm:-mx-6 md:-mb-6 h-[calc(100vh-160px-env(safe-area-inset-bottom,0px))] md:h-[calc(100vh-112px)] bg-white overflow-hidden">
            {/* LEFT COLUMN — sidebar. Full-height flex column: its own header
                (Messages | Later tabs) sits at the top, then the search bar and
                channel/DM list (or Later sub-nav) fill the rest. */}
            <div className={`${showIndexOnMobile ? 'flex' : 'hidden md:flex'} w-full md:w-[280px] flex-shrink-0 flex-col min-h-0 border-r border-slate-100`}>
                <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 flex-shrink-0 min-h-[52px]">
                    <TopTabButton
                        active={!isLaterMode}
                        icon={MessageCircle}
                        label="Messages"
                        onClick={() => router.push('/messages')}
                    />
                    <TopTabButton
                        active={isLaterMode}
                        icon={Bookmark}
                        label="Later"
                        onClick={() => router.push('/messages?later=messages')}
                    />
                </div>
                <div className="flex-1 min-h-0 flex flex-col">
                    {isLaterMode && laterTab ? (
                        <LaterIndex
                            activeTab={laterTab}
                            onSelect={goLater}
                        />
                    ) : (
                        <MessagesIndex
                            channels={indexChannels}
                            dms={indexDms}
                            activeChannelId={channelId}
                            activeDmId={activeDmId}
                            loading={loading}
                            onSelectChannel={goChannel}
                            onSelectDm={goDm}
                            onCreateChannel={() => setShowCreateChannel(true)}
                            onNewDm={startNewDm}
                            canCreateChannel={isLeader}
                        />
                    )}
                </div>
            </div>

            {/* RIGHT COLUMN — main chat area. Full-height flex column: dedicated
                ChatHeader at the top (channel name on the left, member count +
                actions on the right) then the chat feed + composer below. */}
            <div className={`${showIndexOnMobile ? 'hidden md:flex' : 'flex'} flex-1 min-w-0 min-h-0 flex-col`}>
                {/* Right-column header — channel name / Later sub-tabs. DM mode
                    skips this row entirely; DmPane's own avatar + name + email
                    bar acts as the singular header for that view. */}
                {!isDmMode && (
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 flex-shrink-0 min-h-[52px]">
                        {/* Mobile-only back arrow returns to the sidebar/index. */}
                        {(isChannelMode || isLaterMode) && (
                            <button
                                onClick={() => router.push(isLaterMode ? '/messages?later=messages' : '/messages')}
                                className="md:hidden flex items-center gap-1 text-sm text-indigo-600 font-medium mr-1"
                            >
                                <ChevronLeft className="w-4 h-4" /> Back
                            </button>
                        )}
                        {isChannelMode && chatHeader ? (
                            <div className="flex-1 min-w-0">
                                <ChannelHeader {...chatHeader} />
                            </div>
                        ) : isLaterMode && laterTab ? (
                            // Lifted Later sub-tabs — sit in the right-column header
                            // (horizontally aligned with the [Messages][Later] pill
                            // row in the left column) so the body stays lean.
                            <div className="flex-1 min-w-0 flex items-center gap-1 -mb-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                                <LaterSubTab
                                    active={laterTab === 'messages'}
                                    icon={MessageSquare}
                                    label="Messages"
                                    count={laterCounts.messages}
                                    onClick={() => goLater('messages')}
                                />
                                <LaterSubTab
                                    active={laterTab === 'tasks'}
                                    icon={ListTodo}
                                    label="Tasks"
                                    count={laterCounts.tasks}
                                    onClick={() => goLater('tasks')}
                                />
                            </div>
                        ) : (
                            <div className="flex-1 min-w-0" />
                        )}
                    </div>
                )}

                {/* ChannelPane and DmPane stay MOUNTED across mode switches so
                    switching from a channel to a DM (or vice-versa) doesn't
                    unmount → tear down SSE → remount → reconnect. We toggle
                    visibility via CSS, and each pane's own SSE/effect logic
                    only does work when its URL params actually point at it
                    (selectedChannel / selected DM). LaterPane and the empty
                    state are still mounted on demand — they're cheap and
                    rarely toggled. */}
                <div className={cn('flex-1 min-h-0', isChannelMode ? 'flex' : 'hidden')}>
                    <ChannelPane />
                </div>
                <div className={cn('flex-1 min-h-0', isDmMode ? 'flex' : 'hidden')}>
                    <DmPane />
                </div>
                {/* LaterPane sits in the fixed-height workspace, so it needs
                    an explicit flex-1 min-h-0 overflow-y-auto wrapper to scroll
                    internally — without it the saved-message list overflows
                    the pane and the bottom rows get clipped. ChannelPane and
                    DmPane manage their own internal scroll, so they don't
                    need this wrapper. */}
                {isLaterMode && laterTab && (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <LaterPane
                            tabOverride={laterTab}
                            onTabChange={(t) => router.replace(`/messages?later=${t}`)}
                            hideTabs
                            onCountsChange={setLaterCounts}
                        />
                    </div>
                )}
                {!isChannelMode && !isDmMode && !isLaterMode && <EmptyState />}
            </div>

            <CreateChannelModal
                open={showCreateChannel}
                onClose={() => setShowCreateChannel(false)}
                onCreated={() => {
                    fetchChannels();
                    setShowCreateChannel(false);
                }}
                purpose="discussion"
            />
        </div>
    );
}

function TopTabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-full transition-colors',
                active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
            )}
        >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
        </button>
    );
}

// Underline-style sub-tab — visually distinct from the indigo TopTabButton
// pills so the [Messages]/[Later] row and the [Saved msgs]/[Saved tasks] row
// don't compete for the same "primary nav" semantics.
function LaterSubTab({ active, icon: Icon, label, count, onClick }: { active: boolean; icon: React.ComponentType<{ className?: string }>; label: string; count: number; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-2 px-3 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
                active
                    ? 'text-indigo-600 border-indigo-600'
                    : 'text-slate-500 border-transparent hover:text-slate-700',
            )}
        >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
            {count > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 text-[11px] bg-indigo-50 text-indigo-600 rounded-full">{count}</span>
            )}
        </button>
    );
}

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4 gap-1">
                <Hash className="w-8 h-8 text-indigo-400 -mr-2" />
                <MessageCircle className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-700 mb-2">Pick a conversation</h2>
            <p className="text-sm text-slate-400 max-w-md">
                Choose a channel or direct message from the left to start chatting.
            </p>
        </div>
    );
}

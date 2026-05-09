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
import { Hash, MessageCircle, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { MessagesIndex, IndexChannel, IndexDm } from '@/components/messaging/MessagesIndex';
import { ChannelPane } from '@/components/messaging/ChannelPane';
import { DmPane } from '@/components/messaging/DmPane';
import { CreateChannelModal } from '@/components/channels/CreateChannelModal';

interface ChannelRow {
    id: string;
    name: string;
    isPrivate?: boolean;
    purpose?: 'discussion' | 'assign_task';
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

    const channelId = params.get('channel');
    const convId = params.get('conv');
    const withUserId = params.get('with');
    const newDm = params.get('new') === '1';
    const isChannelMode = !!channelId;
    const isDmMode = !!convId || !!withUserId || newDm;

    const [channels, setChannels] = useState<ChannelRow[]>([]);
    const [perChannelUnread, setPerChannelUnread] = useState<Record<string, number>>({});
    const [convos, setConvos] = useState<ConvoRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateChannel, setShowCreateChannel] = useState(false);
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
        const i = setInterval(() => {
            fetchChannels();
            fetchConvos();
            fetchUnread();
        }, 15000);
        return () => clearInterval(i);
    }, [user, fetchChannels, fetchConvos, fetchUnread]);

    // Build the index lists from the fetched data. Channel unread badges come
    // from /api/channels/unread; DM unread is on the convo row directly.
    const indexChannels: IndexChannel[] = useMemo(
        () => channels.map((c) => ({
            id: c.id,
            name: c.name,
            isPrivate: c.isPrivate,
            purpose: c.purpose,
            unreadCount: perChannelUnread[c.id] || 0,
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
            })),
        [convos],
    );

    const goChannel = useCallback((c: IndexChannel) => {
        router.push(`/messages?channel=${encodeURIComponent(c.id)}`);
    }, [router]);

    const goDm = useCallback((d: IndexDm) => {
        router.push(`/messages?conv=${encodeURIComponent(d.id)}`);
    }, [router]);

    const startNewDm = useCallback(() => {
        // Hand off to DmPane's "new DM" picker by setting a flag in the URL.
        // The DmPane reads ?new=1 on mount and opens its existing modal.
        router.push('/messages?new=1');
    }, [router]);

    // On mobile the index pane and the active conversation share the screen —
    // when a conversation is selected, hide the index. Back arrow restores it.
    const showIndexOnMobile = !isChannelMode && !isDmMode;

    return (
        <div className="flex bg-white rounded-none sm:rounded-2xl border-0 sm:border border-slate-200 shadow-sm overflow-hidden -mx-3 sm:mx-0 h-[calc(100vh-150px-env(safe-area-inset-bottom,0px))] md:h-[calc(100vh-120px)]">
            <div className={`${showIndexOnMobile ? 'flex' : 'hidden md:flex'} w-full md:w-[280px] flex-shrink-0 flex-col min-h-0`}>
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
            </div>

            <div className={`${showIndexOnMobile ? 'hidden md:flex' : 'flex'} flex-1 min-w-0 flex-col`}>
                {/* Mobile back-button row — visible only when a conversation is active. */}
                {(isChannelMode || isDmMode) && (
                    <div className="md:hidden flex items-center px-3 py-2 border-b border-slate-100">
                        <button
                            onClick={() => router.push('/messages')}
                            className="flex items-center gap-1 text-sm text-indigo-600 font-medium"
                        >
                            <ChevronLeft className="w-4 h-4" /> Back
                        </button>
                    </div>
                )}

                {isChannelMode ? (
                    <ChannelPane />
                ) : isDmMode ? (
                    <DmPane />
                ) : (
                    <EmptyState />
                )}
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

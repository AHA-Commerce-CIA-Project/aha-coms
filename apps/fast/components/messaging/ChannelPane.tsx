'use client';

// ChannelPane — the right-pane channel-feed experience extracted from the
// old standalone /channels page. Used by the unified /messages workspace
// (the parent renders MessagesIndex on the left and this on the right).
//
// This is the original page's logic minus the embedded ChannelList sidebar
// and the page-level Suspense wrapper. URL params drive the active channel
// just like before, so deep-links continue to work unchanged.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/auth/use-auth';
import { useAuth } from '@/lib/auth/use-auth';
import { ChannelMessageFeed } from '@/components/channels/ChannelMessageFeed';
import { PinnedMessagesBanner } from '@/components/channels/PinnedMessagesBanner';
import { ChannelMessageComposer, type ChannelMessageComposerHandle } from '@/components/channels/ChannelMessageComposer';
import { ThreadPanel } from '@/components/channels/ThreadPanel';
import { CreateChannelModal } from '@/components/channels/CreateChannelModal';
import { EditChannelModal } from '@/components/channels/EditChannelModal';
import { ForwardToChannelModal } from '@/components/channels/ForwardToChannelModal';
import { TeamInboxTaskModal, TeamInboxTask } from '@/components/TeamInboxTaskModal';
import { Hash, AlertTriangle, Trash2, MessageSquare } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { htmlToPlainText } from '@/lib/sanitize';

interface Attachment {
  url: string;
  name: string;
  type: string;
  size: number;
  isImage: boolean;
}

interface Channel {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  isPrivate?: boolean;
  purpose?: string;
  allowedTeamIds?: string[];
  visibleToAllTeams?: boolean;
  creator: { id: string; name: string };
  _count: { messages: number };
  updatedAt: string;
  unreadCount?: number;
  isPinned?: boolean;
}

interface Message {
  id: string;
  content: string;
  attachments: Attachment[];
  mentions: string[];
  replyCount: number;
  senderId: string;
  sender: { id: string; name: string; image: string | null };
  reactions: any[];
  savedBy: { id: string }[];
  isPinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MentionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export function ChannelPane() {
  const router = useRouter();
  const searchParamsObj = useSearchParams();
  const { data: session, isPending } = useSession();
  const { isLeader } = useAuth();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [purpose, setPurpose] = useState<'discussion' | 'assign_task'>('discussion');
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createWithUserIds, setCreateWithUserIds] = useState<string[] | undefined>(undefined);
  const setDirectAssignOpen = useAppStore((s) => s.setDirectAssignOpen);
  // Publish the channel header up to MessagesWorkspace so it can render
  // &lt;ChannelHeader&gt; inline next to its Messages | Later tabs — the old
  // standalone header row was burning a whole band of vertical space.
  const setChatHeader = useAppStore((s) => s.setChatHeader);
  const notifyChannelPinned = useAppStore((s) => s.notifyChannelPinned);
  // Subscribe to Direct Assign submit ticks so we can refresh the feed when
  // the user converts a message into a task — the new endpoint edits the source
  // message in place and the SSE stream only pushes inserts, not updates.
  const directAssignSubmittedTick = useAppStore((s) => s.directAssignSubmittedTick);
  const [threadMessage, setThreadMessage] = useState<Message | null>(null);
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string; mentionHandle: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ messages: any[]; replies: any[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [perChannelUnread, setPerChannelUnread] = useState<Record<string, number>>({});
  const [perPurposeUnread, setPerPurposeUnread] = useState<{ discussion: number; assign_task: number }>({ discussion: 0, assign_task: 0 });
  const [dmUnreadTotal, setDmUnreadTotal] = useState(0);
  const [typingUsers, setTypingUsers] = useState<{ id: string; name: string }[]>([]);
  const [forwardMessage, setForwardMessage] = useState<any | null>(null);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Direct-assign task detail modal — opened from Team Inbox deep-link (?task=<id>)
  // and from clicking a DirectAssignCard inside a channel.
  const [taskDetail, setTaskDetail] = useState<TeamInboxTask | null>(null);
  const openTaskDetail = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`/fast/api/tasks/${taskId}/full`);
      if (!res.ok) return;
      const data = await res.json();
      setTaskDetail(data);
    } catch {}
  }, []);

  const messageIdsRef = useRef<Set<string>>(new Set());
  // Composer handle — used to restore the /req draft if the Direct Assign
  // modal is dismissed without submitting.
  const composerRef = useRef<ChannelMessageComposerHandle | null>(null);

  // Scroll feed to bottom when typing indicator appears
  useEffect(() => {
    if (typingUsers.length > 0) {
      setScrollTrigger(prev => prev + 1);
    }
  }, [typingUsers.length]);

  const handleTypingUsersChange = useCallback((users: { id: string; name: string }[]) => {
    setTypingUsers(users);
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isPending && !session) {
      window.location.href = '/portal?app=fast';
    }
  }, [session, isPending, router]);

  // Fetch users + teams for @mentions
  useEffect(() => {
    if (!session) return;
    fetch('/fast/api/chat/users')
      .then((res) => res.ok ? res.json() : [])
      .then(setUsers)
      .catch(() => {});
    fetch('/fast/api/teams')
      .then((res) => res.ok ? res.json() : [])
      .then((list: { id: string; name: string; mentionHandle: string | null }[]) => {
        // Only teams with a mention handle are usable in @-completion.
        setTeams(list.filter(t => !!t.mentionHandle).map(t => ({ id: t.id, name: t.name, mentionHandle: t.mentionHandle as string })));
      })
      .catch(() => {});
  }, [session]);

  // Fetch channels — scoped by the active purpose toggle.
  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch(`/fast/api/channels?purpose=${encodeURIComponent(purpose)}`);
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
        setLoadingChannels(false);
      }
    } catch {
      setLoadingChannels(false);
    }
  }, [purpose]);

  useEffect(() => {
    if (!session) return;
    fetchChannels();
    // Channel list refresh — SSE handles real-time updates, this is a fallback
    const interval = setInterval(fetchChannels, 30000);
    return () => clearInterval(interval);
  }, [session, fetchChannels]);

  // Switch to the right purpose tab when ?purpose=<discussion|assign_task> is
  // in the URL — must run before the channel-list fetches so the resolver
  // below finds the target channel in the filtered list.
  useEffect(() => {
    const purposeParam = searchParamsObj.get('purpose');
    if (purposeParam === 'discussion' || purposeParam === 'assign_task') {
      setPurpose(purposeParam);
    }
  }, [searchParamsObj]);

  // Auto-select channel from URL query param. If the deep-linked channel isn't
  // in the currently-loaded purpose's list (e.g. user clicked "View message"
  // on a forwarded direct-assign card while sitting on the Discussion tab),
  // flip the purpose toggle once so the channel can be found. The ref
  // prevents an infinite ping-pong when the channel doesn't exist in either
  // purpose (revoked, deleted, etc).
  const flippedPurposeForChannelRef = useRef<string | null>(null);
  useEffect(() => {
    const channelParam = searchParamsObj.get('channel');
    if (!channelParam) {
      // URL no longer points at any channel (user switched to DM mode or
      // landed on the empty workspace). Clear the active channel so its
      // SSE subscription tears down — otherwise we'd keep streaming a
      // channel the user isn't viewing.
      if (selectedChannel) setSelectedChannel(null);
      return;
    }
    // Already on this channel — nothing to do. (Pre-bug-fix this returned
    // whenever ANY channel was selected, which prevented switching channels
    // from the unified MessagesIndex.)
    if (selectedChannel && selectedChannel.id === channelParam) return;
    if (channels.length === 0) return;
    const ch = channels.find((c) => c.id === channelParam);
    if (ch) {
      handleSelectChannel(ch);
      flippedPurposeForChannelRef.current = null;
      return;
    }
    // Not found in current purpose — try the other tab once.
    if (flippedPurposeForChannelRef.current !== channelParam) {
      flippedPurposeForChannelRef.current = channelParam;
      setPurpose(p => (p === 'discussion' ? 'assign_task' : 'discussion'));
    }
  }, [channels, searchParamsObj, selectedChannel]);

  // Open create-channel modal with pre-selected members from ?createWith=<userId>(,<userId>)
  useEffect(() => {
    const createWith = searchParamsObj.get('createWith');
    if (createWith) {
      setCreateWithUserIds(createWith.split(',').filter(Boolean));
      setShowCreateModal(true);
    }
  }, [searchParamsObj]);

  // Highlight message from URL query param (from "Open in channel" / Later page)
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  useEffect(() => {
    const highlightParam = searchParamsObj.get('highlight');
    if (highlightParam && messages.length > 0) {
      setHighlightedMessageId(highlightParam);
      // Scroll to the message
      setTimeout(() => {
        const el = document.getElementById(`msg-${highlightParam}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Remove highlight after 3 seconds
          setTimeout(() => setHighlightedMessageId(null), 3000);
        }
      }, 300);
    }
  }, [messages, searchParamsObj]);

  // Auto-open the task detail modal when ?task=<id> is in the URL. Used by
  // /later → "Open task" for direct_assign tasks (which can't be opened from
  // /nexus since the queue excludes them). Runs once per id so re-renders
  // don't keep reopening the modal after the user closes it.
  const openedTaskRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session) return;
    const taskParam = searchParamsObj.get('task');
    if (!taskParam) return;
    if (openedTaskRef.current === taskParam) return;
    openedTaskRef.current = taskParam;
    openTaskDetail(taskParam);
  }, [searchParamsObj, session, openTaskDetail]);

  // Fetch per-channel unread counts + DM total unread (for tab badges)
  useEffect(() => {
    if (!session) return;
    const fetchUnread = async () => {
      try {
        const [chRes, dmRes] = await Promise.all([
          fetch('/fast/api/channels/unread'),
          fetch('/fast/api/chat/unread'),
        ]);
        if (chRes.ok) {
          const data = await chRes.json();
          setPerChannelUnread(data.perChannel || {});
          setPerPurposeUnread({
            discussion: data.perPurpose?.discussion || 0,
            assign_task: data.perPurpose?.assign_task || 0,
          });
        }
        if (dmRes.ok) {
          const data = await dmRes.json();
          setDmUnreadTotal(data.unreadCount || 0);
        }
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 5000);
    return () => clearInterval(interval);
  }, [session]);

  // Fetch messages for selected channel
  const fetchMessages = useCallback(async (channelId: string, cursor?: string, isPolling = false) => {
    if (!isPolling) setLoadingMessages(true);
    try {
      const url = cursor
        ? `/api/channels/${channelId}/messages?cursor=${cursor}`
        : `/api/channels/${channelId}/messages`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (cursor) {
          setMessages((prev) => [...prev, ...data.messages]);
        } else {
          // Merge new messages without duplicates
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMsgs = data.messages.filter((m: Message) => !existingIds.has(m.id));
            if (newMsgs.length > 0) {
              return [...newMsgs, ...prev];
            }
            // Update existing messages (for reaction changes, etc)
            return data.messages;
          });
        }
        setHasMore(!!data.nextCursor);
      }
    } catch {
    } finally {
      if (!isPolling) setLoadingMessages(false);
    }
  }, []);

  // SSE: real-time messages + unread (replaces polling)
  useEffect(() => {
    if (!selectedChannel) return;
    fetchMessages(selectedChannel.id);

    const es = new EventSource(`/api/channels/stream?channelId=${selectedChannel.id}`);

    es.addEventListener('messages', (e) => {
      try {
        const newMsgs: Message[] = JSON.parse(e.data);
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const unique = newMsgs.filter((m) => !existingIds.has(m.id));
          if (unique.length === 0) return prev;
          // State is newest-first. SSE delivers asc (oldest→newest); reverse the
          // batch so the newest of the batch lands at index 0, then prepend.
          // Without this, new messages drift to the END of state and end up at
          // the TOP of the feed after the display reverse.
          const newestFirst = unique.slice().reverse();
          return [...newestFirst, ...prev];
        });
      } catch {}
    });

    es.addEventListener('unread', (e) => {
      try {
        const data = JSON.parse(e.data);
        // Update channel list with new-message indicators
        setChannels((prev) => prev.map((ch) => {
          const update = data.channels?.find((u: any) => u.id === ch.id);
          return update ? { ...ch, hasNew: update.hasNew } : ch;
        }));
      } catch {}
    });

    es.onerror = () => {
      // EventSource auto-reconnects; no action needed
    };

    return () => es.close();
  }, [selectedChannel, fetchMessages]);

  // Refetch the feed when a Direct Assign succeeds — the source message was
  // edited in place by the server, so SSE (which only fires on inserts) won't
  // push it. Cheap full refetch is fine here; it only fires on submit.
  useEffect(() => {
    if (!selectedChannel || directAssignSubmittedTick === 0) return;
    fetchMessages(selectedChannel.id);
  }, [directAssignSubmittedTick, selectedChannel, fetchMessages]);

  // Search messages
  useEffect(() => {
    if (!selectedChannel || !searchQuery || searchQuery.length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/channels/${selectedChannel.id}/search?q=${encodeURIComponent(searchQuery)}`
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch {
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchQuery, selectedChannel]);

  // Mark as read
  const markAsRead = useCallback(async (channelId: string) => {
    try {
      await fetch(`/fast/api/channels/${channelId}/read`, { method: 'PUT' });
    } catch {}
  }, []);

  const handleSelectChannel = (channel: Channel) => {
    setSelectedChannel(channel);
    setMessages([]);
    setHasMore(false);
    setThreadMessage(null);
    setSearchQuery('');
    setSearchResults(null);
    messageIdsRef.current.clear();
    markAsRead(channel.id);
  };

  const handleSendMessage = async (content: string, attachments: Attachment[], mentions: string[]) => {
    if (!selectedChannel) return;
    try {
      const res = await fetch(`/fast/api/channels/${selectedChannel.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, attachments, mentions }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => [msg, ...prev]);
        markAsRead(selectedChannel.id);
      }
    } catch {}
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!selectedChannel) return;
    try {
      await fetch(`/fast/api/channels/${selectedChannel.id}/${messageId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      // Refresh messages to get updated reactions
      fetchMessages(selectedChannel.id);
    } catch {}
  };

  const handleSave = async (messageId: string) => {
    if (!selectedChannel) return;
    try {
      await fetch(`/fast/api/channels/${selectedChannel.id}/${messageId}/save`, {
        method: 'POST',
      });
      fetchMessages(selectedChannel.id);
    } catch {}
  };

  // Bumped after every successful pin toggle so PinnedMessagesBanner refetches.
  const [pinTick, setPinTick] = useState(0);

  const handlePin = async (messageId: string) => {
    if (!selectedChannel) return;
    // Optimistic flip so the toolbar icon swaps immediately; the banner waits
    // on the network round-trip to avoid a flash of an empty/wrong list.
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, isPinned: !m.isPinned } : m)),
    );
    try {
      const res = await fetch(`/fast/api/channels/${selectedChannel.id}/messages/${messageId}/pin`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('pin failed');
      const data = await res.json();
      // Reconcile with server truth in case the optimistic flip got out of step.
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isPinned: data.isPinned } : m)),
      );
      setPinTick((t) => t + 1);
    } catch {
      // Roll the optimistic flip back if the API rejected.
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isPinned: !m.isPinned } : m)),
      );
    }
  };

  // Jump to a pinned message inside the feed — reuses the existing highlight
  // mechanism so the row gets the indigo ring + auto-scroll behavior.
  const handleJumpToMessage = useCallback((messageId: string) => {
    setHighlightedMessageId(messageId);
    const el = document.getElementById(`msg-${messageId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setHighlightedMessageId(null), 3000);
  }, []);

  const handleReplyCountChange = (messageId: string, count: number) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, replyCount: count } : m))
    );
  };

  const confirmDeleteChannel = async () => {
    if (!selectedChannel) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/fast/api/channels/${selectedChannel.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || 'Failed to delete channel');
        setDeleting(false);
        return;
      }
      setDeleteConfirmOpen(false);
      setSelectedChannel(null);
      setMessages([]);
      setThreadMessage(null);
      fetchChannels();
    } catch {
      setDeleteError('Failed to delete channel');
    } finally {
      setDeleting(false);
    }
  };

  // Stable callbacks for the published ChatHeaderState — wrapped in useCallback
  // so MessagesWorkspace doesn't re-render the workspace shell on every
  // ChannelPane state tick. Inline closures here would tear down on every
  // re-render and the published header object would never stabilise.
  const handleHeaderSearchChange = useCallback((q: string) => setSearchQuery(q), []);
  const handleHeaderDelete = useCallback(() => {
    setDeleteError(null);
    setDeleteConfirmOpen(true);
  }, []);
  const handleHeaderEdit = useCallback(() => setEditModalOpen(true), []);
  const handleHeaderDirectAssign = useCallback(() => {
    if (selectedChannel) setDirectAssignOpen(true, { channelId: selectedChannel.id });
  }, [selectedChannel, setDirectAssignOpen]);
  const handleHeaderBack = useCallback(() => setSelectedChannel(null), []);

  // Toggle the user-specific channel pin. Optimistic flip on both the
  // channels list and the selected-channel snapshot so the kebab icon
  // and the sidebar Pinned section both react before the round-trip
  // returns; rolls back if the API rejects.
  const handleHeaderPinChannel = useCallback(async () => {
    if (!selectedChannel) return;
    const previous = !!selectedChannel.isPinned;
    setSelectedChannel((prev) => (prev ? { ...prev, isPinned: !previous } : prev));
    setChannels((prev) =>
      prev.map((c) => (c.id === selectedChannel.id ? { ...c, isPinned: !previous } : c)),
    );
    try {
      const res = await fetch(`/fast/api/channels/${selectedChannel.id}/pin`, { method: 'POST' });
      if (!res.ok) throw new Error('pin failed');
      const data = await res.json();
      // Reconcile both snapshots with server truth in case the optimistic
      // flip raced another tab.
      setSelectedChannel((prev) => (prev ? { ...prev, isPinned: !!data.isPinned } : prev));
      setChannels((prev) =>
        prev.map((c) => (c.id === selectedChannel.id ? { ...c, isPinned: !!data.isPinned } : c)),
      );
      // MessagesWorkspace owns the sidebar channel list — nudge it to
      // refetch so the Pinned section reflects this change immediately.
      notifyChannelPinned();
    } catch {
      setSelectedChannel((prev) => (prev ? { ...prev, isPinned: previous } : prev));
      setChannels((prev) =>
        prev.map((c) => (c.id === selectedChannel.id ? { ...c, isPinned: previous } : c)),
      );
    }
  }, [selectedChannel, notifyChannelPinned]);

  // Publish header data into the workspace-level Zustand slot so the top tab
  // row can render &lt;ChannelHeader&gt; inline. Clear when no channel is selected
  // (or this pane unmounts) so the row collapses back to just the tabs.
  useEffect(() => {
    if (!selectedChannel || !session) {
      setChatHeader(null);
      return;
    }
    setChatHeader({
      name: selectedChannel.name,
      description: selectedChannel.description,
      isPrivate: (selectedChannel as any).isPrivate,
      memberCount: (selectedChannel as any).memberCount,
      channelId: selectedChannel.id,
      purpose: selectedChannel.purpose,
      isCreator: selectedChannel.createdBy === session.user.id,
      isPinnedForUser: !!selectedChannel.isPinned,
      searchQuery,
      searching,
      onSearchChange: handleHeaderSearchChange,
      onDelete: handleHeaderDelete,
      onEdit: handleHeaderEdit,
      onDirectAssign: handleHeaderDirectAssign,
      onPinChannel: handleHeaderPinChannel,
      onBack: handleHeaderBack,
    });
  }, [
    selectedChannel,
    session,
    searchQuery,
    searching,
    setChatHeader,
    handleHeaderSearchChange,
    handleHeaderDelete,
    handleHeaderEdit,
    handleHeaderDirectAssign,
    handleHeaderPinChannel,
    handleHeaderBack,
  ]);

  useEffect(() => () => setChatHeader(null), [setChatHeader]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  return (
    // Single root: an outer wrapper here breaks the flex chain and lets long channels overflow the workspace.
    <div className="flex bg-white flex-1 min-h-0 overflow-hidden w-full">
      {/* The unified /messages workspace renders MessagesIndex on the left,
          so this pane is the right-side feed only. */}
      <div className="flex flex-1 flex-col min-w-0 min-h-0">
        {selectedChannel ? (
          <>
            {/* ChannelHeader is now rendered by MessagesWorkspace inline next
                to its Messages | Later tab row — see app/messages/page.tsx.
                This pane publishes the header data + callbacks into the
                Zustand `chatHeader` slot via the useEffect above. */}
            {searchResults ? (
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                  {searchResults.messages.length + searchResults.replies.length} results for &quot;{searchQuery}&quot;
                </p>
                {searchResults.messages.length === 0 && searchResults.replies.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-8">No messages found</p>
                )}
                {searchResults.messages.map((msg: any) => (
                  <button
                    key={msg.id}
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults(null);
                    }}
                    className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all mb-1"
                  >
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                        {msg.sender.image ? (
                          <img src={msg.sender.image} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          msg.sender.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-sm text-slate-700">{msg.sender.name}</span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(msg.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mt-0.5 line-clamp-2">{htmlToPlainText(msg.content)}</p>
                      </div>
                    </div>
                  </button>
                ))}
                {searchResults.replies.length > 0 && (
                  <>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-4 mb-2">
                      In threads
                    </p>
                    {searchResults.replies.map((reply: any) => (
                      <button
                        key={reply.id}
                        onClick={() => {
                          const parentMsg = messages.find((m) => m.id === reply.message.id);
                          if (parentMsg) {
                            setThreadMessage(parentMsg);
                          }
                          setSearchQuery('');
                          setSearchResults(null);
                        }}
                        className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all mb-1"
                      >
                        <div className="flex items-center gap-1.5 text-xs text-indigo-500 mb-1">
                          <MessageSquare className="w-3 h-3" />
                          <span>Thread reply</span>
                        </div>
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                            {reply.sender.image ? (
                              <img src={reply.sender.image} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              reply.sender.name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="font-semibold text-sm text-slate-700">{reply.sender.name}</span>
                              <span className="text-[11px] text-slate-400">
                                {new Date(reply.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            <p className="text-sm text-slate-600 mt-0.5 line-clamp-2">{htmlToPlainText(reply.content)}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <>
                <PinnedMessagesBanner
                  channelId={selectedChannel.id}
                  refreshTick={pinTick}
                  onJumpToMessage={handleJumpToMessage}
                />
                <ChannelMessageFeed
                  messages={messages}
                  currentUserId={session.user.id}
                  channelName={selectedChannel.name}
                  channelId={selectedChannel.id}
                  loading={loadingMessages}
                  hasMore={hasMore}
                  onLoadMore={() => {
                    if (messages.length > 0) {
                      fetchMessages(selectedChannel.id, messages[messages.length - 1].id);
                    }
                  }}
                  onOpenThread={(msg) => setThreadMessage(msg)}
                  onReaction={handleReaction}
                  onSave={handleSave}
                  onPin={handlePin}
                  onMessageUpdated={() => fetchMessages(selectedChannel.id)}
                  onForward={async (msg) => {
                    const raw = msg.content || '';
                    // Detect direct-assign cards forwarded from a channel — they
                    // carry a <!--direct_assign:TASK_ID--> marker. We pull the
                    // task id out so the forward goes through the same path as
                    // /team-inbox / /nexus and renders as a real DirectAssignCard
                    // at the receiver, with a "Forwarded from Task X" footer.
                    const daMatch = raw.match(/<!--direct_assign:([^\s>]+?)-->/);
                    const taskId = daMatch?.[1]?.trim() || undefined;
                    let taskToken: string | undefined;
                    if (taskId) {
                      try {
                        const r = await fetch(`/fast/api/tasks/${taskId}/card`);
                        if (r.ok) {
                          const data = await r.json();
                          taskToken = data.task_token || undefined;
                        }
                      } catch {}
                    }
                    setForwardMessage({
                      originalAuthor: msg.sender.name,
                      originalAuthorImage: msg.sender.image,
                      originalContent: raw
                        .replace(/<!--forward:.*?-->/s, '')
                        .replace(/<!--direct_assign:[^\s>]+?-->/g, '')
                        .trim(),
                      originalAttachments: msg.attachments || [],
                      originalChannelName: selectedChannel.name,
                      originalChannelId: selectedChannel.id,
                      originalMessageId: msg.id,
                      originalDate: msg.createdAt,
                      ...(taskId
                        ? { isTaskForward: true, taskId, taskToken }
                        : {}),
                    });
                  }}
                  onDirectAssign={(msg) => {
                    // Convert this chat message into a Direct Assign task.
                    // The modal will pre-fill description + attachments and submit
                    // to /api/tasks/direct-assign-from-message, which transforms
                    // this same message into a card in place.
                    const raw = msg.content || '';
                    const atts = msg.attachments || [];
                    const images = atts
                      .filter((a: any) => a.isImage || (a.type || '').startsWith('image/'))
                      .map((a: any) => ({ url: a.url, preview: a.url }));
                    const fileUrls = atts
                      .filter((a: any) => !(a.isImage || (a.type || '').startsWith('image/')))
                      .map((a: any) => a.url);
                    setDirectAssignOpen(true, {
                      channelId: selectedChannel.id,
                      sourceMessageId: msg.id,
                      defaultDescription: raw,
                      defaultImages: images,
                      defaultFileUrls: fileUrls,
                    });
                  }}
                  allUsers={users}
                  allTeams={teams}
                  highlightedMessageId={highlightedMessageId}
                  scrollTrigger={scrollTrigger}
                  onOpenTaskDetail={openTaskDetail}
                />
                {/* Typing indicator */}
                {typingUsers.length > 0 && (
                  <div className="px-6 py-1.5 bg-white border-t border-slate-100 flex items-center gap-2">
                    <div className="flex gap-[3px] items-center">
                      <span className="w-[5px] h-[5px] rounded-full bg-indigo-400 animate-[typingBounce_1.2s_ease-in-out_infinite]" />
                      <span className="w-[5px] h-[5px] rounded-full bg-indigo-400 animate-[typingBounce_1.2s_ease-in-out_0.2s_infinite]" />
                      <span className="w-[5px] h-[5px] rounded-full bg-indigo-400 animate-[typingBounce_1.2s_ease-in-out_0.4s_infinite]" />
                    </div>
                    <span className="text-xs text-slate-500 font-medium">
                      {typingUsers.length === 1
                        ? `${typingUsers[0].name} is typing`
                        : typingUsers.length === 2
                        ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing`
                        : `${typingUsers[0].name} and ${typingUsers.length - 1} others are typing`}
                    </span>
                  </div>
                )}
                <ChannelMessageComposer
                  ref={composerRef}
                  channelId={selectedChannel.id}
                  channelName={selectedChannel.name}
                  onSend={handleSendMessage}
                  users={users}
                  teams={teams}
                  onTypingUsersChange={handleTypingUsersChange}
                  onRemindCommand={isLeader ? () => router.push('/orbit') : undefined}
                  onTaskCommand={(description, atts) => {
                    const images = atts
                      .filter((a) => a.isImage || (a.type || '').startsWith('image/'))
                      .map((a) => ({ url: a.url, preview: a.url }));
                    const fileUrls = atts
                      .filter((a) => !(a.isImage || (a.type || '').startsWith('image/')))
                      .map((a) => a.url);
                    setDirectAssignOpen(true, {
                      channelId: selectedChannel.id,
                      defaultDescription: description,
                      defaultImages: images,
                      defaultFileUrls: fileUrls,
                      // Skip the wizard: jump straight to Review & Submit. The
                      // user already wrote the description in the composer, so
                      // they should land on the page that lets them ship it.
                      startAtReview: true,
                      // If they cancel/close without submitting, push the draft
                      // back into the composer and re-enter task mode.
                      onCancel: (draftDescription) => {
                        composerRef.current?.restoreTaskDraft(draftDescription);
                      },
                    });
                  }}
                />
              </>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
              <Hash className="w-10 h-10 text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-700 mb-2">Welcome to Channels</h2>
            <p className="text-sm text-slate-400 max-w-md">
              Select a channel from the sidebar to start collaborating with your team, or create a new one.
            </p>
          </div>
        )}
      </div>

      {/* Thread panel */}
      {threadMessage && selectedChannel && (
        <div className="w-[380px] flex-shrink-0">
          <ThreadPanel
            channelId={selectedChannel.id}
            message={threadMessage}
            currentUserId={session.user.id}
            onClose={() => setThreadMessage(null)}
            users={users}
            onReplyCountChange={handleReplyCountChange}
            onOpenTaskDetail={openTaskDetail}
          />
        </div>
      )}

      {/* Create channel modal — inherits the active purpose so the new channel is scoped correctly. */}
      <CreateChannelModal
        open={showCreateModal}
        onClose={() => { setShowCreateModal(false); setCreateWithUserIds(undefined); }}
        onCreated={fetchChannels}
        purpose={purpose}
        preselectedMemberIds={createWithUserIds}
      />

      {/* Edit channel modal */}
      <EditChannelModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        channel={selectedChannel as any}
        onUpdated={(updated) => {
          setSelectedChannel((prev) => (prev ? { ...prev, ...updated } : prev));
          fetchChannels();
        }}
      />

      {/* Direct-assign task detail modal — opened via deep-link or DirectAssignCard */}
      {taskDetail && (
        <TeamInboxTaskModal
          task={taskDetail}
          currentUserId={session?.user?.id}
          onClose={() => setTaskDetail(null)}
          onChange={() => taskDetail && openTaskDetail(taskDetail.id)}
        />
      )}
      {/* Delete channel confirmation modal */}
      {deleteConfirmOpen && selectedChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !deleting && setDeleteConfirmOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-slate-800">
                    Delete #{selectedChannel.name}?
                  </h2>
                  <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
                    This will permanently remove the channel along with all its messages, replies, and reactions. This action cannot be undone.
                  </p>
                </div>
              </div>

              {deleteError && (
                <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">
                  {deleteError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-white rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteChannel}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 text-white text-sm font-semibold rounded-lg hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete channel
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ForwardToChannelModal
        open={!!forwardMessage}
        onClose={() => setForwardMessage(null)}
        originalAuthor={forwardMessage?.originalAuthor || ''}
        originalAuthorImage={forwardMessage?.originalAuthorImage}
        originalContent={forwardMessage?.originalContent || ''}
        originalAttachments={forwardMessage?.originalAttachments || []}
        originalChannelName={forwardMessage?.originalChannelName}
        originalChannelId={forwardMessage?.originalChannelId}
        originalMessageId={forwardMessage?.originalMessageId}
        originalDate={forwardMessage?.originalDate}
        isTaskForward={forwardMessage?.isTaskForward}
        taskToken={forwardMessage?.taskToken}
        taskId={forwardMessage?.taskId}
      />
    </div>
  );
}


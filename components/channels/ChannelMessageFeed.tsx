'use client';

import { useRef, useEffect } from 'react';
import { ChannelMessageItem } from './ChannelMessageItem';
import { Hash } from 'lucide-react';

interface Message {
  id: string;
  content: string;
  attachments: any[];
  mentions: string[];
  replyCount: number;
  senderId: string;
  sender: { id: string; name: string; image: string | null };
  reactions: any[];
  savedBy: { id: string }[];
  createdAt: string;
}

interface ChannelMessageFeedProps {
  messages: Message[];
  currentUserId: string;
  channelName: string;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  channelId: string;
  onOpenThread: (message: Message) => void;
  onReaction: (messageId: string, emoji: string) => void;
  onSave: (messageId: string) => void;
  onMessageUpdated: () => void;
  onForward?: (message: Message) => void;
  onDirectAssign?: (message: Message) => void;
  allUsers?: { id: string; name: string }[];
  allTeams?: { id: string; name: string; mentionHandle: string }[];
  highlightedMessageId?: string | null;
  scrollTrigger?: number;
  /** Open the Team Inbox detail modal for a direct-assign task. Forwarded to ChannelMessageItem → DirectAssignCard. */
  onOpenTaskDetail?: (taskId: string) => void;
}

function formatDateDivider(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function ChannelMessageFeed({
  messages,
  currentUserId,
  channelName,
  channelId,
  loading,
  hasMore,
  onLoadMore,
  onOpenThread,
  onReaction,
  onSave,
  onMessageUpdated,
  onForward,
  onDirectAssign,
  allUsers,
  allTeams,
  highlightedMessageId,
  scrollTrigger,
  onOpenTaskDetail,
}: ChannelMessageFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  // While true, content-height growth (images/GIFs finishing load) re-pins the
  // viewport to the bottom. We disable pinning when the user scrolls away or
  // after a short window — long enough for media to settle, short enough that
  // a late image load mid-read doesn't yank them.
  const pinToBottomRef = useRef(false);

  // Switching channels or first paint: reset pinning, reset tracker.
  // pinToBottomRef stays true until the user actively scrolls away (see
  // handleScroll below). The ResizeObserver re-pins on every content-height
  // change so slow-loading images can't displace the bottom anchor — the
  // root cause of "I opened the channel but landed in the middle".
  useEffect(() => {
    pinToBottomRef.current = true;
    prevLengthRef.current = 0;
    return () => {};
  }, [channelId]);

  // Auto-scroll on new messages.
  //
  // Initial load for a channel: jump to the bottom (latest message) — this is
  // the standard chat behavior users expect. Image-loading reflows are
  // handled by the ResizeObserver re-pinning while pinToBottomRef is true,
  // so the user stays at the bottom until they themselves scroll up.
  //
  // Subsequent message arrivals: stay sticky at the bottom only if the user
  // is already near the bottom — never yank them away from older content
  // they're actively reading.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const grew = messages.length > prevLengthRef.current;
    const wasInitial = prevLengthRef.current === 0 && messages.length > 0;
    if (wasInitial) {
      container.scrollTop = container.scrollHeight;
    } else if (grew) {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom < 150) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
    prevLengthRef.current = messages.length;
  }, [messages.length]);

  // Pin to bottom while content height grows (images/GIFs loading after initial render)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      if (pinToBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    });
    ro.observe(container);
    Array.from(container.children).forEach((child) => ro.observe(child));
    return () => ro.disconnect();
  }, [channelId]);

  // Scroll to bottom when triggered externally (e.g., typing indicator appears)
  useEffect(() => {
    if (scrollTrigger && scrollTrigger > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scrollTrigger]);

  // Load more on scroll to top; manage bottom-pinning based on user position.
  // - Scrolled away (>200px from bottom): disable pin so the user can read
  //   older content without being yanked back when an image finishes loading.
  // - Scrolled back to bottom (<80px): re-enable pin so subsequent image
  //   loads or new messages keep them at the bottom.
  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom > 200) {
      pinToBottomRef.current = false;
    } else if (distanceFromBottom < 80) {
      pinToBottomRef.current = true;
    }
    if (!hasMore || loading) return;
    if (container.scrollTop < 100) {
      onLoadMore();
    }
  };

  // Messages come newest-first from API, reverse for display
  const displayMessages = [...messages].reverse();

  // Group by date
  const messagesWithDividers: { type: 'divider' | 'message'; date?: string; message?: Message; showAvatar?: boolean }[] = [];
  let lastDate = '';
  let lastSenderId = '';
  let lastTime = 0;

  for (const msg of displayMessages) {
    const msgDate = new Date(msg.createdAt).toDateString();
    if (msgDate !== lastDate) {
      messagesWithDividers.push({ type: 'divider', date: msg.createdAt });
      lastDate = msgDate;
      lastSenderId = '';
    }

    const msgTime = new Date(msg.createdAt).getTime();
    const sameGroup = msg.senderId === lastSenderId && msgTime - lastTime < 5 * 60 * 1000;

    messagesWithDividers.push({
      type: 'message',
      message: msg,
      showAvatar: !sameGroup,
    });

    lastSenderId = msg.senderId;
    lastTime = msgTime;
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto"
      onScroll={handleScroll}
    >
      {/* Load more indicator */}
      {loading && messages.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
            <Hash className="w-8 h-8 text-indigo-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-1">
            Welcome to #{channelName}
          </h3>
          <p className="text-sm text-slate-400">
            This is the start of the channel. Send a message to get the conversation going!
          </p>
        </div>
      )}

      {/* Messages */}
      {messagesWithDividers.map((item, idx) => {
        if (item.type === 'divider') {
          return (
            <div key={`divider-${idx}`} className="flex items-center gap-4 px-6 py-3">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs font-medium text-slate-400">
                {formatDateDivider(item.date!)}
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          );
        }

        const isHighlighted = highlightedMessageId === item.message!.id;
        return (
          <div key={item.message!.id} id={`msg-${item.message!.id}`} className={`transition-all duration-1000 rounded-xl ${isHighlighted ? 'bg-indigo-50 ring-2 ring-indigo-300 -mx-2 px-2 py-1' : ''}`}>
            <ChannelMessageItem
              message={item.message!}
              currentUserId={currentUserId}
              channelId={channelId}
              channelName={channelName}
              onOpenThread={onOpenThread}
              onReaction={onReaction}
              onSave={onSave}
              onMessageUpdated={onMessageUpdated}
              onForward={onForward}
              onDirectAssign={onDirectAssign}
              allUsers={allUsers}
              allTeams={allTeams}
              showAvatar={item.showAvatar}
              onOpenTaskDetail={onOpenTaskDetail}
            />
          </div>
        );
      })}

      <div ref={bottomRef} />
    </div>
  );
}

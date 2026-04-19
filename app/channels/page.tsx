'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { useAuth } from '@/lib/auth-context';
import { ChannelList } from '@/components/channels/ChannelList';
import { ChannelHeader } from '@/components/channels/ChannelHeader';
import { ChannelMessageFeed } from '@/components/channels/ChannelMessageFeed';
import { ChannelMessageComposer } from '@/components/channels/ChannelMessageComposer';
import { ThreadPanel } from '@/components/channels/ThreadPanel';
import { CreateChannelModal } from '@/components/channels/CreateChannelModal';
import { ForwardToChannelModal } from '@/components/channels/ForwardToChannelModal';
import { Hash, MessageSquare } from 'lucide-react';
import { PageTabs } from '@/components/PageTabs';

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
  creator: { id: string; name: string };
  _count: { messages: number };
  updatedAt: string;
  unreadCount?: number;
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
  createdAt: string;
}

interface MentionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

function ChannelsPageContent() {
  const router = useRouter();
  const searchParamsObj = useSearchParams();
  const { data: session, isPending } = useSession();
  const { isLeader } = useAuth();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [threadMessage, setThreadMessage] = useState<Message | null>(null);
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ messages: any[]; replies: any[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [perChannelUnread, setPerChannelUnread] = useState<Record<string, number>>({});
  const [typingUsers, setTypingUsers] = useState<{ id: string; name: string }[]>([]);
  const [forwardMessage, setForwardMessage] = useState<any | null>(null);
  const [scrollTrigger, setScrollTrigger] = useState(0);

  const messageIdsRef = useRef<Set<string>>(new Set());

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
      router.push('/login');
    }
  }, [session, isPending, router]);

  // Fetch users for @mentions
  useEffect(() => {
    if (!session) return;
    fetch('/api/chat/users')
      .then((res) => res.ok ? res.json() : [])
      .then(setUsers)
      .catch(() => {});
  }, [session]);

  // Fetch channels
  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/channels');
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
        setLoadingChannels(false);
      }
    } catch {
      setLoadingChannels(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchChannels();
    // Channel list refresh — SSE handles real-time updates, this is a fallback
    const interval = setInterval(fetchChannels, 30000);
    return () => clearInterval(interval);
  }, [session, fetchChannels]);

  // Auto-select channel from URL query param
  useEffect(() => {
    const channelParam = searchParamsObj.get('channel');
    if (channelParam && channels.length > 0 && !selectedChannel) {
      const ch = channels.find((c) => c.id === channelParam);
      if (ch) {
        handleSelectChannel(ch);
      }
    }
  }, [channels, searchParamsObj]);

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

  // Fetch per-channel unread counts
  useEffect(() => {
    if (!session) return;
    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/channels/unread');
        if (res.ok) {
          const data = await res.json();
          setPerChannelUnread(data.perChannel || {});
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
          return unique.length > 0 ? [...prev, ...unique] : prev;
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
      await fetch(`/api/channels/${channelId}/read`, { method: 'PUT' });
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
      const res = await fetch(`/api/channels/${selectedChannel.id}/messages`, {
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
      await fetch(`/api/channels/${selectedChannel.id}/${messageId}/reactions`, {
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
      await fetch(`/api/channels/${selectedChannel.id}/${messageId}/save`, {
        method: 'POST',
      });
      fetchMessages(selectedChannel.id);
    } catch {}
  };

  const handleReplyCountChange = (messageId: string, count: number) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, replyCount: count } : m))
    );
  };

  const handleDeleteChannel = async () => {
    if (!selectedChannel) return;
    const confirmed = window.confirm(
      `Delete #${selectedChannel.name}? This permanently removes the channel and all its messages. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/channels/${selectedChannel.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete channel');
        return;
      }
      setSelectedChannel(null);
      setMessages([]);
      setThreadMessage(null);
      fetchChannels();
    } catch {
      alert('Failed to delete channel');
    }
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="-mx-6 -mt-6">
      <div className="px-6 pt-4 pb-2">
        <PageTabs tabs={[
          { href: '/channels', label: 'Channels' },
          { href: '/messages', label: 'Messages' },
        ]} />
      </div>
    <div className="flex" style={{ height: 'calc(100vh - 168px)' }}>
      {/* Channel list */}
      <div className="w-[280px] border-r border-slate-200 flex-shrink-0">
        <ChannelList
          channels={channels.map((ch) => ({
            ...ch,
            unreadCount: perChannelUnread[ch.id] || 0,
          }))}
          selectedId={selectedChannel?.id || null}
          onSelect={handleSelectChannel}
          onCreateChannel={() => setShowCreateModal(true)}
          isLeader={isLeader}
          loading={loadingChannels}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedChannel ? (
          <>
            <ChannelHeader
              name={selectedChannel.name}
              description={selectedChannel.description}
              isPrivate={(selectedChannel as any).isPrivate}
              memberCount={(selectedChannel as any).memberCount}
              channelId={selectedChannel.id}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              searching={searching}
              isCreator={selectedChannel.createdBy === session.user.id}
              onDelete={handleDeleteChannel}
            />
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
                        <p className="text-sm text-slate-600 mt-0.5 line-clamp-2">{msg.content}</p>
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
                            <p className="text-sm text-slate-600 mt-0.5 line-clamp-2">{reply.content}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <>
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
                  onMessageUpdated={() => fetchMessages(selectedChannel.id)}
                  onForward={(msg) => setForwardMessage({
                    originalAuthor: msg.sender.name,
                    originalContent: msg.content?.replace(/<!--forward:.*?-->/s, '').trim() || '',
                    originalAttachments: msg.attachments || [],
                    originalChannelName: selectedChannel.name,
                    originalChannelId: selectedChannel.id,
                    originalMessageId: msg.id,
                    originalDate: msg.createdAt,
                  })}
                  allUsers={users}
                  highlightedMessageId={highlightedMessageId}
                  scrollTrigger={scrollTrigger}
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
                  channelId={selectedChannel.id}
                  channelName={selectedChannel.name}
                  onSend={handleSendMessage}
                  users={users}
                  onTypingUsersChange={handleTypingUsersChange}
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
          />
        </div>
      )}

      {/* Create channel modal */}
      <CreateChannelModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchChannels}
      />
      <ForwardToChannelModal
        open={!!forwardMessage}
        onClose={() => setForwardMessage(null)}
        originalAuthor={forwardMessage?.originalAuthor || ''}
        originalContent={forwardMessage?.originalContent || ''}
        originalAttachments={forwardMessage?.originalAttachments || []}
        originalChannelName={forwardMessage?.originalChannelName}
        originalChannelId={forwardMessage?.originalChannelId}
        originalMessageId={forwardMessage?.originalMessageId}
        originalDate={forwardMessage?.originalDate}
        isTaskForward={forwardMessage?.isTaskForward}
        taskToken={forwardMessage?.taskToken}
      />
    </div>
    </div>
  );
}

export default function ChannelsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>}>
      <ChannelsPageContent />
    </Suspense>
  );
}

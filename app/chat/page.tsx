'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { ConversationList, ConversationItem } from '@/components/chat/ConversationList';
import { MessageThread } from '@/components/chat/MessageThread';
import { MessageInput } from '@/components/chat/MessageInput';
import { NewDMModal } from '@/components/chat/NewDMModal';

interface Attachment {
    url: string;
    name: string;
    type: string;
    size: number;
    isImage: boolean;
}

interface Message {
    id: string;
    content: string;
    attachments?: Attachment[];
    senderId: string;
    senderName: string;
    senderImage: string | null;
    createdAt: string;
}

export default function ChatPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    // State
    const [conversations, setConversations] = useState<ConversationItem[]>([]);
    const [selectedConversation, setSelectedConversation] = useState<ConversationItem | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loadingConversations, setLoadingConversations] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [showNewDMModal, setShowNewDMModal] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    const messagePollingRef = useRef<NodeJS.Timeout | null>(null);

    // Redirect if not logged in
    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [authLoading, user, router]);

    // Fetch conversations
    const fetchConversations = useCallback(async () => {
        try {
            const res = await fetch('/api/chat/conversations');
            if (res.ok) {
                const data = await res.json();
                setConversations(data);

                // Update selected conversation if it exists
                if (selectedConversation) {
                    const updated = data.find((c: ConversationItem) => c.id === selectedConversation.id);
                    if (updated) {
                        setSelectedConversation(updated);
                    }
                }
            }
        } catch {
        } finally {
            setLoadingConversations(false);
        }
    }, [selectedConversation?.id]);

    // Initial load + polling for conversations
    useEffect(() => {
        if (user) {
            fetchConversations();
            pollingRef.current = setInterval(fetchConversations, 5000);
            return () => {
                if (pollingRef.current) clearInterval(pollingRef.current);
            };
        }
    }, [user]);

    // Fetch messages for selected conversation
    const fetchMessages = useCallback(async (conversationId: string, cursor?: string) => {
        try {
            const url = new URL(`/api/chat/conversations/${conversationId}/messages`, window.location.origin);
            if (cursor) url.searchParams.set('cursor', cursor);
            url.searchParams.set('limit', '50');

            const res = await fetch(url.toString());
            if (res.ok) {
                const data = await res.json();
                if (cursor) {
                    // Appending older messages
                    setMessages((prev) => [...data.messages, ...prev]);
                } else {
                    setMessages(data.messages);
                }
                setNextCursor(data.nextCursor);
                setHasMore(!!data.nextCursor);
            }
        } catch {
        } finally {
            setLoadingMessages(false);
        }
    }, []);

    // Poll for new messages in active conversation
    const pollNewMessages = useCallback(async () => {
        if (!selectedConversation) return;

        try {
            const url = new URL(
                `/api/chat/conversations/${selectedConversation.id}/messages`,
                window.location.origin
            );
            url.searchParams.set('limit', '50');

            const res = await fetch(url.toString());
            if (res.ok) {
                const data = await res.json();
                // Only update if we have new messages
                setMessages((prev) => {
                    const existingIds = new Set(prev.map((m) => m.id));
                    const newMessages = data.messages.filter((m: Message) => !existingIds.has(m.id));
                    if (newMessages.length > 0) {
                        return [...prev, ...newMessages];
                    }
                    return prev;
                });
            }
        } catch { }
    }, [selectedConversation?.id]);

    // When selecting a conversation, load messages and mark as read
    useEffect(() => {
        if (selectedConversation) {
            setLoadingMessages(true);
            setMessages([]);
            setNextCursor(null);
            setHasMore(false);
            fetchMessages(selectedConversation.id);

            // Mark as read
            fetch(`/api/chat/conversations/${selectedConversation.id}/read`, {
                method: 'PUT',
            }).then(() => fetchConversations());

            // Poll for new messages every 3 seconds
            messagePollingRef.current = setInterval(pollNewMessages, 3000);

            return () => {
                if (messagePollingRef.current) clearInterval(messagePollingRef.current);
            };
        }
    }, [selectedConversation?.id]);

    // Send message
    const handleSendMessage = async (content: string, attachments?: Attachment[]) => {
        if (!selectedConversation) return;

        try {
            const res = await fetch(
                `/api/chat/conversations/${selectedConversation.id}/messages`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content, attachments }),
                }
            );

            if (res.ok) {
                const newMessage = await res.json();
                setMessages((prev) => [...prev, newMessage]);
                fetchConversations(); // Refresh conversation list to update preview
            }
        } catch { }
    };

    // Handle new DM user selection
    const handleNewDM = async (otherUserId: string) => {
        setShowNewDMModal(false);

        try {
            const res = await fetch('/api/chat/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ otherUserId }),
            });

            if (res.ok) {
                const data = await res.json();
                await fetchConversations();

                // Find and select the conversation
                const conv = conversations.find((c) => c.id === data.id);
                if (conv) {
                    setSelectedConversation(conv);
                } else {
                    // Newly created - refresh and select
                    const freshRes = await fetch('/api/chat/conversations');
                    if (freshRes.ok) {
                        const freshData = await freshRes.json();
                        setConversations(freshData);
                        const newConv = freshData.find((c: ConversationItem) => c.id === data.id);
                        if (newConv) setSelectedConversation(newConv);
                    }
                }
            }
        } catch { }
    };

    // Load more (older) messages
    const handleLoadMore = () => {
        if (selectedConversation && nextCursor) {
            fetchMessages(selectedConversation.id, nextCursor);
        }
    };

    if (authLoading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-4rem)] -m-6 flex">
            {/* Left Panel: Conversation List */}
            <div className="w-[340px] flex-shrink-0 border-r border-slate-200">
                <ConversationList
                    conversations={conversations}
                    selectedId={selectedConversation?.id || null}
                    currentUserId={user?.id || ''}
                    onSelect={setSelectedConversation}
                    onNewDM={() => setShowNewDMModal(true)}
                    loading={loadingConversations}
                />
            </div>

            {/* Right Panel: Message Thread */}
            <div className="flex-1 flex flex-col bg-white min-w-0">
                {selectedConversation ? (
                    <>
                        {/* Chat Header */}
                        <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-200 flex-shrink-0">
                            {/* Mobile back button */}
                            <button
                                onClick={() => setSelectedConversation(null)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors lg:hidden"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>

                            {/* User info */}
                            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                {selectedConversation.otherUser?.image ? (
                                    <img
                                        src={selectedConversation.otherUser.image}
                                        alt=""
                                        className="w-full h-full rounded-full object-cover"
                                    />
                                ) : (
                                    <span className="text-sm font-bold text-indigo-700">
                                        {selectedConversation.otherUser?.name?.charAt(0).toUpperCase() || '?'}
                                    </span>
                                )}
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">
                                    {selectedConversation.otherUser?.name || 'Unknown'}
                                </h3>
                                <p className="text-xs text-slate-400">
                                    {selectedConversation.otherUser?.email}
                                </p>
                            </div>
                        </div>

                        {/* Messages */}
                        <MessageThread
                            messages={messages}
                            currentUserId={user?.id || ''}
                            otherUserName={selectedConversation.otherUser?.name || 'Unknown'}
                            loading={loadingMessages}
                            hasMore={hasMore}
                            onLoadMore={handleLoadMore}
                        />

                        {/* Input */}
                        <MessageInput
                            otherUserName={selectedConversation.otherUser?.name || 'Unknown'}
                            onSend={handleSendMessage}
                        />
                    </>
                ) : (
                    /* No conversation selected */
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center mb-5">
                            <MessageCircle className="w-10 h-10 text-indigo-400" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-700 mb-2">Your Messages</h3>
                        <p className="text-sm text-slate-400 mb-6 text-center max-w-xs">
                            Select a conversation to start chatting, or create a new one to connect with your teammates.
                        </p>
                        <button
                            onClick={() => setShowNewDMModal(true)}
                            className="px-6 py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20"
                        >
                            Start a New Chat
                        </button>
                    </div>
                )}
            </div>

            {/* New DM Modal */}
            <NewDMModal
                open={showNewDMModal}
                onClose={() => setShowNewDMModal(false)}
                onSelectUser={handleNewDM}
            />
        </div>
    );
}

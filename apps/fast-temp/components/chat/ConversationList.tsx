'use client';

import { Search, Plus, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { htmlToPlainText } from '@/lib/sanitize';

interface ConversationUser {
    id: string;
    name: string;
    image: string | null;
    email: string;
}

interface LastMessage {
    id: string;
    content: string;
    senderId: string;
    senderName: string;
    createdAt: string;
}

export interface ConversationItem {
    id: string;
    otherUser: ConversationUser | null;
    lastMessage: LastMessage | null;
    unreadCount: number;
    lastReadAt: string | null;
    updatedAt: string;
}

interface ConversationListProps {
    conversations: ConversationItem[];
    selectedId: string | null;
    currentUserId: string;
    onSelect: (conversation: ConversationItem) => void;
    onNewDM: () => void;
    loading: boolean;
}

// Build the DM list preview. The stored content is rich HTML (mention chips,
// formatting tags, optional forward marker) — we strip the HTML so the user
// sees readable text like "@ca hi" instead of `<span class="mention-chip"...>`.
function previewLastMessage(raw: string): string {
    const fwdMatch = raw.match(/<!--forward:(.*?)-->/s);
    if (fwdMatch) {
        try {
            const fwd = JSON.parse(fwdMatch[1]);
            const userMsg = htmlToPlainText(raw.replace(/<!--forward:.*?-->/s, '').trim());
            const author = fwd?.author || 'someone';
            return userMsg ? `${userMsg} — Forwarded from ${author}` : `📤 Forwarded from ${author}`;
        } catch {}
    }
    return htmlToPlainText(raw);
}

function timeAgo(d: string) {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ConversationList({
    conversations,
    selectedId,
    currentUserId,
    onSelect,
    onNewDM,
    loading,
}: ConversationListProps) {
    const [searchQuery, setSearchQuery] = useState('');

    const filtered = conversations.filter((c) =>
        c.otherUser?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.otherUser?.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-white border-r border-slate-200">
            {/* Header */}
            <div className="p-4 border-b border-slate-200">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-slate-800">Direct Messages</h2>
                    <button
                        onClick={onNewDM}
                        className="p-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm"
                        title="New message"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Find a conversation..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                    />
                </div>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
                        <p className="text-sm">Loading conversations...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 px-4">
                        <MessageCircle className="w-10 h-10 mb-3 text-slate-300" />
                        <p className="text-sm font-medium text-slate-500">
                            {searchQuery ? 'No conversations found' : 'No messages yet'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1 text-center">
                            {searchQuery
                                ? 'Try a different search term'
                                : 'Start a new conversation to chat with your teammates'}
                        </p>
                        {!searchQuery && (
                            <button
                                onClick={onNewDM}
                                className="mt-4 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
                            >
                                Start a Chat
                            </button>
                        )}
                    </div>
                ) : (
                    filtered.map((conv) => {
                        const isSelected = selectedId === conv.id;
                        const user = conv.otherUser;
                        const lastMsg = conv.lastMessage;
                        const isOwnMessage = lastMsg?.senderId === currentUserId;

                        return (
                            <button
                                key={conv.id}
                                onClick={() => onSelect(conv)}
                                className={cn(
                                    'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all duration-150 border-b border-slate-100',
                                    isSelected
                                        ? 'bg-indigo-50 border-l-[3px] border-l-indigo-600'
                                        : 'hover:bg-slate-50 border-l-[3px] border-l-transparent'
                                )}
                            >
                                {/* Avatar */}
                                <div className="relative flex-shrink-0">
                                    <div className={cn(
                                        'w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm',
                                        isSelected
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-indigo-100 text-indigo-700'
                                    )}>
                                        {user?.image ? (
                                            <img src={user.image} alt="" className="w-full h-full rounded-full object-cover" />
                                        ) : (
                                            user?.name?.charAt(0).toUpperCase() || '?'
                                        )}
                                    </div>
                                    {conv.unreadCount > 0 && (
                                        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center px-1.5 text-[10px] font-bold bg-rose-500 text-white rounded-full shadow-sm">
                                            {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                                        </span>
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-0.5">
                                        <span className={cn(
                                            'text-sm truncate',
                                            conv.unreadCount > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'
                                        )}>
                                            {user?.name || 'Unknown User'}
                                        </span>
                                        {lastMsg && (
                                            <span className="text-[11px] text-slate-400 flex-shrink-0 ml-2">
                                                {timeAgo(lastMsg.createdAt)}
                                            </span>
                                        )}
                                    </div>
                                    {lastMsg ? (
                                        <p className={cn(
                                            'text-xs truncate',
                                            conv.unreadCount > 0 ? 'text-slate-700 font-medium' : 'text-slate-500'
                                        )}>
                                            {isOwnMessage && <span className="text-slate-400">You: </span>}
                                            {previewLastMessage(lastMsg.content)}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-slate-400 italic">No messages yet</p>
                                    )}
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}

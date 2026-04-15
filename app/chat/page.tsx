'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, Send, Hash, User, Search, AlertCircle, RefreshCw, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Space {
    name: string;
    displayName: string;
    type: string;
    spaceType: string;
    threaded: boolean;
}

interface Message {
    name: string;
    text: string;
    sender: string;
    senderType: string;
    createTime: string;
    threadName: string | null;
    threadReply: boolean;
}

function formatChatTime(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return time;
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 86400000 * 2) return `Yesterday ${time}`;
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

export default function GoogleChatPage() {
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [connected, setConnected] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showNewChat, setShowNewChat] = useState(false);
    const [teammates, setTeammates] = useState<{ id: string; name: string; email: string }[]>([]);
    const [newChatSearch, setNewChatSearch] = useState('');
    const [creatingDm, setCreatingDm] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Fetch teammates for new chat
    const fetchTeammates = useCallback(async () => {
        try {
            const res = await fetch('/api/users/public');
            if (res.ok) {
                const data = await res.json();
                setTeammates(data.map((u: any) => ({ id: u.id, name: u.name, email: u.email })));
            }
        } catch {}
    }, []);

    const [dmError, setDmError] = useState<string | null>(null);

    const handleStartDm = async (email: string, name: string) => {
        setCreatingDm(true);
        setDmError(null);
        try {
            const res = await fetch('/api/google-chat/dm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();
            if (res.ok) {
                setShowNewChat(false);
                setNewChatSearch('');
                await fetchSpaces();
                setSelectedSpace({ ...data, displayName: data.displayName || name, threaded: false });
            } else {
                setDmError(data.error || 'Failed to create chat');
            }
        } catch {
            setDmError('Network error. Please try again.');
        }
        setCreatingDm(false);
    };

    const handleReconnectGoogle = async () => {
        // Disconnect first
        await fetch('/api/auth/google/disconnect', { method: 'POST' });
        // Then redirect to OAuth
        const res = await fetch('/api/auth/google');
        if (res.ok) {
            const data = await res.json();
            window.location.href = data.url;
        }
    };

    const fetchSpaces = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/google-chat/spaces');
            if (res.ok) {
                const data = await res.json();
                setSpaces(data.spaces || []);
                setConnected(true);
            } else {
                setError('Failed to load Google Chat. Make sure Google Chat API is enabled and reconnect your Google account.');
                setConnected(false);
            }
        } catch {
            setError('Failed to connect to Google Chat');
            setConnected(false);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchSpaces(); }, [fetchSpaces]);

    const fetchMessages = useCallback(async (spaceName: string) => {
        setMessagesLoading(true);
        try {
            const res = await fetch(`/api/google-chat/messages?space=${encodeURIComponent(spaceName)}`);
            if (res.ok) {
                const data = await res.json();
                setMessages((data.messages || []).reverse());
            }
        } catch {}
        setMessagesLoading(false);
    }, []);

    useEffect(() => {
        if (selectedSpace) {
            fetchMessages(selectedSpace.name);
            const interval = setInterval(() => fetchMessages(selectedSpace.name), 10000);
            return () => clearInterval(interval);
        }
    }, [selectedSpace, fetchMessages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!selectedSpace || !newMessage.trim() || sending) return;
        setSending(true);
        try {
            const res = await fetch('/api/google-chat/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ space: selectedSpace.name, text: newMessage.trim() }),
            });
            if (res.ok) {
                setNewMessage('');
                await fetchMessages(selectedSpace.name);
            }
        } catch {}
        setSending(false);
    };

    const filteredSpaces = searchQuery
        ? spaces.filter(s => s.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
        : spaces;
    const dmSpaces = filteredSpaces.filter(s => s.type === 'DM' || s.spaceType === 'DIRECT_MESSAGE');
    const roomSpaces = filteredSpaces.filter(s => s.type !== 'DM' && s.spaceType !== 'DIRECT_MESSAGE');

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !connected) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
                <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-amber-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Google Chat Not Connected</h2>
                <p className="text-sm text-slate-500 text-center max-w-md">
                    {error || 'To use Google Chat, reconnect your Google account with Chat permissions.'}
                </p>
                <div className="text-center">
                    <p className="text-xs text-slate-400 mb-2">Setup steps:</p>
                    <ol className="text-xs text-slate-500 text-left space-y-1">
                        <li>1. Enable <strong>Google Chat API</strong> in GCP Console</li>
                        <li>2. Add Chat scopes to OAuth consent screen</li>
                        <li>3. Reconnect Google account from Calendar Meeting section</li>
                    </ol>
                </div>
                <div className="flex gap-3">
                    <button onClick={handleReconnectGoogle} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700">
                        Reconnect Google Account
                    </button>
                    <button onClick={fetchSpaces} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-200">
                        <RefreshCw className="w-4 h-4" /> Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-100px)] -mx-6 -my-6">
            {/* Spaces List */}
            <div className="w-72 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
                <div className="p-4 border-b border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <MessageCircle className="w-5 h-5 text-indigo-500" />
                            Google Chat
                        </h2>
                        <button
                            onClick={() => { setShowNewChat(true); if (teammates.length === 0) fetchTeammates(); }}
                            className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                            title="New Chat"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search conversations..."
                            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {roomSpaces.length > 0 && (
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 pt-3 pb-1">Spaces</p>
                            {roomSpaces.map(space => (
                                <button
                                    key={space.name}
                                    onClick={() => setSelectedSpace(space)}
                                    className={cn(
                                        'w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors',
                                        selectedSpace?.name === space.name ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'
                                    )}
                                >
                                    <Hash className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                    <span className="text-sm font-medium truncate">{space.displayName}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {dmSpaces.length > 0 && (
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-4 pt-3 pb-1">Direct Messages</p>
                            {dmSpaces.map(space => (
                                <button
                                    key={space.name}
                                    onClick={() => setSelectedSpace(space)}
                                    className={cn(
                                        'w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors',
                                        selectedSpace?.name === space.name ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'
                                    )}
                                >
                                    <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                    <span className="text-sm font-medium truncate">{space.displayName || 'Direct Message'}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {spaces.length === 0 && (
                        <div className="text-center py-12 px-4">
                            <MessageCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                            <p className="text-sm text-slate-500">No conversations yet</p>
                            <p className="text-xs text-slate-400 mt-1 mb-3">Click + to start a new chat, or reconnect if you just enabled Chat API.</p>
                            <button
                                onClick={handleReconnectGoogle}
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 underline"
                            >
                                Reconnect Google Account
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Panel */}
            <div className="flex-1 flex flex-col bg-white">
                {selectedSpace ? (
                    <>
                        <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-3">
                            {selectedSpace.type === 'DM' || selectedSpace.spaceType === 'DIRECT_MESSAGE' ? (
                                <User className="w-5 h-5 text-slate-400" />
                            ) : (
                                <Hash className="w-5 h-5 text-slate-400" />
                            )}
                            <div>
                                <h3 className="text-sm font-semibold text-slate-800">{selectedSpace.displayName || 'Direct Message'}</h3>
                                <p className="text-[10px] text-slate-400">Google Chat</p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                            {messagesLoading && messages.length === 0 ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="text-center py-12">
                                    <MessageCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                                    <p className="text-sm text-slate-500">No messages yet</p>
                                </div>
                            ) : (
                                messages.map((msg) => (
                                    <div key={msg.name} className="flex items-start gap-3">
                                        <div className={cn(
                                            'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0',
                                            msg.senderType === 'BOT' ? 'bg-slate-400' : 'bg-gradient-to-br from-indigo-400 to-purple-500'
                                        )}>
                                            {msg.sender.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-sm font-semibold text-slate-800">{msg.sender}</span>
                                                <span className="text-[10px] text-slate-400">{formatChatTime(msg.createTime)}</span>
                                            </div>
                                            <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap break-words">{msg.text}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="px-5 py-3 border-t border-slate-200">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                                    placeholder={`Message ${selectedSpace.displayName || 'here'}...`}
                                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!newMessage.trim() || sending}
                                    className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center px-8">
                        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                            <MessageCircle className="w-8 h-8 text-indigo-500" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-1">Google Chat</h3>
                        <p className="text-sm text-slate-500 max-w-sm text-center">
                            Select a conversation from the left to start chatting. Your Google Chat spaces and direct messages appear here.
                        </p>
                    </div>
                )}
            </div>

            {/* New Chat Modal */}
            {showNewChat && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowNewChat(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-semibold text-slate-900">New Chat</h3>
                            <button onClick={() => setShowNewChat(false)} className="p-1 text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-5 py-3 border-b border-slate-100">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={newChatSearch}
                                    onChange={(e) => setNewChatSearch(e.target.value)}
                                    placeholder="Search by name or email..."
                                    autoFocus
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                        {dmError && (
                            <div className="mx-5 mt-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600">
                                {dmError}
                            </div>
                        )}
                        <div className="flex-1 overflow-y-auto px-2 py-2">
                            {teammates.length === 0 ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : (
                                teammates
                                    .filter(t => t.email.endsWith('@ahacommerce.net'))
                                    .filter(t => {
                                        if (!newChatSearch) return true;
                                        const q = newChatSearch.toLowerCase();
                                        return t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q);
                                    })
                                    .map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => handleStartDm(t.email, t.name)}
                                            disabled={creatingDm}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left disabled:opacity-50"
                                        >
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                                {t.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-slate-800 truncate">{t.name}</p>
                                                <p className="text-xs text-slate-500 truncate">{t.email}</p>
                                            </div>
                                            <MessageCircle className="w-4 h-4 text-slate-300 flex-shrink-0" />
                                        </button>
                                    ))
                            )}
                            {teammates.length > 0 && newChatSearch && teammates.filter(t => {
                                const q = newChatSearch.toLowerCase();
                                return t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q);
                            }).length === 0 && (
                                <p className="text-sm text-slate-400 text-center py-6">No users found</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

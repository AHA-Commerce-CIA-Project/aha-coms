'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useSearchParams } from 'next/navigation';
import { Search, PenSquare, X, Send, Paperclip, Image as ImageIcon, Smile, ChevronLeft, Plus, ClipboardList, Clock, CheckCircle2, Pencil, Trash2, Bookmark } from 'lucide-react';
import { EmojiPicker } from '@/components/chat/EmojiPicker';
import { ChannelMessageComposer } from '@/components/channels/ChannelMessageComposer';
import { ImageLightbox } from '@/components/ImageLightbox';
import { PresenceDot } from '@/components/PresenceDot';
import { linkifyHtml } from '@/lib/linkify';
import { htmlToPlainText } from '@/lib/sanitize';
import { useDrafts } from '@/lib/useDrafts';
import { useAppStore } from '@/lib/store';

interface OtherUser {
    id: string;
    name: string;
    image: string | null;
    email: string;
    lastSeenAt?: string | null;
}

interface ConversationItem {
    id: string;
    otherUser: OtherUser | null;
    lastMessage: { content: string; senderId: string; senderName: string; createdAt: string } | null;
    unreadCount: number;
    // Server returns the participant's lastReadAt in /api/chat/conversations.
    // Captured at click-time so we can anchor scroll on the first unread message
    // even after the read endpoint bumps the value to "now".
    lastReadAt: string | null;
    updatedAt: string;
}

interface DmMessage {
    id: string;
    conversationId: string;
    senderId: string;
    sender: { id: string; name: string; image: string | null };
    content: string;
    attachments: any[];
    createdAt: string;
}

interface UserOption {
    id: string;
    name: string;
    image: string | null;
    email: string;
    role: string;
}

function DmMessageItem({ msg, isOwn, isEdited, images, docs, reactionGroups, onReaction, onEdit, onDelete, onImageClick, onAvatarClick }: {
    msg: DmMessage; isOwn: boolean; isEdited: boolean; images: any[]; docs: any[];
    reactionGroups: Record<string, { emoji: string; users: string[]; hasOwn: boolean }>;
    onReaction: (id: string, emoji: string) => void; onEdit: (id: string, content: string) => void;
    onDelete: (id: string) => void; onImageClick: (url: string) => void;
    onAvatarClick: (userId: string) => void;
}) {
    const [showActions, setShowActions] = useState(false);
    const [showEmoji, setShowEmoji] = useState(false);
    const [editing, setEditing] = useState(false);
    // DM composer now stores rich HTML — convert to plaintext for the edit
    // textarea so the user sees readable text, not raw <div>/<br> markup.
    const [editContent, setEditContent] = useState(htmlToPlainText(msg.content));

    return (
        <div
            id={`dm-msg-${msg.id}`}
            className="group relative px-6 py-2 hover:bg-slate-50 transition-colors"
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => { setShowActions(false); setShowEmoji(false); }}
        >
            {/* Hover action bar */}
            {showActions && !editing && (
                <div className="absolute top-0 right-4 -translate-y-1/2 flex items-center bg-white border border-slate-200 rounded-lg shadow-md z-10">
                    {['✅', '👀', '🙌'].map(emoji => (
                        <button key={emoji} onClick={() => onReaction(msg.id, emoji)}
                            className="p-1 text-base hover:bg-slate-50 transition-colors first:rounded-l-lg hover:scale-125" title={`React ${emoji}`}>
                            {emoji}
                        </button>
                    ))}
                    <div className="relative">
                        <button onClick={() => setShowEmoji(v => !v)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50" title="Add reaction">
                            <Smile className="w-4 h-4" />
                        </button>
                        <EmojiPicker open={showEmoji} position="below" onSelect={emoji => { onReaction(msg.id, emoji); setShowEmoji(false); }} onClose={() => setShowEmoji(false)} />
                    </div>
                    {isOwn && (
                        <>
                            <div className="w-px h-5 bg-slate-200" />
                            <button onClick={() => { setEditing(true); setEditContent(htmlToPlainText(msg.content)); }}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50" title="Edit">
                                <Pencil className="w-4 h-4" />
                            </button>
                        </>
                    )}
                    <button onClick={() => onDelete(msg.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-50 last:rounded-r-lg" title="Delete">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            )}

            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={() => msg.sender?.id && onAvatarClick(msg.sender.id)}
                    className="relative flex-shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    aria-label={`Open profile for ${msg.sender?.name || 'user'}`}
                >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold overflow-hidden">
                        {msg.sender?.image ? (
                            <img src={msg.sender.image} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (msg.sender?.name?.charAt(0) || '?').toUpperCase()}
                    </div>
                </button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="font-bold text-base text-slate-800">{msg.sender?.name || 'Unknown'}</span>
                        <span className="text-xs text-slate-400">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isEdited && <span className="text-xs text-slate-400 italic">(edited)</span>}
                    </div>

                    {editing ? (
                        <div className="mt-1">
                            <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" rows={2} autoFocus
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEdit(msg.id, editContent); setEditing(false); }
                                    if (e.key === 'Escape') setEditing(false);
                                }}
                            />
                            <div className="flex items-center gap-2 mt-1">
                                <button onClick={() => { onEdit(msg.id, editContent); setEditing(false); }}
                                    className="px-2.5 py-1 bg-indigo-600 text-white rounded-md text-xs font-medium hover:bg-indigo-700">Save</button>
                                <button onClick={() => setEditing(false)} className="text-xs text-slate-500">Cancel</button>
                                <span className="text-[10px] text-slate-400">esc to cancel, enter to save</span>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Skip the bubble entirely when content is just contenteditable
                                cruft like "<br><div><br></div>" — common with image-only sends.
                                Without this guard the cruft renders as an empty grey bubble
                                above the attachment. */}
                            {msg.content && htmlToPlainText(msg.content).length > 0 && (
                                /<[a-z][\s\S]*>/i.test(msg.content) ? (
                                    <div
                                        className="text-[15px] text-slate-800 leading-relaxed [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_strike]:line-through [&_s]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:bg-slate-200 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_a]:text-indigo-600 [&_a]:underline [&_a:hover]:text-indigo-700"
                                        dangerouslySetInnerHTML={{ __html: linkifyHtml(msg.content) }}
                                    />
                                ) : (
                                    <p
                                        className="text-[15px] text-slate-800 whitespace-pre-wrap leading-relaxed [&_a]:text-indigo-600 [&_a]:underline [&_a:hover]:text-indigo-700"
                                        dangerouslySetInnerHTML={{ __html: linkifyHtml(msg.content) }}
                                    />
                                )
                            )}
                            {images.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {images.map((img: any, i: number) => (
                                        <button key={i} onClick={() => onImageClick(img.url)} className="rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-300">
                                            <img src={img.url} alt={img.name} className="max-w-[280px] max-h-[200px] object-cover cursor-zoom-in" loading="lazy" />
                                        </button>
                                    ))}
                                </div>
                            )}
                            {docs.length > 0 && (
                                <div className="flex flex-col gap-1 mt-2">
                                    {docs.map((doc: any, i: number) => (
                                        <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-100 w-fit">
                                            <Paperclip className="w-3 h-3" /> {doc.name}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* Reactions */}
                    {Object.keys(reactionGroups).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {Object.values(reactionGroups).map(g => (
                                <button key={g.emoji} onClick={() => onReaction(msg.id, g.emoji)}
                                    title={`${g.users.join(', ')} reacted with ${g.emoji}`}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border-2 transition-all hover:scale-105 ${
                                        g.hasOwn ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                                    }`}>
                                    <span className="text-lg leading-none">{g.emoji}</span>
                                    <span className="font-bold text-sm">{g.users.length}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function formatRelative(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

// DmPane — DM-thread right-pane experience extracted from the old /messages
// page. The unified workspace at /messages renders MessagesIndex (containing
// channels + DMs) on the left and this pane on the right when the URL has
// ?conv=<id> or ?with=<userId>.
export function DmPane() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const [conversations, setConversations] = useState<ConversationItem[]>([]);
    const [channelUnreadTotal, setChannelUnreadTotal] = useState(0);
    const [selected, setSelected] = useState<ConversationItem | null>(null);
    const [messages, setMessages] = useState<DmMessage[]>([]);
    const [loadingConvos, setLoadingConvos] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showUnreadOnly, setShowUnreadOnly] = useState(false);
    const [msgSearch, setMsgSearch] = useState('');
    const [showMsgSearch, setShowMsgSearch] = useState(false);
    const [showNewDm, setShowNewDm] = useState(false);
    const [allUsers, setAllUsers] = useState<UserOption[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [msgInput, setMsgInput] = useState('');
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showEmoji, setShowEmoji] = useState(false);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [mobileShowThread, setMobileShowThread] = useState(false);
    const [showCreateTask, setShowCreateTask] = useState(false);
    const [taskForm, setTaskForm] = useState({ title: '', description: '', urgency: 'P3', dueDate: '', dueDateTime: '' });
    const [taskSubmitting, setTaskSubmitting] = useState(false);
    const msgEndRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const draftIds = useDrafts();
    const setProfileUser = useAppStore((s) => s.setProfileUser);
    // Tracks the conversation we last did the initial scroll for, so the
    // instant-jump-to-bottom only runs once per open instead of on every
    // SSE message tick.
    const initialScrolledRef = useRef<string | null>(null);

    const openProfileForUser = useCallback(async (userId: string) => {
        try {
            const res = await fetch(`/api/users/${userId}`);
            if (res.ok) {
                const profile = await res.json();
                // If the clicked user is the partner of the currently-open DM,
                // hide "Send DM" — that button would just navigate them back to
                // the conversation they're already viewing.
                const hideSendDm = !!selected?.otherUser && selected.otherUser.id === userId;
                setProfileUser(profile, { showAddToConversation: true, hideSendDm });
            }
        } catch {}
    }, [setProfileUser, selected]);

    const fetchConversations = useCallback(async () => {
        try {
            const res = await fetch('/api/chat/conversations');
            if (res.ok) {
                const data = await res.json();
                setConversations(data);
                setLoadingConvos(false);
            }
        } catch {}
    }, []);

    const fetchMessages = useCallback(async (convoId: string) => {
        setLoadingMessages(true);
        try {
            const res = await fetch(`/api/chat/conversations/${convoId}/messages`);
            if (res.ok) {
                const data = await res.json();
                // API returns newest-first for pagination; reverse so render is chronological
                // (oldest at top, newest at bottom) matching standard chat UX.
                const list: any[] = data.messages || data;
                setMessages(Array.isArray(list) ? [...list].reverse() : []);
                // Mark as read — also clears dm_message notifications for this
                // conversation server-side so the bell badge syncs immediately.
                fetch(`/api/chat/conversations/${convoId}/read`, { method: 'PUT' }).catch(() => {});
            }
        } catch {} finally { setLoadingMessages(false); }
    }, []);

    useEffect(() => {
        if (!user) return;
        fetchConversations();
        fetch('/api/chat/users').then(r => r.ok ? r.json() : []).then(setAllUsers).catch(() => {});
    }, [user, fetchConversations]);

    // Poll channel unread total for the Channels tab badge
    useEffect(() => {
        if (!user) return;
        const fetchChannelUnread = async () => {
            try {
                const res = await fetch('/api/channels/unread');
                if (res.ok) {
                    const data = await res.json();
                    setChannelUnreadTotal(data.unreadCount || 0);
                }
            } catch {}
        };
        fetchChannelUnread();
        const interval = setInterval(fetchChannelUnread, 5000);
        return () => clearInterval(interval);
    }, [user]);

    // Auto-open conversation from URL param
    useEffect(() => {
        const withUser = searchParams.get('with');
        const convParam = searchParams.get('conv');
        // No DM target in the URL — clear the active conversation so the
        // SSE for the previous DM tears down. (Without this, a stale SSE
        // would keep streaming a thread the user has navigated away from.)
        if (!withUser && !convParam && !searchParams.get('new')) {
            if (selected) {
                setSelected(null);
                setMessages([]);
            }
            return;
        }
        if (withUser && conversations.length > 0) {
            const existing = conversations.find(c => c.otherUser?.id === withUser);
            if (existing) {
                handleSelectConvo(existing);
            } else {
                startConversation(withUser);
            }
        }
    }, [searchParams, conversations]);

    // Open the user-picker modal when the unified workspace requests a new DM
    // via ?new=1. The modal handles user search + initiates the conversation.
    useEffect(() => {
        if (searchParams.get('new') === '1') setShowNewDm(true);
    }, [searchParams]);

    // SSE for real-time messages
    useEffect(() => {
        if (!selected || !user) return;

        const es = new EventSource(`/api/chat/stream?conversationId=${selected.id}`);
        es.addEventListener('messages', (e) => {
            try {
                const newMsgs: DmMessage[] = JSON.parse(e.data);
                setMessages(prev => {
                    const ids = new Set(prev.map(m => m.id));
                    const unique = newMsgs.filter(m => !ids.has(m.id));
                    if (unique.length > 0) {
                        // Mark as read
                        fetch(`/api/chat/conversations/${selected.id}/read`, { method: 'PUT' }).catch(() => {});
                        return [...prev, ...unique];
                    }
                    return prev;
                });
            } catch {}
        });

        es.addEventListener('unread', () => {
            fetchConversations();
        });

        return () => es.close();
    }, [selected, user, fetchConversations]);

    // Scroll on conversation open / new messages.
    //
    // First render of a conversation: instant jump to bottom (latest message),
    // matching what users expect from chat apps. Subsequent SSE-delivered
    // messages smooth-scroll to bottom too. The instant jump on initial avoids
    // the smooth-scroll-mid-render glitch that previously left the user
    // "in the middle".
    useEffect(() => {
        if (!selected || messages.length === 0) return;

        if (initialScrolledRef.current !== selected.id) {
            initialScrolledRef.current = selected.id;
            requestAnimationFrame(() => {
                msgEndRef.current?.scrollIntoView({ behavior: 'auto' });
            });
            return;
        }

        msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, selected]);

    const handleSelectConvo = (convo: ConversationItem) => {
        // Skip the round-trip if the user clicked the conversation that's
        // already active — prevents an unnecessary SSE teardown + spinner flash.
        if (selected && selected.id === convo.id) return;
        setSelected(convo);
        // Clear immediately so the previous DM's thread doesn't briefly
        // show under the new DM's header during fetch.
        setMessages([]);
        setMobileShowThread(true);
        fetchMessages(convo.id);
    };

    const startConversation = async (otherUserId: string) => {
        try {
            const res = await fetch('/api/chat/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ otherUserId }),
            });
            if (res.ok) {
                const data = await res.json();
                await fetchConversations();
                const convo = { id: data.id, otherUser: data.otherUser, lastMessage: null, unreadCount: 0, lastReadAt: null, updatedAt: new Date().toISOString() };
                handleSelectConvo(convo);
                setShowNewDm(false);
            }
        } catch {}
    };

    const sendMessage = async () => {
        if (!msgInput.trim() || !selected || sending) return;
        setSending(true);
        try {
            const res = await fetch(`/api/chat/conversations/${selected.id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: msgInput.trim() }),
            });
            if (res.ok) {
                setMsgInput('');
                fetchConversations();
            }
        } catch {} finally { setSending(false); }
    };

    const handleFileUpload = async (file: File) => {
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const uploadRes = await fetch('/api/chat/upload', { method: 'POST', body: fd });
            if (!uploadRes.ok) return;
            const uploadData = await uploadRes.json();

            await fetch(`/api/chat/conversations/${selected!.id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: file.type.startsWith('image/') ? '' : file.name,
                    attachments: [{ url: uploadData.url, name: uploadData.name || file.name, type: file.type, size: file.size, isImage: file.type.startsWith('image/') }],
                }),
            });
            fetchConversations();
        } catch {} finally { setUploading(false); }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) handleFileUpload(file);
                return;
            }
        }
    };

    const handleReaction = async (msgId: string, emoji: string) => {
        if (!selected) return;
        await fetch(`/api/chat/conversations/${selected.id}/messages/${msgId}/reactions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }),
        });
        fetchMessages(selected.id);
    };

    const handleEditMsg = async (msgId: string, content: string) => {
        if (!selected) return;
        await fetch(`/api/chat/conversations/${selected.id}/messages/${msgId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
        });
        fetchMessages(selected.id);
    };

    const handleDeleteMsg = async (msgId: string) => {
        if (!selected || !confirm('Delete this message?')) return;
        await fetch(`/api/chat/conversations/${selected.id}/messages/${msgId}`, { method: 'DELETE' });
        fetchMessages(selected.id);
    };

    const handleCreateTask = async () => {
        if (!taskForm.title.trim() || !selected || taskSubmitting) return;
        setTaskSubmitting(true);
        try {
            const res = await fetch(`/api/chat/conversations/${selected.id}/create-task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskForm),
            });
            if (res.ok) {
                setShowCreateTask(false);
                setTaskForm({ title: '', description: '', urgency: 'P3', dueDate: '', dueDateTime: '' });
                fetchConversations();
            }
        } catch {} finally { setTaskSubmitting(false); }
    };

    const filtered = conversations.filter(c => {
        if (showUnreadOnly && c.unreadCount === 0) return false;
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return c.otherUser?.name.toLowerCase().includes(q) || c.lastMessage?.content.toLowerCase().includes(q);
    });

    const filteredMessages = messages.filter(m => {
        if (!msgSearch) return true;
        return (m.content || '').toLowerCase().includes(msgSearch.toLowerCase());
    });

    const filteredUsers = allUsers.filter(u => {
        if (!userSearch) return true;
        return u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email || ''.toLowerCase().includes(userSearch.toLowerCase());
    });

    return (
        <div className="flex bg-white flex-1 min-h-0 overflow-hidden">
            {/* DM thread — the unified /messages workspace renders the
                 conversation list (MessagesIndex) on the left, so this pane
                 is just the active thread + composer. */}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                {selected ? (
                    <>
                        {/* Header */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
                            <button onClick={() => setMobileShowThread(false)} className="md:hidden p-1 text-slate-400">
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => selected.otherUser?.id && openProfileForUser(selected.otherUser.id)}
                                className="relative flex-shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                aria-label={`Open profile for ${selected.otherUser?.name || 'user'}`}
                            >
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold overflow-hidden">
                                    {selected.otherUser?.image ? (
                                        <img src={selected.otherUser.image} alt="" className="w-9 h-9 rounded-full object-cover" />
                                    ) : (
                                        selected.otherUser?.name?.charAt(0).toUpperCase() || '?'
                                    )}
                                </div>
                                <PresenceDot lastSeenAt={selected.otherUser?.lastSeenAt} />
                            </button>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-900 truncate">{selected.otherUser?.name}</p>
                                <p className="text-xs text-slate-400 truncate">{selected.otherUser?.email}</p>
                            </div>
                            <button
                                onClick={() => setShowCreateTask(true)}
                                title={`Assign task to ${selected.otherUser?.name || ''}`}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-lg transition-colors"
                            >
                                <ClipboardList className="w-3.5 h-3.5" /> Assign Task
                            </button>
                            <button
                                onClick={() => { setShowMsgSearch(v => !v); if (showMsgSearch) setMsgSearch(''); }}
                                className={`p-2 rounded-lg transition-colors ${showMsgSearch ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'}`}
                                title="Search messages in this conversation"
                            >
                                <Search className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => { setSelected(null); setMessages([]); setMsgSearch(''); setShowMsgSearch(false); setMobileShowThread(false); }}
                                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Close conversation"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {showMsgSearch && (
                            <div className="px-4 py-2 border-b border-slate-200 bg-slate-50">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        value={msgSearch}
                                        onChange={e => setMsgSearch(e.target.value)}
                                        placeholder={`Search messages with ${selected.otherUser?.name || ''}...`}
                                        autoFocus
                                        className="w-full pl-10 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                                    />
                                    {msgSearch && (
                                        <button
                                            onClick={() => setMsgSearch('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                                            title="Clear search"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                {msgSearch && (
                                    <p className="mt-1.5 text-[11px] text-slate-500">
                                        {filteredMessages.length} {filteredMessages.length === 1 ? 'match' : 'matches'} in this conversation
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Messages — Slack-style left-aligned */}
                        <div className="flex-1 min-h-0 overflow-y-auto pt-6">
                            {loadingMessages ? (
                                <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
                            ) : messages.length === 0 ? (
                                <div className="text-center py-16">
                                    <p className="text-slate-500 text-sm">No messages yet. Say hello!</p>
                                </div>
                            ) : filteredMessages.length === 0 ? (
                                <div className="text-center py-16">
                                    <p className="text-slate-500 text-sm">No messages match &ldquo;{msgSearch}&rdquo;</p>
                                    <button onClick={() => setMsgSearch('')} className="mt-2 text-sm text-indigo-600 hover:underline">Clear search</button>
                                </div>
                            ) : (() => {
                                const rendered: React.ReactNode[] = [];
                                let lastDate = '';
                                for (const msg of filteredMessages) {
                                    const msgDate = new Date(msg.createdAt).toDateString();
                                    if (msgDate !== lastDate) {
                                        rendered.push(
                                            <div key={`divider-${msg.id}`} className="flex items-center gap-4 px-6 py-3">
                                                <div className="flex-1 h-px bg-slate-200" />
                                                <span className="text-xs font-medium text-slate-400">{formatDateDivider(msg.createdAt)}</span>
                                                <div className="flex-1 h-px bg-slate-200" />
                                            </div>
                                        );
                                        lastDate = msgDate;
                                    }

                                    const msgType = (msg as any).type || 'text';
                                    const snapshot = (msg as any).taskSnapshot as any;

                                    if (msgType === 'status_update') {
                                        rendered.push(
                                            <div key={msg.id} id={`dm-msg-${msg.id}`} className="flex justify-center py-2">
                                                <span className="text-[11px] text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
                                                    {msg.content || 'Task updated'} · {formatTime(msg.createdAt)}
                                                </span>
                                            </div>
                                        );
                                        continue;
                                    }

                                    if (msgType === 'task_card' && snapshot) {
                                        const urgencyColors: Record<string, string> = { P1: 'bg-rose-500 text-white', P2: 'bg-orange-500 text-white', P3: 'bg-amber-400 text-white', P4: 'bg-emerald-500 text-white', '5-minute': 'bg-sky-400 text-white' };
                                        const statusLabels: Record<string, { label: string; color: string }> = { todo: { label: 'New', color: 'text-sky-600 bg-sky-50' }, 'in-progress': { label: 'In Progress', color: 'text-indigo-600 bg-indigo-50' }, done: { label: 'Completed', color: 'text-emerald-600 bg-emerald-50' } };
                                        const st = statusLabels[snapshot.status] || statusLabels.todo;
                                        rendered.push(
                                            <div key={msg.id} id={`dm-msg-${msg.id}`} className="px-6 py-3">
                                                <div className="max-w-md bg-white border-2 border-indigo-200 rounded-2xl p-4 shadow-sm">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <ClipboardList className="w-4 h-4 text-indigo-500" />
                                                        <span className="text-xs font-semibold text-indigo-500">Task Created</span>
                                                        <span className="text-[10px] text-slate-400 ml-auto">{formatTime(msg.createdAt)}</span>
                                                    </div>
                                                    <div className="flex items-start gap-2 mb-2">
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${urgencyColors[snapshot.urgency] || 'bg-slate-200'}`}>{snapshot.urgency || 'P3'}</span>
                                                        <h4 className="text-sm font-bold text-slate-900 flex-1">{snapshot.title}</h4>
                                                    </div>
                                                    <div className="flex items-center justify-between text-xs text-slate-500">
                                                        <span>Assigned to: <strong className="text-slate-700">{snapshot.assigneeName}</strong></span>
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.color}`}>{st.label}</span>
                                                    </div>
                                                    {snapshot.dueDate && (
                                                        <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                                                            <Clock className="w-3 h-3" />
                                                            <span>Deadline: {new Date(snapshot.dueDate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                                                        </div>
                                                    )}
                                                    <div className="mt-3 pt-2 border-t border-slate-100">
                                                        <a href={`/nexus?task=${snapshot.id}&action=view`} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">View Details →</a>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                        continue;
                                    }

                                    const attachments = (Array.isArray(msg.attachments) ? msg.attachments : []) as any[];
                                    const images = attachments.filter((a: any) => a?.isImage);
                                    const docs = attachments.filter((a: any) => a && !a.isImage);
                                    const isOwn = msg.senderId === user?.id;
                                    const reactions = (msg as any).reactions || [];
                                    const isEdited = (msg as any).isEdited || false;

                                    const reactionGroups: Record<string, { emoji: string; users: string[]; hasOwn: boolean }> = {};
                                    reactions.forEach((r: any) => {
                                        if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = { emoji: r.emoji, users: [], hasOwn: false };
                                        reactionGroups[r.emoji].users.push(r.user?.name || '?');
                                        if (r.userId === user?.id) reactionGroups[r.emoji].hasOwn = true;
                                    });

                                    rendered.push(
                                        <DmMessageItem
                                            key={msg.id}
                                            msg={msg}
                                            isOwn={isOwn}
                                            isEdited={isEdited}
                                            images={images}
                                            docs={docs}
                                            reactionGroups={reactionGroups}
                                            onReaction={handleReaction}
                                            onEdit={handleEditMsg}
                                            onDelete={handleDeleteMsg}
                                            onImageClick={setLightboxUrl}
                                            onAvatarClick={openProfileForUser}
                                        />
                                    );
                                }
                                return rendered;
                            })()}
                            <div ref={msgEndRef} />
                        </div>

                        {/* Composer — Channel-style with rich text */}
                        <div className="border-t border-slate-200">
                            <ChannelMessageComposer
                                channelId={selected.id}
                                channelName={selected.otherUser?.name || 'DM'}
                                users={[]}
                                onSend={async (content, attachments) => {
                                    try {
                                        await fetch(`/api/chat/conversations/${selected.id}/messages`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ content, attachments }),
                                        });
                                        fetchConversations();
                                    } catch {}
                                }}
                                placeholder={`Message ${selected.otherUser?.name || ''}...`}
                            />
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <PenSquare className="w-7 h-7 text-indigo-400" />
                            </div>
                            <p className="text-slate-500 text-sm">Select a conversation or start a new one</p>
                        </div>
                    </div>
                )}
            </div>

            {/* New DM modal */}
            {showNewDm && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowNewDm(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900">New Message</h3>
                            <button onClick={() => setShowNewDm(false)} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="px-5 py-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={userSearch}
                                    onChange={e => setUserSearch(e.target.value)}
                                    placeholder="Search by name or email..."
                                    autoFocus
                                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                        </div>
                        <div className="max-h-80 overflow-y-auto pb-2">
                            {filteredUsers.map(u => (
                                <button
                                    key={u.id}
                                    onClick={() => startConversation(u.id)}
                                    className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-indigo-50 transition-colors text-left"
                                >
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                                        {u.image ? <img src={u.image} alt="" className="w-9 h-9 rounded-full object-cover" /> : u.name?.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-800 truncate">{u.name}</p>
                                        <p className="text-xs text-slate-400 truncate">{u.email || ''}</p>
                                    </div>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : u.role === 'leader' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {u.role === 'admin' ? 'Master' : u.role === 'leader' ? 'Leader' : 'Member'}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Task from DM Modal */}
            {showCreateTask && selected && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !taskSubmitting && setShowCreateTask(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Create Task</h3>
                                <p className="text-xs text-slate-400">Assign to {selected.otherUser?.name}</p>
                            </div>
                            <button onClick={() => setShowCreateTask(false)} disabled={taskSubmitting} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-5 space-y-3">
                            <div>
                                <label className="text-xs font-medium text-slate-600">Title *</label>
                                <input type="text" value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="What needs to be done?" className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Description</label>
                                <textarea value={taskForm.description} onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                                    rows={3} placeholder="Add details..." className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 resize-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-slate-600">Priority</label>
                                    <select value={taskForm.urgency} onChange={e => setTaskForm(f => ({ ...f, urgency: e.target.value }))}
                                        className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500">
                                        <option value="P1">P1 — Urgent</option>
                                        <option value="P2">P2 — High</option>
                                        <option value="P3">P3 — Normal</option>
                                        <option value="P4">P4 — Low</option>
                                        <option value="5-minute">5 Min</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-600">Deadline</label>
                                    <input type="date" value={taskForm.dueDate}
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (val) {
                                                const now = new Date();
                                                setTaskForm(f => ({ ...f, dueDate: val, dueDateTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}` }));
                                            } else {
                                                setTaskForm(f => ({ ...f, dueDate: '', dueDateTime: '' }));
                                            }
                                        }}
                                        className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50">
                            <button onClick={() => setShowCreateTask(false)} disabled={taskSubmitting} className="px-4 py-2 text-sm text-slate-600 rounded-full">Cancel</button>
                            <button onClick={handleCreateTask} disabled={taskSubmitting || !taskForm.title.trim()}
                                className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-full disabled:opacity-40">
                                {taskSubmitting ? 'Creating...' : 'Create & Assign'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Lightbox — closes on ESC (document-level listener) and backdrop click */}
            <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
        </div>
    );
}

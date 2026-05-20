'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth/use-auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, PenSquare, X, Send, Paperclip, Image as ImageIcon, Smile, ChevronLeft, Plus, ClipboardList, Clock, CheckCircle2, Pencil, Trash2, Bookmark } from 'lucide-react';
import { EmojiPicker } from '@/components/chat/EmojiPicker';
import { ChannelMessageComposer } from '@/components/channels/ChannelMessageComposer';
import { DeleteMessageModal } from '@/components/channels/DeleteMessageModal';
import { ImageLightbox } from '@/components/ImageLightbox';
import { PresenceDot } from '@/components/PresenceDot';
import { linkifyHtml } from '@/lib/linkify';
import { htmlToPlainText } from '@/lib/sanitize';
import { useAppStore } from '@/lib/store';
import { useCustomEmojiMap } from '@/lib/customEmojis';
import { renderShortcodes } from '@/lib/renderShortcodes';

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
    lastSeenAt: string | null;
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
    const customEmojiMap = useCustomEmojiMap();
    // DM composer now stores rich HTML — convert to plaintext for the edit
    // textarea so the user sees readable text, not raw <div>/<br> markup.
    const [editContent, setEditContent] = useState(htmlToPlainText(msg.content));

    return (
        <div
            id={`dm-msg-${msg.id}`}
            className="group relative px-6 py-2 hover:bg-slate-50 transition-colors"
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => {
                // Don't close the picker — it's portalled to body and the cursor
                // crosses out of this row to interact with it. Picker has its own
                // outside-click handler.
                if (!showEmoji) setShowActions(false);
            }}
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
                        <EmojiPicker
                            open={showEmoji}
                            position="below"
                            onSelect={(emoji) => {
                                onReaction(msg.id, emoji);
                                setShowEmoji(false);
                                setShowActions(false);
                            }}
                            onClose={() => {
                                setShowEmoji(false);
                                setShowActions(false);
                            }}
                        />
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
                                        dangerouslySetInnerHTML={{ __html: renderShortcodes(linkifyHtml(msg.content), customEmojiMap) }}
                                    />
                                ) : (
                                    <p
                                        className="text-[15px] text-slate-800 whitespace-pre-wrap leading-relaxed [&_a]:text-indigo-600 [&_a]:underline [&_a:hover]:text-indigo-700"
                                        dangerouslySetInnerHTML={{ __html: renderShortcodes(linkifyHtml(msg.content), customEmojiMap) }}
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

// Presence label for the New Message picker. Within 5 minutes of the last
// heartbeat we treat the user as active; beyond that we show a relative
// "last seen N ago" string. Returns plain values so the caller can style.
function presenceLabel(lastSeenAt: string | null): { text: string; active: boolean } {
    if (!lastSeenAt) return { text: 'Offline', active: false };
    const diffMs = Date.now() - new Date(lastSeenAt).getTime();
    const diffMin = diffMs / 60000;
    if (diffMin < 5) return { text: 'Active now', active: true };
    if (diffMin < 60) return { text: `Last seen ${Math.floor(diffMin)}m ago`, active: false };
    const diffHr = diffMin / 60;
    if (diffHr < 24) return { text: `Last seen ${Math.floor(diffHr)}h ago`, active: false };
    const diffDays = diffHr / 24;
    if (diffDays < 7) return { text: `Last seen ${Math.floor(diffDays)}d ago`, active: false };
    return { text: `Last seen ${Math.floor(diffDays / 7)}w ago`, active: false };
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
    const router = useRouter();
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
    // Delete-message modal target — set by the trash icon, cleared on close.
    // Matches the channels surface, which has used DeleteMessageModal since
    // the messaging unification pass; DMs were the last surface still on
    // window.confirm().
    const [deleteTarget, setDeleteTarget] = useState<DmMessage | null>(null);
    const [mobileShowThread, setMobileShowThread] = useState(false);
    const msgEndRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const setProfileUser = useAppStore((s) => s.setProfileUser);
    // Tracks the conversation we last did the initial scroll for, so the
    // instant-jump-to-bottom only runs once per open instead of on every
    // SSE message tick.
    const initialScrolledRef = useRef<string | null>(null);

    const openProfileForUser = useCallback(async (userId: string) => {
        try {
            const res = await fetch(`/fast/api/users/${userId}`);
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
            const res = await fetch('/fast/api/chat/conversations');
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
            const res = await fetch(`/fast/api/chat/conversations/${convoId}/messages`);
            if (res.ok) {
                const data = await res.json();
                // API returns newest-first for pagination; reverse so render is chronological
                // (oldest at top, newest at bottom) matching standard chat UX.
                const list: any[] = data.messages || data;
                setMessages(Array.isArray(list) ? [...list].reverse() : []);
                // Mark as read — also clears dm_message notifications for this
                // conversation server-side so the bell badge syncs immediately.
                fetch(`/fast/api/chat/conversations/${convoId}/read`, { method: 'PUT' }).catch(() => {});
            }
        } catch {} finally { setLoadingMessages(false); }
    }, []);

    useEffect(() => {
        if (!user) return;
        fetchConversations();
        fetch('/fast/api/chat/users').then(r => r.ok ? r.json() : []).then(setAllUsers).catch(() => {});
    }, [user, fetchConversations]);

    // Poll channel unread total for the Channels tab badge
    useEffect(() => {
        if (!user) return;
        const fetchChannelUnread = async () => {
            try {
                const res = await fetch('/fast/api/channels/unread');
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

        const es = new EventSource(`/fast/api/chat/stream?conversationId=${selected.id}`);
        es.addEventListener('messages', (e) => {
            try {
                const newMsgs: DmMessage[] = JSON.parse(e.data);
                setMessages(prev => {
                    const ids = new Set(prev.map(m => m.id));
                    const unique = newMsgs.filter(m => !ids.has(m.id));
                    if (unique.length > 0) {
                        // Mark as read
                        fetch(`/fast/api/chat/conversations/${selected.id}/read`, { method: 'PUT' }).catch(() => {});
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
            const res = await fetch('/fast/api/chat/conversations', {
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
            const res = await fetch(`/fast/api/chat/conversations/${selected.id}/messages`, {
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
            const uploadRes = await fetch('/fast/api/chat/upload', { method: 'POST', body: fd });
            if (!uploadRes.ok) return;
            const uploadData = await uploadRes.json();

            await fetch(`/fast/api/chat/conversations/${selected!.id}/messages`, {
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

    // Optimistic toggle — same pattern as ChannelPane.handleReaction. The
    // POST is idempotent, so failure rolls back by re-toggling locally.
    // Removes the full-conversation refetch the previous shape did, which
    // is what users felt as the 3-5s lag.
    const handleReaction = async (msgId: string, emoji: string) => {
        if (!selected || !user) return;
        const myId = user.id;
        const myName = user.name;

        const toggleLocal = () => {
            setMessages((prev) => prev.map((m) => {
                if (m.id !== msgId) return m;
                const reactions = ((m as any).reactions || []) as { id: string; emoji: string; userId: string; user: { id: string; name: string } }[];
                const idx = reactions.findIndex((r) => r.userId === myId && r.emoji === emoji);
                if (idx >= 0) {
                    return { ...m, reactions: reactions.filter((_, i) => i !== idx) } as any;
                }
                return {
                    ...m,
                    reactions: [
                        ...reactions,
                        {
                            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                            emoji,
                            userId: myId,
                            user: { id: myId, name: myName },
                        },
                    ],
                } as any;
            }));
        };

        toggleLocal();

        try {
            const res = await fetch(`/fast/api/chat/conversations/${selected.id}/messages/${msgId}/reactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emoji }),
            });
            if (!res.ok) toggleLocal();
        } catch {
            toggleLocal();
        }
    };

    const handleEditMsg = async (msgId: string, content: string) => {
        if (!selected) return;
        await fetch(`/fast/api/chat/conversations/${selected.id}/messages/${msgId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
        });
        fetchMessages(selected.id);
    };

    // Hand the target message to the modal — actual DELETE fires from
    // confirmDeleteMsg below once the user clicks Delete in the modal.
    const handleDeleteMsg = (msgId: string) => {
        const target = messages.find((m) => m.id === msgId);
        if (!target) return;
        setDeleteTarget(target);
    };

    const confirmDeleteMsg = async () => {
        if (!selected || !deleteTarget) return;
        try {
            await fetch(
                `/fast/api/chat/conversations/${selected.id}/messages/${deleteTarget.id}`,
                { method: 'DELETE' },
            );
            // Optimistic drop — the SSE stream won't push deletions, so we
            // remove the row locally instead of waiting on a full refetch.
            setMessages((prev) => prev.filter((m) => m.id !== deleteTarget.id));
        } catch {
            // On failure, the row stays; the SSE/30s safety net will
            // reconcile the next time the conversation list refetches.
        }
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
        const q = userSearch.toLowerCase();
        return u.name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
    });

    return (
        <div className="flex bg-white flex-1 min-h-0 overflow-hidden">
            {/* DM thread — the unified /messages workspace renders the
                 conversation list (MessagesIndex) on the left, so this pane
                 is just the active thread + composer. */}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                {selected ? (
                    <>
                        {/* Header — singular top-level header for the DM view.
                            The parent /messages workspace hides its own
                            right-column header bar while in DM mode, so this
                            row sits at y=0 of the right column and matches the
                            standard 52px workspace header height. */}
                        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 min-h-[52px]">
                            <button
                                onClick={() => router.push('/messages')}
                                className="md:hidden flex items-center gap-1 text-sm text-indigo-600 font-medium mr-1"
                            >
                                <ChevronLeft className="w-4 h-4" /> Back
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

                        {/* Composer — Channel-style with rich text. The
                            onSend handler does an optimistic insert into
                            local state before awaiting the POST so the
                            message renders instantly; the DM POST route's
                            side effects (sidebar bump, recipient notif)
                            were deferred to a fire-and-forget block in
                            this same PR, but the optimistic insert is what
                            users actually perceive as "snappy". The SSE
                            'messages' listener dedupes by id, so the same
                            message echoed back through the stream is
                            filtered. On failure we drop the temp row. */}
                        <div className="border-t border-slate-200">
                            <ChannelMessageComposer
                                channelId={selected.id}
                                channelName={selected.otherUser?.name || 'DM'}
                                users={[]}
                                onSend={async (content, attachments) => {
                                    if (!user) return;
                                    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                                    const optimistic: DmMessage = {
                                        id: tempId,
                                        conversationId: selected.id,
                                        senderId: user.id,
                                        sender: { id: user.id, name: user.name, image: user.image },
                                        content,
                                        attachments: attachments ?? [],
                                        createdAt: new Date().toISOString(),
                                    };
                                    setMessages((prev) => [...prev, optimistic]);
                                    try {
                                        const res = await fetch(`/fast/api/chat/conversations/${selected.id}/messages`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ content, attachments }),
                                        });
                                        if (res.ok) {
                                            const real = await res.json();
                                            setMessages((prev) => prev.map((m) => (m.id === tempId ? real : m)));
                                            fetchConversations();
                                        } else {
                                            setMessages((prev) => prev.filter((m) => m.id !== tempId));
                                        }
                                    } catch {
                                        setMessages((prev) => prev.filter((m) => m.id !== tempId));
                                    }
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

            {/* Delete-message modal — same Slack-style preview card as the
                channels surface. Replaces the legacy window.confirm() so the
                DM delete flow is on parity with channel deletes. */}
            {deleteTarget && (
                <DeleteMessageModal
                    open={!!deleteTarget}
                    onClose={() => setDeleteTarget(null)}
                    onConfirm={confirmDeleteMsg}
                    preview={{
                        senderName: deleteTarget.sender?.name ?? 'Deleted User',
                        senderImage: deleteTarget.sender?.image ?? null,
                        createdAt: deleteTarget.createdAt,
                        content: deleteTarget.content,
                        contextLabel: selected?.otherUser?.name
                            ? `Direct Message · ${selected.otherUser.name}`
                            : 'Direct Message',
                    }}
                    kind="message"
                />
            )}

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
                                    {(() => {
                                        const p = presenceLabel(u.lastSeenAt);
                                        return (
                                            <span className={`text-[11px] inline-flex items-center gap-1.5 flex-shrink-0 ${p.active ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                                                {p.active && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                                                {p.text}
                                            </span>
                                        );
                                    })()}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Lightbox — closes on ESC (document-level listener) and backdrop click */}
            <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
        </div>
    );
}

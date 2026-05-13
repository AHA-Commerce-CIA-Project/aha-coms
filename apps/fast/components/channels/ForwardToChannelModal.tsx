'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Hash, Search, Send, Loader2, MessageSquare } from 'lucide-react';
import { htmlToPlainText } from '@/lib/sanitize';
import { cn } from '@/lib/utils';

interface Channel {
    id: string;
    name: string;
}

interface DMUser {
    id: string;
    name: string;
    email: string;
    image: string | null;
    teamName?: string | null;
}

type Target =
    | { kind: 'channel'; channel: Channel }
    | { kind: 'user'; user: DMUser };

interface ForwardToChannelModalProps {
    open: boolean;
    onClose: () => void;
    // Original message data
    originalAuthor: string;
    originalAuthorImage?: string | null;
    originalContent: string;
    originalAttachments?: any[];
    originalChannelName?: string;
    originalDate?: string;
    originalMessageId?: string;
    originalChannelId?: string;
    // For task forwards
    isTaskForward?: boolean;
    taskToken?: string;
    // Used to render the forwarded task as a real DirectAssignCard at the
    // destination — without it the receiver only sees a plain text quote.
    taskId?: string;
}

export function ForwardToChannelModal({
    open, onClose,
    originalAuthor, originalAuthorImage, originalContent, originalAttachments = [],
    originalChannelName, originalDate, originalMessageId, originalChannelId,
    isTaskForward, taskToken, taskId,
}: ForwardToChannelModalProps) {
    const [tab, setTab] = useState<'channel' | 'dm'>('channel');
    const [channels, setChannels] = useState<Channel[]>([]);
    const [users, setUsers] = useState<DMUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<Target | null>(null);
    const [additionalMessage, setAdditionalMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const sendingRef = useRef(false);

    useEffect(() => {
        if (open) {
            setLoading(true);
            setSent(false);
            setSearch('');
            setSelected(null);
            setAdditionalMessage('');
            setError(null);
            setTab('channel');
            sendingRef.current = false;
            Promise.all([
                fetch('/fast/api/channels').then(r => r.ok ? r.json() : []).catch(() => []),
                fetch('/fast/api/chat/users').then(r => r.ok ? r.json() : []).catch(() => []),
            ])
                .then(([chs, us]) => {
                    setChannels(chs);
                    setUsers(us);
                })
                .finally(() => setLoading(false));
        }
    }, [open]);

    // Reset search/selection when switching tabs.
    useEffect(() => {
        setSearch('');
        setSelected(null);
    }, [tab]);

    const handleForward = async () => {
        if (!selected || sendingRef.current || sent) return;
        sendingRef.current = true;
        setSending(true);
        setError(null);

        // Strip any nested HTML-comment markers from the inner content before
        // we stuff it into the forward meta. The outer forward marker is
        // delimited by `-->`, and the consumer regex (`<!--forward:(.*?)-->`)
        // is non-greedy — so leaving an inner `<!--direct_assign:UUID-->`
        // (or another `<!--forward:-->`) inside the content would terminate
        // the capture early and break JSON parsing at the receiver.
        const sanitizedContent = (originalContent || '')
            .replace(/<!--forward:.*?-->/sg, '')
            .replace(/<!--direct_assign:[^\s>]+?-->/g, '')
            .trim();

        const forwardMeta = JSON.stringify({
            type: 'forward',
            author: originalAuthor,
            content: sanitizedContent,
            channelName: originalChannelName || null,
            date: originalDate || new Date().toISOString(),
            messageId: originalMessageId || null,
            channelId: originalChannelId || null,
            isTask: isTaskForward || false,
            taskToken: taskToken || null,
            // Task id lets the receiving channel/DM render a live DirectAssignCard
            // (with claim/complete buttons) instead of a static text quote.
            taskId: taskId || null,
        });

        const messageContent = additionalMessage.trim()
            ? `${additionalMessage.trim()}\n<!--forward:${forwardMeta}-->`
            : `<!--forward:${forwardMeta}-->`;

        try {
            let res: Response;
            if (selected.kind === 'channel') {
                res = await fetch(`/fast/api/channels/${selected.channel.id}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: messageContent,
                        attachments: originalAttachments,
                        mentions: [],
                    }),
                });
            } else {
                // DM: ensure (or create) the 1-on-1 conversation, then post a message.
                const convRes = await fetch('/fast/api/chat/conversations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ otherUserId: selected.user.id }),
                });
                if (!convRes.ok) {
                    const body = await convRes.json().catch(() => null);
                    setError(body?.error || `Failed to start DM (${convRes.status}).`);
                    sendingRef.current = false;
                    setSending(false);
                    return;
                }
                const conv = await convRes.json();
                res = await fetch(`/fast/api/chat/conversations/${conv.id}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: messageContent,
                        attachments: originalAttachments,
                    }),
                });
            }

            if (res.ok) {
                setSent(true);
                setTimeout(() => onClose(), 500);
                return;
            }
            const body = await res.json().catch(() => null);
            setError(body?.error || `Failed to forward (${res.status}). Please try again.`);
        } catch {
            setError('Network error. Please check your connection and try again.');
        }
        sendingRef.current = false;
        setSending(false);
    };

    const filteredChannels = channels.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );
    const filteredUsers = users.filter((u) => {
        const q = search.toLowerCase();
        return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900">Forward {isTaskForward ? 'Task' : 'Message'}</h3>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                </div>

                {/* Tabs */}
                {!selected && (
                    <div className="flex border-b border-slate-200 px-2">
                        <button
                            onClick={() => setTab('channel')}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                                tab === 'channel'
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700',
                            )}
                        >
                            <Hash className="w-4 h-4" />
                            Channels
                        </button>
                        <button
                            onClick={() => setTab('dm')}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                                tab === 'dm'
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700',
                            )}
                        >
                            <MessageSquare className="w-4 h-4" />
                            Direct Messages
                        </button>
                    </div>
                )}

                {/* Selector */}
                <div className="px-5 py-3 border-b border-slate-200">
                    {!selected ? (
                        <>
                            <div className="relative mb-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder={tab === 'channel' ? 'Search channels...' : 'Search people...'}
                                    autoFocus
                                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-0.5">
                                {loading ? (
                                    <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 text-indigo-400 animate-spin" /></div>
                                ) : tab === 'channel' ? (
                                    filteredChannels.length === 0 ? (
                                        <p className="text-sm text-slate-400 text-center py-4">No channels found</p>
                                    ) : filteredChannels.map(ch => (
                                        <button
                                            key={ch.id}
                                            onClick={() => setSelected({ kind: 'channel', channel: ch })}
                                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors"
                                        >
                                            <Hash className="w-4 h-4 text-slate-400" />
                                            <span className="text-sm text-slate-700">{ch.name}</span>
                                        </button>
                                    ))
                                ) : filteredUsers.length === 0 ? (
                                    <p className="text-sm text-slate-400 text-center py-4">No people found</p>
                                ) : (
                                    filteredUsers.map(u => (
                                        <button
                                            key={u.id}
                                            onClick={() => setSelected({ kind: 'user', user: u })}
                                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors"
                                        >
                                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0 overflow-hidden">
                                                {u.image ? (
                                                    <img src={u.image} alt={u.name} className="w-7 h-7 object-cover" />
                                                ) : (
                                                    u.name.charAt(0).toUpperCase()
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-slate-700 truncate">{u.name}</p>
                                                {u.teamName && <p className="text-[11px] text-slate-400 truncate">{u.teamName}</p>}
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">To:</span>
                            {selected.kind === 'channel' ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 rounded-full text-sm text-indigo-700 font-medium">
                                    <Hash className="w-3 h-3" />{selected.channel.name}
                                    <button onClick={() => setSelected(null)} className="ml-1 text-indigo-400 hover:text-indigo-600"><X className="w-3 h-3" /></button>
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-2 pl-1 pr-3 py-0.5 bg-indigo-50 border border-indigo-200 rounded-full text-sm text-indigo-700 font-medium">
                                    <span className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white flex items-center justify-center text-[10px] font-bold overflow-hidden">
                                        {selected.user.image ? (
                                            <img src={selected.user.image} alt={selected.user.name} className="w-5 h-5 object-cover" />
                                        ) : (
                                            selected.user.name.charAt(0).toUpperCase()
                                        )}
                                    </span>
                                    {selected.user.name}
                                    <button onClick={() => setSelected(null)} className="ml-1 text-indigo-400 hover:text-indigo-600"><X className="w-3 h-3" /></button>
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Additional message */}
                {selected && (
                    <div className="px-5 py-3 border-b border-slate-200">
                        <textarea
                            value={additionalMessage}
                            onChange={e => setAdditionalMessage(e.target.value)}
                            placeholder="Add a message, if you'd like."
                            rows={2}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                        />
                    </div>
                )}

                {/* Original message preview */}
                <div className="px-5 py-4 bg-slate-50">
                    <div className="border-l-4 border-indigo-400 bg-white rounded-r-xl p-3 shadow-sm">
                        <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 overflow-hidden">
                                {originalAuthorImage ? (
                                    <img src={originalAuthorImage} alt={originalAuthor} className="w-6 h-6 object-cover" />
                                ) : (
                                    originalAuthor?.charAt(0)?.toUpperCase() || '?'
                                )}
                            </div>
                            <span className="text-sm font-semibold text-slate-800">{originalAuthor}</span>
                        </div>
                        <p className="text-sm text-slate-600 line-clamp-4 whitespace-pre-wrap break-words">
                            {htmlToPlainText((originalContent || '').replace(/<!--forward:.*?-->/s, '')) || ''}
                        </p>
                        {originalAttachments.length > 0 && (
                            <div className="mt-2 flex gap-2">
                                {originalAttachments.filter(a => a.isImage).slice(0, 2).map((a, i) => (
                                    <img key={i} src={a.url} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                                ))}
                                {originalAttachments.filter(a => !a.isImage).length > 0 && (
                                    <span className="text-xs text-slate-400 self-end">{originalAttachments.filter(a => !a.isImage).length} file(s)</span>
                                )}
                            </div>
                        )}
                        {originalChannelName && (
                            <p className="text-[10px] text-slate-400 mt-2">From #{originalChannelName}</p>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-200 bg-white">
                    {error && (
                        <span className="mr-auto text-xs text-rose-600 font-medium">{error}</span>
                    )}
                    <div className="ml-auto">
                        {sent ? (
                            <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-semibold">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                Forwarded!
                            </span>
                        ) : (
                            <button
                                onClick={handleForward}
                                disabled={!selected || sending}
                                className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-2"
                            >
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                {sending ? 'Sending...' : 'Forward'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

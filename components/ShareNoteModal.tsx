'use client';

import { useEffect, useState } from 'react';
import { X, Hash, Search, Send, Loader2, Users, StickyNote, Check } from 'lucide-react';
import { htmlToPlainText } from '@/lib/sanitize';

interface Channel { id: string; name: string }
interface DMUser { id: string; name: string; email: string | null; image: string | null }

interface Props {
    open: boolean;
    onClose: () => void;
    note: { id: string; title: string | null; content: string | null } | null;
}

export function ShareNoteModal({ open, onClose, note }: Props) {
    const [tab, setTab] = useState<'channels' | 'people'>('channels');
    const [channels, setChannels] = useState<Channel[]>([]);
    const [users, setUsers] = useState<DMUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
    const [selectedUser, setSelectedUser] = useState<DMUser | null>(null);
    const [caption, setCaption] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setTab('channels');
        setSearch('');
        setSelectedChannel(null);
        setSelectedUser(null);
        setCaption('');
        setSent(false);
        setError(null);
        setLoading(true);
        Promise.all([
            fetch('/api/channels').then(r => r.ok ? r.json() : []).catch(() => []),
            fetch('/api/chat/users').then(r => r.ok ? r.json() : []).catch(() => []),
        ]).then(([ch, us]) => {
            setChannels(Array.isArray(ch) ? ch : []);
            setUsers(Array.isArray(us) ? us : []);
        }).finally(() => setLoading(false));
    }, [open]);

    const notePlain = htmlToPlainText(note?.content || '').trim();
    const previewTitle = note?.title?.trim() || 'Untitled note';
    const previewSnippet = notePlain.length > 180 ? notePlain.slice(0, 180) + '…' : notePlain;

    const buildMessageContent = () => {
        const head = caption.trim() ? `${caption.trim()}\n\n` : '';
        const bodyPlain = notePlain || '(empty note)';
        return `${head}📌 Note: ${previewTitle}\n\n${bodyPlain}`;
    };

    const handleShare = async () => {
        if (sending) return;
        if (tab === 'channels' && !selectedChannel) return;
        if (tab === 'people' && !selectedUser) return;
        setSending(true);
        setError(null);
        try {
            const content = buildMessageContent();
            let res: Response;
            if (tab === 'channels' && selectedChannel) {
                res = await fetch(`/api/channels/${selectedChannel.id}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content, attachments: [], mentions: [] }),
                });
            } else if (tab === 'people' && selectedUser) {
                const convRes = await fetch('/api/chat/conversations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ otherUserId: selectedUser.id }),
                });
                if (!convRes.ok) {
                    setError('Could not start DM.');
                    setSending(false);
                    return;
                }
                const conv = await convRes.json();
                res = await fetch(`/api/chat/conversations/${conv.id}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content, attachments: [] }),
                });
            } else {
                setSending(false);
                return;
            }
            if (res.ok) {
                setSent(true);
                setTimeout(() => onClose(), 500);
            } else {
                const body = await res.json().catch(() => null);
                setError(body?.error || 'Failed to share.');
            }
        } catch {
            setError('Network error.');
        }
        setSending(false);
    };

    if (!open) return null;

    const filteredChannels = channels.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
    const filteredUsers = users.filter(u => (u.name || '').toLowerCase().includes(search.toLowerCase()) || (u.email || '').toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <StickyNote className="w-4 h-4 text-indigo-500" /> Share Note
                    </h3>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                </div>

                {/* Tabs */}
                <div className="flex items-center border-b border-slate-200">
                    <button
                        onClick={() => { setTab('channels'); setSelectedUser(null); setSearch(''); }}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${tab === 'channels' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}
                    >
                        <Hash className="w-3.5 h-3.5" /> Channels
                    </button>
                    <button
                        onClick={() => { setTab('people'); setSelectedChannel(null); setSearch(''); }}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${tab === 'people' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}
                    >
                        <Users className="w-3.5 h-3.5" /> Direct Message
                    </button>
                </div>

                {/* Target picker */}
                <div className="px-5 py-3 border-b border-slate-200">
                    {!selectedChannel && !selectedUser ? (
                        <>
                            <div className="relative mb-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder={tab === 'channels' ? 'Search channels…' : 'Search people…'}
                                    autoFocus
                                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-0.5">
                                {loading ? (
                                    <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 text-indigo-400 animate-spin" /></div>
                                ) : tab === 'channels' ? (
                                    filteredChannels.length === 0 ? (
                                        <p className="text-sm text-slate-400 text-center py-4">No channels found</p>
                                    ) : filteredChannels.map(ch => (
                                        <button
                                            key={ch.id}
                                            onClick={() => setSelectedChannel(ch)}
                                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors"
                                        >
                                            <Hash className="w-4 h-4 text-slate-400" />
                                            <span className="text-sm text-slate-700">{ch.name}</span>
                                        </button>
                                    ))
                                ) : (
                                    filteredUsers.length === 0 ? (
                                        <p className="text-sm text-slate-400 text-center py-4">No people found</p>
                                    ) : filteredUsers.map(u => (
                                        <button
                                            key={u.id}
                                            onClick={() => setSelectedUser(u)}
                                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors"
                                        >
                                            {u.image ? (
                                                <img src={u.image} alt={u.name} className="w-6 h-6 rounded-full object-cover" />
                                            ) : (
                                                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
                                                    {u.name?.charAt(0)?.toUpperCase() || '?'}
                                                </div>
                                            )}
                                            <span className="text-sm text-slate-700">{u.name}</span>
                                            {u.email && <span className="ml-auto text-[10px] text-slate-400">{u.email}</span>}
                                        </button>
                                    ))
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">To:</span>
                            {selectedChannel && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 rounded-full text-sm text-indigo-700 font-medium">
                                    <Hash className="w-3 h-3" />{selectedChannel.name}
                                    <button onClick={() => setSelectedChannel(null)} className="ml-1 text-indigo-400 hover:text-indigo-600"><X className="w-3 h-3" /></button>
                                </span>
                            )}
                            {selectedUser && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 rounded-full text-sm text-indigo-700 font-medium">
                                    {selectedUser.image ? (
                                        <img src={selectedUser.image} alt={selectedUser.name} className="w-4 h-4 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-4 h-4 rounded-full bg-indigo-200 text-indigo-700 flex items-center justify-center text-[9px] font-bold">
                                            {selectedUser.name?.charAt(0)?.toUpperCase() || '?'}
                                        </div>
                                    )}
                                    {selectedUser.name}
                                    <button onClick={() => setSelectedUser(null)} className="ml-1 text-indigo-400 hover:text-indigo-600"><X className="w-3 h-3" /></button>
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Caption */}
                {(selectedChannel || selectedUser) && (
                    <div className="px-5 py-3 border-b border-slate-200">
                        <textarea
                            value={caption}
                            onChange={e => setCaption(e.target.value)}
                            placeholder="Add a message, if you'd like."
                            rows={2}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                        />
                    </div>
                )}

                {/* Note preview */}
                <div className="px-5 py-4 bg-slate-50">
                    <div className="border-l-4 border-indigo-400 bg-white rounded-r-xl p-3 shadow-sm">
                        <div className="flex items-center gap-2 mb-1.5">
                            <StickyNote className="w-4 h-4 text-amber-500" />
                            <span className="text-sm font-semibold text-slate-800">{previewTitle}</span>
                        </div>
                        {previewSnippet && (
                            <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-4">{previewSnippet}</p>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-200 bg-white">
                    {error && <span className="mr-auto text-xs text-rose-600 font-medium">{error}</span>}
                    <div className="ml-auto">
                        {sent ? (
                            <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-semibold">
                                <Check className="w-4 h-4" /> Shared!
                            </span>
                        ) : (
                            <button
                                onClick={handleShare}
                                disabled={sending || (!selectedChannel && !selectedUser)}
                                className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-2"
                            >
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                {sending ? 'Sharing…' : 'Share'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

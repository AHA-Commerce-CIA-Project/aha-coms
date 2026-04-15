'use client';

import { useState, useEffect } from 'react';
import { X, Hash, Search, Send, Loader2 } from 'lucide-react';

interface Channel {
    id: string;
    name: string;
}

interface ForwardToChannelModalProps {
    open: boolean;
    onClose: () => void;
    // Original message data
    originalAuthor: string;
    originalContent: string;
    originalAttachments?: any[];
    originalChannelName?: string;
    originalDate?: string;
    originalMessageId?: string;
    originalChannelId?: string;
    // For task forwards
    isTaskForward?: boolean;
    taskToken?: string;
}

export function ForwardToChannelModal({
    open, onClose,
    originalAuthor, originalContent, originalAttachments = [],
    originalChannelName, originalDate, originalMessageId, originalChannelId,
    isTaskForward, taskToken,
}: ForwardToChannelModalProps) {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
    const [additionalMessage, setAdditionalMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    useEffect(() => {
        if (open) {
            setLoading(true);
            setSent(false);
            setSearch('');
            setSelectedChannel(null);
            setAdditionalMessage('');
            fetch('/api/channels')
                .then(r => r.ok ? r.json() : [])
                .then(setChannels)
                .catch(() => {})
                .finally(() => setLoading(false));
        }
    }, [open]);

    const handleForward = async () => {
        if (!selectedChannel) return;
        setSending(true);

        // Build the forwarded message content as JSON metadata embedded in a special format
        const forwardMeta = JSON.stringify({
            type: 'forward',
            author: originalAuthor,
            content: originalContent,
            channelName: originalChannelName || null,
            date: originalDate || new Date().toISOString(),
            messageId: originalMessageId || null,
            channelId: originalChannelId || null,
            isTask: isTaskForward || false,
            taskToken: taskToken || null,
        });

        const messageContent = additionalMessage.trim()
            ? `${additionalMessage.trim()}\n<!--forward:${forwardMeta}-->`
            : `<!--forward:${forwardMeta}-->`;

        try {
            const res = await fetch(`/api/channels/${selectedChannel.id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: messageContent,
                    attachments: originalAttachments,
                    mentions: [],
                }),
            });
            if (res.ok) {
                setSent(true);
                setTimeout(() => onClose(), 1000);
            }
        } catch {}
        setSending(false);
    };

    const filtered = channels.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900">Forward {isTaskForward ? 'Task' : 'Message'}</h3>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                </div>

                {/* Channel selector */}
                <div className="px-5 py-3 border-b border-slate-200">
                    {!selectedChannel ? (
                        <>
                            <div className="relative mb-2">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search channels..."
                                    autoFocus
                                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-0.5">
                                {loading ? (
                                    <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 text-indigo-400 animate-spin" /></div>
                                ) : filtered.length === 0 ? (
                                    <p className="text-sm text-slate-400 text-center py-4">No channels found</p>
                                ) : filtered.map(ch => (
                                    <button
                                        key={ch.id}
                                        onClick={() => setSelectedChannel(ch)}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-left transition-colors"
                                    >
                                        <Hash className="w-4 h-4 text-slate-400" />
                                        <span className="text-sm text-slate-700">{ch.name}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">To:</span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 rounded-full text-sm text-indigo-700 font-medium">
                                <Hash className="w-3 h-3" />{selectedChannel.name}
                                <button onClick={() => setSelectedChannel(null)} className="ml-1 text-indigo-400 hover:text-indigo-600"><X className="w-3 h-3" /></button>
                            </span>
                        </div>
                    )}
                </div>

                {/* Additional message */}
                {selectedChannel && (
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
                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold">
                                {originalAuthor?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <span className="text-sm font-semibold text-slate-800">{originalAuthor}</span>
                        </div>
                        <p className="text-sm text-slate-600 line-clamp-4 whitespace-pre-wrap">{originalContent?.replace(/<!--forward:.*?-->/s, '').trim() || ''}</p>
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
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-white">
                    {sent ? (
                        <span className="text-sm text-emerald-600 font-medium">Forwarded!</span>
                    ) : (
                        <button
                            onClick={handleForward}
                            disabled={!selectedChannel || sending}
                            className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center gap-2"
                        >
                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {sending ? 'Sending...' : 'Forward'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

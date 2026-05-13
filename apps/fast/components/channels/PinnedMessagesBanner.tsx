'use client';

// PinnedMessagesBanner — narrow strip that sits between the channel header
// and the message feed listing the messages currently pinned in this channel.
// Click a pinned message to scroll the feed to it (the feed's highlight ring
// kicks in via setHighlightedMessageId in the parent). Refetches whenever
// pinTick bumps so the host can force a refresh after toggling pin state.

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Pin } from 'lucide-react';
import { htmlToPlainText } from '@/lib/sanitize';
import { cn } from '@/lib/utils';

interface PinnedMessage {
    id: string;
    content: string;
    createdAt: string;
    sender: { id: string; name: string; image: string | null };
}

interface PinnedMessagesBannerProps {
    channelId: string;
    /** Bump to force a refetch — host increments after toggling pin state. */
    refreshTick?: number;
    /** Click handler — host typically scrolls the feed to messageId. */
    onJumpToMessage: (messageId: string) => void;
}

export function PinnedMessagesBanner({ channelId, refreshTick, onJumpToMessage }: PinnedMessagesBannerProps) {
    const [pinned, setPinned] = useState<PinnedMessage[]>([]);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/fast/api/channels/${channelId}/messages/pinned`);
                if (!res.ok || cancelled) return;
                const data = await res.json();
                setPinned(data.pinned || []);
            } catch {}
        })();
        return () => { cancelled = true; };
    }, [channelId, refreshTick]);

    if (pinned.length === 0) return null;

    // Banner condenses to the most-recent pin by default; clicking the
    // count expands the full list so a user with many pins can pick one.
    const headline = pinned[0];
    const rest = pinned.slice(1);
    const headlinePreview = htmlToPlainText(headline.content).split('\n')[0].slice(0, 140);

    return (
        <div className="border-b border-slate-200 bg-indigo-50/40">
            <button
                type="button"
                onClick={() => onJumpToMessage(headline.id)}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-indigo-50/70 transition-colors group"
            >
                <Pin className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 flex-shrink-0">
                            Pinned
                        </span>
                        <span className="text-xs text-slate-700 truncate">
                            <span className="font-semibold">{headline.sender.name}:</span>{' '}
                            {headlinePreview || <span className="italic text-slate-400">(no text)</span>}
                        </span>
                    </div>
                </div>
                {pinned.length > 1 && (
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                setExpanded((v) => !v);
                            }
                        }}
                        className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-indigo-600 hover:bg-indigo-100 cursor-pointer"
                    >
                        {pinned.length} pinned
                        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </span>
                )}
            </button>

            {expanded && rest.length > 0 && (
                <div className="border-t border-indigo-100/80 max-h-60 overflow-y-auto">
                    {rest.map((m) => {
                        const preview = htmlToPlainText(m.content).split('\n')[0].slice(0, 140);
                        return (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => onJumpToMessage(m.id)}
                                className={cn(
                                    'w-full flex items-center gap-2.5 px-4 py-2 text-left text-xs text-slate-700 hover:bg-indigo-50/70 transition-colors',
                                )}
                            >
                                <Pin className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                                <span className="flex-1 min-w-0 truncate">
                                    <span className="font-semibold">{m.sender.name}:</span>{' '}
                                    {preview || <span className="italic text-slate-400">(no text)</span>}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

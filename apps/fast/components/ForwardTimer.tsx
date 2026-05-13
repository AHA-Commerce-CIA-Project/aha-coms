'use client';

import { useState, useEffect } from 'react';
import { Timer } from 'lucide-react';

interface ForwardTimerProps {
    // ISO timestamp to start counting forward from
    startAt: string | null | undefined;
    // If set, stop at this time (task completed); otherwise count to now
    stopAt?: string | null;
    label?: string;
    compact?: boolean;
}

export function ForwardTimer({ startAt, stopAt, label = 'Processing', compact = false }: ForwardTimerProps) {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        if (stopAt) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [stopAt]);

    if (!startAt) return null;
    const start = new Date(startAt).getTime();
    const end = stopAt ? new Date(stopAt).getTime() : now;
    const diffMs = Math.max(0, end - start);

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diffMs % (1000 * 60)) / 1000);

    const pad = (n: number) => String(n).padStart(2, '0');
    const display = days > 0
        ? `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`
        : `${pad(hours)}:${pad(mins)}:${pad(secs)}`;

    if (compact) {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                <Timer className="w-3 h-3" />
                {display}
            </span>
        );
    }

    return (
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Timer className="w-4 h-4" />
            <div className="flex flex-col leading-tight">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500">{label}</span>
                <span className="font-mono text-sm font-bold tabular-nums">{display}</span>
            </div>
        </div>
    );
}

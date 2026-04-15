'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface CountdownTimerProps {
    deadline: string;
    compact?: boolean;
}

export function CountdownTimer({ deadline, compact = false }: CountdownTimerProps) {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const target = new Date(deadline).getTime();
    const diffMs = target - now;
    const isOverdue = diffMs < 0;
    const absDiff = Math.abs(diffMs);

    const hours = Math.floor(absDiff / (1000 * 60 * 60));
    const mins = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((absDiff % (1000 * 60)) / 1000);

    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${pad(hours)}:${pad(mins)}:${pad(secs)}`;

    if (compact) {
        return (
            <span className={`font-mono text-xs font-semibold ${isOverdue ? 'text-rose-600' : hours < 1 ? 'text-rose-500' : hours < 4 ? 'text-amber-500' : 'text-indigo-600'}`}>
                {isOverdue ? `-${timeStr}` : timeStr}
            </span>
        );
    }

    const colorClass = isOverdue
        ? 'bg-rose-50 text-rose-600 border-rose-200'
        : hours < 1
        ? 'bg-rose-50 text-rose-500 border-rose-200'
        : hours < 4
        ? 'bg-amber-50 text-amber-600 border-amber-200'
        : 'bg-indigo-50 text-indigo-600 border-indigo-200';

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${colorClass} font-mono`}>
            <Clock className="w-3 h-3" />
            {isOverdue && <span className="text-[10px] font-semibold not-italic mr-0.5">OVERDUE</span>}
            {isOverdue ? `-${timeStr}` : timeStr}
        </span>
    );
}

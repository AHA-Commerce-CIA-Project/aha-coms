'use client';

import { useState, useEffect } from 'react';

interface DueCountdownProps {
    dueDate: string;
}

export function DueCountdown({ dueDate }: DueCountdownProps) {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const target = new Date(dueDate).getTime();
    const diffMs = target - now;
    const isOverdue = diffMs < 0;
    const absDiff = Math.abs(diffMs);

    const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((absDiff % (1000 * 60)) / 1000);

    let display: string;
    let colorClass: string;

    if (isOverdue) {
        if (days > 0) {
            display = `${days}d ${hours}h`;
        } else if (hours > 0) {
            display = `${hours}h ${mins}m`;
        } else {
            display = `${mins}m ${secs}s`;
        }
        colorClass = 'text-rose-600 bg-rose-50 border-rose-200';
    } else if (days > 1) {
        // More than 1 day: show days + hours
        display = `${days}d ${hours}h`;
        colorClass = 'text-slate-700 bg-slate-50 border-slate-200';
    } else if (days === 1) {
        // Exactly 1 day: show "1d Xh Xm"
        display = `1d ${hours}h ${mins}m`;
        colorClass = 'text-amber-600 bg-amber-50 border-amber-200';
    } else {
        // Less than 24 hours: show hours:minutes:seconds countdown
        const pad = (n: number) => String(n).padStart(2, '0');
        display = `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
        colorClass = hours < 4
            ? 'text-rose-600 bg-rose-50 border-rose-200'
            : 'text-amber-600 bg-amber-50 border-amber-200';
    }

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold border font-mono ${colorClass}`}>
            {display}
        </span>
    );
}

'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth/use-auth';

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export function Heartbeat() {
    const { user } = useAuth();
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const isVisibleRef = useRef(true);

    useEffect(() => {
        if (!user) return;

        const sendHeartbeat = () => {
            if (!isVisibleRef.current) return;
            fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
        };

        // Send immediately on mount
        sendHeartbeat();

        // Then every 30 seconds
        intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        // Detect tab visibility
        const handleVisibility = () => {
            isVisibleRef.current = !document.hidden;
            if (!document.hidden) {
                // Tab became visible — send heartbeat immediately
                sendHeartbeat();
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [user]);

    return null; // No UI — just background behavior
}

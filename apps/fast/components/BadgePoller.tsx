'use client';

import { useEffect, useRef } from 'react';
import { fetchBadgeCounts } from '@/lib/badge-counts';
import { useAppStore } from '@/lib/store';
import { useAuth } from '@/lib/auth/use-auth';

const POLL_INTERVAL_MS = 15000;

/**
 * Single source of badge counts (channels unread, DM unread, orbit
 * unclaimed, changelog unseen) for both Sidebar and BottomNav. Mounted
 * once in AppShell. Pauses while the tab is hidden — a backgrounded
 * tab does not need fresh badges and the auth-cache TTL absorbs the
 * gap on visibility return.
 */
export function BadgePoller() {
    const { user } = useAuth();
    const setBadgeCounts = useAppStore((s) => s.setBadgeCounts);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isVisibleRef = useRef(true);

    useEffect(() => {
        if (!user) return;

        const tick = async () => {
            if (!isVisibleRef.current) return;
            try {
                const counts = await fetchBadgeCounts();
                setBadgeCounts(counts);
            } catch { }
        };

        tick();
        intervalRef.current = setInterval(tick, POLL_INTERVAL_MS);

        const handleVisibility = () => {
            isVisibleRef.current = !document.hidden;
            if (!document.hidden) tick();
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [user, setBadgeCounts]);

    return null;
}

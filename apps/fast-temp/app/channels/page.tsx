'use client';

// Legacy /channels route — kept alive only as a redirect into the unified
// Messages workspace at /messages. Every existing query param convention
// (?channel=, ?channelId=, ?createWith=, ?task=, ?highlight=, ?purpose=) is
// preserved so deep-links from notifications, forwards, /later, /team-inbox,
// the user profile panel, etc. continue to land in the right place.

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function ChannelsRedirect() {
    return (
        <Suspense fallback={null}>
            <RedirectInner />
        </Suspense>
    );
}

function RedirectInner() {
    const router = useRouter();
    const params = useSearchParams();

    useEffect(() => {
        const next = new URLSearchParams();
        // Old code sometimes used ?channelId= and sometimes ?channel= for the
        // active channel. Normalize to ?channel= on /messages.
        const ch = params.get('channel') || params.get('channelId');
        if (ch) next.set('channel', ch);

        // Pass-through params that the unified page or its inner panes still read.
        for (const k of ['createWith', 'task', 'highlight', 'purpose']) {
            const v = params.get(k);
            if (v) next.set(k, v);
        }

        const qs = next.toString();
        router.replace(qs ? `/messages?${qs}` : '/messages');
    }, [router, params]);

    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
    );
}

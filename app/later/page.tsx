'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { LaterPane } from '@/components/messaging/LaterPane';

// /later — standalone Saved Messages / Tasks / Posted Cards page. The same
// LaterPane component also renders inside /messages?later=... so the two
// surfaces stay in step.
export default function LaterPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>}>
            <LaterPageInner />
        </Suspense>
    );
}

function LaterPageInner() {
    const router = useRouter();
    return (
        <LaterPane
            onTabChange={(tab) => {
                // Reflect the active tab in the URL so deep-linking and the
                // back button work as before.
                router.replace(`/later?tab=${tab}`);
            }}
        />
    );
}

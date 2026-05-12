'use client';

import { PageTabs } from '@/components/PageTabs';
import { MyRequestView } from '@/components/MyRequestView';

export default function MyRequestPage() {
    return (
        <div className="space-y-6">
            <PageTabs tabs={[
                { href: '/tasks', label: 'My Tasks' },
                { href: '/my-request', label: 'My Request' },
                { href: '/nexus', label: 'Task Queue' },
                { href: '/team-inbox', label: 'Task Inbox' },
                { href: '/orbit', label: 'AHA Orbit' },
            ]} />
            {/* Cap the cards body at max-w-4xl so they don't stretch on wide
                monitors. PageTabs stays outside the wrapper to preserve the
                left-aligned tab row shared by the other Tasks-group pages. */}
            <div className="max-w-4xl mx-auto">
                <MyRequestView />
            </div>
        </div>
    );
}

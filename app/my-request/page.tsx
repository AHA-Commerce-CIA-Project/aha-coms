'use client';

import { PageTabs } from '@/components/PageTabs';
import { MyRequestView } from '@/components/MyRequestView';

export default function MyRequestPage() {
    return (
        <div className="max-w-4xl mx-auto px-6 py-8">
            <PageTabs tabs={[
                { href: '/tasks', label: 'My Tasks' },
                { href: '/my-request', label: 'My Request' },
                { href: '/nexus', label: 'Task Queue' },
                { href: '/team-inbox', label: 'Task Inbox' },
                { href: '/orbit', label: 'AHA Orbit' },
            ]} />
            <MyRequestView />
        </div>
    );
}

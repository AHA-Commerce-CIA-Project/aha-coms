'use client';

import { usePathname } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Sidebar, Header } from '@/components/layout';

const PUBLIC_ROUTES = ['/login', '/register', '/request', '/track'];

export function AppShell({ children }: { children: React.ReactNode }) {
    const { sidebarOpen } = useAppStore();
    const pathname = usePathname();

    const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

    // Public routes render without the shell (no sidebar/header)
    if (isPublicRoute) {
        return <>{children}</>;
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <Sidebar />
            <div
                className={cn(
                    'transition-all duration-300 ease-in-out',
                    sidebarOpen ? 'ml-64' : 'ml-20'
                )}
            >
                <Header />
                <main className="p-6">{children}</main>
            </div>
        </div>
    );
}

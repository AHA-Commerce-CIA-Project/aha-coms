'use client';

import { AuthProvider } from '@/lib/auth/use-auth';
import { ThemeProvider } from '@/lib/theme-context';
import { PWAInstaller } from './PWAInstaller';
import { Heartbeat } from './Heartbeat';

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider>
            <AuthProvider>
                {children}
                <PWAInstaller />
                <Heartbeat />
            </AuthProvider>
        </ThemeProvider>
    );
}

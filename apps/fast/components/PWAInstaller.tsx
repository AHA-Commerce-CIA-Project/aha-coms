'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstaller() {
    const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        // Register service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/sw.js')
                .then((reg) => console.log('SW registered:', reg.scope))
                .catch((err) => console.warn('SW registration failed:', err));
        }

        // Listen for install prompt
        const handler = (e: Event) => {
            e.preventDefault();
            setInstallPrompt(e as BeforeInstallPromptEvent);

            // Only show banner if not dismissed before
            const dismissed = localStorage.getItem('pwa-install-dismissed');
            if (!dismissed) setShowPrompt(true);
        };

        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = async () => {
        if (!installPrompt) return;
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === 'accepted') {
            setShowPrompt(false);
            setInstallPrompt(null);
        }
    };

    const handleDismiss = () => {
        setShowPrompt(false);
        localStorage.setItem('pwa-install-dismissed', '1');
    };

    if (!showPrompt || !installPrompt) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[100] max-w-sm bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 flex items-start gap-3 animate-in slide-in-from-bottom-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <Download className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">Install AHA COMSS</p>
                <p className="text-xs text-slate-500 mt-0.5 mb-3">
                    Get quick access from your home screen with offline support.
                </p>
                <div className="flex gap-2">
                    <button
                        onClick={handleInstall}
                        className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                    >
                        Install
                    </button>
                    <button
                        onClick={handleDismiss}
                        className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                    >
                        Not now
                    </button>
                </div>
            </div>
            <button
                onClick={handleDismiss}
                className="text-slate-300 hover:text-slate-500 transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

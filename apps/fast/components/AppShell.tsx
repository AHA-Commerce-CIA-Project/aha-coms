'use client';

import { Suspense } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Sidebar, TopNav, BottomNav } from '@/components/layout';
import { SuiteServiceBar } from '@/components/layout/SuiteServiceBar';
import { DirectAssignModal } from '@/components/DirectAssignModal';
import { Breadcrumb } from '@/components/Breadcrumb';
import { UserProfilePanel } from '@/components/UserProfilePanel';
import { useAuth } from '@/lib/auth/use-auth';

const PUBLIC_ROUTES = ['/request', '/track'];

export function AppShell({ children }: { children: React.ReactNode }) {
    const {
        sidebarOpen, sidebarHovered,
        directAssignOpen, directAssignChannelId,
        directAssignSourceMessageId, directAssignDefaultDescription,
        directAssignDefaultImages, directAssignDefaultFileUrls,
        directAssignStartAtReview, directAssignOnCancel,
        setDirectAssignOpen, notifyDirectAssignSubmitted,
        profileUser, setProfileUser, profileShowAddToConversation, profileHideSendDm,
    } = useAppStore();
    const pathname = usePathname();
    const router = useRouter();
    const { user: authUser } = useAuth();

    const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

    // Public routes render without the shell
    if (isPublicRoute) {
        return <>{children}</>;
    }

    // Page reflows to match the sidebar's actual width — pinned OR hovered both push
    // the content to the right so nothing gets cut off.
    const expanded = sidebarOpen || sidebarHovered;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <SuiteServiceBar />
            <TopNav />
            <Suspense fallback={null}>
                <Sidebar />
            </Suspense>
            <div
                className={cn(
                    'transition-all duration-300 ease-in-out min-w-0',
                    // Sidebar is hidden below md (see Sidebar.tsx) — only push the
                    // content over once the rail actually exists, otherwise mobile
                    // gets a phantom 80px left gutter.
                    expanded
                        ? 'md:ml-64 md:max-w-[calc(100vw-16rem)]'
                        : 'md:ml-20 md:max-w-[calc(100vw-5rem)]',
                    // Slack-style reflow: reserve 380px on the right when the profile
                    // panel is open so chat content doesn't slide under it.
                    profileUser ? 'sm:pr-[380px]' : ''
                )}
            >
                {/* Breadcrumb hugs the top — TopNav is sticky and already takes its
                    own 64px flow slot, so we don't add extra top padding here. */}
                <Suspense fallback={null}>
                    <Breadcrumb />
                </Suspense>
                {/* Mobile reserves room at the bottom for the BottomNav (≈58px + iOS safe-area).
                    Desktop keeps the original `pb-6` since BottomNav is hidden there. */}
                <main className="px-3 sm:px-6 pb-[calc(72px+env(safe-area-inset-bottom,0px))] md:pb-6 pt-3 overflow-x-hidden">{children}</main>
            </div>
            <BottomNav />
            <DirectAssignModal
                open={directAssignOpen}
                onClose={() => setDirectAssignOpen(false)}
                defaultChannelId={directAssignChannelId}
                sourceMessageId={directAssignSourceMessageId}
                defaultDescription={directAssignDefaultDescription}
                defaultImages={directAssignDefaultImages}
                defaultFileUrls={directAssignDefaultFileUrls}
                startAtReview={directAssignStartAtReview}
                onCancel={directAssignOnCancel ?? undefined}
                onSubmitted={({ channelId }) => {
                    // Always bump the tick so subscribers (channels page) can refetch
                    // the feed and surface the freshly created/transformed card.
                    notifyDirectAssignSubmitted();
                    // For "convert message → task" the user is already in the channel,
                    // so skip the navigation; the message will refresh in place.
                    if (directAssignSourceMessageId) return;
                    // Otherwise jump to the channel so the poster can see their card.
                    if (channelId) {
                        router.push(`/messages?channel=${encodeURIComponent(channelId)}`);
                    }
                }}
            />
            {/* Single, app-wide profile panel — driven by store.profileUser so any
                component can open it via setProfileUser() and only one renders at a time. */}
            <UserProfilePanel
                user={profileUser}
                currentUserId={authUser?.id ?? ''}
                onClose={() => setProfileUser(null)}
                showAddToConversation={profileShowAddToConversation}
                hideSendDm={profileHideSendDm}
            />
        </div>
    );
}

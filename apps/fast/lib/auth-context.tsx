'use client';

import { createContext, useContext, useEffect, useState } from 'react';

/**
 * useAuth — client-side identity hook.
 *
 * Spec 05 Phase 3 / T61 — sub-phase (b). The hook's external surface
 * (returned fields, signOut shape) stays identical to the Better Auth
 * era so the 26 client-side consumers (TopNav, Sidebar, ChannelPane,
 * DmPane, …) require no edits. Internally it now reads from
 * `/api/auth/me` (portal-rooted) instead of `authClient.getSession()`.
 *
 * `signOut()` redirects to portal's sign-out endpoint via top-level
 * navigation — same posture heroes' AccountWidget holds. Better Auth's
 * `authClient.signOut()` writes to /api/auth/sign-out (Better Auth's
 * own route), which the T62 + T63 cuts retire. The portal endpoint
 * clears the `__session` cookie origin-wide.
 */

interface UserProfile {
    id: string;
    email: string;
    name: string;
    image: string | null;
    avatar_url: string | null;
    role: string;
    teamId: string | null;
    teamName: string | null;
}

interface AuthContextType {
    user: UserProfile | null;
    profile: UserProfile | null;
    isLeader: boolean;
    isMaster: boolean;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    isLeader: false,
    isMaster: false,
    loading: true,
    signOut: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSession();
    }, []);

    const fetchSession = async () => {
        try {
            const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
            if (!res.ok) {
                setProfile(null);
                return;
            }
            const payload = (await res.json()) as {
                user: {
                    id: string;
                    email: string;
                    name: string;
                    image: string | null;
                    role: string;
                    teamId: string | null;
                };
                profile: {
                    team_id: string | null;
                    team_name: string | null;
                    avatar_url: string | null;
                };
            };
            setProfile({
                id: payload.user.id,
                email: payload.user.email,
                name: payload.user.name,
                image: payload.profile.avatar_url ?? payload.user.image,
                avatar_url: payload.profile.avatar_url ?? payload.user.image,
                role: payload.user.role,
                teamId: payload.profile.team_id ?? payload.user.teamId,
                teamName: payload.profile.team_name,
            });
        } catch (error) {
            console.error('Error fetching session:', error);
            setProfile(null);
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        // Portal owns sign-out: redirect to its end-session endpoint with a
        // returnTo back to fast's root. The endpoint clears the __session
        // cookie origin-wide; Better Auth's local /api/auth/sign-out route
        // retires alongside the lib/auth-server.ts deletion in T63.
        setProfile(null);
        const portalOrigin =
            process.env.NEXT_PUBLIC_PORTAL_ORIGIN ||
            (typeof window !== 'undefined' ? window.location.origin : '');
        const returnTo =
            typeof window !== 'undefined' ? `${window.location.origin}/` : '/';
        window.location.assign(
            `${portalOrigin}/api/auth/sign-out?returnTo=${encodeURIComponent(returnTo)}`,
        );
    };

    return (
        <AuthContext.Provider
            value={{
                user: profile,
                profile,
                isLeader: profile?.role === 'leader' || profile?.role === 'admin',
                isMaster: profile?.role === 'admin',
                loading,
                signOut: handleSignOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);

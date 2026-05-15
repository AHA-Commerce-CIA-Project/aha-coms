'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * useAuth — client-side identity hook.
 *
 * Spec 05 Phase 3 / T63 — sub-phase (c). Relocated from the deleted
 * `lib/auth-context.tsx` into the surviving `lib/auth/` subdirectory
 * so the 26 consumer files only need an import-path rewrite, not a
 * behavioural one. External surface unchanged.
 *
 * Also exports `useSession`, a shim mirroring Better Auth's
 * `authClient.useSession()` shape (`{ data: { user } | null, isPending }`)
 * so the 8 useSession consumers (orbit pages, profile, activity-log,
 * MyRequestView, LaterPane, ChannelPane) can swap their import path
 * without touching the `data.user.id` access pattern they already
 * read.
 *
 * The underlying data substrate is now `/api/auth/me`, which runs
 * `requireFastAuth` server-side. Better Auth's client surface
 * (`createAuthClient`, `authClient.getSession`, `authClient.signOut`)
 * retires with the deletion of `lib/auth-client.ts` in this commit.
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
    portalRole: string;
    apps: readonly string[];
}

export interface AppCatalogEntry {
    slug: string;
    label: string;
    url: string;
}

interface AuthContextType {
    user: UserProfile | null;
    profile: UserProfile | null;
    isLeader: boolean;
    isMaster: boolean;
    loading: boolean;
    /** Cross-app launcher list from portal-api's /api/userinfo (T74). Empty until
     *  the first /api/auth/me fetch settles; subscribers should treat an empty
     *  list as "still loading" rather than "no apps available". */
    appCatalog: readonly AppCatalogEntry[];
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    isLeader: false,
    isMaster: false,
    loading: true,
    appCatalog: [],
    signOut: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [appCatalog, setAppCatalog] = useState<readonly AppCatalogEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSession();
    }, []);

    const fetchSession = async () => {
        try {
            const res = await fetch('/fast/api/auth/me', { credentials: 'same-origin' });
            if (!res.ok) {
                setProfile(null);
                setAppCatalog([]);
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
                    portalRole?: string;
                    apps?: readonly string[];
                };
                profile: {
                    team_id: string | null;
                    team_name: string | null;
                    avatar_url: string | null;
                };
                appCatalog?: readonly AppCatalogEntry[];
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
                portalRole: payload.user.portalRole ?? payload.user.role,
                apps: payload.user.apps ?? [],
            });
            setAppCatalog(payload.appCatalog ?? []);
        } catch (error) {
            console.error('Error fetching session:', error);
            setProfile(null);
            setAppCatalog([]);
        } finally {
            setLoading(false);
        }
    };

    // Wrapped in useCallback so the AuthContext value below stays
    // referentially stable across renders — a fresh function literal here
    // would defeat the useMemo that wraps the provider value and ripple
    // back into every useEffect that depends on the context object.
    const handleSignOut = useCallback(async () => {
        setProfile(null);
        const portalOrigin =
            process.env.NEXT_PUBLIC_PORTAL_ORIGIN ||
            (typeof window !== 'undefined' ? window.location.origin : '');
        const returnTo =
            typeof window !== 'undefined' ? `${window.location.origin}/` : '/';
        window.location.assign(
            `${portalOrigin}/api/auth/sign-out?returnTo=${encodeURIComponent(returnTo)}`,
        );
    }, []);

    // Memoised so the context object identity only changes when one of
    // its inputs changes. The previous shape (a fresh object literal in
    // the JSX prop) crashed /fast/messages by triggering an infinite
    // render loop: every render produced a new context value, every
    // useSession()/useAuth() consumer saw a new reference, every
    // useEffect with session in its deps re-ran, and ChannelPane's
    // setChatHeader publish re-fired into MessagesWorkspace's Zustand
    // subscriber — Maximum update depth exceeded.
    const value = useMemo(
        () => ({
            user: profile,
            profile,
            isLeader: profile?.role === 'leader' || profile?.role === 'admin',
            isMaster: profile?.role === 'admin',
            loading,
            appCatalog,
            signOut: handleSignOut,
        }),
        [profile, loading, appCatalog, handleSignOut],
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);

/**
 * useSession — Better Auth-shaped shim over useAuth.
 *
 * Returns `{ data: { user } | null, isPending }` so the 8 useSession
 * consumers continue reading `data?.user.id` after the credential-lib
 * cut. The `user` shape is the minimal Better Auth surface those
 * callers already access: `{ id, email, name, image, role }`.
 *
 * The wrapper object MUST be memoised. Returning a fresh literal each
 * call gave every consumer a new `data` reference per render, so any
 * useEffect with `data`/`session` in its deps re-ran on every render
 * and triggered the /fast/messages infinite-loop crash documented
 * inline above the AuthProvider value memo. Memoising on `user` keeps
 * the reference stable as long as the underlying profile state is
 * stable.
 */
export function useSession() {
    const { user, loading } = useAuth();
    const data = useMemo(() => {
        if (!user) return null;
        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                image: user.image,
                role: user.role,
            },
        };
    }, [user]);
    return { data, isPending: loading };
}

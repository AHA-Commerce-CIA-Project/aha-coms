'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

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
    const router = useRouter();

    useEffect(() => {
        fetchSession();
    }, []);

    const fetchSession = async () => {
        try {
            const { data: session } = await authClient.getSession();
            if (session?.user) {
                let role = (session.user as any).role || 'member';
                let name = session.user.name || 'User';
                let teamId = (session.user as any).teamId || null;
                let teamName: string | null = null;
                let avatarUrl: string | null = session.user.image ?? null;

                // Supplement with profile API for custom fields
                try {
                    const profileRes = await fetch('/api/profile');
                    if (profileRes.ok) {
                        const profileData = await profileRes.json();
                        if (profileData.name) name = profileData.name;
                        if (profileData.role) role = profileData.role;
                        if (profileData.team_id) teamId = profileData.team_id;
                        if (profileData.team_name) teamName = profileData.team_name;
                        if (profileData.avatar_url) avatarUrl = profileData.avatar_url;
                    }
                } catch { }

                const userProfile: UserProfile = {
                    id: session.user.id,
                    email: session.user.email,
                    name,
                    image: avatarUrl,
                    avatar_url: avatarUrl,
                    role,
                    teamId,
                    teamName,
                };
                setProfile(userProfile);
            } else {
                setProfile(null);
            }
        } catch (error) {
            console.error('Error fetching session:', error);
            setProfile(null);
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        await authClient.signOut();
        setProfile(null);
        window.location.href = '/login';
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

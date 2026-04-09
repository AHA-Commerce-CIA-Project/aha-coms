'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from '@/lib/auth-client';
import { Eye, EyeOff, Mail, Lock, Zap } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const result = await signIn.email({
                email,
                password,
            });

            if (result.error) {
                throw new Error(result.error.message || 'Failed to sign in');
            }

            // Check account status
            const profileRes = await fetch('/api/profile');
            if (profileRes.ok) {
                const profile = await profileRes.json();
                if (profile.account_status === 'pending_approval') {
                    // Sign out and show message
                    await fetch('/api/auth/sign-out', { method: 'POST' });
                    throw new Error('Your account is pending leader approval. Please wait for confirmation.');
                }
                if (profile.account_status === 'rejected') {
                    await fetch('/api/auth/sign-out', { method: 'POST' });
                    throw new Error('Your account registration was declined. Please contact a team leader.');
                }
                if (profile.account_status === 'pending_activation' || profile.account_status === 'pending_setup') {
                    await fetch('/api/auth/sign-out', { method: 'POST' });
                    throw new Error('Please complete your account activation first. Check your email for the activation link.');
                }
            }

            window.location.href = '/';
        } catch (err: any) {
            setError(err.message || 'Failed to sign in');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-white p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/25">
                        <Zap className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                        FAST
                    </h1>
                    <p className="text-slate-400 mt-2">Sign in to your account</p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleLogin} className="bg-white border border-slate-200 shadow-xl rounded-2xl p-8 space-y-6">
                    {error && (
                        <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-xl text-rose-600 text-sm font-medium">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="w-full pl-12 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all text-sm"
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>

                    <div className="text-center">
                        <span className="text-slate-500 text-sm">Don&apos;t have an account? </span>
                        <Link href="/register" className="text-[#0F0E7F] hover:text-indigo-700 font-bold text-sm transition-colors">
                            Register
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}

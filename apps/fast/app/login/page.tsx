'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from '@/lib/auth-client';
import { Eye, EyeOff, Mail, Lock, User, CheckCircle2 } from 'lucide-react';
import { Suspense } from 'react';

function AuthPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isSignUp, setIsSignUp] = useState(false);

    useEffect(() => {
        if (searchParams.get('mode') === 'register') setIsSignUp(true);
    }, [searchParams]);

    // Login state
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);

    // Register state
    const [regName, setRegName] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regLoading, setRegLoading] = useState(false);
    const [regError, setRegError] = useState<string | null>(null);
    const [regSuccess, setRegSuccess] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginLoading(true);
        setLoginError(null);

        try {
            const result = await signIn.email({ email: loginEmail, password: loginPassword });
            if (result.error) throw new Error(result.error.message || 'Failed to sign in');

            const profileRes = await fetch('/api/profile');
            if (profileRes.ok) {
                const profile = await profileRes.json();
                if (profile.account_status === 'pending_approval') {
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
            setLoginError(err.message || 'Failed to sign in');
        } finally {
            setLoginLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setRegLoading(true);
        setRegError(null);

        if (!regEmail.endsWith('@ahacommerce.net')) {
            setRegError('Only @ahacommerce.net email addresses are allowed');
            setRegLoading(false);
            return;
        }

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: regName, email: regEmail }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Registration failed');
            setRegSuccess(true);
        } catch (err: any) {
            setRegError(err.message);
        } finally {
            setRegLoading(false);
        }
    };

    const switchToSignUp = () => {
        setIsSignUp(true);
        setLoginError(null);
        setRegError(null);
        setRegSuccess(false);
    };

    const switchToSignIn = () => {
        setIsSignUp(false);
        setLoginError(null);
        setRegError(null);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-white to-indigo-50 p-4">
            {/* Decorative shapes */}
            <div className="fixed top-0 right-0 w-64 h-64 bg-gradient-to-bl from-rose-300/30 to-transparent rounded-bl-full pointer-events-none" />
            <div className="fixed bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-amber-300/30 to-transparent rounded-tr-full pointer-events-none" />

            <div className="relative w-full max-w-[850px] min-h-[520px] bg-white rounded-3xl shadow-2xl overflow-hidden">
                {/* Sign In Form */}
                <div className={`absolute inset-0 flex transition-all duration-700 ease-in-out ${isSignUp ? '-translate-x-full opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}`}>
                    <div className="w-1/2 flex flex-col justify-center px-10 py-8">
                        <div className="flex items-center gap-2 mb-8">
                            <img src="/aha-logo.png?v=2" alt="AHA" className="w-8 h-8" />
                            <span className="text-sm font-semibold text-slate-500">AHA COMSS</span>
                        </div>

                        <h1 className="text-3xl font-bold text-indigo-600 mb-8">Sign in to AHA COMSS</h1>

                        <p className="text-sm text-slate-400 mb-6">Use your email account:</p>

                        <form onSubmit={handleLogin} className="space-y-4">
                            {loginError && (
                                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs font-medium">
                                    {loginError}
                                </div>
                            )}

                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="email"
                                    value={loginEmail}
                                    onChange={(e) => setLoginEmail(e.target.value)}
                                    placeholder="Email"
                                    required
                                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all"
                                />
                            </div>

                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={loginPassword}
                                    onChange={(e) => setLoginPassword(e.target.value)}
                                    placeholder="Password"
                                    required
                                    className="w-full pl-11 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all"
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>

                            <div className="text-right">
                                <span
                                    onClick={() => { window.location.href = '/forgot-password'; }}
                                    className="text-xs text-indigo-500 hover:text-indigo-700 font-medium cursor-pointer select-none"
                                    role="link"
                                    tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === 'Enter') window.location.href = '/forgot-password'; }}
                                >
                                    Forgot Password?
                                </span>
                            </div>

                            <button
                                type="submit"
                                disabled={loginLoading}
                                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-bold rounded-full hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-500/25 transition-all text-sm mt-2"
                            >
                                {loginLoading ? 'Signing in...' : 'SIGN IN'}
                            </button>
                        </form>
                    </div>

                    {/* Right overlay panel - Sign Up CTA */}
                    <div className="w-1/2 bg-gradient-to-br from-indigo-500 to-blue-600 flex flex-col items-center justify-center text-white px-10 py-8 relative overflow-hidden">
                        <div className="absolute inset-0 opacity-10">
                            <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full border-2 border-white" />
                            <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full border-2 border-white" />
                        </div>
                        <div className="relative z-10 text-center">
                            <h2 className="text-3xl font-bold mb-4">Hello, sAHAbat!</h2>
                            <p className="text-indigo-100 text-sm mb-8 max-w-[200px] mx-auto">
                                Enter your personal details and start your journey with us
                            </p>
                            <button
                                onClick={switchToSignUp}
                                className="px-10 py-3 border-2 border-white text-white font-bold rounded-full hover:bg-white/10 transition-all text-sm tracking-wider"
                            >
                                SIGN UP
                            </button>
                        </div>
                    </div>
                </div>

                {/* Sign Up Form */}
                <div className={`absolute inset-0 flex transition-all duration-700 ease-in-out ${isSignUp ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}`}>
                    {/* Left overlay panel - Sign In CTA */}
                    <div className="w-1/2 bg-gradient-to-br from-indigo-500 to-blue-600 flex flex-col items-center justify-center text-white px-10 py-8 relative overflow-hidden">
                        <div className="absolute inset-0 opacity-10">
                            <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full border-2 border-white" />
                            <div className="absolute -bottom-10 -right-10 w-48 h-48 rounded-full border-2 border-white" />
                        </div>
                        <div className="relative z-10 text-center">
                            <h2 className="text-3xl font-bold mb-4">Welcome Back!</h2>
                            <p className="text-indigo-100 text-sm mb-8 max-w-[200px] mx-auto">
                                To keep connected with us please login with your personal info
                            </p>
                            <button
                                onClick={switchToSignIn}
                                className="px-10 py-3 border-2 border-white text-white font-bold rounded-full hover:bg-white/10 transition-all text-sm tracking-wider"
                            >
                                SIGN IN
                            </button>
                        </div>
                    </div>

                    {/* Sign Up form */}
                    <div className="w-1/2 flex flex-col justify-center px-10 py-8">
                        <div className="flex items-center gap-2 mb-8">
                            <img src="/aha-logo.png?v=2" alt="AHA" className="w-8 h-8" />
                            <span className="text-sm font-semibold text-slate-500">AHA COMSS</span>
                        </div>

                        {regSuccess ? (
                            <div className="text-center">
                                <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                                </div>
                                <h2 className="text-2xl font-bold text-slate-800 mb-2">Check Your Email</h2>
                                <p className="text-slate-500 text-sm mb-4">
                                    We&apos;ve sent an activation link to <strong className="text-slate-700">{regEmail}</strong>.
                                </p>
                                <p className="text-xs text-slate-400 mb-6">The link expires in 24 hours.</p>
                                <button onClick={switchToSignIn} className="text-indigo-600 hover:text-indigo-700 font-semibold text-sm">
                                    Back to Sign In
                                </button>
                            </div>
                        ) : (
                            <>
                                <h1 className="text-3xl font-bold text-indigo-600 mb-8">Create Account</h1>

                                <p className="text-sm text-slate-400 mb-6">Use your @ahacommerce.net email:</p>

                                <form onSubmit={handleRegister} className="space-y-4">
                                    {regError && (
                                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs font-medium">
                                            {regError}
                                        </div>
                                    )}

                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={regName}
                                            onChange={(e) => setRegName(e.target.value)}
                                            placeholder="Full Name"
                                            required
                                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all"
                                        />
                                    </div>

                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="email"
                                            value={regEmail}
                                            onChange={(e) => setRegEmail(e.target.value)}
                                            placeholder="you@ahacommerce.net"
                                            required
                                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all"
                                        />
                                    </div>
                                    <p className="text-xs text-slate-400 -mt-2">Only @ahacommerce.net emails are accepted</p>

                                    <button
                                        type="submit"
                                        disabled={regLoading}
                                        className="w-full py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-bold rounded-full hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-500/25 transition-all text-sm mt-2"
                                    >
                                        {regLoading ? 'Sending...' : 'SIGN UP'}
                                    </button>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
}

export default function AuthPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>}>
            <AuthPageContent />
        </Suspense>
    );
}

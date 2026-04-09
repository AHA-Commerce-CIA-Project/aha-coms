'use client';

import { useState } from 'react';
import { Zap, Mail, User, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function RegisterPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (!email.endsWith('@ahacommerce.net')) {
            setError('Only @ahacommerce.net email addresses are allowed');
            setLoading(false);
            return;
        }

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Registration failed');
            }

            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white p-4">
                <div className="w-full max-w-md text-center">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800 mb-2">Check Your Email</h1>
                    <p className="text-slate-500 mb-6">
                        We&apos;ve sent an activation link to <strong className="text-slate-700">{email}</strong>.
                        Click the link to set up your password and choose your team.
                    </p>
                    <p className="text-sm text-slate-400 mb-6">The link expires in 24 hours.</p>
                    <Link
                        href="/login"
                        className="text-indigo-600 hover:text-indigo-700 font-semibold text-sm"
                    >
                        Back to Login
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-white p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/25">
                        <Zap className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                        FAST
                    </h1>
                    <p className="text-slate-400 mt-2">Create your account</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-white border border-slate-200 shadow-xl rounded-2xl p-8 space-y-6">
                    {error && (
                        <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-xl text-rose-600 text-sm font-medium">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Full Name</label>
                        <div className="relative">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Enter your full name"
                                required
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@ahacommerce.net"
                                required
                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                            />
                        </div>
                        <p className="text-xs text-slate-400">Only @ahacommerce.net emails are accepted</p>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all text-sm"
                    >
                        {loading ? 'Sending...' : 'Send Activation Link'}
                    </button>

                    <div className="text-center">
                        <span className="text-slate-500 text-sm">Already have an account? </span>
                        <Link href="/login" className="text-[#0F0E7F] hover:text-indigo-700 font-bold text-sm transition-colors">
                            Sign In
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}

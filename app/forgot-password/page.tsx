'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, ArrowLeft, Loader2, CheckCircle2, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';

export default function ForgotPasswordPage() {
    const router = useRouter();
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [email, setEmail] = useState('');
    const [code, setCode] = useState(['', '', '', '', '', '']);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Auto-focus first code input on step 2
    useEffect(() => {
        if (step === 2) {
            setTimeout(() => codeRefs.current[0]?.focus(), 100);
        }
    }, [step]);

    // Step 1: Send code to email
    const handleSendCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });
            const data = await res.json();
            if (res.ok) {
                setStep(2);
            } else {
                setError(data.error || 'Something went wrong.');
            }
        } catch {
            setError('Failed to send code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Code input handlers
    const handleCodeChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const newCode = [...code];
        newCode[index] = value.slice(-1);
        setCode(newCode);
        if (value && index < 5) {
            codeRefs.current[index + 1]?.focus();
        }
    };

    const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            codeRefs.current[index - 1]?.focus();
        }
    };

    const handleCodePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        const newCode = [...code];
        for (let i = 0; i < pasted.length; i++) {
            newCode[i] = pasted[i];
        }
        setCode(newCode);
        const nextEmpty = Math.min(pasted.length, 5);
        codeRefs.current[nextEmpty]?.focus();
    };

    // Step 2: Verify code
    const handleVerifyCode = async (e: React.FormEvent) => {
        e.preventDefault();
        const fullCode = code.join('');
        if (fullCode.length !== 6) {
            setError('Please enter the complete 6-digit code.');
            return;
        }
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/reset-password?action=verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), code: fullCode }),
            });
            const data = await res.json();
            if (res.ok && data.valid) {
                setStep(3);
            } else {
                setError(data.error || 'Invalid code.');
            }
        } catch {
            setError('Failed to verify code.');
        } finally {
            setLoading(false);
        }
    };

    // Step 3: Reset password
    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/auth/reset-password?action=reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), code: code.join(''), password }),
            });
            const data = await res.json();
            if (res.ok && data.status === 'success') {
                // Auto sign in and redirect to dashboard
                try {
                    const { signIn } = await import('@/lib/auth-client');
                    await signIn.email({ email: email.trim(), password });
                    window.location.href = '/';
                } catch {
                    window.location.href = '/login';
                }
            } else {
                setError(data.error || 'Failed to reset password.');
            }
        } catch {
            setError('Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    const handleResendCode = async () => {
        setLoading(true);
        setError('');
        try {
            await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim() }),
            });
            setCode(['', '', '', '', '', '']);
            setError('');
            codeRefs.current[0]?.focus();
        } catch {} finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-indigo-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-[#0F0E7F] to-indigo-600 px-8 py-8 text-center">
                        <div className="w-14 h-14 mx-auto mb-3 flex items-center justify-center">
                            <img src="/aha-logo.png?v=2" alt="AHA Logo" className="w-full h-full object-contain" />
                        </div>
                        <h1 className="text-xl font-bold text-white">
                            {step === 1 ? 'Forgot Password' : step === 2 ? 'Enter Reset Code' : 'Create New Password'}
                        </h1>
                        <p className="text-indigo-200 text-sm mt-1">AHA COMSS</p>

                        {/* Step indicator */}
                        <div className="flex items-center justify-center gap-2 mt-5">
                            {[1, 2, 3].map((s) => (
                                <div key={s} className="flex items-center gap-2">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                        s < step ? 'bg-emerald-400 text-white' :
                                        s === step ? 'bg-white text-indigo-600' :
                                        'bg-indigo-400/30 text-indigo-200'
                                    }`}>
                                        {s < step ? <CheckCircle2 className="w-4 h-4" /> : s}
                                    </div>
                                    {s < 3 && (
                                        <div className={`w-8 h-0.5 ${s < step ? 'bg-emerald-400' : 'bg-indigo-400/30'}`} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-8">
                        {/* Step 1: Enter email */}
                        {step === 1 && (
                            <form onSubmit={handleSendCode} className="space-y-5">
                                <p className="text-sm text-slate-500">
                                    Enter the email address associated with your account and we'll send you a reset code.
                                </p>

                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1.5 block">Email Address</label>
                                    <div className="relative">
                                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="your.name@ahacommerce.net"
                                            required
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <p className="text-xs text-rose-500 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || !email.trim()}
                                    className="w-full py-3 bg-[#0F0E7F] text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all text-sm flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                                    {loading ? 'Sending...' : 'Send Code'}
                                </button>

                                <div className="text-center">
                                    <a href="/login" className="text-sm text-slate-500 hover:text-indigo-600 font-medium inline-flex items-center gap-1.5">
                                        <ArrowLeft className="w-3.5 h-3.5" />
                                        Back to Sign In
                                    </a>
                                </div>
                            </form>
                        )}

                        {/* Step 2: Enter code */}
                        {step === 2 && (
                            <form onSubmit={handleVerifyCode} className="space-y-5">
                                <div className="text-center">
                                    <ShieldCheck className="w-10 h-10 text-indigo-500 mx-auto mb-3" />
                                    <p className="text-sm text-slate-500">
                                        We've sent a 6-digit code to
                                    </p>
                                    <p className="text-sm font-semibold text-indigo-600 mt-1">{email}</p>
                                </div>

                                {/* 6-digit code input */}
                                <div className="flex justify-center gap-2" onPaste={handleCodePaste}>
                                    {code.map((digit, i) => (
                                        <input
                                            key={i}
                                            ref={(el) => { codeRefs.current[i] = el; }}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={(e) => handleCodeChange(i, e.target.value)}
                                            onKeyDown={(e) => handleCodeKeyDown(i, e)}
                                            className="w-12 h-14 text-center text-xl font-bold text-slate-800 bg-slate-50 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                                        />
                                    ))}
                                </div>

                                {error && (
                                    <p className="text-xs text-rose-500 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-center">{error}</p>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || code.join('').length !== 6}
                                    className="w-full py-3 bg-[#0F0E7F] text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all text-sm flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {loading ? 'Verifying...' : 'Verify Code'}
                                </button>

                                <div className="text-center space-y-2">
                                    <p className="text-xs text-slate-400">Didn't receive the code?</p>
                                    <button
                                        type="button"
                                        onClick={handleResendCode}
                                        disabled={loading}
                                        className="text-sm text-indigo-500 hover:text-indigo-700 font-medium disabled:opacity-50"
                                    >
                                        Resend Code
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Step 3: New password */}
                        {step === 3 && (
                            <form onSubmit={handleResetPassword} className="space-y-5">
                                <p className="text-sm text-slate-500">
                                    Create a new password for <strong className="text-indigo-600">{email}</strong>
                                </p>

                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1.5 block">New Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Min. 6 characters"
                                            required
                                            minLength={6}
                                            className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                                        />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1.5 block">Confirm Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type={showConfirm ? 'text' : 'password'}
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Re-enter your password"
                                            required
                                            className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                                        />
                                        <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {error && (
                                    <p className="text-xs text-rose-500 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || !password || !confirmPassword}
                                    className="w-full py-3 bg-[#0F0E7F] text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all text-sm flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                    {loading ? 'Resetting...' : 'Reset Password'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

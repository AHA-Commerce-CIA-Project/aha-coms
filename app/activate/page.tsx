'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Zap, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import Link from 'next/link';

interface Team {
  id: string;
  name: string;
}

export default function ActivatePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenError('No activation token provided');
      setValidating(false);
      return;
    }

    fetch(`/api/auth/activate?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setValid(true);
          setEmail(data.email);
          setName(data.name);
          setTeams(data.teams || []);
        } else {
          setTokenError(data.error || 'Invalid token');
        }
      })
      .catch(() => setTokenError('Failed to validate token'))
      .finally(() => setValidating(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, teamId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Activation failed');

      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Validating activation link...</p>
        </div>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-rose-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Activation Failed</h1>
          <p className="text-slate-500 mb-6">{tokenError}</p>
          <Link href="/register" className="text-indigo-600 hover:text-indigo-700 font-semibold text-sm">
            Register Again
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Account Created!</h1>
          <p className="text-slate-500 mb-6">
            Your account is now waiting for leader approval. You&apos;ll receive an email once your account is approved.
          </p>
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
            <p className="text-sm text-amber-700 font-medium">
              A team leader needs to verify and approve your account before you can log in.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-block px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors text-sm"
          >
            Go to Login
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
          <h1 className="text-2xl font-bold text-slate-800">Complete Your Account</h1>
          <p className="text-slate-400 mt-2">Welcome, <strong className="text-slate-600">{name}</strong></p>
          <p className="text-sm text-slate-400">{email}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 shadow-xl rounded-2xl p-8 space-y-6">
          {error && (
            <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-xl text-rose-600 text-sm font-medium">
              {error}
            </div>
          )}

          {/* Team Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Team / Division</label>
            <div className="relative">
              <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm appearance-none"
              >
                <option value="">Select your team...</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                required
                minLength={6}
                className="w-full pl-12 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                minLength={6}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
              />
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-rose-500">Passwords do not match</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || password !== confirmPassword || password.length < 6}
            className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all text-sm"
          >
            {loading ? 'Setting Up...' : 'Complete Registration'}
          </button>
        </form>
      </div>
    </div>
  );
}

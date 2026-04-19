'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Zap, RotateCcw, FileText, ArrowRight, Users } from 'lucide-react';

export default function ComssLandingPage() {
    const { profile, isLeader, isMaster } = useAuth();
    const displayName = profile?.name?.split(' ')[0] || 'there';
    const isFbiTeam = profile?.teamName?.includes('Factual Business Intelligence') || profile?.teamName?.includes('FBI') || profile?.role === 'admin';

    const apps = [
        ...(isFbiTeam || isLeader ? [{
            href: '/fast',
            icon: Zap,
            title: 'AHA Fast',
            subtitle: 'FBI Assignment Smart Tracker',
            description: 'Manage tasks, track requests, collaborate on channels, and view team analytics.',
            color: 'from-indigo-500 to-blue-600',
            iconBg: 'bg-indigo-50',
            iconColor: 'text-indigo-600',
            border: 'hover:border-indigo-300',
        }] : []),
        {
            href: '/orbit',
            icon: RotateCcw,
            title: 'AHA Orbit',
            subtitle: 'Routine Task System',
            description: 'Claim recurring routine tasks, track completion, and delegate work.',
            color: 'from-purple-500 to-fuchsia-600',
            iconBg: 'bg-purple-50',
            iconColor: 'text-purple-600',
            border: 'hover:border-purple-300',
        },
        {
            href: '/request',
            icon: FileText,
            title: 'Request Form',
            subtitle: 'Submit a New Request',
            description: 'Send requests to FBI team or other divisions. Track status and updates.',
            color: 'from-teal-500 to-emerald-600',
            iconBg: 'bg-teal-50',
            iconColor: 'text-teal-600',
            border: 'hover:border-teal-300',
        },
        ...(isLeader ? [{
            href: '/users',
            icon: Users,
            title: 'User Control Panel',
            subtitle: 'Leader / Master Only',
            description: 'Manage users, approve registrations, assign roles and teams across the platform.',
            color: 'from-amber-500 to-orange-600',
            iconBg: 'bg-amber-50',
            iconColor: 'text-amber-600',
            border: 'hover:border-amber-300',
        }] : []),
    ];

    return (
        <div className="max-w-6xl mx-auto px-6 py-10">
            {/* Header */}
            <div className="mb-10 text-center">
                <div className="inline-flex items-center gap-3 mb-4">
                    <img src="/aha-logo.png?v=2" alt="AHA" className="w-12 h-12" />
                    <div className="text-left">
                        <h1 className="text-3xl font-bold text-slate-900">AHA COMSS</h1>
                        <p className="text-sm text-indigo-500">Company Support Systems</p>
                    </div>
                </div>
                <p className="text-slate-500 text-lg mt-4">
                    Welcome back, <span className="font-semibold text-slate-700">{displayName}</span>! Choose an app to get started.
                </p>
            </div>

            {/* App Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {apps.map((app) => {
                    const Icon = app.icon;
                    return (
                        <Link
                            key={app.href}
                            href={app.href}
                            className={`group relative bg-white rounded-2xl border border-slate-200 ${app.border} p-6 shadow-sm hover:shadow-lg transition-all overflow-hidden`}
                        >
                            {/* Decorative gradient corner */}
                            <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${app.color} opacity-5 group-hover:opacity-10 transition-opacity`} />

                            {/* Icon */}
                            <div className={`w-14 h-14 rounded-2xl ${app.iconBg} flex items-center justify-center mb-5 relative z-10`}>
                                <Icon className={`w-7 h-7 ${app.iconColor}`} />
                            </div>

                            {/* Content */}
                            <h2 className="text-xl font-bold text-slate-900 mb-1">{app.title}</h2>
                            <p className={`text-xs font-semibold ${app.iconColor} mb-3 uppercase tracking-wider`}>{app.subtitle}</p>
                            <p className="text-sm text-slate-500 leading-relaxed mb-5">{app.description}</p>

                            {/* CTA */}
                            <div className={`inline-flex items-center gap-1.5 text-sm font-semibold ${app.iconColor} group-hover:gap-2.5 transition-all`}>
                                Open
                                <ArrowRight className="w-4 h-4" />
                            </div>
                        </Link>
                    );
                })}
            </div>

            {/* Footer note */}
            <div className="mt-12 text-center">
                <p className="text-xs text-slate-400">
                    More apps coming soon. <span className="text-slate-500">© 2026 AHA Factual Business Intelligence</span>
                </p>
            </div>
        </div>
    );
}

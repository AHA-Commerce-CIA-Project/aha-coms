'use client';

import { Bell, Search, User, LogOut, Shield, CheckCheck, FileText, UserPlus, CheckCircle2, Check, Trash2, Calendar, Clock, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useAppStore } from '@/lib/store';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface NotifItem {
    id: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    created_at: string;
    data: any;
}

export function Header() {
    const { user, profile, isLeader, signOut } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { users } = useAppStore();
    const [showDropdown, setShowDropdown] = useState(false);
    const [showNotifs, setShowNotifs] = useState(false);
    const [notifications, setNotifications] = useState<NotifItem[]>([]);
    const notifRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    const displayName = profile?.name || 'User';
    const displayRole = profile?.role || 'member';

    const [currentTime, setCurrentTime] = useState<Date | null>(null);

    useEffect(() => {
        setCurrentTime(new Date());
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    // Fetch notifications
    useEffect(() => {
        if (user) {
            fetchNotifications();
            // Poll every 30 seconds
            const interval = setInterval(fetchNotifications, 30000);
            return () => clearInterval(interval);
        }
    }, [user]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
                setShowNotifs(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const fetchNotifications = async () => {
        try {
            const res = await fetch('/api/notifications');
            if (res.ok) setNotifications(await res.json());
        } catch { }
    };

    const markAllRead = async () => {
        try {
            await fetch('/api/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAllRead: true }),
            });
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } catch { }
    };

    const clearAll = async () => {
        try {
            await fetch('/api/notifications', { method: 'DELETE' });
            setNotifications([]);
        } catch { }
    };

    const markOneRead = async (id: string) => {
        try {
            await fetch('/api/notifications', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        } catch { }
    };

    const getNotifIcon = (title: string) => {
        if (title.includes('Request')) return <FileText className="w-4 h-4 text-sky-400" />;
        if (title.includes('Claimed')) return <UserPlus className="w-4 h-4 text-indigo-400" />;
        if (title.includes('Completed')) return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
        return <Bell className="w-4 h-4 text-slate-400" />;
    };

    const handleNotifClick = async (n: NotifItem) => {
        // Mark as read
        if (!n.read) await markOneRead(n.id);
        setShowNotifs(false);

        // Navigate based on notification type
        if (n.data?.meeting_id) {
            // Meeting notification → go to /tasks with date & meeting params
            const params = new URLSearchParams();
            if (n.data.meeting_date) params.set('date', n.data.meeting_date);
            params.set('meetingId', n.data.meeting_id);
            router.push(`/tasks?${params.toString()}`);
        } else if (n.data?.channel_id && n.data?.message_id) {
            // Channel message notification → go to channel with highlight
            router.push(`/channels?channel=${n.data.channel_id}&highlight=${n.data.message_id}`);
        } else if (n.data?.channel_id) {
            // Channel notification without specific message
            router.push(`/channels?channel=${n.data.channel_id}`);
        } else if (n.type === 'task_comment' && n.data?.task_id) {
            // Comment notification → go to /nexus, open task, scroll to comments
            router.push(`/nexus?highlight=${n.data.task_id}&open=true&focus=comments`);
        } else if (n.data?.task_id) {
            // Request/task notification → go to /nexus with highlight
            router.push(`/nexus?highlight=${n.data.task_id}`);
        } else if (n.data?.task_token) {
            router.push(`/nexus?highlight_token=${n.data.task_token}`);
        }
    };

    const timeAgo = (d: string) => {
        const diff = Date.now() - new Date(d).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    };

    return (
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-30 sticky top-0">
            {/* Date & Time */}
            <div className="flex items-center gap-3 flex-1">
                {currentTime && (
                    <div className="flex items-center gap-2.5 px-4 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
                        <Calendar className="w-4 h-4 text-indigo-500" />
                        <span className="text-sm font-medium text-slate-600">
                            {currentTime.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                        <div className="w-px h-4 bg-slate-200" />
                        <Clock className="w-4 h-4 text-indigo-400" />
                        <span className="text-sm font-semibold text-slate-700 tabular-nums">
                            {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                        </span>
                    </div>
                )}
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-4">
                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>

                {/* Notifications */}
                <div className="relative" ref={notifRef}>
                    <button
                        onClick={() => { setShowNotifs(!showNotifs); setShowDropdown(false); }}
                        className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                        <Bell className="w-5 h-5" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-rose-500 text-white rounded-full">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {/* Notifications Dropdown */}
                    {showNotifs && (
                        <div className="absolute right-0 top-full mt-2 w-96 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50">
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                                <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
                                <div className="flex items-center gap-3">
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={markAllRead}
                                            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition-colors"
                                        >
                                            <CheckCheck className="w-3.5 h-3.5" />
                                            Mark all read
                                        </button>
                                    )}
                                    {notifications.length > 0 && (
                                        <button
                                            onClick={clearAll}
                                            className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-600 transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Notification List */}
                            <div className="max-h-80 overflow-y-auto">
                                {notifications.length === 0 ? (
                                    <div className="px-4 py-8 text-center">
                                        <Bell className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                                        <p className="text-sm text-slate-500">No notifications yet</p>
                                    </div>
                                ) : (
                                    notifications.map(n => (
                                        <div
                                            key={n.id}
                                            onClick={() => handleNotifClick(n)}
                                            className={`px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer ${!n.read ? 'bg-indigo-50/50' : ''}`}
                                        >
                                            <div className="flex gap-3">
                                                <div className="mt-0.5">
                                                    {getNotifIcon(n.title)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm font-medium text-slate-800">{n.title}</p>
                                                        {!n.read && <span className="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0" />}
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-0.5 truncate">{n.message}</p>
                                                    <p className="text-xs text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                                                </div>
                                                {!n.read && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); markOneRead(n.id); }}
                                                        title="Mark as read"
                                                        className="flex-shrink-0 mt-0.5 p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                                                    >
                                                        <Check className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* User Menu */}
                <div className="relative">
                    <button
                        onClick={() => { setShowDropdown(!showDropdown); setShowNotifs(false); }}
                        className="flex items-center gap-3 pl-4 border-l border-slate-200 hover:opacity-80 transition-opacity"
                    >
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-bold text-slate-800">{displayName}</p>
                            <p className="text-xs text-slate-500 capitalize flex items-center gap-1 justify-end">
                                {isLeader && <Shield className="w-3 h-3 text-indigo-500" />}
                                {displayRole === 'admin' ? 'Master' : displayRole === 'leader' ? 'Leader' : displayRole}
                            </p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center overflow-hidden">
                            {profile?.avatar_url ? (
                                <img src={profile.avatar_url} alt={displayName} className="w-10 h-10 rounded-full object-cover" />
                            ) : (
                                <span className="text-indigo-700 font-bold">{displayName.charAt(0).toUpperCase()}</span>
                            )}
                        </div>
                    </button>

                    {/* Dropdown */}
                    {showDropdown && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50">
                            {user ? (
                                <>
                                    <div className="px-4 py-3 border-b border-slate-100">
                                        <p className="text-sm font-medium text-slate-800 truncate">{profile?.email || user.email}</p>
                                        <p className="text-xs text-slate-500 capitalize">{displayRole}</p>
                                    </div>
                                    <Link
                                        href="/profile"
                                        onClick={() => setShowDropdown(false)}
                                        className="w-full px-4 py-3 flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 hover:bg-slate-50 transition-colors"
                                    >
                                        <User className="w-4 h-4" />
                                        Profile Settings
                                    </Link>
                                    <button
                                        onClick={() => {
                                            signOut();
                                            setShowDropdown(false);
                                        }}
                                        className="w-full px-4 py-3 flex items-center gap-2 text-sm text-slate-600 hover:text-rose-600 hover:bg-slate-50 transition-colors border-t border-slate-100"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        Sign out
                                    </button>
                                </>
                            ) : (
                                <>
                                    <Link
                                        href="/login"
                                        className="block px-4 py-3 text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
                                        onClick={() => setShowDropdown(false)}
                                    >
                                        Sign in
                                    </Link>
                                    <Link
                                        href="/register"
                                        className="block px-4 py-3 text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors border-t border-slate-800"
                                        onClick={() => setShowDropdown(false)}
                                    >
                                        Register
                                    </Link>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}

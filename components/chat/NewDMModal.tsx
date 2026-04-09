'use client';

import { useState, useEffect } from 'react';
import { X, Search, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatUser {
    id: string;
    name: string;
    email: string;
    image: string | null;
    role: string;
    teamName: string | null;
}

interface NewDMModalProps {
    open: boolean;
    onClose: () => void;
    onSelectUser: (userId: string) => void;
}

export function NewDMModal({ open, onClose, onSelectUser }: NewDMModalProps) {
    const [users, setUsers] = useState<ChatUser[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            setSearchQuery('');
            fetchUsers();
        }
    }, [open]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/chat/users');
            if (res.ok) {
                setUsers(await res.json());
            }
        } catch {
        } finally {
            setLoading(false);
        }
    };

    const filtered = users.filter(
        (u) =>
            u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.teamName?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-indigo-600" />
                        <h3 className="text-base font-bold text-slate-800">New Message</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search */}
                <div className="px-5 py-3 border-b border-slate-100">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by name, email, or team..."
                            autoFocus
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                        />
                    </div>
                </div>

                {/* User List */}
                <div className="max-h-80 overflow-y-auto">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-10">
                            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2" />
                            <p className="text-sm text-slate-400">Loading users...</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                            <p className="text-sm">No users found</p>
                        </div>
                    ) : (
                        filtered.map((user) => (
                            <button
                                key={user.id}
                                onClick={() => onSelectUser(user.id)}
                                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-indigo-50 transition-colors text-left"
                            >
                                {/* Avatar */}
                                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                    {user.image ? (
                                        <img src={user.image} alt="" className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                        <span className="text-sm font-bold text-indigo-700">
                                            {user.name.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-slate-800 truncate">
                                            {user.name}
                                        </span>
                                        <span className={cn(
                                            'text-[10px] font-medium px-2 py-0.5 rounded-full capitalize',
                                            user.role === 'leader' || user.role === 'admin'
                                                ? 'bg-amber-100 text-amber-700'
                                                : 'bg-slate-100 text-slate-500'
                                        )}>
                                            {user.role}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-xs text-slate-500 truncate">{user.email}</span>
                                        {user.teamName && (
                                            <>
                                                <span className="text-slate-300">·</span>
                                                <span className="text-xs text-indigo-500 font-medium">{user.teamName}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

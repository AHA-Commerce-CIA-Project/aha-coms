'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

import {
    Users, Plus, Pencil, Trash2, X, Shield, User as UserIcon,
    Mail, Lock, Search, AlertTriangle, Check, MailCheck,
    RefreshCw, FileSpreadsheet, AlertCircle
} from 'lucide-react';

interface UserRow {
    id: string;
    email: string;
    name: string;
    avatar_url: string | null;
    role: 'leader' | 'member';
    team_id: string | null;
    created_at: string;
    teams?: { name: string } | null;
    email_confirmed_at: string | null;
}

interface TeamRow {
    id: string;
    name: string;
}

type ModalMode = 'create' | 'edit' | null;

export default function UserManagementPage() {
    const { isLeader, loading: authLoading } = useAuth();
    const router = useRouter();

    const [users, setUsers] = useState<UserRow[]>([]);
    const [teams, setTeams] = useState<TeamRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [modalMode, setModalMode] = useState<ModalMode>(null);
    const [editingUser, setEditingUser] = useState<UserRow | null>(null);
    const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [formLoading, setFormLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Pending approval
    const [pendingUsers, setPendingUsers] = useState<{ id: string; name: string; email: string; createdAt: string; team: { name: string } | null }[]>([]);
    const [approvingId, setApprovingId] = useState<string | null>(null);

    // HR Sync state
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{
        status: string;
        message: string;
        stats: { totalRows: number; teamsCreated: number; usersUpdated: number; unmatched: string[] };
    } | null>(null);

    // Form fields
    const [formName, setFormName] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formPassword, setFormPassword] = useState('');
    const [formRole, setFormRole] = useState<'leader' | 'member'>('member');
    const [formTeamId, setFormTeamId] = useState<string>('');

    useEffect(() => {
        if (!authLoading && !isLeader) {
            router.push('/');
        }
    }, [authLoading, isLeader, router]);

    useEffect(() => {
        if (isLeader) {
            fetchUsers();
            fetchTeams();
            fetchPending();
        }
    }, [isLeader]);

    const fetchPending = async () => {
        try {
            const res = await fetch('/api/auth/pending');
            if (res.ok) setPendingUsers(await res.json());
        } catch {}
    };

    const handleApproval = async (userId: string, action: 'approve' | 'reject') => {
        setApprovingId(userId);
        try {
            await fetch(`/api/auth/approve/${userId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
            fetchPending();
            fetchUsers();
        } catch {} finally { setApprovingId(null); }
    };

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/users');
            if (res.ok) {
                const data = await res.json();
                setUsers(data);
            }
        } catch (err) {
            console.error('Error fetching users:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchTeams = async () => {
        try {
            const res = await fetch('/api/teams');
            if (res.ok) {
                const data = await res.json();
                setTeams(data as TeamRow[]);
            }
        } catch (err) {
            console.error('Error fetching teams:', err);
        }
    };

    const showSuccess = (msg: string) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(null), 3000);
    };

    const openCreateModal = () => {
        setFormName('');
        setFormEmail('');
        setFormPassword('');
        setFormRole('member');
        setFormTeamId(teams.length > 0 ? teams[0].id : '');
        setFormError(null);
        setModalMode('create');
    };

    const openEditModal = (user: UserRow) => {
        setEditingUser(user);
        setFormName(user.name);
        setFormEmail(user.email);
        setFormRole(user.role);
        setFormTeamId(user.team_id || '');
        setFormError(null);
        setModalMode('edit');
    };

    const closeModal = () => {
        setModalMode(null);
        setEditingUser(null);
        setFormError(null);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);
        setFormError(null);

        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formEmail,
                    password: formPassword,
                    name: formName,
                    role: formRole,
                    team_id: formTeamId || null,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            await fetchUsers();
            closeModal();
            showSuccess(`User "${formName}" created successfully!`);
        } catch (err: any) {
            setFormError(err.message || 'Failed to create user');
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;
        setFormLoading(true);
        setFormError(null);

        try {
            const res = await fetch(`/api/users/${editingUser.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formName,
                    role: formRole,
                    team_id: formTeamId || null,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            await fetchUsers();
            closeModal();
            showSuccess(`User "${formName}" updated successfully!`);
        } catch (err: any) {
            setFormError(err.message || 'Failed to update user');
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteUser) return;
        setFormLoading(true);

        try {
            const res = await fetch(`/api/users/${deleteUser.id}`, {
                method: 'DELETE',
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            await fetchUsers();
            setDeleteUser(null);
            showSuccess(`User "${deleteUser.name}" deleted successfully!`);
        } catch (err: any) {
            setFormError(err.message || 'Failed to delete user');
        } finally {
            setFormLoading(false);
        }
    };

    const handleConfirmEmail = async (user: UserRow) => {
        try {
            const res = await fetch(`/api/users/${user.id}/confirm`, {
                method: 'POST',
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            await fetchUsers();
            showSuccess(`Email for "${user.name}" confirmed successfully!`);
        } catch (err: any) {
            setFormError(err.message || 'Failed to confirm email');
        }
    };

    const handleSyncHR = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await fetch('/api/admin/sync-hr', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Sync failed');
            setSyncResult(data);
            await fetchUsers();
            await fetchTeams();
            if (data.stats.usersUpdated > 0 || data.stats.teamsCreated > 0) {
                showSuccess(data.message);
            }
        } catch (err: any) {
            setSyncResult({
                status: 'error',
                message: err.message || 'Failed to sync HR data',
                stats: { totalRows: 0, teamsCreated: 0, usersUpdated: 0, unmatched: [] },
            });
        } finally {
            setSyncing(false);
        }
    };

    const filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
        });
    };

    if (authLoading || (!isLeader && !authLoading)) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Success Toast */}
            {successMessage && (
                <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl shadow-lg animate-slide-in">
                    <Check className="w-4 h-4" />
                    <span className="text-sm font-medium">{successMessage}</span>
                </div>
            )}

            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">User Control Panel</h1>
                    <p className="text-slate-500">Manage registered users, roles, and team assignments.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSyncHR}
                        disabled={syncing}
                        className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-full transition-all shadow-sm disabled:opacity-60"
                    >
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Syncing...' : 'Sync HR Data'}
                    </button>
                    <button
                        onClick={openCreateModal}
                        className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full transition-all shadow-sm"
                    >
                        <Plus className="w-5 h-5" />
                        Add User
                    </button>
                </div>
            </div>

            {/* Pending Approval Section */}
            {pendingUsers.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="w-5 h-5 text-amber-600" />
                        <h2 className="text-sm font-bold text-amber-800">
                            Pending Approval ({pendingUsers.length})
                        </h2>
                    </div>
                    <div className="space-y-2">
                        {pendingUsers.map((u) => (
                            <div key={u.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-amber-100">
                                <div>
                                    <p className="text-sm font-semibold text-slate-800">{u.name}</p>
                                    <p className="text-xs text-slate-400">{u.email}{u.team ? ` · ${u.team.name}` : ''}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleApproval(u.id, 'approve')}
                                        disabled={approvingId === u.id}
                                        className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => handleApproval(u.id, 'reject')}
                                        disabled={approvingId === u.id}
                                        className="px-3 py-1.5 bg-rose-100 text-rose-600 text-xs font-semibold rounded-lg hover:bg-rose-200 disabled:opacity-50 transition-colors"
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Search Bar */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
            </div>

            {/* Users Table */}
            {loading ? (
                <div className="text-center py-16">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-500">Loading users...</p>
                </div>
            ) : filteredUsers.length === 0 ? (
                <div className="text-center py-16 bg-white shadow border-slate-200 border border-slate-200 rounded-2xl">
                    <Users className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-500">No users found</p>
                </div>
            ) : (
                <div className="bg-white shadow border-slate-200 border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Role</th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Team</th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Joined</th>
                                    <th className="text-right px-6 py-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {filteredUsers.map((user) => (
                                    <tr key={user.id} className="hover:bg-slate-100/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center">
                                                    <UserIcon className="w-4 h-4 text-indigo-400" />
                                                </div>
                                                <span className="text-sm font-medium text-slate-900">{user.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm text-slate-500">{user.email}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                                                user.role === 'leader'
                                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                                    : 'bg-slate-700/50 border-slate-300 text-slate-700'
                                            }`}>
                                                {user.role === 'leader' && <Shield className="w-3 h-3" />}
                                                {user.role === 'leader' ? 'Leader' : 'Member'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm text-slate-500">{user.teams?.name || '—'}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {user.email_confirmed_at ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                                                    <Check className="w-3 h-3" /> Confirmed
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400">
                                                    Unconfirmed
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm text-slate-500">{formatDate(user.created_at)}</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {!user.email_confirmed_at && (
                                                    <button
                                                        onClick={() => handleConfirmEmail(user)}
                                                        className="p-2 text-amber-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                                        title="Confirm email"
                                                    >
                                                        <MailCheck className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => openEditModal(user)}
                                                    className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                                                    title="Edit user"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteUser(user)}
                                                    className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                                    title="Delete user"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-6 py-3 border-t border-slate-200 text-xs text-slate-500">
                        {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} total
                    </div>
                </div>
            )}

            {/* Create / Edit Modal */}
            {modalMode && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-white shadow border-slate-200 border border-slate-200 rounded-2xl shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h2 className="text-lg font-semibold text-slate-900">
                                {modalMode === 'create' ? 'Add New User' : 'Edit User'}
                            </h2>
                            <button onClick={closeModal} className="p-1 text-slate-500 hover:text-slate-900 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={modalMode === 'create' ? handleCreate : handleEdit} className="p-6 space-y-5">
                            {formError && (
                                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm">
                                    {formError}
                                </div>
                            )}

                            {/* Name */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">Name</label>
                                <div className="relative">
                                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <input
                                        type="text"
                                        value={formName}
                                        onChange={(e) => setFormName(e.target.value)}
                                        placeholder="Full name"
                                        required
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                                    />
                                </div>
                            </div>

                            {/* Email (only for create) */}
                            {modalMode === 'create' && (
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Email</label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        <input
                                            type="email"
                                            value={formEmail}
                                            onChange={(e) => setFormEmail(e.target.value)}
                                            placeholder="user@example.com"
                                            required
                                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Password (only for create) */}
                            {modalMode === 'create' && (
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700">Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        <input
                                            type="password"
                                            value={formPassword}
                                            onChange={(e) => setFormPassword(e.target.value)}
                                            placeholder="Min. 6 characters"
                                            required
                                            minLength={6}
                                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Role */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">Role</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setFormRole('member')}
                                        className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold border transition-all shadow-sm ${
                                            formRole === 'member'
                                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                                : 'bg-white border-slate-200 text-slate-500 hover:text-[#0F0E7F] hover:bg-slate-50'
                                        }`}
                                    >
                                        <UserIcon className="w-4 h-4" />
                                        Member
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormRole('leader')}
                                        className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold border transition-all shadow-sm ${
                                            formRole === 'leader'
                                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                                : 'bg-white border-slate-200 text-slate-500 hover:text-[#0F0E7F] hover:bg-slate-50'
                                        }`}
                                    >
                                        <Shield className="w-4 h-4" />
                                        Leader
                                    </button>
                                </div>
                            </div>

                            {/* Team */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">Team</label>
                                <select
                                    value={formTeamId}
                                    onChange={(e) => setFormTeamId(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                                >
                                    <option value="">No Team</option>
                                    {teams.map((team) => (
                                        <option key={team.id} value={team.id}>{team.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={formLoading}
                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                            >
                                {formLoading
                                    ? 'Processing...'
                                    : modalMode === 'create'
                                        ? 'Create User'
                                        : 'Save Changes'
                                }
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-white shadow border-slate-200 border border-slate-200 rounded-2xl shadow-2xl p-6">
                        <div className="text-center">
                            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle className="w-6 h-6 text-rose-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete User</h3>
                            <p className="text-sm text-slate-500 mb-1">
                                Are you sure you want to delete
                            </p>
                            <p className="text-sm font-medium text-slate-900 mb-4">
                                {deleteUser.name} ({deleteUser.email})?
                            </p>
                            <p className="text-xs text-rose-400/70 mb-6">
                                This action cannot be undone. The user will be permanently removed.
                            </p>

                            {formError && (
                                <div className="p-3 mb-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm">
                                    {formError}
                                </div>
                            )}

                            <div className="flex gap-3 mt-4">
                                <button
                                    onClick={() => { setDeleteUser(null); setFormError(null); }}
                                    className="flex-1 py-3 bg-white border border-slate-200 text-[#0F0E7F] rounded-full hover:bg-slate-50 transition-colors font-bold text-sm shadow-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={formLoading}
                                    className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-full disabled:opacity-50 transition-colors font-bold text-sm shadow-sm"
                                >
                                    {formLoading ? 'Deleting...' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* HR Sync Result Modal */}
            {syncResult && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                                <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
                                <h2 className="text-lg font-semibold text-slate-900">HR Sync Results</h2>
                            </div>
                            <button onClick={() => setSyncResult(null)} className="p-1 text-slate-500 hover:text-slate-900 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Status Badge */}
                            <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
                                syncResult.status === 'error'
                                    ? 'bg-rose-50 border border-rose-200 text-rose-600'
                                    : syncResult.status === 'warning'
                                        ? 'bg-amber-50 border border-amber-200 text-amber-600'
                                        : 'bg-emerald-50 border border-emerald-200 text-emerald-600'
                            }`}>
                                {syncResult.status === 'error'
                                    ? <AlertCircle className="w-4 h-4" />
                                    : syncResult.status === 'warning'
                                        ? <AlertTriangle className="w-4 h-4" />
                                        : <Check className="w-4 h-4" />
                                }
                                {syncResult.message}
                            </div>

                            {/* Stats Grid */}
                            {syncResult.stats.totalRows > 0 && (
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                                        <p className="text-2xl font-bold text-slate-900">{syncResult.stats.totalRows}</p>
                                        <p className="text-xs text-slate-500">Rows Read</p>
                                    </div>
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                                        <p className="text-2xl font-bold text-emerald-600">{syncResult.stats.usersUpdated}</p>
                                        <p className="text-xs text-slate-500">Users Updated</p>
                                    </div>
                                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
                                        <p className="text-2xl font-bold text-indigo-600">{syncResult.stats.teamsCreated}</p>
                                        <p className="text-xs text-slate-500">New Teams</p>
                                    </div>
                                </div>
                            )}

                            {/* Unmatched Employees */}
                            {syncResult.stats.unmatched.length > 0 && (
                                <div>
                                    <p className="text-sm font-medium text-amber-600 mb-2 flex items-center gap-1">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        {syncResult.stats.unmatched.length} employee(s) not matched to registered users:
                                    </p>
                                    <div className="max-h-40 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                                        {syncResult.stats.unmatched.map((name, i) => (
                                            <p key={i} className="text-sm text-slate-600">• {name}</p>
                                        ))}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2">
                                        These employees exist in the Google Sheet but have no registered account in the app.
                                    </p>
                                </div>
                            )}

                            <button
                                onClick={() => setSyncResult(null)}
                                className="w-full py-3 bg-slate-100 text-slate-700 font-bold rounded-full hover:bg-slate-200 transition-colors text-sm"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

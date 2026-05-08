'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageTabs } from '@/components/PageTabs';
import { useAppStore } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';
import { useCommentDraftTaskIds } from '@/lib/use-comment-drafts';
import { RichEditor } from '@/components/RichEditor';
import { DueCountdown } from '@/components/DueCountdown';
import { ForwardTimer } from '@/components/ForwardTimer';
import { SaveTaskButton } from '@/components/SaveTaskButton';
import { ImageLightbox } from '@/components/ImageLightbox';
import { sanitizeMeetingDescription } from '@/lib/sanitize';
import { linkifyHtml } from '@/lib/linkify';
import { TaskCommentsSection } from '@/components/TaskCommentsSection';
import { ShareNoteModal } from '@/components/ShareNoteModal';
import { TaskHelpPanel } from '@/components/TaskHelpPanel';

import {
    CheckCircle2, Clock, AlertCircle, Inbox, FileText,
    X, UserPlus, Star, Calendar as CalendarIcon, Plus,
    ChevronLeft, ChevronRight, Trash2, Pencil, Users, Bell, UserMinus,
    StickyNote, Pin, PinOff, Palette, ExternalLink, MessageSquare, Send as SendIcon,
    Loader2, Check, Share2, Archive, ArchiveRestore, PauseCircle
} from 'lucide-react';

interface ClaimedTask {
    id: string;
    title: string;
    description: string | null;
    status: string;
    urgency: string | null;
    task_token: string | null;
    requester_name: string | null;
    requester_email?: string | null;
    requester_division: string | null;
    assignee_id: string | null;
    created_at: string;
    claimed_at: string | null;
    completed_at: string | null;
    due_date: string | null;
    request_type: string | null;
    source?: string | null;
    direct_assignee_id?: string | null;
    assignee?: { name: string } | null;
    image_url?: string | null;
    attachment_link?: string | null;
    custom_fields?: { fileUrls?: string[]; referenceUrls?: string[] };
    reviews?: { id: string; reviewer_type: string; rating: number; comment: string | null; reviewer_name: string | null; created_at: string }[];
    needs_help?: boolean;
    help_requested_at?: string | null;
    helper_count?: number;
    helpers?: { id: string; name: string; image: string | null }[];
    is_helper?: boolean;
    archived_for_me?: boolean;
    pending_reason?: string | null;
    pending_tag?: string | null;
    pended_at?: string | null;
    pended_from_status?: string | null;
}

const PENDING_TAGS: { value: string; label: string }[] = [
    { value: 'waiting_on_brand', label: 'Waiting on brand' },
    { value: 'waiting_on_partner', label: 'Waiting on partner' },
    { value: 'waiting_on_internal', label: 'Waiting on internal team' },
    { value: 'waiting_on_user', label: 'Waiting on requester' },
    { value: 'other', label: 'Other' },
];
const PENDING_TAG_LABEL: Record<string, string> = Object.fromEntries(
    PENDING_TAGS.map(t => [t.value, t.label]),
);


const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    'todo': { label: 'New', color: 'text-sky-400', bg: 'bg-sky-500/20 border-sky-500/30' },
    'in-progress': { label: 'In Progress', color: 'text-indigo-400', bg: 'bg-indigo-500/20 border-indigo-500/30' },
    'review': { label: 'In Review', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' },
    'pending': { label: 'On Hold', color: 'text-amber-700', bg: 'bg-amber-500/20 border-amber-500/30' },
    'done': { label: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' },
    'archived': { label: 'Archived', color: 'text-slate-500', bg: 'bg-slate-500/20 border-slate-500/30' },
};

const urgencyConfig: Record<string, { label: string; bg: string; style?: React.CSSProperties }> = {
    'P1': { label: 'P1', bg: 'bg-rose-500' },
    'P2': { label: 'P2', bg: 'bg-orange-500' },
    'P3': { label: 'P3', bg: 'bg-amber-500' },
    'P4': { label: 'P4', bg: 'bg-emerald-500' },
    '5-minute': { label: '5min', bg: '', style: { backgroundColor: '#56CDFC', color: '#ffffff' } },
};

function MyTasksContent() {
    const { user, profile, isLeader } = useAuth();
    const draftTaskIds = useCommentDraftTaskIds();
    const searchParams = useSearchParams();
    const {
        tasks,
        projects,
        viewMode,
        setViewMode,
        selectedProjectId,
        setSelectedProject
    } = useAppStore();

    const [claimedTasks, setClaimedTasks] = useState<ClaimedTask[]>([]);
    const [loadingClaimed, setLoadingClaimed] = useState(true);
    const [viewTask, setViewTask] = useState<ClaimedTask | null>(null);
    const [taskComments, setTaskComments] = useState<any[]>([]);
    const [commentText, setCommentText] = useState('');
    const [commentSending, setCommentSending] = useState(false);
    const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
    const [reassignTo, setReassignTo] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [showReassign, setShowReassign] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    // Pending modal state — captures structured tag + free-text reason so the
    // requester gets a meaningful "your task is paused because X" toast.
    const [pendingModalTask, setPendingModalTask] = useState<ClaimedTask | null>(null);
    const [pendingModalReason, setPendingModalReason] = useState('');
    const [pendingModalTag, setPendingModalTag] = useState<string>('waiting_on_brand');
    const [pendingModalSubmitting, setPendingModalSubmitting] = useState(false);
    const [pendingActionTaskId, setPendingActionTaskId] = useState<string | null>(null);
    const [claimTab, setClaimTab] = useState<'direct' | 'queue'>('queue');
    const [claimedFilter, setClaimedFilter] = useState<'all' | 'inProgress' | 'pending' | 'done' | 'overdue' | 'archive'>('all');
    const [notes, setNotes] = useState<any[]>([]);
    const [editingNote, setEditingNote] = useState<any | null>(null);
    const [showAllNotes, setShowAllNotes] = useState(false);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [shareNoteOpen, setShareNoteOpen] = useState(false);
    const [creatingNote, setCreatingNote] = useState(false);
    const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
    const NOTES_PREVIEW_COUNT = 2;
    const [showCompleteForm, setShowCompleteForm] = useState(false);
    const [completeForm, setCompleteForm] = useState({
        completedAt: new Date().toISOString().slice(0, 16),
        completedBy: '',
        difficultyScore: 3,
        actualTimeSpent: '' as number | '',
        timeUnit: 'minutes',
        resolutionSummary: '',
    });

    useEffect(() => {
        if (user) {
            fetchClaimedTasks();
            fetchTeamMembers();
        }
    }, [user]);

    // Auto-refresh My Tasks / Direct Requests so incoming tasks show up without a manual reload.
    // Poll every 15s while the tab is visible; refetch immediately when the tab regains focus.
    useEffect(() => {
        if (!user) return;
        let intervalId: ReturnType<typeof setInterval> | null = null;
        const start = () => {
            if (intervalId) return;
            intervalId = setInterval(() => fetchClaimedTasks({ silent: true }), 15000);
        };
        const stop = () => { if (intervalId) { clearInterval(intervalId); intervalId = null; } };
        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                fetchClaimedTasks({ silent: true });
                start();
            } else {
                stop();
            }
        };
        if (document.visibilityState === 'visible') start();
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            stop();
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [user]);

    // Deep-link from /later or comment notifications — open view modal for ?task=<id>
    // Extra params: ?focus=comments scrolls the modal to the Comments section,
    // ?comment=<id> additionally flash-highlights that specific comment.
    useEffect(() => {
        const taskParam = searchParams.get('task');
        if (!taskParam || claimedTasks.length === 0) return;
        const found = claimedTasks.find(t => t.id === taskParam);
        if (found) {
            const focus = searchParams.get('focus');
            const commentId = searchParams.get('comment');
            setClaimTab(found.source === 'direct_request' ? 'direct' : 'queue');
            setViewTask(found);
            setTaskComments([]);
            setCommentText('');
            setHighlightCommentId(commentId);
            if (focus === 'comments') {
                setTimeout(() => {
                    const el = document.getElementById('task-comments-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 350);
            }
            window.history.replaceState({}, '', '/tasks');
        }
    }, [searchParams, claimedTasks]);

    const getAuthHeaders = async () => {
        return {} as Record<string, string>;
    };

    const fetchClaimedTasks = async (opts?: { silent?: boolean }) => {
        if (!opts?.silent) setLoadingClaimed(true);
        try {
            // 3 sources: primary-assignee queue tasks, direct-request tasks, and tasks where
            // I'm an approved helper. Concat then dedupe by id (a user could appear in multiple
            // lists if the state ever crosses over).
            const [nexusRes, directRes, helpingRes] = await Promise.all([
                fetch('/api/nexus'),
                fetch('/api/tasks/my-direct-requests'),
                fetch('/api/tasks/helping'),
            ]);
            const map = new Map<string, any>();
            if (nexusRes.ok) {
                const all = await nexusRes.json();
                for (const t of all.filter((t: any) => t.assignee_id === user?.id)) map.set(t.id, t);
            }
            if (directRes.ok) {
                const directTasks = await directRes.json();
                for (const t of directTasks) map.set(t.id, t);
            }
            if (helpingRes.ok) {
                const helperTasks = await helpingRes.json();
                for (const t of helperTasks) {
                    // Only add if not already in the list (I'd be both owner and helper — shouldn't happen but guard anyway)
                    if (!map.has(t.id)) map.set(t.id, t);
                }
            }
            setClaimedTasks(Array.from(map.values()));
        } catch (err) {
            console.error('Error fetching claimed tasks:', err);
        }
        if (!opts?.silent) setLoadingClaimed(false);
    };

    const fetchTaskComments = async (taskId: string) => {
        try {
            const res = await fetch(`/api/tasks/${taskId}/comments`);
            if (res.ok) setTaskComments(await res.json());
        } catch {}
    };

    const handleSendTaskComment = async () => {
        if (!commentText.trim() || !viewTask) return;
        setCommentSending(true);
        try {
            const res = await fetch(`/api/tasks/${viewTask.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: commentText.trim() }),
            });
            if (res.ok) {
                setCommentText('');
                fetchTaskComments(viewTask.id);
            }
        } catch {}
        setCommentSending(false);
    };

    const fetchTeamMembers = async () => {
        try {
            const res = await fetch('/api/teammates');
            if (res.ok) {
                const data = await res.json();
                setTeamMembers(data.map((u: any) => ({ id: u.id, name: u.name })));
            }
        } catch { }
    };

    const showSuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(null), 3000);
    };

    // Open completion form
    const openCompleteForm = () => {
        setCompleteForm({
            completedAt: new Date().toISOString().slice(0, 16),
            completedBy: profile?.name || user?.name || '',
            difficultyScore: 3,
            actualTimeSpent: '',
            timeUnit: 'minutes',
            resolutionSummary: '',
        });
        setShowCompleteForm(true);
    };

    const submitPendingTask = async () => {
        if (!pendingModalTask || !pendingModalReason.trim() || pendingModalSubmitting) return;
        setPendingModalSubmitting(true);
        try {
            const res = await fetch(`/api/tasks/${pendingModalTask.id}/pending`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reason: pendingModalReason.trim(),
                    tag: pendingModalTag,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                alert(body?.error || 'Failed to mark task pending');
                return;
            }
            setPendingModalTask(null);
            setPendingModalReason('');
            await fetchClaimedTasks({ silent: true });
            // Reflect in the open detail modal so the user sees the new pending state instantly.
            setViewTask((prev) => prev && prev.id === pendingModalTask.id ? {
                ...prev,
                status: 'pending',
                pending_reason: pendingModalReason.trim(),
                pending_tag: pendingModalTag,
                pended_at: new Date().toISOString(),
                pended_from_status: prev.status,
            } : prev);
        } catch (err: any) {
            alert(err?.message || 'Failed to mark task pending');
        } finally {
            setPendingModalSubmitting(false);
        }
    };

    const handleResumeTask = async (task: ClaimedTask) => {
        if (pendingActionTaskId) return;
        setPendingActionTaskId(task.id);
        try {
            const res = await fetch(`/api/tasks/${task.id}/pending`, { method: 'DELETE' });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                alert(body?.error || 'Failed to resume task');
                return;
            }
            await fetchClaimedTasks({ silent: true });
            setViewTask((prev) => prev && prev.id === task.id ? {
                ...prev,
                status: prev.pended_from_status || 'in-progress',
                pending_reason: null,
                pending_tag: null,
                pended_at: null,
                pended_from_status: null,
            } : prev);
        } catch (err: any) {
            alert(err?.message || 'Failed to resume task');
        } finally {
            setPendingActionTaskId(null);
        }
    };

    // Submit completion form
    const handleCompleteSubmit = async () => {
        if (!viewTask) return;
        setActionLoading(true);
        try {
            const res = await fetch(`/api/tasks/${viewTask.id}/complete`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...completeForm,
                    actualTimeSpent: Number(completeForm.actualTimeSpent) || 0,
                }),
            });
            if (res.ok) {
                await fetchClaimedTasks();
                setViewTask(null);
                setShowCompleteForm(false);
                showSuccess('Task marked as completed!');
            }
        } catch (err) {
            console.error('Error completing task:', err);
        }
        setActionLoading(false);
    };

    // Reassign task to another member
    const handleReassign = async () => {
        if (!viewTask || !reassignTo) return;
        setActionLoading(true);
        try {
            const res = await fetch(`/api/tasks/${viewTask.id}/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reassignTo }),
            });
            if (res.ok) {
                await fetchClaimedTasks();
                setViewTask(null);
                setShowReassign(false);
                setReassignTo('');
                const memberName = teamMembers.find(m => m.id === reassignTo)?.name || 'member';
                showSuccess(`Task reassigned to ${memberName}!`);
            } else {
                const data = await res.json().catch(() => ({}));
                alert(data?.error || `Reassignment failed (HTTP ${res.status}).`);
            }
        } catch (err) {
            console.error('Error reassigning task:', err);
            alert('Network error while reassigning. Please try again.');
        }
        setActionLoading(false);
    };

    // ─── Notes ────────────────────────────────────────────────────────────────
    const noteColors: Record<string, { bg: string; border: string }> = {
        default: { bg: 'bg-white', border: 'border-slate-200' },
        yellow: { bg: 'bg-amber-50', border: 'border-amber-200' },
        green: { bg: 'bg-emerald-50', border: 'border-emerald-200' },
        blue: { bg: 'bg-blue-50', border: 'border-blue-200' },
        purple: { bg: 'bg-purple-50', border: 'border-purple-200' },
        pink: { bg: 'bg-pink-50', border: 'border-pink-200' },
        red: { bg: 'bg-rose-50', border: 'border-rose-200' },
        orange: { bg: 'bg-orange-50', border: 'border-orange-200' },
    };

    const fetchNotes = async () => {
        try {
            const res = await fetch('/api/notes');
            if (res.ok) {
                const data = await res.json();
                setNotes(data);
            }
        } catch (err) {
            console.error('Error fetching notes:', err);
        }
    };

    // Clicking "Add new note" immediately creates a blank note server-side
    // and opens it in the edit modal — which auto-saves as the user types.
    // Empty notes (no title + no content) are deleted on modal close.
    const handleAddNewNote = async () => {
        if (creatingNote) return;
        setCreatingNote(true);
        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: '', content: '', color: 'default' }),
            });
            if (res.ok) {
                const note = await res.json();
                await fetchNotes();
                setEditingNote(note);
            }
        } catch (err) {
            console.error('Error creating note:', err);
        }
        setCreatingNote(false);
    };

    const handleUpdateNote = async (note: any) => {
        try {
            const res = await fetch('/api/notes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: note.id, title: note.title, content: note.content, color: note.color, pinned: note.pinned }),
            });
            if (res.ok) {
                await fetchNotes();
                setEditingNote(null);
            }
        } catch (err) {
            console.error('Error updating note:', err);
        }
    };

    // ─── Auto-save for the edit-note modal ───────────────────────────
    const [noteSaveStatus, setNoteSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const noteSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedNoteSnapshotRef = useRef<string>('');

    const noteSnapshot = (n: any) => JSON.stringify({
        title: n?.title || '',
        content: n?.content || '',
        color: n?.color || 'default',
        pinned: !!n?.pinned,
    });

    const persistNote = useCallback(async (note: any) => {
        if (!note?.id) return;
        setNoteSaveStatus('saving');
        try {
            const res = await fetch('/api/notes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: note.id, title: note.title, content: note.content, color: note.color, pinned: note.pinned }),
            });
            if (res.ok) {
                lastSavedNoteSnapshotRef.current = noteSnapshot(note);
                setNoteSaveStatus('saved');
            } else {
                setNoteSaveStatus('error');
            }
        } catch {
            setNoteSaveStatus('error');
        }
    }, []);

    // Snapshot the note when the modal opens (or switches to another note)
    useEffect(() => {
        if (editingNote?.id) {
            lastSavedNoteSnapshotRef.current = noteSnapshot(editingNote);
            setNoteSaveStatus('saved');
        }
        return () => {
            if (noteSaveTimerRef.current) {
                clearTimeout(noteSaveTimerRef.current);
                noteSaveTimerRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingNote?.id]);

    // Debounced save when the note is edited
    useEffect(() => {
        if (!editingNote?.id) return;
        const current = noteSnapshot(editingNote);
        if (current === lastSavedNoteSnapshotRef.current) return;
        setNoteSaveStatus('saving');
        if (noteSaveTimerRef.current) clearTimeout(noteSaveTimerRef.current);
        noteSaveTimerRef.current = setTimeout(() => {
            persistNote(editingNote);
        }, 800);
        return () => {
            if (noteSaveTimerRef.current) clearTimeout(noteSaveTimerRef.current);
        };
    }, [editingNote?.title, editingNote?.content, editingNote?.color, editingNote?.pinned, editingNote?.id, persistNote]);

    // Flush any pending save and close the modal.
    // If the note is still completely blank (no title + no content after stripping tags),
    // delete it so the list doesn't accumulate empty entries.
    const closeEditingNote = useCallback(async () => {
        const note = editingNote;
        if (noteSaveTimerRef.current) {
            clearTimeout(noteSaveTimerRef.current);
            noteSaveTimerRef.current = null;
        }
        const plainContent = (note?.content || '').replace(/<[^>]*>/g, '').trim();
        const isBlank = !(note?.title || '').trim() && !plainContent;
        if (note?.id && isBlank) {
            await fetch('/api/notes', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: note.id }),
            }).catch(() => {});
        } else if (note && noteSnapshot(note) !== lastSavedNoteSnapshotRef.current) {
            await persistNote(note);
        }
        await fetchNotes();
        setEditingNote(null);
    }, [editingNote, persistNote]);

    const handleDeleteNote = async (id: string) => {
        try {
            const res = await fetch('/api/notes', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            if (res.ok) {
                await fetchNotes();
                setEditingNote(null);
            }
        } catch (err) {
            console.error('Error deleting note:', err);
        }
    };

    const handlePinNote = async (note: any) => {
        try {
            const res = await fetch('/api/notes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: note.id, pinned: !note.pinned }),
            });
            if (res.ok) {
                await fetchNotes();
            }
        } catch (err) {
            console.error('Error pinning note:', err);
        }
    };

    useEffect(() => {
        if (user) {
            fetchNotes();
        }
    }, [user]);

    const sortedNotes = useMemo(() => {
        return [...notes].sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    }, [notes]);

    // Claimed tasks stats (exclude both global-archived and personal-archived from active)
    const activeClaimed = claimedTasks.filter(t => t.status !== 'archived' && !t.archived_for_me);
    const personalArchived = claimedTasks.filter(t => t.archived_for_me);
    // Pending tasks are paused — exclude them from Overdue and from In Progress
    // so the assignee isn't double-counted (and isn't penalized for blockers
    // outside their control).
    const claimedStats = {
        total: activeClaimed.length,
        inProgress: activeClaimed.filter(t => t.status === 'in-progress').length,
        pending: activeClaimed.filter(t => t.status === 'pending').length,
        done: activeClaimed.filter(t => t.status === 'done').length,
        overdue: activeClaimed.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done' && t.status !== 'archived' && t.status !== 'pending').length,
        archive: personalArchived.length,
    };

    const claimedTasksMatchingFilter = (() => {
        if (claimedFilter === 'archive') return personalArchived;
        if (claimedFilter === 'inProgress') return activeClaimed.filter(t => t.status === 'in-progress');
        if (claimedFilter === 'pending') return activeClaimed.filter(t => t.status === 'pending');
        if (claimedFilter === 'done') return activeClaimed.filter(t => t.status === 'done');
        if (claimedFilter === 'overdue') return activeClaimed.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done' && t.status !== 'archived' && t.status !== 'pending');
        return activeClaimed;
    })();

    const handlePersonalArchive = async (taskId: string, archive: boolean) => {
        try {
            const res = await fetch(`/api/tasks/${taskId}/personal-archive`, {
                method: archive ? 'POST' : 'DELETE',
            });
            if (res.ok) await fetchClaimedTasks({ silent: true });
        } catch (err) {
            console.error('archive error', err);
        }
    };

    // For local store tasks
    const currentUserId = 'user-1';
    const myTasks = useMemo(() => {
        return tasks.filter(t => t.assigneeId === currentUserId);
    }, [tasks, currentUserId]);

    const taskStats = useMemo(() => ({
        todo: myTasks.filter(t => t.status === 'todo').length,
        inProgress: myTasks.filter(t => t.status === 'in-progress').length,
        done: myTasks.filter(t => t.status === 'done').length,
    }), [myTasks]);

    const myProjects = useMemo(() => {
        const projectIds = [...new Set(myTasks.map(t => t.projectId))];
        return projects.filter(p => projectIds.includes(p.id));
    }, [myTasks, projects]);

    const activeProjectId = selectedProjectId || myProjects[0]?.id;
    const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    // 24h "HH:MM" — matches Indonesian business convention.
    const formatTime = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    // Split claimed tasks by source — using the filtered set so KPI selection cascades through.
    const directRequestTasks = claimedTasksMatchingFilter.filter(t => t.source === 'direct_request');
    const queueTasks = claimedTasksMatchingFilter.filter(t => t.source !== 'direct_request');

    return (
        <div className="space-y-6">
            {/* Success Toast */}
            {successMsg && (
                <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl shadow-lg">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm font-medium">{successMsg}</span>
                </div>
            )}

            <PageTabs tabs={[
                { href: '/tasks', label: 'My Tasks' },
                { href: '/nexus', label: 'Task Queue' },
                { href: '/team-inbox', label: 'Cards Inbox' },
                { href: '/orbit', label: 'AHA Orbit' },
            ]} />

            {/* Claimed Tasks Stats — clickable filters (toggle-style, like Task Queue). */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                    { key: 'all' as const, label: 'Total Claimed', count: claimedStats.total, icon: Inbox, color: 'text-sky-400', ring: 'ring-sky-500/30' },
                    { key: 'inProgress' as const, label: 'In Progress', count: claimedStats.inProgress, icon: AlertCircle, color: 'text-indigo-400', ring: 'ring-indigo-500/30' },
                    { key: 'pending' as const, label: 'Pending', count: claimedStats.pending, icon: PauseCircle, color: 'text-amber-500', ring: 'ring-amber-500/30' },
                    { key: 'done' as const, label: 'Completed', count: claimedStats.done, icon: CheckCircle2, color: 'text-emerald-400', ring: 'ring-emerald-500/30' },
                    { key: 'overdue' as const, label: 'Overdue', count: claimedStats.overdue, icon: Clock, color: 'text-rose-400', ring: 'ring-rose-500/30' },
                    { key: 'archive' as const, label: 'Archive', count: claimedStats.archive, icon: Archive, color: 'text-slate-500', ring: 'ring-slate-500/30' },
                ].map(kpi => (
                    <button
                        key={kpi.key}
                        type="button"
                        onClick={() => setClaimedFilter(claimedFilter === kpi.key ? 'all' : kpi.key)}
                        className={`p-4 bg-white shadow-sm border rounded-xl text-left transition-all hover:bg-slate-50 ${
                            claimedFilter === kpi.key ? `border-indigo-500/50 ring-2 ${kpi.ring}` : 'border-slate-200'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                            <span className="text-xs text-slate-500">{kpi.label}</span>
                        </div>
                        <p className="text-2xl font-bold text-slate-900">{kpi.count}</p>
                    </button>
                ))}
            </div>

            {/* Claimed Tasks Tables */}
            {loadingClaimed ? (
                <div className="text-center py-8">
                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">Loading claimed tasks...</p>
                </div>
            ) : claimedTasks.length === 0 ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center max-w-sm mx-auto shadow-sm">
                    <Inbox className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-slate-900">No active tasks</h3>
                    <p className="text-slate-500 text-xs mt-1">Go to List Task Queue &rarr; View a task &rarr; Click &quot;Claim This Task&quot;</p>
                </div>
            ) : (
                <div>
                    {/* Tab Toggle — Centered */}
                    <div className="flex justify-center mb-4">
                        <div className="bg-slate-100 p-1.5 rounded-2xl inline-flex gap-1">
                            <button
                                onClick={() => setClaimTab('direct')}
                                className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${claimTab === 'direct' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <UserPlus className="w-4 h-4" />
                                Direct Requests
                                {directRequestTasks.length > 0 && (
                                    <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full font-bold">{directRequestTasks.length}</span>
                                )}
                            </button>
                            <button
                                onClick={() => setClaimTab('queue')}
                                className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 ${claimTab === 'queue' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <FileText className="w-4 h-4" />
                                Open Queue
                                {queueTasks.length > 0 && (
                                    <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">{queueTasks.length}</span>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Tab Content */}
                    {claimTab === 'direct' ? (
                        directRequestTasks.length === 0 ? (
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center shadow-sm">
                                <p className="text-slate-400 text-sm">No tasks from direct requests</p>
                            </div>
                        ) : (
                            <>
                            {/* Mobile (below md) — stacked cards. Same data, same click handler. */}
                            <ul className="md:hidden space-y-2.5">
                                {directRequestTasks.map(task => {
                                    const urgency = urgencyConfig[task.urgency || 'P3'];
                                    const status = statusConfig[task.status] || statusConfig['in-progress'];
                                    return (
                                        <li key={task.id}>
                                            <button
                                                type="button"
                                                onClick={() => { setViewTask(task); setShowReassign(false); setReassignTo(''); setTaskComments([]); setCommentText(''); fetchTaskComments(task.id); }}
                                                className="w-full text-left bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm active:bg-slate-50 transition-colors"
                                            >
                                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${urgency?.bg || 'bg-slate-200'} ${urgency?.style ? '' : 'text-slate-900'}`} style={urgency?.style}>{urgency?.label || '—'}</span>
                                                    <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold border ${status.bg} ${status.color}`}>{status.label}</span>
                                                    <span className="ml-auto font-mono text-[11px] text-indigo-500">{task.task_token || '—'}</span>
                                                </div>
                                                <p className="font-semibold text-slate-900 text-sm leading-snug mb-2 break-words flex items-start gap-1.5 flex-wrap">
                                                    {task.needs_help && <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 border border-amber-300 text-amber-700 rounded-full">🙋</span>}
                                                    {task.is_helper && <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 border border-emerald-300 text-emerald-700 rounded-full">Helping</span>}
                                                    {draftTaskIds.has(task.id) && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full">✏️ Draft</span>}
                                                    <span className="break-words">{task.title}</span>
                                                </p>
                                                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                                                    <div>
                                                        <dt className="text-slate-400">Requester</dt>
                                                        <dd className="text-slate-700 font-medium truncate">{task.requester_name || '—'}</dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-slate-400">Deadline</dt>
                                                        <dd className="text-slate-700">
                                                            {task.due_date && task.status !== 'done' ? <DueCountdown dueDate={task.due_date} />
                                                                : task.due_date ? <span className="text-emerald-500 font-medium">✓ Done</span>
                                                                : <span className="text-slate-400">—</span>}
                                                        </dd>
                                                    </div>
                                                </dl>
                                                {(task.archived_for_me || (task.status === 'done' && task.assignee_id === user?.id)) && (
                                                    <div className="mt-2 pt-2 border-t border-slate-100 flex justify-end">
                                                        {task.archived_for_me ? (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); handlePersonalArchive(task.id, false); }}
                                                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                                                            >
                                                                <ArchiveRestore className="w-3.5 h-3.5" /> Restore
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); handlePersonalArchive(task.id, true); }}
                                                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                                                            >
                                                                <Archive className="w-3.5 h-3.5" /> Archive
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>

                            {/* Desktop / tablet — keep the dense 7-column table. */}
                            <div className="hidden md:block bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full table-fixed">
                                        <thead>
                                            <tr className="border-b border-slate-200">
                                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase w-[10%]">Token</th>
                                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase w-[8%]">Priority</th>
                                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase w-[23%]">Title</th>
                                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase w-[16%]">Requester</th>
                                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase w-[14%]">Deadline</th>
                                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase w-[12%]">Status</th>
                                                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase w-[8%]"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {directRequestTasks.map(task => {
                                                const urgency = urgencyConfig[task.urgency || 'P3'];
                                                const status = statusConfig[task.status] || statusConfig['in-progress'];
                                                const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
                                                return (
                                                    <tr
                                                        key={task.id}
                                                        onClick={() => { setViewTask(task); setShowReassign(false); setReassignTo(''); setTaskComments([]); setCommentText(''); fetchTaskComments(task.id); }}
                                                        className="cursor-pointer hover:bg-slate-100/30 transition-colors"
                                                    >
                                                        <td className="px-4 py-3">
                                                            <span className="font-mono text-sm text-indigo-400">{task.task_token || '\u2014'}</span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span
                                                                className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${urgency?.bg || 'bg-slate-700'} ${urgency?.style ? '' : 'text-slate-900'}`}
                                                                style={urgency?.style}
                                                            >
                                                                {urgency?.label || '\u2014'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <p className="text-sm text-slate-900 font-medium truncate max-w-[250px] flex items-center gap-1.5">
                                                                {task.needs_help && (
                                                                    <span title="Help requested" className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 border border-amber-300 text-amber-700 rounded-full shrink-0">
                                                                        🙋
                                                                    </span>
                                                                )}
                                                                {task.is_helper && (
                                                                    <span title="You are helping on this task" className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 border border-emerald-300 text-emerald-700 rounded-full shrink-0">
                                                                        Helping
                                                                    </span>
                                                                )}
                                                                {draftTaskIds.has(task.id) && (
                                                                    <span title="You have an unsent comment draft" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full shrink-0">
                                                                        ✏️ Draft
                                                                    </span>
                                                                )}
                                                                <span className="truncate">{task.title}</span>
                                                            </p>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <p className="text-sm text-slate-600">{task.requester_name || '\u2014'}</p>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            {task.due_date && task.status !== 'done' ? (
                                                                <DueCountdown dueDate={task.due_date} />
                                                            ) : task.due_date ? (
                                                                <span className="text-sm text-emerald-500 font-medium">✓</span>
                                                            ) : (
                                                                <span className="text-sm text-slate-400">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium border ${status.bg} ${status.color}`}>
                                                                {status.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            {task.archived_for_me ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); handlePersonalArchive(task.id, false); }}
                                                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                                                                    title="Restore from Archive"
                                                                >
                                                                    <ArchiveRestore className="w-3.5 h-3.5" /> Restore
                                                                </button>
                                                            ) : task.status === 'done' && task.assignee_id === user?.id ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); handlePersonalArchive(task.id, true); }}
                                                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                                                                    title="Archive (move to your personal Archive)"
                                                                >
                                                                    <Archive className="w-3.5 h-3.5" /> Archive
                                                                </button>
                                                            ) : null}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            </>
                        )
                    ) : (
                        queueTasks.length === 0 ? (
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center shadow-sm">
                                <p className="text-slate-400 text-sm">No tasks from the Open queue</p>
                            </div>
                        ) : (
                            <>
                            {/* Mobile (below md) — stacked cards. */}
                            <ul className="md:hidden space-y-2.5">
                                {queueTasks.map(task => {
                                    const urgency = urgencyConfig[task.urgency || 'P3'];
                                    const status = statusConfig[task.status] || statusConfig['in-progress'];
                                    return (
                                        <li key={task.id}>
                                            <button
                                                type="button"
                                                onClick={() => { setViewTask(task); setShowReassign(false); setReassignTo(''); setTaskComments([]); setCommentText(''); fetchTaskComments(task.id); }}
                                                className="w-full text-left bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm active:bg-slate-50 transition-colors"
                                            >
                                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                    <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${urgency?.bg || 'bg-slate-200'} ${urgency?.style ? '' : 'text-slate-900'}`} style={urgency?.style}>{urgency?.label || '—'}</span>
                                                    <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold border ${status.bg} ${status.color}`}>{status.label}</span>
                                                    <span className="ml-auto font-mono text-[11px] text-indigo-500">{task.task_token || '—'}</span>
                                                </div>
                                                <p className="font-semibold text-slate-900 text-sm leading-snug mb-2 break-words flex items-start gap-1.5 flex-wrap">
                                                    {task.needs_help && <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 border border-amber-300 text-amber-700 rounded-full">🙋</span>}
                                                    {task.is_helper && <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 border border-emerald-300 text-emerald-700 rounded-full">Helping</span>}
                                                    {draftTaskIds.has(task.id) && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full">✏️ Draft</span>}
                                                    <span className="break-words">{task.title}</span>
                                                </p>
                                                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                                                    <div>
                                                        <dt className="text-slate-400">Requester</dt>
                                                        <dd className="text-slate-700 font-medium truncate">{task.requester_name || '—'}</dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-slate-400">Deadline</dt>
                                                        <dd className="text-slate-700">
                                                            {task.due_date && task.status !== 'done' ? <DueCountdown dueDate={task.due_date} />
                                                                : task.due_date ? <span className="text-emerald-500 font-medium">✓ Done</span>
                                                                : <span className="text-slate-400">—</span>}
                                                        </dd>
                                                    </div>
                                                </dl>
                                                {(task.archived_for_me || (task.status === 'done' && task.assignee_id === user?.id)) && (
                                                    <div className="mt-2 pt-2 border-t border-slate-100 flex justify-end">
                                                        {task.archived_for_me ? (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); handlePersonalArchive(task.id, false); }}
                                                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                                                            >
                                                                <ArchiveRestore className="w-3.5 h-3.5" /> Restore
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); handlePersonalArchive(task.id, true); }}
                                                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                                                            >
                                                                <Archive className="w-3.5 h-3.5" /> Archive
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>

                            {/* Desktop / tablet — keep the dense 7-column table. */}
                            <div className="hidden md:block bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full table-fixed">
                                        <thead>
                                            <tr className="border-b border-slate-200">
                                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase w-[10%]">Token</th>
                                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase w-[8%]">Priority</th>
                                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase w-[23%]">Title</th>
                                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase w-[16%]">Requester</th>
                                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase w-[14%]">Deadline</th>
                                                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase w-[12%]">Status</th>
                                                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase w-[8%]"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/50">
                                            {queueTasks.map(task => {
                                                const urgency = urgencyConfig[task.urgency || 'P3'];
                                                const status = statusConfig[task.status] || statusConfig['in-progress'];
                                                const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
                                                return (
                                                    <tr
                                                        key={task.id}
                                                        onClick={() => { setViewTask(task); setShowReassign(false); setReassignTo(''); setTaskComments([]); setCommentText(''); fetchTaskComments(task.id); }}
                                                        className="cursor-pointer hover:bg-slate-100/30 transition-colors"
                                                    >
                                                        <td className="px-4 py-3">
                                                            <span className="font-mono text-sm text-indigo-400">{task.task_token || '\u2014'}</span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span
                                                                className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${urgency?.bg || 'bg-slate-700'} ${urgency?.style ? '' : 'text-slate-900'}`}
                                                                style={urgency?.style}
                                                            >
                                                                {urgency?.label || '\u2014'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <p className="text-sm text-slate-900 font-medium truncate max-w-[250px] flex items-center gap-1.5">
                                                                {task.needs_help && (
                                                                    <span title="Help requested" className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 border border-amber-300 text-amber-700 rounded-full shrink-0">
                                                                        🙋
                                                                    </span>
                                                                )}
                                                                {task.is_helper && (
                                                                    <span title="You are helping on this task" className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 border border-emerald-300 text-emerald-700 rounded-full shrink-0">
                                                                        Helping
                                                                    </span>
                                                                )}
                                                                {draftTaskIds.has(task.id) && (
                                                                    <span title="You have an unsent comment draft" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full shrink-0">
                                                                        ✏️ Draft
                                                                    </span>
                                                                )}
                                                                <span className="truncate">{task.title}</span>
                                                            </p>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <p className="text-sm text-slate-600">{task.requester_name || '\u2014'}</p>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            {task.due_date && task.status !== 'done' ? (
                                                                <DueCountdown dueDate={task.due_date} />
                                                            ) : task.due_date ? (
                                                                <span className="text-sm text-emerald-500 font-medium">✓</span>
                                                            ) : (
                                                                <span className="text-sm text-slate-400">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium border ${status.bg} ${status.color}`}>
                                                                {status.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            {task.archived_for_me ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); handlePersonalArchive(task.id, false); }}
                                                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                                                                    title="Restore from Archive"
                                                                >
                                                                    <ArchiveRestore className="w-3.5 h-3.5" /> Restore
                                                                </button>
                                                            ) : task.status === 'done' && task.assignee_id === user?.id ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); handlePersonalArchive(task.id, true); }}
                                                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                                                                    title="Archive (move to your personal Archive)"
                                                                >
                                                                    <Archive className="w-3.5 h-3.5" /> Archive
                                                                </button>
                                                            ) : null}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            </>
                        )
                    )}
                </div>
            )}

            {/* View Task Detail Modal */}
            {viewTask && (
                <div
                    className="fixed inset-0 z-50 flex items-stretch sm:items-center sm:justify-center bg-black/60 backdrop-blur-sm"
                    onClick={() => { if (!showCompleteForm) { setViewTask(null); setHighlightCommentId(null); } }}
                >
                    <div className="w-full max-w-2xl bg-white border-0 sm:border border-slate-200 rounded-none sm:rounded-2xl shadow-2xl h-full max-h-screen sm:h-auto sm:max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
                            <div>
                                <span className="font-mono text-base text-indigo-400">{viewTask.task_token}</span>
                                <h2 className="text-xl font-bold text-slate-900 mt-1">{viewTask.title}</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                {viewTask.claimed_at && (
                                    <ForwardTimer
                                        startAt={viewTask.claimed_at}
                                        stopAt={viewTask.completed_at}
                                        label={viewTask.completed_at ? 'Total' : 'Since claim'}
                                    />
                                )}
                                <SaveTaskButton taskId={viewTask.id} />
                                <button onClick={() => { setViewTask(null); setHighlightCommentId(null); }} className="p-1 text-slate-500 hover:text-slate-900">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Detail Content */}
                        <div className="p-6 space-y-5 text-base">
                            <div className="grid grid-cols-2 gap-5">
                                <div><p className="text-sm font-medium text-indigo-600 mb-0.5">Requester</p><p className="text-base text-slate-900 font-medium">{viewTask.requester_name || '—'}</p></div>
                                <div><p className="text-sm font-medium text-indigo-600 mb-0.5">Division</p><p className="text-base text-slate-900 font-medium">{viewTask.requester_division || '—'}</p></div>
                                <div><p className="text-sm font-medium text-indigo-600 mb-0.5">Priority</p><p className="text-base text-slate-900 font-medium">{viewTask.urgency || '—'}</p></div>
                                <div>
                                    <p className="text-sm font-medium text-indigo-600 mb-0.5">Status</p>
                                    <span className={`inline-flex px-3 py-1 rounded-lg text-sm font-medium border ${(statusConfig[viewTask.status] || statusConfig['in-progress']).bg} ${(statusConfig[viewTask.status] || statusConfig['in-progress']).color}`}>
                                        {(statusConfig[viewTask.status] || statusConfig['in-progress']).label}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-indigo-600 mb-0.5">Assigned To</p>
                                    <p className="text-base text-slate-900 font-medium">
                                        {viewTask.assignee?.name || 'Unassigned'}
                                        {(viewTask.helpers?.length ?? 0) > 0 && (
                                            <span className="text-slate-600">, {viewTask.helpers!.map(h => h.name).join(', ')}</span>
                                        )}
                                    </p>
                                </div>
                                <div><p className="text-sm font-medium text-indigo-600 mb-0.5">Submitted</p><p className="text-base text-slate-900 font-medium">{formatDate(viewTask.created_at)}, {formatTime(viewTask.created_at)}</p></div>
                                {viewTask.due_date && <div><p className="text-sm font-medium text-indigo-600 mb-0.5">Deadline</p><p className="text-base text-slate-900 font-medium">{formatDate(viewTask.due_date)}</p></div>}
                                {viewTask.request_type && <div><p className="text-sm font-medium text-indigo-600 mb-0.5">Type</p><p className="text-base text-slate-900 font-medium capitalize">{viewTask.request_type.replace('_', ' ')}</p></div>}
                            </div>

                            {viewTask.description && (
                                <div>
                                    <p className="text-sm font-medium text-indigo-600 mb-1.5">Description</p>
                                    <div
                                        className="text-slate-600 bg-slate-50 rounded-xl p-3 whitespace-pre-wrap [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_s]:line-through [&_strike]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:bg-slate-200 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded"
                                        dangerouslySetInnerHTML={{ __html: viewTask.description }}
                                    />
                                </div>
                            )}

                            {/* Attached Image */}
                            {(viewTask.image_url || viewTask.attachment_link) && (
                                <div>
                                    <p className="text-sm font-medium text-indigo-600 mb-1.5">Attached Image</p>
                                    <button
                                        type="button"
                                        onClick={() => setLightboxUrl(viewTask.image_url || viewTask.attachment_link || null)}
                                        className="block w-full"
                                    >
                                        <img
                                            src={viewTask.image_url || viewTask.attachment_link || ''}
                                            alt="Attachment"
                                            className="w-full max-h-64 object-contain rounded-xl border border-slate-300 bg-slate-50 hover:opacity-90 transition-opacity cursor-zoom-in"
                                        />
                                    </button>
                                </div>
                            )}

                            {/* Attached Files */}
                            {viewTask.custom_fields?.fileUrls && viewTask.custom_fields.fileUrls.length > 0 && (
                                <div>
                                    <p className="text-sm font-medium text-indigo-600 mb-1.5">Attached Files</p>
                                    <div className="space-y-1.5">
                                        {viewTask.custom_fields.fileUrls.map((url: string, i: number) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors">
                                                <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                                <span className="truncate">{decodeURIComponent(url.split('/').pop() || url)}</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Reference URLs */}
                            {viewTask.custom_fields?.referenceUrls && viewTask.custom_fields.referenceUrls.length > 0 && (
                                <div>
                                    <p className="text-sm font-medium text-indigo-600 mb-1.5">Reference Links</p>
                                    <div className="space-y-1.5">
                                        {viewTask.custom_fields.referenceUrls.map((url: string, i: number) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                                className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-600 hover:bg-indigo-100 transition-colors">
                                                <ExternalLink className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                                                <span className="truncate">{url}</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Reviews */}
                            {viewTask.reviews && viewTask.reviews.length > 0 && (
                                <div>
                                    <p className="text-slate-500 mb-2 font-semibold flex items-center gap-1.5">
                                        <Star className="w-4 h-4 text-amber-400" /> Reviews
                                    </p>
                                    <div className="space-y-2">
                                        {viewTask.reviews.map(r => (
                                            <div key={r.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-xs font-medium text-indigo-600">
                                                        {r.reviewer_type === 'requester' ? 'Requester Review' : 'Completer Review'}
                                                    </span>
                                                    <span className="text-[11px] text-slate-400">
                                                        {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1 mb-1">
                                                    {[1, 2, 3, 4, 5].map(s => (
                                                        <span key={s} className={`text-lg ${s <= r.rating ? 'text-amber-400' : 'text-slate-200'}`}>★</span>
                                                    ))}
                                                    <span className="text-sm font-semibold text-slate-700 ml-1">{r.rating}/5</span>
                                                </div>
                                                {r.comment && <p className="text-sm text-slate-600 mt-1">{r.comment}</p>}
                                                {r.reviewer_name && <p className="text-xs text-slate-400 mt-1.5">— {r.reviewer_name}</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Collaboration — Request to Help (with owner approval) */}
                            <TaskHelpPanel
                                taskId={viewTask.id}
                                assigneeId={viewTask.assignee_id}
                                currentUserId={user?.id}
                                needsHelp={!!viewTask.needs_help}
                                onTaskUpdated={async () => {
                                    // Refetch the task from the server and reconcile the modal's copy
                                    // so the needs_help flag + helper chips reflect the latest state.
                                    try {
                                        const res = await fetch('/api/nexus');
                                        if (res.ok) {
                                            const list: ClaimedTask[] = await res.json();
                                            const fresh = list.find(t => t.id === viewTask.id);
                                            if (fresh) setViewTask(fresh);
                                        }
                                    } catch {}
                                    fetchClaimedTasks();
                                }}
                                hidden={viewTask.status === 'done'}
                            />

                            {/* Comments */}
                            <div id="task-comments-section" className="scroll-mt-4">
                                <TaskCommentsSection
                                    key={viewTask.id}
                                    taskId={viewTask.id}
                                    currentUserId={user?.id}
                                    size="compact"
                                    highlightCommentId={highlightCommentId}
                                />
                            </div>

                            {/* Pending state callout — visible whenever the open task is paused.
                                Shown above the action buttons so the assignee sees WHY the task
                                is on hold before deciding to resume it. */}
                            {viewTask.status === 'pending' && (viewTask.pending_reason || viewTask.pending_tag) && (
                                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                                    <p className="text-xs font-bold text-amber-900 inline-flex items-center gap-1.5">
                                        <PauseCircle className="w-3.5 h-3.5" />
                                        On hold
                                        {viewTask.pending_tag && PENDING_TAG_LABEL[viewTask.pending_tag]
                                            ? ` — ${PENDING_TAG_LABEL[viewTask.pending_tag]}`
                                            : ''}
                                    </p>
                                    {viewTask.pending_reason && (
                                        <p className="text-xs text-amber-800 mt-1 leading-relaxed whitespace-pre-wrap">
                                            {viewTask.pending_reason}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Action Buttons */}
                            {viewTask.status !== 'done' && (
                                <div className="space-y-3 pt-2">
                                    {/* Mark as Pending / Resume — gated by current status AND
                                        by whether the viewer has authority to manage the pause.
                                        Mirrors the server-side canManagePending check so we
                                        don't render a button that would 403 on click. */}
                                    {(() => {
                                        const myEmail = profile?.email?.toLowerCase();
                                        const requesterEmail = viewTask.requester_email?.toLowerCase();
                                        const canManagePending =
                                            isLeader ||
                                            viewTask.assignee_id === user?.id ||
                                            (!!myEmail && !!requesterEmail && myEmail === requesterEmail);
                                        if (!canManagePending) return null;
                                        if (viewTask.status !== 'pending') {
                                            return (
                                                <button
                                                    onClick={() => {
                                                        setPendingModalTask(viewTask);
                                                        setPendingModalReason('');
                                                        setPendingModalTag('waiting_on_brand');
                                                    }}
                                                    className="w-full py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold rounded-xl border border-amber-300 transition-all flex items-center justify-center gap-2 text-sm"
                                                >
                                                    <PauseCircle className="w-4 h-4" /> Mark as Pending
                                                </button>
                                            );
                                        }
                                        return (
                                            <button
                                                onClick={() => handleResumeTask(viewTask)}
                                                disabled={pendingActionTaskId === viewTask.id}
                                                className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold rounded-xl border border-emerald-300 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                                            >
                                                <CheckCircle2 className="w-4 h-4" /> Resume Task
                                            </button>
                                        );
                                    })()}

                                    {/* Complete Button — opens form */}
                                    {!showCompleteForm ? (
                                        <button
                                            onClick={openCompleteForm}
                                            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            <CheckCircle2 className="w-4 h-4" />
                                            Mark as Completed
                                        </button>
                                    ) : (
                                        <div className="p-4 bg-slate-50 border border-slate-300 rounded-xl space-y-4">
                                            <h3 className="text-sm font-semibold text-slate-900">Complete This Task</h3>

                                            {/* Completion Date */}
                                            <div className="space-y-1">
                                                <label className="text-xs text-slate-500">Completion Date & Time</label>
                                                <input
                                                    type="datetime-local"
                                                    value={completeForm.completedAt}
                                                    onChange={(e) => setCompleteForm({ ...completeForm, completedAt: e.target.value })}
                                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                                />
                                            </div>

                                            {/* Completed By */}
                                            <div className="space-y-1">
                                                <label className="text-xs text-slate-500">Completed By</label>
                                                <div className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 text-sm">
                                                    {completeForm.completedBy || profile?.name || 'You'}
                                                </div>
                                            </div>

                                            {/* Difficulty Score */}
                                            <div className="space-y-1.5">
                                                <label className="text-xs text-slate-500">Difficulty Score</label>
                                                <div className="flex gap-1.5">
                                                    {[{ val: 1, label: 'Trivial' }, { val: 2, label: 'Easy' }, { val: 3, label: 'Medium' }, { val: 4, label: 'Hard' }, { val: 5, label: 'Complex' }].map(d => (
                                                        <button
                                                            key={d.val}
                                                            type="button"
                                                            onClick={() => setCompleteForm({ ...completeForm, difficultyScore: d.val })}
                                                            className={`flex-1 py-2 rounded-lg text-center text-xs font-medium border transition-all ${
                                                                completeForm.difficultyScore === d.val
                                                                    ? 'bg-indigo-500 text-white border-indigo-500'
                                                                    : 'bg-white text-slate-500 border-slate-300 hover:text-slate-900'
                                                            }`}
                                                        >
                                                            <div className="text-sm font-bold">{d.val}</div>
                                                            <div className="text-[10px] mt-0.5">{d.label}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Time Spent */}
                                            <div className="space-y-1">
                                                <label className="text-xs text-slate-500">Actual Time Spent <span className="text-rose-500">*</span></label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        placeholder="0"
                                                        value={completeForm.actualTimeSpent}
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            setCompleteForm({
                                                                ...completeForm,
                                                                actualTimeSpent: v === '' ? '' : Number(v),
                                                            });
                                                        }}
                                                        className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                                    />
                                                    <div className="flex gap-1 text-xs">
                                                        <button type="button" onClick={() => setCompleteForm({ ...completeForm, timeUnit: 'minutes' })} className={`px-2.5 py-1.5 rounded-lg ${completeForm.timeUnit === 'minutes' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>Min</button>
                                                        <button type="button" onClick={() => setCompleteForm({ ...completeForm, timeUnit: 'hours' })} className={`px-2.5 py-1.5 rounded-lg ${completeForm.timeUnit === 'hours' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>Hrs</button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Resolution Summary */}
                                            <div className="space-y-1">
                                                <label className="text-xs text-slate-500">Resolution Summary <span className="text-rose-500">*</span></label>
                                                <textarea
                                                    value={completeForm.resolutionSummary}
                                                    onChange={(e) => setCompleteForm({ ...completeForm, resolutionSummary: e.target.value })}
                                                    rows={2}
                                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                                                    placeholder="What was done to resolve this task?"
                                                />
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setShowCompleteForm(false)}
                                                    className="flex-1 py-2 bg-slate-100 text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-200 transition-colors text-sm font-medium"
                                                >Cancel</button>
                                                <button
                                                    onClick={handleCompleteSubmit}
                                                    disabled={actionLoading || !completeForm.actualTimeSpent || Number(completeForm.actualTimeSpent) <= 0 || !completeForm.resolutionSummary.trim()}
                                                    className="flex-1 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-colors text-sm font-medium flex items-center justify-center gap-1"
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    {actionLoading ? 'Saving...' : 'Done'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Reassign Button / Form
                                        Leaders & admins: can reassign any task.
                                        Members: can reassign any task they are the current assignee of — helpers cannot.
                                        (API enforces the same rules.) */}
                                    {!(isLeader || viewTask.assignee_id === user?.id) ? null : !showReassign ? (
                                        <button
                                            onClick={() => setShowReassign(true)}
                                            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium rounded-xl transition-all flex items-center justify-center gap-2 border border-slate-300"
                                        >
                                            <UserPlus className="w-4 h-4" />
                                            Assign to Other Member
                                        </button>
                                    ) : (
                                        <div className="p-4 bg-slate-50 border border-slate-300 rounded-xl space-y-3">
                                            <p className="text-sm text-slate-500 font-medium">Select a team member:</p>
                                            <select
                                                value={reassignTo}
                                                onChange={(e) => setReassignTo(e.target.value)}
                                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                                            >
                                                <option value="">Choose member...</option>
                                                {teamMembers
                                                    .filter(m => m.id !== user?.id)
                                                    .map(m => (
                                                        <option key={m.id} value={m.id}>{m.name}</option>
                                                    ))
                                                }
                                            </select>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => { setShowReassign(false); setReassignTo(''); }}
                                                    className="flex-1 py-2 bg-slate-100 text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-200 transition-colors text-sm font-medium"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleReassign}
                                                    disabled={!reassignTo || actionLoading}
                                                    className="flex-1 py-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-50 transition-colors text-sm font-medium"
                                                >
                                                    {actionLoading ? 'Reassigning...' : 'Confirm Reassign'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Done state */}
                            {viewTask.status === 'done' && (
                                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                                    <p className="text-sm text-emerald-300 flex items-center justify-center gap-2">
                                        <CheckCircle2 className="w-4 h-4" /> This task has been completed
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Notes + Calendar Side-by-Side ═══ */}
            <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">

            {/* ═══ My Notes (Google Keep Style) ═══ */}
            <div className="lg:col-span-3 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <StickyNote className="w-6 h-6 text-amber-500" />
                        My Notes
                    </h2>
                    <span className="text-xs text-slate-400">{sortedNotes.length} note{sortedNotes.length !== 1 ? 's' : ''}</span>
                </div>

                {/* ── Add New Note button — opens the auto-saving edit modal with a blank note ── */}
                <button
                    onClick={handleAddNewNote}
                    disabled={creatingNote}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-white border-2 border-dashed border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-indigo-600 font-semibold rounded-2xl transition-all disabled:opacity-50"
                >
                    {creatingNote ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Creating…
                        </>
                    ) : (
                        <>
                            <Plus className="w-4 h-4" /> Add new note
                        </>
                    )}
                </button>

                {/* ── Notes List (limited to 4, expandable) ── */}
                {sortedNotes.length > 0 ? (
                    <div className="space-y-3">
                        {sortedNotes.slice(0, NOTES_PREVIEW_COUNT).map(note => {
                            const colors = noteColors[note.color] || noteColors.default;
                            return (
                                <div key={note.id} onClick={() => setEditingNote({ ...note })}
                                    className={`${colors.bg} border-2 ${colors.border} rounded-2xl p-4 cursor-pointer group relative transition-all hover:shadow-lg hover:-translate-y-0.5`}>
                                    {note.pinned && <Pin className="w-3.5 h-3.5 text-slate-400 absolute top-3 right-3 rotate-45" />}
                                    {note.title && <h3 className="text-lg font-bold text-slate-900 mb-2 pr-6 line-clamp-2">{note.title}</h3>}
                                    {note.content && <div className="text-base text-slate-600 line-clamp-8 leading-relaxed [&_b]:font-bold [&_i]:italic [&_u]:underline [&_strike]:line-through [&_a]:text-indigo-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-7 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-7 [&_ol]:my-1 [&_li]:mb-0.5 [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-[10px] [&_code]:font-mono" dangerouslySetInnerHTML={{ __html: linkifyHtml(note.content) }} />}
                                    {!note.title && !note.content && <p className="text-xs text-slate-300 italic">Empty note</p>}
                                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-200/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={e => { e.stopPropagation(); handlePinNote(note); }}
                                            className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title={note.pinned ? 'Unpin' : 'Pin'}>
                                            {note.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                                        </button>
                                        <button onClick={e => { e.stopPropagation(); handleDeleteNote(note.id); }}
                                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete">
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                        <span className="ml-auto text-[9px] text-slate-300">{new Date(note.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                    </div>
                                </div>
                            );
                        })}

                        {/* View all notes — opens modal */}
                        {sortedNotes.length > NOTES_PREVIEW_COUNT && (
                            <button
                                onClick={() => setShowAllNotes(true)}
                                className="w-full py-2.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors border border-indigo-100"
                            >
                                View all {sortedNotes.length} notes
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-6">
                        <StickyNote className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">No notes yet</p>
                    </div>
                )}
            </div>

            {/* Edit Note Modal */}
            {editingNote && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { closeEditingNote(); }}>
                    <div onClick={e => e.stopPropagation()}
                        className={`w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col ${noteColors[editingNote.color]?.bg || 'bg-white'} border-2 ${noteColors[editingNote.color]?.border || 'border-slate-200'} rounded-2xl shadow-2xl transition-colors`}>
                        <div className="p-6 space-y-3 flex-1 overflow-y-auto">
                            <input
                                type="text"
                                value={editingNote.title || ''}
                                onChange={e => setEditingNote({ ...editingNote, title: e.target.value })}
                                placeholder="Title"
                                className="w-full text-xl font-bold text-slate-900 placeholder-slate-300 border-none outline-none bg-transparent"
                            />
                            <RichEditor
                                value={editingNote.content || ''}
                                onChange={(html) => setEditingNote({ ...editingNote, content: html })}
                                placeholder="Write something..."
                                minHeight="300px"
                            />
                        </div>
                        <div className="px-6 pb-2">
                            <div className="flex items-center gap-1.5">
                                <Palette className="w-4 h-4 text-slate-400 mr-1" />
                                {Object.entries(noteColors).map(([key, val]) => (
                                    <button key={key} onClick={() => setEditingNote({ ...editingNote, color: key })}
                                        className={`w-7 h-7 rounded-full border-2 transition-all ${val.bg} ${val.border} ${editingNote.color === key ? 'ring-2 ring-offset-2 ring-indigo-400 scale-110' : 'hover:scale-110'}`}
                                        title={key} />
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200/50">
                            <div className="flex items-center gap-1">
                                <button onClick={() => { handlePinNote(editingNote); setEditingNote(null); }}
                                    className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title={editingNote.pinned ? 'Unpin' : 'Pin'}>
                                    {editingNote.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                                </button>
                                <button onClick={() => { handleDeleteNote(editingNote.id); setEditingNote(null); }}
                                    className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => setShareNoteOpen(true)}
                                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Share">
                                    <Share2 className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                                    {noteSaveStatus === 'saving' && (
                                        <><Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" /> Saving…</>
                                    )}
                                    {noteSaveStatus === 'saved' && (
                                        <><Check className="w-3.5 h-3.5 text-emerald-500" /> Saved</>
                                    )}
                                    {noteSaveStatus === 'error' && (
                                        <><AlertCircle className="w-3.5 h-3.5 text-rose-500" /> Failed — retrying on close</>
                                    )}
                                </span>
                                <button onClick={() => closeEditingNote()}
                                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* View All Notes Modal */}
            {showAllNotes && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowAllNotes(false)}>
                    <div onClick={e => e.stopPropagation()}
                        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                <StickyNote className="w-5 h-5 text-amber-500" />
                                All Notes ({sortedNotes.length})
                            </h3>
                            <button onClick={() => setShowAllNotes(false)} className="p-1 text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                            {sortedNotes.map(note => {
                                const colors = noteColors[note.color] || noteColors.default;
                                return (
                                    <div key={note.id} onClick={() => { setShowAllNotes(false); setEditingNote({ ...note }); }}
                                        className={`${colors.bg} border-2 ${colors.border} rounded-2xl p-4 cursor-pointer group relative transition-all hover:shadow-lg hover:-translate-y-0.5`}>
                                        {note.pinned && <Pin className="w-3.5 h-3.5 text-slate-400 absolute top-3 right-3 rotate-45" />}
                                        {note.title && <h3 className="text-lg font-bold text-slate-900 mb-2 pr-6">{note.title}</h3>}
                                        {note.content && <div className="text-base text-slate-600 leading-relaxed [&_b]:font-bold [&_i]:italic [&_u]:underline [&_strike]:line-through [&_a]:text-indigo-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-7 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-7 [&_ol]:my-1 [&_li]:mb-0.5 [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-[10px] [&_code]:font-mono" dangerouslySetInnerHTML={{ __html: linkifyHtml(note.content) }} />}
                                        {!note.title && !note.content && <p className="text-xs text-slate-300 italic">Empty note</p>}
                                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-200/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={e => { e.stopPropagation(); handlePinNote(note); }}
                                                className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title={note.pinned ? 'Unpin' : 'Pin'}>
                                                {note.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                                            </button>
                                            <button onClick={e => { e.stopPropagation(); handleDeleteNote(note.id); }}
                                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="Delete">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                            <span className="ml-auto text-[10px] text-slate-400">{new Date(note.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Calendar Meeting Section — takes 3 columns. min-w-0 lets the grid
                child shrink below its content width on mobile so the calendar
                doesn't push past the viewport edge. */}
            <div className="lg:col-span-7 min-w-0">
                <CalendarMeetingSection />
            </div>

            </div>{/* end grid */}

            <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />

            <ShareNoteModal
                open={shareNoteOpen}
                onClose={() => setShareNoteOpen(false)}
                note={editingNote ? { id: editingNote.id, title: editingNote.title, content: editingNote.content } : null}
            />

            {/* Mark-as-Pending modal — My Tasks. Layered above the View Task
                modal (z-[80]) so it stays visible while the underlying detail
                stays open behind it. Same shape as Cards Inbox / Task Queue
                so reporting can group blockers the same way. */}
            {pendingModalTask && (
                <div
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    onClick={() => !pendingModalSubmitting && setPendingModalTask(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                                <PauseCircle className="w-5 h-5 text-amber-500" />
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Mark task as Pending</h3>
                                    <p className="text-[11px] text-slate-500 line-clamp-1">{pendingModalTask.title}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => !pendingModalSubmitting && setPendingModalTask(null)}
                                disabled={pendingModalSubmitting}
                                className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-3">
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Pause the overdue clock while you wait on something external.
                                The requester will get a notification with your reason so they
                                can chase the blocker on their side.
                            </p>
                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">Blocker</label>
                                <select
                                    value={pendingModalTag}
                                    onChange={(e) => setPendingModalTag(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500"
                                >
                                    {PENDING_TAGS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-700 block mb-1">Reason <span className="text-rose-500">*</span></label>
                                <textarea
                                    value={pendingModalReason}
                                    onChange={(e) => setPendingModalReason(e.target.value)}
                                    rows={3}
                                    placeholder="e.g. Waiting on brand to confirm the new price for SKU-203."
                                    autoFocus
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setPendingModalTask(null)}
                                disabled={pendingModalSubmitting}
                                className="px-4 py-2 text-sm text-slate-600 rounded-full hover:bg-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={submitPendingTask}
                                disabled={!pendingModalReason.trim() || pendingModalSubmitting}
                                className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-full disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {pendingModalSubmitting ? 'Pausing…' : (<><PauseCircle className="w-3.5 h-3.5" /> Pause task</>)}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Calendar Meeting Section ─────────────────────────────────────────────────

interface MeetingGuest {
    id: string;
    name: string;
}

interface Meeting {
    id: string;
    title: string;
    description: string | null;
    meeting_date: string;
    start_time: string;
    end_time: string;
    created_by: string;
    assigned_to: string;
    source: string;
    status: string;
    created_at: string;
    notify_before: number;
    creator?: { name: string } | null;
    assignee?: { name: string } | null;
    guests: MeetingGuest[];
    meeting_link?: string | null;
    organizer_name?: string | null;
    organizer_email?: string | null;
}

function CalendarMeetingSection() {
    const { user, profile, isLeader } = useAuth();
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    });
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
    const [weekStart, setWeekStart] = useState<Date>(() => {
        const now = new Date();
        const day = now.getDay();
        const diff = day === 0 ? -6 : 1 - day; // Monday
        const monday = new Date(now);
        monday.setDate(now.getDate() + diff);
        monday.setHours(0, 0, 0, 0);
        return monday;
    });
    const [dayViewDate, setDayViewDate] = useState<Date>(() => new Date());
    const [showAddModal, setShowAddModal] = useState(false);
    const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
    const [detailMeeting, setDetailMeeting] = useState<Meeting | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [addGuestId, setAddGuestId] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [pendingNotifyBefore, setPendingNotifyBefore] = useState<number | null>(null);
    const [notifyConfirmed, setNotifyConfirmed] = useState(false);

    // Google Calendar integration
    const [gcalConnected, setGcalConnected] = useState(false);
    const [gcalDisconnecting, setGcalDisconnecting] = useState(false);
    const [showDisconnectModal, setShowDisconnectModal] = useState(false);
    const [gcalEvents, setGcalEvents] = useState<any[]>([]);
    const [gcalLoading, setGcalLoading] = useState(false);
    const [gcalConnecting, setGcalConnecting] = useState(false);

    // Teammate Subscriptions
    const [subscribedUsers, setSubscribedUsers] = useState<string[]>([]);
    const [showSubscribeDropdown, setShowSubscribeDropdown] = useState(false);

    const [form, setForm] = useState({
        title: '',
        description: '',
        meetingDate: '',
        startTime: '09:00',
        endTime: '10:00',
        assignedTo: '',
        source: 'member',
    });

    const [editForm, setEditForm] = useState({
        title: '',
        description: '',
        meetingDate: '',
        startTime: '',
        endTime: '',
        notifyBefore: 0,
    });

    useEffect(() => {
        fetchMeetings();
        fetchMembers();
        checkGcalStatus();
    }, [currentMonth, user, subscribedUsers]);

    const checkGcalStatus = async () => {
        try {
            const res = await fetch('/api/google-calendar');
            if (res.ok) {
                const json = await res.json();
                const connected = json.data?.connected ?? json.connected;
                setGcalConnected(connected);
                if (connected) fetchGcalEvents();
            }
        } catch { }
    };

    const fetchGcalEvents = async () => {
        setGcalLoading(true);
        try {
            let url = `/api/google-calendar?action=events&year=${currentMonth.year}&month=${currentMonth.month}`;
            if (subscribedUsers.length > 0 && user) {
                url += `&userIds=${[user.id, ...subscribedUsers].join(',')}`;
            }
            const res = await fetch(url);
            if (res.ok) {
                const json = await res.json();
                const events = json.data?.events ?? json.events ?? [];
                setGcalEvents(events);
            }
        } catch { }
        setGcalLoading(false);
    };

    // Handle URL search params for deep-linking from notifications
    const searchParams = useSearchParams();
    useEffect(() => {
        const dateParam = searchParams.get('date');
        const meetingIdParam = searchParams.get('meetingId');

        if (dateParam && meetings.length > 0) {
            // Parse the date to set the right month
            const [y, m] = dateParam.split('-').map(Number);
            setCurrentMonth({ year: y, month: m - 1 });
            setSelectedDate(dateParam);

            // If meetingId param, auto-open the meeting detail
            if (meetingIdParam) {
                const meeting = meetings.find(mt => mt.id === meetingIdParam);
                if (meeting) openDetail(meeting);
            }

            // Clear the params so they don't re-trigger
            window.history.replaceState({}, '', '/tasks');
        }
    }, [searchParams, meetings]);

    const getAuthHeaders = async () => {
        return {} as Record<string, string>;
    };

    const fetchMeetings = async () => {
        setLoading(true);
        try {
            const monthStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}`;
            let url = `/api/meetings?month=${monthStr}`;
            if (subscribedUsers.length > 0 && user) {
                url += `&userIds=${[user.id, ...subscribedUsers].join(',')}`;
            }
            const res = await fetch(url);
            if (res.ok) {
                const json = await res.json();
                setMeetings(json.data ?? json);
            }
        } catch (err) {
            console.error('Error fetching meetings:', err);
        }
        setLoading(false);
    };

    const fetchMembers = async () => {
        try {
            const res = await fetch('/api/teammates');
            if (res.ok) {
                const data = await res.json();
                setTeamMembers(data.map((u: any) => ({ id: u.id, name: u.name })));
            }
        } catch { }
    };

    const handleAddMeeting = async () => {
        if (!form.title || !form.meetingDate || !form.startTime || !form.endTime) return;
        try {
            const res = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: form.title,
                    description: form.description || null,
                    meetingDate: form.meetingDate,
                    startTime: form.startTime,
                    endTime: form.endTime,
                    assignedTo: form.assignedTo || user?.id,
                    source: isLeader ? 'leader' : form.source,
                }),
            });
            if (res.ok) {
                await fetchMeetings();
                setShowAddModal(false);
                resetForm();
            }
        } catch (err) {
            console.error('Error creating meeting:', err);
        }
    };

    const handleConnectGoogleCalendar = async () => {
        setGcalConnecting(true);
        try {
            const res = await fetch('/api/auth/google');
            if (res.ok) {
                const data = await res.json();
                if (data.url) {
                    window.location.href = data.url;
                }
            } else {
                console.error('Failed to get Google Auth URL', await res.text());
                setGcalConnecting(false);
            }
        } catch (err) {
            console.error('Error connecting Google Calendar:', err);
            setGcalConnecting(false);
        }
    };

    const handleDisconnectGoogleCalendar = async () => {
        setShowDisconnectModal(false);
        setGcalDisconnecting(true);
        try {
            const res = await fetch('/api/auth/google/disconnect', { method: 'POST' });
            if (res.ok) {
                setGcalConnected(false);
                setGcalEvents([]);
            }
        } catch (err) {
            console.error('Error disconnecting Google Calendar:', err);
        } finally {
            setGcalDisconnecting(false);
        }
    };

    const handleDeleteMeeting = async (id: string) => {
        try {
            await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
            await fetchMeetings();
        } catch (err) {
            console.error('Error deleting meeting:', err);
        }
    };

    const handleApproveMeeting = async (id: string) => {
        try {
            await fetch(`/api/meetings/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'confirmed' }),
            });
            await fetchMeetings();
        } catch (err) {
            console.error('Error approving meeting:', err);
        }
    };

    const resetForm = () => {
        setForm({ title: '', description: '', meetingDate: '', startTime: '09:00', endTime: '10:00', assignedTo: '', source: 'member' });
    };

    const openAddForDate = (dateStr: string) => {
        resetForm();
        setForm(f => ({ ...f, meetingDate: dateStr }));
        setShowAddModal(true);
    };

    const openDetail = (m: Meeting) => {
        setDetailMeeting(m);
        setIsEditing(false);
        setPendingNotifyBefore(null);
        setNotifyConfirmed(false);
        setEditForm({
            title: m.title,
            description: m.description || '',
            meetingDate: m.meeting_date,
            startTime: m.start_time.slice(0, 5),
            endTime: m.end_time.slice(0, 5),
            notifyBefore: m.notify_before || 0,
        });
    };

    const handleSaveEdit = async () => {
        if (!detailMeeting) return;
        setSavingEdit(true);
        try {
            const res = await fetch(`/api/meetings/${detailMeeting.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm),
            });
            if (res.ok) {
                await fetchMeetings();
                setDetailMeeting(null);
                setIsEditing(false);
            }
        } catch (err) {
            console.error('Error updating meeting:', err);
        }
        setSavingEdit(false);
    };

    const handleAddGuest = async () => {
        if (!detailMeeting || !addGuestId) return;
        try {
            await fetch(`/api/meetings/${detailMeeting.id}/guests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: addGuestId }),
            });
            await fetchMeetings();
            // Update detail meeting guests locally
            const member = teamMembers.find(m => m.id === addGuestId);
            if (member) {
                setDetailMeeting(prev => prev ? { ...prev, guests: [...prev.guests, member] } : prev);
            }
            setAddGuestId('');
        } catch (err) {
            console.error('Error adding guest:', err);
        }
    };

    const handleRemoveGuest = async (guestUserId: string) => {
        if (!detailMeeting) return;
        try {
            await fetch(`/api/meetings/${detailMeeting.id}/guests?userId=${guestUserId}`, {
                method: 'DELETE',
            });
            await fetchMeetings();
            setDetailMeeting(prev => prev ? { ...prev, guests: prev.guests.filter(g => g.id !== guestUserId) } : prev);
        } catch (err) {
            console.error('Error removing guest:', err);
        }
    };

    const handleSetNotification = async (minutes: number) => {
        if (!detailMeeting) return;
        try {
            await fetch(`/api/meetings/${detailMeeting.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notifyBefore: minutes }),
            });
            setDetailMeeting(prev => prev ? { ...prev, notify_before: minutes } : prev);
            await fetchMeetings();
        } catch (err) {
            console.error('Error setting notification:', err);
        }
    };

    // Calendar grid helpers
    const daysInMonth = new Date(currentMonth.year, currentMonth.month + 1, 0).getDate();
    const firstDayOfWeek = new Date(currentMonth.year, currentMonth.month, 1).getDay();
    const monthName = new Date(currentMonth.year, currentMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const prevMonth = () => setCurrentMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 });
    const nextMonth = () => setCurrentMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 });

    const getMeetingsForDate = (dateStr: string) => {
        const localMeetings = meetings.filter(m => m.meeting_date === dateStr);
        const googleMeetings = gcalEvents.filter(e => e.meeting_date === dateStr);
        return [...localMeetings, ...googleMeetings];
    };

    const selectedMeetings = selectedDate ? getMeetingsForDate(selectedDate) : [];

    const formatTime = (t: string) => {
        const [h, m] = t.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        return `${hour % 12 || 12}:${m} ${ampm}`;
    };

    // Color palette for followed users (assigned in order)
    const userColorPalette = [
        { bg: 'bg-indigo-500/15', text: 'text-indigo-700', dot: 'bg-indigo-500', name: 'indigo' },
        { bg: 'bg-purple-500/15', text: 'text-purple-700', dot: 'bg-purple-500', name: 'purple' },
        { bg: 'bg-teal-500/15', text: 'text-teal-700', dot: 'bg-teal-500', name: 'teal' },
        { bg: 'bg-pink-500/15', text: 'text-pink-700', dot: 'bg-pink-500', name: 'pink' },
        { bg: 'bg-rose-500/15', text: 'text-rose-700', dot: 'bg-rose-500', name: 'rose' },
        { bg: 'bg-emerald-500/15', text: 'text-emerald-700', dot: 'bg-emerald-500', name: 'emerald' },
        { bg: 'bg-cyan-500/15', text: 'text-cyan-700', dot: 'bg-cyan-500', name: 'cyan' },
        { bg: 'bg-orange-500/15', text: 'text-orange-700', dot: 'bg-orange-500', name: 'orange' },
        { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-700', dot: 'bg-fuchsia-500', name: 'fuchsia' },
        { bg: 'bg-blue-500/15', text: 'text-blue-700', dot: 'bg-blue-500', name: 'blue' },
    ];

    // All users displayed in calendar = current user + followed teammates
    const calendarUserIds = user ? [user.id, ...subscribedUsers] : subscribedUsers;
    const userColorMap: Record<string, typeof userColorPalette[number]> = {};
    calendarUserIds.forEach((uid, i) => {
        userColorMap[uid] = userColorPalette[i % userColorPalette.length];
    });

    const getMeetingTheme = (m: any) => {
        if (m.status === 'pending') return { bg: 'bg-amber-500/15', text: 'text-amber-700', dot: 'bg-amber-400', name: 'amber' };

        // Color by the meeting owner (creator or assignee), prefer one in followed list
        const ownerId = (calendarUserIds.includes(m.assigned_to) ? m.assigned_to : null)
            || (calendarUserIds.includes(m.created_by) ? m.created_by : null)
            || (calendarUserIds.includes(m.owner_id) ? m.owner_id : null)
            || m.assigned_to || m.created_by || m.owner_id;

        if (ownerId && userColorMap[ownerId]) return userColorMap[ownerId];
        return { bg: 'bg-slate-200/60', text: 'text-slate-600', dot: 'bg-slate-400', name: 'slate' };
    };

    // Build the legend (followed users + current user + pending)
    const legendUsers = [
        ...(user ? [{ id: user.id, name: user.name || 'You', isCurrent: true }] : []),
        ...subscribedUsers.map(uid => {
            const member = teamMembers.find(m => m.id === uid);
            return { id: uid, name: member?.name || 'Unknown', isCurrent: false };
        }),
    ];

    // Helper: get pastel version of theme color for week/day blocks
    const getPastelStyle = (m: any): { bg: string; border: string; text: string } => {
        const theme = getMeetingTheme(m);
        const pastelMap: Record<string, { bg: string; border: string; text: string }> = {
            indigo: { bg: 'bg-indigo-100', border: 'border-indigo-300', text: 'text-indigo-800' },
            purple: { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-800' },
            teal: { bg: 'bg-teal-100', border: 'border-teal-300', text: 'text-teal-800' },
            pink: { bg: 'bg-pink-100', border: 'border-pink-300', text: 'text-pink-800' },
            rose: { bg: 'bg-rose-100', border: 'border-rose-300', text: 'text-rose-800' },
            emerald: { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-800' },
            cyan: { bg: 'bg-cyan-100', border: 'border-cyan-300', text: 'text-cyan-800' },
            orange: { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-800' },
            fuchsia: { bg: 'bg-fuchsia-100', border: 'border-fuchsia-300', text: 'text-fuchsia-800' },
            blue: { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-800' },
            amber: { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-800' },
            slate: { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-700' },
        };
        return pastelMap[theme.name] || pastelMap.slate;
    };

    // Week view helpers
    const getWeekDates = (start: Date): Date[] => {
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            return d;
        });
    };

    const formatDateStr = (d: Date): string => {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const weekDates = getWeekDates(weekStart);
    const weekDayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const weekHours = Array.from({ length: 11 }, (_, i) => i + 8); // 8:00 to 18:00

    const dayHours = Array.from({ length: 14 }, (_, i) => i + 7); // 7:00 to 20:00

    const prevWeek = () => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() - 7);
        setWeekStart(d);
    };
    const nextWeek = () => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + 7);
        setWeekStart(d);
    };

    const prevDay = () => {
        const d = new Date(dayViewDate);
        d.setDate(d.getDate() - 1);
        setDayViewDate(d);
        setSelectedDate(formatDateStr(d));
    };
    const nextDay = () => {
        const d = new Date(dayViewDate);
        d.setDate(d.getDate() + 1);
        setDayViewDate(d);
        setSelectedDate(formatDateStr(d));
    };

    const getTimePosition = (timeStr: string, startHour: number): number => {
        const [h, m] = timeStr.split(':').map(Number);
        return ((h - startHour) + m / 60) * 60; // 60px per hour
    };

    const getBlockHeight = (startTime: string, endTime: string): number => {
        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = endTime.split(':').map(Number);
        const duration = (eh * 60 + em) - (sh * 60 + sm);
        return Math.max((duration / 60) * 60, 20); // min 20px
    };

    // Navigation label
    const getNavigationLabel = () => {
        if (viewMode === 'month') return monthName;
        if (viewMode === 'week') {
            const start = weekDates[0];
            const end = weekDates[6];
            const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return `${startStr} - ${endStr}`;
        }
        return dayViewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    };

    const handlePrev = () => {
        if (viewMode === 'month') prevMonth();
        else if (viewMode === 'week') prevWeek();
        else prevDay();
    };

    const handleNext = () => {
        if (viewMode === 'month') nextMonth();
        else if (viewMode === 'week') nextWeek();
        else nextDay();
    };

    return (
        <>
            <hr className="border-slate-200" />
            <div>
                <div className="flex justify-center mb-6">
                    <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <CalendarIcon className="w-5 h-5 text-indigo-400" />
                        Calendar Meeting
                    </h2>
                </div>
                {/* Buttons — hidden here, shown below calendar */}
                <div className="hidden">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <button
                                onClick={() => setShowSubscribeDropdown(!showSubscribeDropdown)}
                                className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-full border border-slate-300 shadow-sm transition-all"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>
                                Follow Teammates
                                {subscribedUsers.length > 0 && (
                                    <span className="bg-indigo-100 text-indigo-700 py-0.5 px-2 rounded-full text-xs font-bold">
                                        {subscribedUsers.length}
                                    </span>
                                )}
                            </button>

                            {showSubscribeDropdown && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowSubscribeDropdown(false)}></div>
                                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
                                        <div className="p-3 border-b border-slate-100 bg-slate-50">
                                            <h3 className="text-sm font-semibold text-slate-800">Overlay Calendars</h3>
                                            <p className="text-xs text-slate-500 mt-0.5">See events and meetings from others</p>
                                        </div>
                                        <div className="max-h-60 overflow-y-auto p-2">
                                            {teamMembers.filter(m => m.id !== user?.id).map(member => (
                                                <label key={member.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 cursor-pointer rounded-lg transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-600"
                                                        checked={subscribedUsers.includes(member.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSubscribedUsers([...subscribedUsers, member.id]);
                                                            } else {
                                                                setSubscribedUsers(subscribedUsers.filter(id => id !== member.id));
                                                            }
                                                        }}
                                                    />
                                                    <span className="text-sm text-slate-700 font-medium">{member.name}</span>
                                                </label>
                                            ))}
                                            {teamMembers.length <= 1 && (
                                                <div className="p-3 text-center text-sm text-slate-500">No other team members found</div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {gcalConnected ? (
                            <button
                                onClick={() => setShowDisconnectModal(true)}
                                disabled={gcalDisconnecting}
                                className="group flex items-center gap-2 px-6 py-2.5 bg-emerald-50 hover:bg-rose-50 text-emerald-700 hover:text-rose-600 text-sm font-semibold rounded-full border border-emerald-200 hover:border-rose-200 transition-all disabled:opacity-50"
                            >
                                <CheckCircle2 className="w-4 h-4 group-hover:hidden" />
                                <X className="w-4 h-4 hidden group-hover:block" />
                                <span className="group-hover:hidden">{gcalDisconnecting ? 'Disconnecting...' : 'Google Calendar Connected'}</span>
                                <span className="hidden group-hover:inline">{gcalDisconnecting ? 'Disconnecting...' : 'Disconnect Calendar'}</span>
                            </button>
                        ) : (
                            <button
                                onClick={handleConnectGoogleCalendar}
                                disabled={gcalConnecting}
                                className="flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-full border border-slate-300 shadow-sm transition-all disabled:opacity-50"
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                                {gcalConnecting ? 'Connecting...' : 'Connect Google Calendar'}
                            </button>
                        )}
                        <button
                            onClick={() => { resetForm(); setShowAddModal(true); }}
                            className="px-7 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full shadow-md transition-all flex items-center gap-2 text-sm"
                        >
                            <Plus className="w-5 h-5" /> Add Meeting
                        </button>
                    </div>
                </div>

                {/* Navigation + View Toggle */}
                <div className="flex items-center justify-between mb-4">
                    <button onClick={handlePrev} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-4">
                        <h3 className="text-slate-900 font-semibold text-lg">{getNavigationLabel()}</h3>
                        <div className="flex bg-slate-100 rounded-lg p-0.5">
                            {(['month', 'week', 'day'] as const).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => {
                                        setViewMode(mode);
                                        if (mode === 'day') {
                                            const d = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
                                            setDayViewDate(d);
                                            setSelectedDate(formatDateStr(d));
                                        }
                                        if (mode === 'week') {
                                            const base = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
                                            const day = base.getDay();
                                            const diff = day === 0 ? -6 : 1 - day;
                                            const monday = new Date(base);
                                            monday.setDate(base.getDate() + diff);
                                            monday.setHours(0, 0, 0, 0);
                                            setWeekStart(monday);
                                        }
                                    }}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all capitalize ${
                                        viewMode === mode
                                            ? 'bg-white text-indigo-700 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button onClick={handleNext} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex gap-4 min-w-0">
                    {/* Calendar Grid - conditionally render based on viewMode.
                        min-w-0 + overflow-hidden contain the grid below md so
                        long meeting titles can't push 7 columns wider than the
                        viewport. p-2 on mobile gives more room for cells. */}
                    <div className="flex-1 min-w-0 bg-white shadow-sm border border-slate-200 rounded-2xl p-2 sm:p-4 overflow-hidden">

                        {/* ===== MONTH VIEW ===== */}
                        {viewMode === 'month' && (
                            <>
                                {/* Day headers */}
                                <div className="grid grid-cols-7 border-b border-slate-300">
                                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                        <div key={d} className="text-center text-xs font-semibold text-slate-500 py-2 uppercase tracking-wider">{d}</div>
                                    ))}
                                </div>

                                {/* Calendar cells */}
                                <div className="grid grid-cols-7">
                                    {/* Empty cells for days before the first */}
                                    {Array.from({ length: firstDayOfWeek }, (_, i) => (
                                        <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-slate-100 rounded-sm" />
                                    ))}

                                    {/* Day cells */}
                                    {Array.from({ length: daysInMonth }, (_, i) => {
                                        const day = i + 1;
                                        const dateStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const dayMeetings = getMeetingsForDate(dateStr);
                                        const isToday = dateStr === todayStr;
                                        const isSelected = dateStr === selectedDate;

                                        return (
                                            <button
                                                key={day}
                                                onClick={() => setSelectedDate(dateStr === selectedDate ? null : dateStr)}
                                                className={`min-w-0 min-h-[64px] sm:min-h-[100px] p-1 sm:p-1.5 border-b border-r border-slate-100 text-left transition-all flex flex-col rounded-sm overflow-hidden ${
                                                    isSelected
                                                        ? 'bg-indigo-50/80'
                                                        : 'hover:bg-slate-50'
                                                }`}
                                            >
                                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm mb-1 ${
                                                    isToday
                                                        ? 'bg-indigo-600 text-white font-bold'
                                                        : isSelected
                                                            ? 'text-indigo-700 font-semibold'
                                                            : 'text-slate-600'
                                                }`}>
                                                    {day}
                                                </span>
                                                <div className="flex flex-col gap-1 w-full overflow-hidden mt-1">
                                                    {dayMeetings.slice(0, 3).map((m, idx) => {
                                                        const theme = getMeetingTheme(m);
                                                        return (
                                                            <div
                                                                key={idx}
                                                                className="flex items-start gap-1.5 text-[11px] leading-tight truncate"
                                                            >
                                                                <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-[3px] ${theme.dot}`} />
                                                                <span className="truncate text-slate-700">
                                                                    <span className="text-slate-500">{formatTime(m.start_time).replace(' ', '').replace(':00', '').toLowerCase()}</span>
                                                                    {' '}<span className="font-semibold text-slate-800">{m.title}</span>
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                    {dayMeetings.length > 3 && (
                                                        <span className="text-[11px] text-slate-500 font-medium pl-3.5">{dayMeetings.length - 3} more</span>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {/* ===== WEEK VIEW ===== */}
                        {viewMode === 'week' && (
                            <div className="overflow-auto">
                                {/* Column headers */}
                                <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-slate-200">
                                    <div className="py-2" />
                                    {weekDates.map((d, i) => {
                                        const dateStr = formatDateStr(d);
                                        const isToday = dateStr === todayStr;
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => setSelectedDate(dateStr)}
                                                className={`py-2 text-center transition-colors rounded-t-lg ${
                                                    isToday ? 'bg-indigo-50' : 'hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className={`text-xs font-medium ${isToday ? 'text-indigo-600' : 'text-slate-500'}`}>
                                                    {weekDayNames[i]}
                                                </div>
                                                <div className={`text-lg font-bold mt-0.5 ${
                                                    isToday
                                                        ? 'w-8 h-8 mx-auto rounded-full bg-indigo-600 text-white flex items-center justify-center'
                                                        : 'text-slate-900'
                                                }`}>
                                                    {d.getDate()}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Time grid */}
                                <div className="grid grid-cols-[60px_repeat(7,1fr)] relative" style={{ height: `${weekHours.length * 60}px` }}>
                                    {/* Hour labels */}
                                    {weekHours.map((hour) => (
                                        <div
                                            key={`label-${hour}`}
                                            className="absolute left-0 w-[60px] text-right pr-3 text-xs text-slate-400 font-medium"
                                            style={{ top: `${(hour - 8) * 60}px`, transform: 'translateY(-6px)' }}
                                        >
                                            {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                                        </div>
                                    ))}

                                    {/* Grid lines */}
                                    {weekHours.map((hour) => (
                                        <div
                                            key={`line-${hour}`}
                                            className="absolute left-[60px] right-0 border-t border-slate-100"
                                            style={{ top: `${(hour - 8) * 60}px` }}
                                        />
                                    ))}

                                    {/* Day columns with events */}
                                    {weekDates.map((d, colIndex) => {
                                        const dateStr = formatDateStr(d);
                                        const dayMeetings = getMeetingsForDate(dateStr);
                                        const isToday = dateStr === todayStr;

                                        return (
                                            <div
                                                key={colIndex}
                                                className={`relative border-r border-slate-100 ${isToday ? 'bg-indigo-50/30' : ''}`}
                                                style={{ gridColumn: colIndex + 2, gridRow: 1 }}
                                            >
                                                {dayMeetings.map((m, mIdx) => {
                                                    const top = getTimePosition(m.start_time, 8);
                                                    const height = getBlockHeight(m.start_time, m.end_time);
                                                    const pastel = getPastelStyle(m);

                                                    // Skip if outside visible range
                                                    if (top < 0 || top > weekHours.length * 60) return null;

                                                    return (
                                                        <button
                                                            key={m.id || `wk-${mIdx}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedDate(dateStr);
                                                                openDetail(m);
                                                            }}
                                                            className={`absolute left-0.5 right-0.5 ${pastel.bg} ${pastel.text} ${pastel.border} border rounded-lg px-2 py-1 overflow-hidden text-left transition-shadow hover:shadow-md cursor-pointer`}
                                                            style={{ top: `${Math.max(top, 0)}px`, height: `${height}px`, zIndex: 10 }}
                                                        >
                                                            <p className="text-[11px] font-semibold truncate leading-tight">{m.title}</p>
                                                            {height > 30 && (
                                                                <p className="text-[10px] opacity-70 truncate">{formatTime(m.start_time)} - {formatTime(m.end_time)}</p>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ===== DAY VIEW ===== */}
                        {viewMode === 'day' && (
                            <div className="overflow-auto">
                                <div className="relative" style={{ height: `${dayHours.length * 60}px` }}>
                                    {/* Hour rows */}
                                    {dayHours.map((hour) => (
                                        <div
                                            key={`day-hour-${hour}`}
                                            className="absolute left-0 right-0 flex border-t border-slate-100"
                                            style={{ top: `${(hour - 7) * 60}px`, height: '60px' }}
                                        >
                                            <div className="w-[60px] text-right pr-3 text-xs text-slate-400 font-medium flex-shrink-0" style={{ transform: 'translateY(-6px)' }}>
                                                {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                                            </div>
                                            <div className="flex-1" />
                                        </div>
                                    ))}

                                    {/* Events */}
                                    {(() => {
                                        const dateStr = formatDateStr(dayViewDate);
                                        const dayMeetings = getMeetingsForDate(dateStr);
                                        return dayMeetings.map((m, mIdx) => {
                                            const top = getTimePosition(m.start_time, 7);
                                            const height = getBlockHeight(m.start_time, m.end_time);
                                            const pastel = getPastelStyle(m);

                                            if (top < 0 || top > dayHours.length * 60) return null;

                                            return (
                                                <button
                                                    key={m.id || `day-${mIdx}`}
                                                    onClick={() => openDetail(m)}
                                                    className={`absolute ${pastel.bg} ${pastel.text} ${pastel.border} border rounded-xl px-3 py-2 overflow-hidden text-left transition-shadow hover:shadow-md cursor-pointer`}
                                                    style={{
                                                        top: `${Math.max(top, 0)}px`,
                                                        height: `${height}px`,
                                                        left: '70px',
                                                        right: '8px',
                                                        zIndex: 10,
                                                    }}
                                                >
                                                    <p className="text-sm font-semibold truncate">{m.title}</p>
                                                    <p className="text-xs opacity-70 mt-0.5">
                                                        {formatTime(m.start_time)} - {formatTime(m.end_time)}
                                                    </p>
                                                    {height > 60 && m.description && (
                                                        <p className="text-xs opacity-60 mt-1 truncate">{m.description}</p>
                                                    )}
                                                </button>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* Legend - Followed users (shown in all views) */}
                        <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-slate-200">
                            {legendUsers.map(lu => {
                                const color = userColorMap[lu.id];
                                return (
                                    <div key={lu.id} className="flex items-center gap-1.5 text-xs text-slate-500">
                                        <span className={`w-2 h-2 rounded-full ${color?.dot || 'bg-slate-400'}`} />
                                        {lu.name} {lu.isCurrent && <span className="text-slate-400">(you)</span>}
                                    </div>
                                );
                            })}
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <span className="w-2 h-2 rounded-full bg-amber-400" /> Pending
                            </div>
                        </div>

                        {/* Action Buttons — below calendar */}
                        <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t border-slate-200">
                            <div className="relative">
                                <button
                                    onClick={() => setShowSubscribeDropdown(!showSubscribeDropdown)}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-full border border-slate-300 shadow-sm transition-all"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>
                                    Follow Teammates
                                    {subscribedUsers.length > 0 && (
                                        <span className="bg-indigo-100 text-indigo-700 py-0.5 px-2 rounded-full text-xs font-bold">{subscribedUsers.length}</span>
                                    )}
                                </button>
                                {showSubscribeDropdown && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowSubscribeDropdown(false)}></div>
                                        <div className="absolute bottom-full mb-2 left-0 w-64 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
                                            <div className="p-3 border-b border-slate-100 bg-slate-50">
                                                <h3 className="text-sm font-semibold text-slate-800">Overlay Calendars</h3>
                                                <p className="text-xs text-slate-500 mt-0.5">See events and meetings from others</p>
                                            </div>
                                            <div className="max-h-60 overflow-y-auto p-2">
                                                {teamMembers.filter(m => m.id !== user?.id).length > 0 ? teamMembers.filter(m => m.id !== user?.id).map(member => (
                                                    <label key={member.id} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                            checked={subscribedUsers.includes(member.id)}
                                                            onChange={() => {
                                                                if (subscribedUsers.includes(member.id)) {
                                                                    setSubscribedUsers(subscribedUsers.filter((id: string) => id !== member.id));
                                                                } else {
                                                                    setSubscribedUsers([...subscribedUsers, member.id]);
                                                                }
                                                            }}
                                                        />
                                                        <span className="text-sm text-slate-700">{member.name}</span>
                                                    </label>
                                                )) : (
                                                    <p className="text-sm text-slate-400 p-2">No team members found</p>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                            {gcalConnected ? (
                                <button
                                    onClick={() => setShowDisconnectModal(true)}
                                    disabled={gcalDisconnecting}
                                    className="group flex items-center gap-2 px-6 py-2.5 bg-emerald-50 hover:bg-rose-50 text-emerald-700 hover:text-rose-600 text-sm font-semibold rounded-full border border-emerald-200 hover:border-rose-200 transition-all disabled:opacity-50"
                                >
                                    <CheckCircle2 className="w-4 h-4 group-hover:hidden" />
                                    <X className="w-4 h-4 hidden group-hover:block" />
                                    <span className="group-hover:hidden">{gcalDisconnecting ? 'Disconnecting...' : 'Google Calendar Connected'}</span>
                                    <span className="hidden group-hover:inline">{gcalDisconnecting ? 'Disconnecting...' : 'Disconnect Calendar'}</span>
                                </button>
                            ) : (
                                <button
                                    onClick={handleConnectGoogleCalendar}
                                    disabled={gcalConnecting}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-full border border-slate-300 shadow-sm transition-all disabled:opacity-50"
                                >
                                    Connect Google Calendar
                                </button>
                            )}
                            <button
                                onClick={() => { resetForm(); setShowAddModal(true); }}
                                className="px-7 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full shadow-md transition-all flex items-center gap-2 text-sm"
                            >
                                <Plus className="w-5 h-5" /> Add Meeting
                            </button>
                        </div>
                    </div>

                    {/* Day Detail Panel */}
                    <div className="w-80 bg-white shadow-sm border border-slate-200 rounded-2xl p-4 flex flex-col">
                        {selectedDate ? (
                            <>
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-semibold text-slate-900">
                                        {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                    </h4>
                                    <button
                                        onClick={() => openAddForDate(selectedDate)}
                                        className="p-1.5 text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                                        title="Add meeting on this date"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                                {selectedMeetings.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <p className="text-sm text-slate-500">No meetings scheduled</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 flex-1 overflow-y-auto">
                                        {selectedMeetings.map((m, idx) => {
                                            const theme = getMeetingTheme(m);
                                            return (
                                                <button
                                                    key={m.id || `meeting-${idx}`}
                                                    onClick={() => openDetail(m)}
                                                    className={`w-full text-left p-3 rounded-xl border transition-colors hover:bg-slate-200/30 ${m.status === 'pending' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-50 border-slate-300'}`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${theme.dot}`} />
                                                        <p className="text-sm font-medium text-slate-900 truncate">{m.title}</p>
                                                    </div>
                                                <p className="text-xs text-slate-500 mt-1 ml-4">
                                                    {formatTime(m.start_time)} – {formatTime(m.end_time)}
                                                </p>
                                                {m.assignee?.name && (
                                                    <p className="text-xs text-slate-500 mt-0.5 ml-4">👤 {m.assignee.name}</p>
                                                )}
                                                {m.guests?.length > 0 && (
                                                    <p className="text-xs text-slate-500 mt-0.5 ml-4">👥 {m.guests.length} guest{m.guests.length > 1 ? 's' : ''}</p>
                                                )}
                                                {m.status === 'pending' && (
                                                    <span className="inline-flex ml-4 mt-1 px-2 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full">
                                                        Pending
                                                    </span>
                                                )}
                                            </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-center">
                                    <CalendarIcon className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                                    <p className="text-sm text-slate-500">Select a day to view meetings</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Disconnect Google Calendar Modal */}
            {showDisconnectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDisconnectModal(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-6">
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Disconnect Google Calendar</h3>
                                    <p className="text-sm text-slate-500 mt-1">Your calendar events will no longer sync with AHA COMSS. You can reconnect anytime.</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
                            <button
                                onClick={() => setShowDisconnectModal(false)}
                                className="px-5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDisconnectGoogleCalendar}
                                className="px-5 py-2 text-sm font-semibold text-white bg-rose-500 rounded-xl hover:bg-rose-600 transition-colors"
                            >
                                Disconnect
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Meeting Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h2 className="text-lg font-semibold text-slate-900">Add Meeting</h2>
                            <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-500 hover:text-slate-900">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Title */}
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Meeting Title *</label>
                                <input
                                    type="text"
                                    value={form.title}
                                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="e.g. Sprint Planning"
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                />
                            </div>

                            {/* Date */}
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Date *</label>
                                <input
                                    type="date"
                                    value={form.meetingDate}
                                    onChange={e => setForm(f => ({ ...f, meetingDate: e.target.value }))}
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 "
                                />
                            </div>

                            {/* Time */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 font-medium">Start Time *</label>
                                    <input
                                        type="time"
                                        value={form.startTime}
                                        onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 "
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 font-medium">End Time *</label>
                                    <input
                                        type="time"
                                        value={form.endTime}
                                        onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 "
                                    />
                                </div>
                            </div>

                            {/* Assign To (Leaders only) */}
                            {isLeader && (
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 font-medium">Assign To</label>
                                    <select
                                        value={form.assignedTo}
                                        onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                    >
                                        <option value="">Myself</option>
                                        {teamMembers.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Description */}
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Notes (Optional)</label>
                                <textarea
                                    value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    rows={2}
                                    placeholder="Meeting agenda or notes..."
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                                />
                            </div>

                            {/* Submit */}
                            <button
                                onClick={handleAddMeeting}
                                disabled={!form.title || !form.meetingDate}
                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                            >
                                <CalendarIcon className="w-5 h-5" /> Create Meeting
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Meeting Detail Modal */}
            {detailMeeting && !isEditing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${getMeetingTheme(detailMeeting).dot}`} />
                                <h2 className="text-lg font-semibold text-slate-900 truncate">{detailMeeting.title}</h2>
                            </div>
                            <div className="flex items-center gap-1">
                                {(isLeader || detailMeeting.created_by === user?.id) && (
                                    <button onClick={() => setIsEditing(true)} className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" title="Edit">
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                )}
                                {(isLeader || detailMeeting.created_by === user?.id) && (
                                    <button onClick={() => { handleDeleteMeeting(detailMeeting.id); setDetailMeeting(null); }} className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Delete">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                                <button onClick={() => setDetailMeeting(null)} className="p-1.5 text-slate-500 hover:text-slate-900">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Date & Time */}
                            <div className="flex items-center gap-3">
                                <CalendarIcon className="w-5 h-5 text-slate-500 flex-shrink-0" />
                                <div>
                                    <p className="text-sm text-slate-900">
                                        {new Date(detailMeeting.meeting_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {formatTime(detailMeeting.start_time)} – {formatTime(detailMeeting.end_time)}
                                    </p>
                                </div>
                            </div>

                            {/* Meeting Link — from Google Calendar hangoutLink or detected in description */}
                            {(() => {
                                const link = detailMeeting.meeting_link
                                    || detailMeeting.description?.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i)?.[0]
                                    || detailMeeting.description?.match(/https:\/\/calendly\.com\/events\/[^\s]+\/google_meet/i)?.[0]
                                    || null;
                                if (!link) return null;
                                const displayUrl = link.replace(/^https?:\/\//, '').replace(/^www\./, '');
                                return (
                                    <div className="flex items-center gap-3">
                                        <ExternalLink className="w-5 h-5 text-slate-500 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <a
                                                href={link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
                                            >
                                                Join with Google Meet
                                            </a>
                                            <p className="text-xs text-slate-500 mt-1 truncate">{displayUrl}</p>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Description */}
                            {detailMeeting.description && (
                                <div className="flex items-start gap-3">
                                    <FileText className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                                    <div
                                        className="text-sm text-slate-600 whitespace-pre-wrap break-words meeting-description"
                                        dangerouslySetInnerHTML={{ __html: sanitizeMeetingDescription(detailMeeting.description) }}
                                    />
                                </div>
                            )}

                            {/* Organizer */}
                            <div className="flex items-center gap-3">
                                <UserPlus className="w-5 h-5 text-slate-500 flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-slate-500">Organizer</p>
                                    <p className="text-sm text-slate-900">
                                        {detailMeeting.organizer_name
                                            || (detailMeeting.source === 'partner_relations'
                                                ? (detailMeeting.description?.match(/Requester:\s*([^\n]+)/)?.[1] || 'Unknown Partner')
                                                : (detailMeeting.creator?.name || 'Unknown'))}
                                    </p>
                                    {detailMeeting.organizer_email && detailMeeting.organizer_email !== detailMeeting.organizer_name && (
                                        <p className="text-xs text-slate-400">{detailMeeting.organizer_email}</p>
                                    )}
                                </div>
                            </div>

                            {/* Guests */}
                            <div className="flex items-start gap-3">
                                <Users className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-xs text-slate-500 mb-2">
                                        {detailMeeting.guests.length} guest{detailMeeting.guests.length !== 1 ? 's' : ''}
                                    </p>

                                    {/* Guest list */}
                                    {detailMeeting.guests.length > 0 && (
                                        <div className="space-y-1.5 mb-3">
                                            {detailMeeting.guests.map(g => (
                                                <div key={g.id} className="flex items-center justify-between px-3 py-1.5 bg-slate-50 rounded-lg">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-indigo-500/30 flex items-center justify-center text-[10px] font-bold text-indigo-700">
                                                            {g.name?.charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="text-sm text-slate-600">{g.name}</span>
                                                    </div>
                                                    {(isLeader || detailMeeting.created_by === user?.id) && (
                                                        <button
                                                            onClick={() => handleRemoveGuest(g.id)}
                                                            className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                                                            title="Remove guest"
                                                        >
                                                            <UserMinus className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add guest */}
                                    {(isLeader || detailMeeting.created_by === user?.id) && (
                                        <div className="flex gap-2">
                                            <select
                                                value={addGuestId}
                                                onChange={e => setAddGuestId(e.target.value)}
                                                className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                                            >
                                                <option value="">Add guest...</option>
                                                {teamMembers
                                                    .filter(m => !detailMeeting.guests.some(g => g.id === m.id) && m.id !== detailMeeting.created_by)
                                                    .map(m => (
                                                        <option key={m.id} value={m.id}>{m.name}</option>
                                                    ))}
                                            </select>
                                            <button
                                                onClick={handleAddGuest}
                                                disabled={!addGuestId}
                                                className="px-3 py-1.5 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Notification */}
                            <div className="flex items-start gap-3">
                                <Bell className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-xs text-slate-500 mb-2">Notification</p>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {[{ val: 5, label: '5 min' }, { val: 10, label: '10 min' }, { val: 15, label: '15 min' }, { val: 30, label: '30 min' }, { val: 60, label: '1 hour' }].map(opt => (
                                            <button
                                                key={opt.val}
                                                onClick={() => setPendingNotifyBefore(opt.val)}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                                                    (pendingNotifyBefore ?? detailMeeting.notify_before ?? 0) === opt.val
                                                        ? 'bg-indigo-500 text-white border-indigo-500'
                                                        : 'bg-slate-100 text-slate-500 border-slate-300 hover:text-slate-900'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                        {pendingNotifyBefore !== null && pendingNotifyBefore !== (detailMeeting.notify_before ?? 0) && !notifyConfirmed && (
                                            <button
                                                onClick={() => setNotifyConfirmed(true)}
                                                className="ml-1 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                                            >
                                                Set
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Status badges */}
                            {detailMeeting.status === 'pending' && isLeader && (
                                <button
                                    onClick={() => { handleApproveMeeting(detailMeeting.id); setDetailMeeting(null); }}
                                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-full transition-colors flex items-center justify-center gap-2 text-sm shadow-sm"
                                >
                                    <CheckCircle2 className="w-5 h-5" /> Approve Meeting
                                </button>
                            )}

                            {/* Save & Cancel — shown for organizer/leader OR after notification Set is clicked */}
                            {(notifyConfirmed || ((isLeader || detailMeeting.created_by === user?.id) && false)) ? (
                                <div className="flex gap-3 pt-4 border-t border-slate-200 mt-4">
                                    <button
                                        onClick={() => {
                                            setPendingNotifyBefore(null);
                                            setNotifyConfirmed(false);
                                        }}
                                        className="flex-1 py-3 bg-white border border-slate-200 text-[#0F0E7F] rounded-full hover:bg-slate-50 text-sm font-bold transition-colors shadow-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (pendingNotifyBefore !== null) {
                                                await handleSetNotification(pendingNotifyBefore);
                                            }
                                            setPendingNotifyBefore(null);
                                            setNotifyConfirmed(false);
                                            setDetailMeeting(null);
                                        }}
                                        className="flex-1 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 text-sm font-bold transition-all shadow-sm"
                                    >
                                        Save
                                    </button>
                                </div>
                            ) : (isLeader || detailMeeting.created_by === user?.id) ? (
                                <div className="flex gap-3 pt-4 border-t border-slate-200 mt-4">
                                    <button
                                        onClick={() => setDetailMeeting(null)}
                                        className="flex-1 py-3 bg-white border border-slate-200 text-[#0F0E7F] rounded-full hover:bg-slate-50 text-sm font-bold transition-colors shadow-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => { handleSaveEdit(); }}
                                        className="flex-1 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 text-sm font-bold transition-all shadow-sm"
                                    >
                                        Save
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Meeting Modal */}
            {detailMeeting && isEditing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h2 className="text-lg font-semibold text-slate-900">Edit Meeting</h2>
                            <button onClick={() => setIsEditing(false)} className="p-1 text-slate-500 hover:text-slate-900">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Title *</label>
                                <input type="text" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Date *</label>
                                <input type="date" value={editForm.meetingDate} onChange={e => setEditForm(f => ({ ...f, meetingDate: e.target.value }))} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 " />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 font-medium">Start *</label>
                                    <input type="time" value={editForm.startTime} onChange={e => setEditForm(f => ({ ...f, startTime: e.target.value }))} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 " />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 font-medium">End *</label>
                                    <input type="time" value={editForm.endTime} onChange={e => setEditForm(f => ({ ...f, endTime: e.target.value }))} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 " />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Notes</label>
                                <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button onClick={() => setIsEditing(false)} className="flex-1 py-3 bg-white border border-slate-200 text-[#0F0E7F] rounded-full hover:bg-slate-50 text-sm font-bold shadow-sm transition-colors">Cancel</button>
                                <button onClick={handleSaveEdit} disabled={savingEdit || !editForm.title} className="flex-1 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 text-sm font-bold shadow-sm transition-all">
                                    {savingEdit ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
export default function MyTasksPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading tasks...</div>}>
            <MyTasksContent />
        </Suspense>
    );
}

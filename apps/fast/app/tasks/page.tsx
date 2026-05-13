'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageTabs } from '@/components/PageTabs';
import { useAppStore } from '@/lib/store';
import { useAuth } from '@/lib/auth/use-auth';
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
    // 6 = 3 cols × 2 rows in the new full-width Notes grid.
    const NOTES_PREVIEW_COUNT = 6;
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
                fetch('/fast/api/nexus'),
                fetch('/fast/api/tasks/my-direct-requests'),
                fetch('/fast/api/tasks/helping'),
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
            const res = await fetch(`/fast/api/tasks/${taskId}/comments`);
            if (res.ok) setTaskComments(await res.json());
        } catch {}
    };

    const handleSendTaskComment = async () => {
        if (!commentText.trim() || !viewTask) return;
        setCommentSending(true);
        try {
            const res = await fetch(`/fast/api/tasks/${viewTask.id}/comments`, {
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
            const res = await fetch('/fast/api/teammates');
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
            const res = await fetch(`/fast/api/tasks/${pendingModalTask.id}/pending`, {
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
            const res = await fetch(`/fast/api/tasks/${task.id}/pending`, { method: 'DELETE' });
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
            const res = await fetch(`/fast/api/tasks/${viewTask.id}/complete`, {
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
            const res = await fetch(`/fast/api/tasks/${viewTask.id}/claim`, {
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
            const res = await fetch('/fast/api/notes');
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
            const res = await fetch('/fast/api/notes', {
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
            const res = await fetch('/fast/api/notes', {
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
            const res = await fetch('/fast/api/notes', {
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
            await fetch('/fast/api/notes', {
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
            const res = await fetch('/fast/api/notes', {
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
            const res = await fetch('/fast/api/notes', {
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
            const res = await fetch(`/fast/api/tasks/${taskId}/personal-archive`, {
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
                { href: '/my-request', label: 'My Request' },
                { href: '/nexus', label: 'Task Queue' },
                { href: '/team-inbox', label: 'Task Inbox' },
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
                                        const res = await fetch('/fast/api/nexus');
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

            {/* ═══ My Notes (Google Keep Style) — full-width 3×2 grid since
                the calendar widget moved to the dashboard. ═══ */}
            <div className="space-y-4">
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

                {/* ── Notes grid — 3 cols × 2 rows on desktop, 2 cols on tablet,
                    1 col on mobile. flex-col on each card so the action footer
                    pins to the bottom and rows stay visually aligned. ── */}
                {sortedNotes.length > 0 ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {sortedNotes.slice(0, NOTES_PREVIEW_COUNT).map(note => {
                                const colors = noteColors[note.color] || noteColors.default;
                                return (
                                    <div key={note.id} onClick={() => setEditingNote({ ...note })}
                                        className={`${colors.bg} border-2 ${colors.border} rounded-2xl p-4 cursor-pointer group relative transition-all hover:shadow-lg hover:-translate-y-0.5 flex flex-col min-h-[180px]`}>
                                        {note.pinned && <Pin className="w-3.5 h-3.5 text-slate-400 absolute top-3 right-3 rotate-45" />}
                                        {note.title && <h3 className="text-lg font-bold text-slate-900 mb-2 pr-6 line-clamp-2">{note.title}</h3>}
                                        {note.content && <div className="flex-1 text-sm text-slate-600 line-clamp-6 leading-relaxed [&_b]:font-bold [&_i]:italic [&_u]:underline [&_strike]:line-through [&_a]:text-indigo-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-7 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-7 [&_ol]:my-1 [&_li]:mb-0.5 [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-[10px] [&_code]:font-mono" dangerouslySetInnerHTML={{ __html: linkifyHtml(note.content) }} />}
                                        {!note.title && !note.content && <p className="flex-1 text-xs text-slate-300 italic">Empty note</p>}
                                        <div className="flex items-center gap-1 mt-3 pt-2 border-t border-slate-200/40 opacity-0 group-hover:opacity-100 transition-opacity">
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
                        </div>

                        {/* View all notes — opens modal */}
                        {sortedNotes.length > NOTES_PREVIEW_COUNT && (
                            <button
                                onClick={() => setShowAllNotes(true)}
                                className="w-full py-2.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl transition-colors border border-indigo-100"
                            >
                                View all {sortedNotes.length} notes
                            </button>
                        )}
                    </>
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

            {/* CalendarMeetingSection moved to the dashboard — see app/fast/page.tsx. */}

            <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />

            <ShareNoteModal
                open={shareNoteOpen}
                onClose={() => setShareNoteOpen(false)}
                note={editingNote ? { id: editingNote.id, title: editingNote.title, content: editingNote.content } : null}
            />

            {/* Mark-as-Pending modal — My Tasks. Layered above the View Task
                modal (z-[80]) so it stays visible while the underlying detail
                stays open behind it. Same shape as Task Inbox / Task Queue
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

export default function MyTasksPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading tasks...</div>}>
            <MyTasksContent />
        </Suspense>
    );
}

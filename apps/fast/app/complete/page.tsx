'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Star, MessageSquare, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface TaskInfo {
    id: string;
    title: string;
    requester_name: string | null;
    requester_division: string | null;
    urgency: string | null;
}

function CompleteContent() {
    const searchParams = useSearchParams();
    const taskId = searchParams.get('taskId');

    const [task, setTask] = useState<TaskInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Completion form data
    const [difficulty, setDifficulty] = useState(5);
    const [feedbackNotes, setFeedbackNotes] = useState('');

    useEffect(() => {
        if (taskId) {
            fetchTask(taskId);
        } else {
            setLoading(false);
        }
    }, [taskId]);

    const fetchTask = async (id: string) => {
        try {
            // Use the nexus endpoint to get tasks and filter client-side
            const res = await fetch('/api/nexus');
            if (res.ok) {
                const tasks = await res.json();
                const found = tasks.find((t: any) => t.id === id);
                if (found) {
                    setTask({
                        id: found.id,
                        title: found.title,
                        requester_name: found.requester_name,
                        requester_division: found.requester_division,
                        urgency: found.urgency,
                    });
                } else {
                    setError('Task not found.');
                }
            } else {
                setError('Failed to fetch task.');
            }
        } catch {
            setError('Task not found.');
        }
        setLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!task) return;
        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch(`/api/tasks/${task.id}/complete`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    difficultyScore: difficulty,
                    feedbackNotes,
                    completedAt: new Date().toISOString(),
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || 'Failed to complete task.');
            }

            setCompleted(true);
        } catch (err: any) {
            setError(err.message || 'Failed to complete task.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-96">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!taskId || !task) {
        return (
            <div className="max-w-lg mx-auto text-center py-16">
                <p className="text-slate-400 mb-4">No task specified or task not found.</p>
                <Link href="/nexus" className="text-indigo-400 hover:text-indigo-300 font-medium">
                    &larr; Back to List Task Queue
                </Link>
            </div>
        );
    }

    if (completed) {
        return (
            <div className="max-w-lg mx-auto text-center py-16">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Task Completed!</h2>
                <p className="text-slate-500 mb-6">
                    &quot;{task.title}&quot; has been marked as done. 
                    {task.requester_name && ` A confirmation will be sent to ${task.requester_name}.`}
                </p>
                <Link
                    href="/nexus"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to List Task Queue
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div>
                <Link href="/nexus" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-1 mb-4">
                    <ArrowLeft className="w-4 h-4" /> Back to List Task Queue
                </Link>
                <h1 className="text-2xl font-bold text-slate-900 mb-1">Complete Task</h1>
                <p className="text-slate-500">Fill in the completion details for this task.</p>
            </div>

            {/* Task Info Card */}
            <div className="bg-white shadow border-slate-200 border border-slate-200 rounded-2xl p-5">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{task.title}</h3>
                <div className="flex gap-4 text-sm text-slate-500">
                    {task.requester_name && <span>From: {task.requester_name}</span>}
                    {task.requester_division && <span>Division: {task.requester_division}</span>}
                    {task.urgency && <span>Urgency: {task.urgency}</span>}
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                    {error}
                </div>
            )}

            {/* Completion Form */}
            <form onSubmit={handleSubmit} className="bg-white shadow border-slate-200 border border-slate-200 rounded-2xl p-6 space-y-6">
                {/* Difficulty Score */}
                <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        <Star className="w-4 h-4 text-amber-400" />
                        Difficulty Score (1–10)
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="range"
                            min={1}
                            max={10}
                            value={difficulty}
                            onChange={(e) => setDifficulty(Number(e.target.value))}
                            className="flex-1 accent-indigo-500"
                        />
                        <span className="text-2xl font-bold text-slate-900 w-10 text-center">{difficulty}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                        <span>Easy</span>
                        <span>Hard</span>
                    </div>
                </div>

                {/* Feedback Notes */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-indigo-400" />
                        Notes / Feedback to Requester (optional)
                    </label>
                    <textarea
                        value={feedbackNotes}
                        onChange={(e) => setFeedbackNotes(e.target.value)}
                        rows={4}
                        className="w-full bg-slate-50 border-slate-200 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
                        placeholder="Any notes about how this was resolved, things to improve, etc."
                    />
                </div>

                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50 flex justify-center items-center gap-2"
                >
                    {submitting ? 'Completing...' : (
                        <>
                            <CheckCircle2 className="w-5 h-5" />
                            Mark as Done
                        </>
                    )}
                </button>
            </form>
        </div>
    );
}

export default function CompletePage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-96"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>}>
            <CompleteContent />
        </Suspense>
    );
}

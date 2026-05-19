'use client';

// 3-step wizard for Create Card. Mirrors CreateTaskWizard structurally —
// same step labels, same priority pills, same Include-request-details
// toggle — adapted for the self-assign-by-default flow. PR #54 layered
// on:
//   • a real DB-backed brand-code combobox (was a placeholder input),
//     with the dropdown menu rendered via React portal so it can't be
//     clipped by the modal body's overflow-y-auto scroll container;
//   • a click-to-zoom ImageLightbox on Step 2 thumbnails;
//   • an optional Assignee picker in Step 1 visible only to
//     Leader/Master/Admin callers — standard members never see the
//     field and their submission always self-assigns;
//   • the "Request Type" header relabelled to "Task Type" per the
//     brief; the redundant "← Edit details" link on Step 3 is gone
//     since the footer Back button already covers that path.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, ExternalLink, ImageIcon, Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/use-auth';
import { ImageLightbox } from '@/components/ImageLightbox';

interface CreatePersonalCardModalProps {
    open: boolean;
    onClose: () => void;
    /** Called with the new task id after a successful create — consumer
     *  uses this to trigger an inbox refetch so the card appears
     *  immediately without a manual reload. */
    onCreated?: (taskId: string) => void;
}

const REQUEST_TYPES = [
    { value: 'internal',      label: 'Internal Task' },
    { value: 'fix_request',   label: 'Partner Request' },
    { value: 'google_sheets', label: 'Google Sheets Maintenance' },
    { value: 'other',         label: 'Other' },
];

const PRIORITY_LEVELS: {
    value: string;
    label: string;
    sublabel: string;
    bg: string;
    ring: string;
    customStyle?: React.CSSProperties;
}[] = [
    { value: 'P1',       label: 'P1',    sublabel: 'Critical / Blocker', bg: 'bg-rose-500',    ring: 'ring-rose-500/30' },
    { value: 'P2',       label: 'P2',    sublabel: 'High Priority',      bg: 'bg-orange-500',  ring: 'ring-orange-500/30' },
    { value: 'P3',       label: 'P3',    sublabel: 'Normal',             bg: 'bg-amber-500',   ring: 'ring-amber-500/30' },
    { value: 'P4',       label: 'P4',    sublabel: 'Low Priority',       bg: 'bg-emerald-500', ring: 'ring-emerald-500/30' },
    { value: '5-minute', label: '5 Min', sublabel: 'Quick Fix',          bg: '',               ring: 'ring-sky-400/30', customStyle: { backgroundColor: '#56CDFC', color: '#ffffff' } },
];

const STEP_LABELS = ['Card Details', 'Priority & Description', 'Review & Submit'];
const STEP_SUBTITLES = [
    'Title is required. Toggle on to add a task type, brand code, or assignee.',
    'How urgent is this and describe the details',
    'Review the card before creating',
];

interface UploadedImage { url: string; preview: string; }
interface MemberOption { id: string; name: string; }

export function CreatePersonalCardModal({ open, onClose, onCreated }: CreatePersonalCardModalProps) {
    const { user, isLeader } = useAuth();

    const [currentStep, setCurrentStep] = useState(1);
    const [highestStepReached, setHighestStepReached] = useState(1);
    const [stepErrors, setStepErrors] = useState<string[]>([]);

    const [formData, setFormData] = useState({
        title: '',
        requestType: 'internal',
        brandCode: '',
        assigneeId: '',
        urgency: 'P3',
        dueDate: '',
        description: '',
        referenceUrls: [] as string[],
    });
    const [includeRequestDetails, setIncludeRequestDetails] = useState(false);
    const [newUrlInput, setNewUrlInput] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [images, setImages] = useState<UploadedImage[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    // Brand code combobox — list comes from /api/brand-codes (the same
    // Google Sheets-backed list CreateTaskWizard consumes). The menu is
    // rendered via a React portal to document.body so it isn't clipped
    // by the modal body's `overflow-y-auto`; position is computed from
    // the input's bounding rect every time we open.
    const [brandCodes, setBrandCodes] = useState<string[]>([]);
    const [brandSearchOpen, setBrandSearchOpen] = useState(false);
    const [brandMenuRect, setBrandMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
    const brandInputRef = useRef<HTMLInputElement>(null);

    // Same shape for the assignee picker — also portal-rendered so the
    // dropdown isn't clipped. Members list is the caller's team only,
    // matching CreateTaskWizard's source.
    const [members, setMembers] = useState<MemberOption[]>([]);

    useEffect(() => {
        if (!open) return;
        setCurrentStep(1);
        setHighestStepReached(1);
        setStepErrors([]);
        setFormData({
            title: '',
            requestType: 'internal',
            brandCode: '',
            assigneeId: '',
            urgency: 'P3',
            dueDate: '',
            description: '',
            referenceUrls: [],
        });
        setIncludeRequestDetails(false);
        setNewUrlInput('');
        setImages([]);
        setUploading(false);
        setUploadError(null);
        setIsDragOver(false);
        setError(null);
        setBrandSearchOpen(false);
        setLightboxUrl(null);

        // Hydrate the brand list on every open so a Sheets edit shows up
        // without a hard reload. /api/brand-codes is cached server-side
        // for 10 minutes, so the fetch is cheap even with frequent opens.
        fetch('/fast/api/brand-codes')
            .then((r) => (r.ok ? r.json() : []))
            .then(setBrandCodes)
            .catch(() => setBrandCodes([]));

        // Only fetch the teammates list when the caller can pick an
        // assignee — saves a round-trip for standard members who never
        // see the picker.
        if (isLeader) {
            fetch('/fast/api/teammates')
                .then((r) => (r.ok ? r.json() : []))
                .then((list: { id: string; name: string }[]) => {
                    setMembers((list || []).map((u) => ({ id: u.id, name: u.name })));
                })
                .catch(() => setMembers([]));
        } else {
            setMembers([]);
        }
    }, [open, isLeader]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !submitting) onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, submitting, onClose]);

    // Recompute the brand-menu portal position when the dropdown opens
    // or the viewport resizes / scrolls — `fixed` positioning means we
    // anchor off the live bounding rect, not the page coordinates.
    useEffect(() => {
        if (!brandSearchOpen) return;
        const recompute = () => {
            const el = brandInputRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            setBrandMenuRect({
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width,
            });
        };
        recompute();
        window.addEventListener('resize', recompute);
        window.addEventListener('scroll', recompute, true);
        return () => {
            window.removeEventListener('resize', recompute);
            window.removeEventListener('scroll', recompute, true);
        };
    }, [brandSearchOpen]);

    const uploadImage = useCallback(async (file: File) => {
        setUploading(true);
        setUploadError(null);
        const localPreview = URL.createObjectURL(file);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/fast/api/upload', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            setImages((prev) => [...prev, { url: data.url, preview: localPreview }]);
        } catch (err: any) {
            setUploadError(err?.message || 'Failed to upload image');
        } finally {
            setUploading(false);
        }
    }, []);

    const removeImageAt = useCallback((idx: number) => {
        setImages((prev) => prev.filter((_, i) => i !== idx));
    }, []);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) uploadImage(file);
                return;
            }
        }
    }, [uploadImage]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                uploadImage(file);
            } else {
                setUploadError('Please drop an image file (PNG, JPEG, WebP, or GIF)');
            }
        }
    }, [uploadImage]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        Array.from(files).forEach((f) => { if (f.type.startsWith('image/')) uploadImage(f); });
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [uploadImage]);

    const validateStep = (step: number): string[] => {
        const errs: string[] = [];
        if (step === 1) {
            if (!formData.title.trim()) errs.push('Title is required.');
            if (includeRequestDetails && formData.requestType === 'fix_request' && !formData.brandCode.trim()) {
                errs.push('Brand code is required for a Partner Request.');
            }
        }
        return errs;
    };

    const handleNext = () => {
        const errs = validateStep(currentStep);
        setStepErrors(errs);
        if (errs.length > 0) return;
        const next = Math.min(currentStep + 1, 3);
        setCurrentStep(next);
        setHighestStepReached((prev) => Math.max(prev, next));
    };

    const handleBack = () => {
        setStepErrors([]);
        setCurrentStep((s) => Math.max(s - 1, 1));
    };

    const addUrl = () => {
        const url = newUrlInput.trim();
        if (!url) return;
        setFormData((prev) => ({ ...prev, referenceUrls: [...prev.referenceUrls, url] }));
        setNewUrlInput('');
    };

    const handleSubmit = async () => {
        const step1Errs = validateStep(1);
        if (step1Errs.length > 0) {
            setStepErrors(step1Errs);
            setCurrentStep(1);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            // assigneeId only goes on the wire when the leader picked a
            // non-self target. The API enforces the role gate too —
            // the client-side filter is just to keep payloads clean.
            const targetedAssigneeId = isLeader && formData.assigneeId && formData.assigneeId !== user?.id
                ? formData.assigneeId
                : undefined;
            const res = await fetch('/fast/api/tasks/self', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: formData.title.trim(),
                    description: formData.description.trim() || undefined,
                    urgency: formData.urgency,
                    dueDate: formData.dueDate || undefined,
                    referenceUrls: formData.referenceUrls,
                    fileUrls: images.map((i) => i.url),
                    requestType: includeRequestDetails ? formData.requestType : 'self',
                    brandCode: includeRequestDetails && formData.requestType === 'fix_request'
                        ? formData.brandCode.trim().toUpperCase()
                        : undefined,
                    assigneeId: targetedAssigneeId,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || 'Failed to create card');
            }
            onCreated?.(data.id);
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Failed to create card');
        } finally {
            setSubmitting(false);
        }
    };

    const minDueDate = (() => {
        const d = new Date();
        if (formData.urgency === '5-minute') return d.toISOString().split('T')[0];
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    })();

    if (!open) return null;

    const activePriority = PRIORITY_LEVELS.find((p) => p.value === formData.urgency);
    const activeRequestType = REQUEST_TYPES.find((r) => r.value === formData.requestType);
    const titleLabel = includeRequestDetails ? 'Request Title / Subject' : 'Title';
    const filteredBrands = brandCodes.filter((c) =>
        !formData.brandCode || c.toLowerCase().includes(formData.brandCode.toLowerCase()),
    );
    const selectedAssignee = members.find((m) => m.id === formData.assigneeId);

    return (
        <div
            className="fixed inset-0 z-[95] flex items-stretch sm:items-center sm:justify-center bg-black/50 backdrop-blur-sm sm:p-4"
            onClick={() => !submitting && onClose()}
        >
            <div
                className="w-full max-w-2xl bg-white border-0 sm:border border-slate-200 rounded-none sm:rounded-3xl shadow-2xl flex flex-col h-full max-h-screen sm:h-auto sm:max-h-[92vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                            <Plus className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Create Personal Card</h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {isLeader
                                    ? 'Self-assigned by default. Pick an assignee in Step 1 to delegate.'
                                    : 'Self-assigned task. Lands in your Direct Tasks tab and Team Inbox.'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => !submitting && onClose()}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Step indicator */}
                <div className="px-6 pt-5">
                    <div className="flex items-center justify-between">
                        {STEP_LABELS.map((label, idx) => {
                            const stepNum = idx + 1;
                            const isCompleted = highestStepReached > stepNum && currentStep !== stepNum;
                            const isActive = currentStep === stepNum;
                            return (
                                <div key={stepNum} className="flex items-center flex-1 last:flex-initial">
                                    <div className="flex flex-col items-center">
                                        <div
                                            className={cn(
                                                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all',
                                                isCompleted ? 'bg-indigo-600 text-white' :
                                                isActive ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' :
                                                'bg-white border-2 border-slate-300 text-slate-400',
                                            )}
                                        >
                                            {isCompleted ? <Check className="w-4 h-4" /> : stepNum}
                                        </div>
                                        <span
                                            className={cn(
                                                'text-xs mt-1.5 font-medium whitespace-nowrap',
                                                isActive || isCompleted ? 'text-indigo-600' : 'text-slate-400',
                                            )}
                                        >
                                            {label}
                                        </span>
                                    </div>
                                    {stepNum < STEP_LABELS.length && (
                                        <div
                                            className={cn(
                                                'flex-1 h-0.5 mx-2 mb-5',
                                                highestStepReached > stepNum ? 'bg-indigo-600' : 'bg-slate-200',
                                            )}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="px-6 pt-4 pb-3">
                    <h3 className="text-base font-bold text-slate-900">{STEP_LABELS[currentStep - 1]}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{STEP_SUBTITLES[currentStep - 1]}</p>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">
                    {stepErrors.length > 0 && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">
                            {stepErrors[0]}
                        </div>
                    )}
                    {error && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm">
                            {error}
                        </div>
                    )}

                    {/* ===== STEP 1: Card Details ===== */}
                    {currentStep === 1 && (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-500 font-medium">
                                    {titleLabel} <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    autoFocus
                                    maxLength={200}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                    placeholder="e.g. Follow up on Brand X invoice"
                                />
                            </div>

                            <label className="flex items-start gap-3 cursor-pointer group">
                                <div className="relative mt-0.5">
                                    <input
                                        type="checkbox"
                                        checked={includeRequestDetails}
                                        onChange={(e) => setIncludeRequestDetails(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-10 h-5 bg-slate-200 rounded-full peer-checked:bg-indigo-500 transition-colors" />
                                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
                                </div>
                                <div>
                                    <span className="text-sm text-slate-700 font-medium">Include request details</span>
                                    <p className="text-xs text-slate-400">
                                        Optional — task type and brand code (for Partner Request).
                                        Step 2 captures priority, description, and links regardless.
                                    </p>
                                </div>
                            </label>

                            {includeRequestDetails && (
                                <>
                                    <div className="space-y-2">
                                        {/* PR #54: label renamed from "Request Type" to "Task Type"
                                            per the brief — the field still maps to formData.requestType
                                            internally so the API contract stays unchanged. */}
                                        <label className="text-sm text-slate-500 font-medium">Task Type</label>
                                        <div className="flex flex-wrap gap-3">
                                            {REQUEST_TYPES.map((rt) => (
                                                <label key={rt.value} className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name="pc-requestType"
                                                        value={rt.value}
                                                        checked={formData.requestType === rt.value}
                                                        onChange={(e) => setFormData({ ...formData, requestType: e.target.value })}
                                                        className="w-4 h-4 text-indigo-500 bg-slate-100 border-slate-300 focus:ring-indigo-500"
                                                    />
                                                    <span className="text-sm text-slate-700">{rt.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    {formData.requestType === 'fix_request' && (
                                        <div className="space-y-1.5 relative">
                                            <label className="text-sm text-slate-500 font-medium">
                                                Brand Code <span className="text-rose-500">*</span>
                                            </label>
                                            <input
                                                ref={brandInputRef}
                                                type="text"
                                                value={formData.brandCode}
                                                onChange={(e) => setFormData({ ...formData, brandCode: e.target.value.toUpperCase() })}
                                                onFocus={() => setBrandSearchOpen(true)}
                                                placeholder="Type or search brand code..."
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                            />
                                            <p className="text-xs text-slate-400">
                                                The brand or partner this card relates to. Matches the leader-create flow.
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Optional assignee picker — Leader/Master/Admin only.
                                Standard members never see this control and their
                                submissions always self-assign. The default option
                                "Myself" preserves the historical Create Card
                                behaviour so leaders aren't forced to pick a target
                                every time. */}
                            {isLeader && (
                                <div className="space-y-1.5">
                                    <label className="text-sm text-slate-500 font-medium">
                                        Assignee <span className="text-slate-400">(Optional)</span>
                                    </label>
                                    <select
                                        value={formData.assigneeId}
                                        onChange={(e) => setFormData({ ...formData, assigneeId: e.target.value })}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                    >
                                        <option value="">Myself ({user?.name || 'Me'})</option>
                                        {members
                                            .filter((m) => m.id !== user?.id)
                                            .map((m) => (
                                                <option key={m.id} value={m.id}>{m.name}</option>
                                            ))}
                                    </select>
                                    <p className="text-xs text-slate-400">
                                        Defaults to yourself. Pick a teammate to delegate — the card lands directly in their Direct Tasks lane, in-progress and claimed.
                                    </p>
                                </div>
                            )}
                        </>
                    )}

                    {/* ===== STEP 2: Priority & Description ===== */}
                    {currentStep === 2 && (
                        <>
                            <div className="space-y-2">
                                <label className="text-sm text-slate-500 font-medium">Priority Level</label>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                    {PRIORITY_LEVELS.map((p) => {
                                        const isActive = formData.urgency === p.value;
                                        const useCustomStyle = !!p.customStyle && isActive;
                                        return (
                                            <button
                                                key={p.value}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, urgency: p.value })}
                                                style={useCustomStyle ? p.customStyle : undefined}
                                                className={cn(
                                                    'flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-xl border-2 transition-all text-center',
                                                    isActive
                                                        ? cn(
                                                              'text-white border-transparent shadow-md ring-4',
                                                              p.ring,
                                                              !p.customStyle && p.bg,
                                                          )
                                                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300',
                                                )}
                                            >
                                                <span className="text-sm font-bold">{p.label}</span>
                                                <span className={cn('text-[10px]', isActive ? 'opacity-90' : 'text-slate-400')}>
                                                    {p.sublabel}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-500 font-medium">
                                    Preferred Deadline <span className="text-slate-400">(Optional)</span>
                                </label>
                                <input
                                    type="date"
                                    value={formData.dueDate}
                                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                                    min={minDueDate}
                                    style={{ colorScheme: 'light' }}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                                />
                                <p className="text-xs text-slate-400">
                                    {formData.urgency === '5-minute'
                                        ? 'Quick tasks can be set for today'
                                        : 'Minimum deadline is tomorrow (H+1)'}
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-500 font-medium">
                                    Request Description <span className="text-slate-400">(Optional)</span>
                                </label>
                                <div
                                    onPaste={handlePaste}
                                    onDrop={handleDrop}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                                    onDragLeave={() => setIsDragOver(false)}
                                    className={cn(
                                        'rounded-xl border transition-colors',
                                        isDragOver
                                            ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/30'
                                            : 'border-slate-200 bg-slate-50',
                                    )}
                                >
                                    {images.length > 0 && (
                                        <div className="flex flex-wrap gap-2 p-3 border-b border-slate-200">
                                            {images.map((img, idx) => (
                                                <div key={`img-${idx}`} className="relative group">
                                                    {/* Wrap thumbnail in a button so it
                                                        announces as activatable and so
                                                        keyboard focus opens the lightbox
                                                        too. Prefer the remote URL — the
                                                        blob fallback only matters while
                                                        an upload is mid-flight. */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setLightboxUrl(img.url || img.preview)}
                                                        className="block focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded-lg"
                                                        title="Click to preview"
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={img.url || img.preview}
                                                            alt={`Attachment ${idx + 1}`}
                                                            className="h-16 w-auto rounded-lg border border-slate-200 object-cover hover:opacity-90 transition-opacity cursor-zoom-in"
                                                        />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeImageAt(idx)}
                                                        className="absolute -top-1.5 -right-1.5 p-0.5 bg-slate-700 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                        aria-label="Remove image"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        rows={4}
                                        className="w-full px-4 py-3 bg-transparent border-0 rounded-xl text-sm text-slate-800 focus:outline-none resize-y"
                                        placeholder="Notes, links, context… Paste (Ctrl+V) a screenshot to attach it."
                                    />
                                    <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-200 bg-slate-100/60 rounded-b-xl">
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-600 hover:text-indigo-600 hover:bg-white rounded-md transition-colors"
                                        >
                                            <ImageIcon className="w-3.5 h-3.5" /> Attach image
                                        </button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            onChange={handleFileSelect}
                                            className="hidden"
                                        />
                                        {uploading && (
                                            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                                <Loader2 className="w-3 h-3 animate-spin" /> Uploading…
                                            </span>
                                        )}
                                        <span className="ml-auto text-[11px] text-slate-400">
                                            Tip: Ctrl+V to paste a screenshot
                                        </span>
                                    </div>
                                </div>
                                {uploadError && (
                                    <p className="text-xs text-rose-600">{uploadError}</p>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-500 font-medium">
                                    Add URL / Link <span className="text-slate-400">(Optional)</span>
                                </label>
                                <div className="space-y-2">
                                    {formData.referenceUrls.length > 0 && (
                                        <div className="space-y-1.5">
                                            {formData.referenceUrls.map((url, i) => (
                                                <div key={`${url}-${i}`} className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs">
                                                    <ExternalLink className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                                                    <a href={url} target="_blank" rel="noopener noreferrer" className="truncate flex-1 text-indigo-600 hover:underline">
                                                        {url}
                                                    </a>
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData((prev) => ({ ...prev, referenceUrls: prev.referenceUrls.filter((_, idx) => idx !== i) }))}
                                                        className="text-rose-400 hover:text-rose-600"
                                                        aria-label="Remove link"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex gap-2">
                                        <input
                                            type="url"
                                            value={newUrlInput}
                                            onChange={(e) => setNewUrlInput(e.target.value)}
                                            placeholder="https://example.com/reference"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    addUrl();
                                                }
                                            }}
                                            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={addUrl}
                                            disabled={!newUrlInput.trim()}
                                            className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex-shrink-0"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ===== STEP 3: Review & Submit ===== */}
                    {currentStep === 3 && (
                        <>
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 rounded-full text-xs font-semibold text-indigo-700">
                                <Check className="w-3 h-3" />
                                {selectedAssignee && selectedAssignee.id !== user?.id
                                    ? `Assigned to ${selectedAssignee.name}`
                                    : 'Self-Assigned'}
                            </div>

                            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                                <div>
                                    <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">{titleLabel}</div>
                                    <div className="text-sm font-medium text-slate-800">
                                        {formData.title || <span className="text-slate-400">—</span>}
                                    </div>
                                </div>

                                {includeRequestDetails && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Task Type</div>
                                            <div className="text-sm font-medium text-slate-800">
                                                {activeRequestType?.label || formData.requestType}
                                            </div>
                                        </div>
                                        {formData.requestType === 'fix_request' && (
                                            <div>
                                                <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Brand Code</div>
                                                <div className="text-sm font-medium text-slate-800">
                                                    {formData.brandCode || <span className="text-slate-400 font-normal">—</span>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Priority</div>
                                        <div className="text-sm font-medium text-slate-800">
                                            {activePriority?.label}
                                            {' · '}
                                            <span className="font-normal text-slate-500">{activePriority?.sublabel}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Preferred Deadline</div>
                                        <div className="text-sm font-medium text-slate-800">
                                            {formData.dueDate || <span className="text-slate-400 font-normal">No deadline</span>}
                                        </div>
                                    </div>
                                </div>

                                {formData.description && (
                                    <div>
                                        <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Description</div>
                                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{formData.description}</p>
                                    </div>
                                )}

                                {images.length > 0 && (
                                    <div>
                                        <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mb-1">Attachments</div>
                                        <div className="flex flex-wrap gap-2">
                                            {images.map((img, i) => (
                                                <button
                                                    key={`review-img-${i}`}
                                                    type="button"
                                                    onClick={() => setLightboxUrl(img.url || img.preview)}
                                                    className="block focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded-lg"
                                                    title="Click to preview"
                                                >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={img.url || img.preview}
                                                        alt={`Attachment ${i + 1}`}
                                                        className="h-14 w-auto rounded-lg border border-slate-200 object-cover hover:opacity-90 cursor-zoom-in"
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {formData.referenceUrls.length > 0 && (
                                    <div>
                                        <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mb-1">Links</div>
                                        <div className="space-y-1">
                                            {formData.referenceUrls.map((url, i) => (
                                                <div key={`review-${url}-${i}`} className="flex items-center gap-2 text-xs">
                                                    <ExternalLink className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                                                    <span className="truncate text-indigo-600">{url}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* PR #54: the "← Edit details" text link that used to
                                live here is gone — the footer Back button already
                                covers the same flow, and the duplicate
                                affordance read as visual clutter on Review. */}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-slate-200">
                    {currentStep > 1 ? (
                        <button
                            type="button"
                            onClick={handleBack}
                            disabled={submitting}
                            className="inline-flex items-center gap-1 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                        >
                            <ChevronLeft className="w-4 h-4" /> Back
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    )}

                    {currentStep < 3 ? (
                        <button
                            type="button"
                            onClick={handleNext}
                            disabled={!formData.title.trim()}
                            className="inline-flex items-center gap-1 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                            Next <ChevronRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={submitting || !formData.title.trim() || uploading}
                            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                            {submitting ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                            ) : (
                                <><Plus className="w-4 h-4" /> Create Card</>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Brand-code dropdown portal — rendered to document.body so
                the menu can escape the modal body's overflow-y-auto clip.
                Position is recomputed via getBoundingClientRect on the
                input, with a window-level click backdrop to dismiss. */}
            {brandSearchOpen && brandMenuRect && typeof document !== 'undefined' && createPortal(
                <>
                    <div
                        className="fixed inset-0 z-[110]"
                        onClick={() => setBrandSearchOpen(false)}
                    />
                    <div
                        className="fixed z-[111] bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto"
                        style={{
                            top: brandMenuRect.top,
                            left: brandMenuRect.left,
                            width: brandMenuRect.width,
                        }}
                    >
                        {filteredBrands.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-slate-400">No matching brand codes</p>
                        ) : (
                            filteredBrands.map((code) => (
                                <button
                                    key={code}
                                    type="button"
                                    onClick={() => { setFormData({ ...formData, brandCode: code }); setBrandSearchOpen(false); }}
                                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                                >
                                    {code}
                                </button>
                            ))
                        )}
                    </div>
                </>,
                document.body,
            )}

            {/* Image lightbox — opens when a thumbnail (Step 2 or Step 3)
                is clicked; closes via Esc, the X button, or backdrop. */}
            <ImageLightbox
                src={lightboxUrl}
                onClose={() => setLightboxUrl(null)}
                images={images.map((i) => i.url || i.preview)}
            />
        </div>
    );
}

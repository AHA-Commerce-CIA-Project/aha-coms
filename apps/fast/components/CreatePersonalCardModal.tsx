'use client';

// 2-step wizard for personal card creation. Step 1 mirrors
// CreateTaskWizard's Step 1 layout — Title + an "Include request
// details" toggle that expands the rest of the form (Priority,
// Deadline, Description, URL adder) — minus CreateTaskWizard's
// Assignee picker since personal cards always self-assign. Step 2 is
// the read-only review with a Self-Assigned pill in place of the
// channel/brand metadata.
//
// Field set:
//   Step 1: Title (always visible, required), Include-request-details
//           toggle, then when expanded: Priority pills (P1-P4 + 5 Min),
//           Preferred Deadline, Description (with paste/drop image
//           upload), Add URL/Link chip list.
//   Step 2: Read-only review + Self-Assigned pill + final submit.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, ExternalLink, FileText, ImageIcon, Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreatePersonalCardModalProps {
    open: boolean;
    onClose: () => void;
    /** Called with the new task id after a successful create — consumer
     *  uses this to trigger an inbox refetch so the card appears
     *  immediately without a manual reload. */
    onCreated?: (taskId: string) => void;
}

// Same shape + colors as CreateTaskWizard's PRIORITY_LEVELS so the two
// modals read as one design system. The 5-minute pill carries its own
// inline style because the brand cyan isn't a Tailwind palette colour.
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

const STEP_LABELS = ['Card Details', 'Review & Submit'];
const STEP_SUBTITLES = [
    'Title is required. Toggle on to add priority, deadline, description, and links.',
    'Review the card before creating',
];

interface UploadedImage { url: string; preview: string; }

export function CreatePersonalCardModal({ open, onClose, onCreated }: CreatePersonalCardModalProps) {
    const [currentStep, setCurrentStep] = useState(1);
    const [highestStepReached, setHighestStepReached] = useState(1);
    const [stepErrors, setStepErrors] = useState<string[]>([]);

    const [formData, setFormData] = useState({
        title: '',
        urgency: 'P3',
        dueDate: '',
        description: '',
        referenceUrls: [] as string[],
    });
    // Mirrors CreateTaskWizard's toggle — when off, Step 1 collapses to
    // just Title + this switch. Step 2 review honours the toggle by
    // hiding the optional sections that were never filled in.
    const [includeRequestDetails, setIncludeRequestDetails] = useState(false);
    const [newUrlInput, setNewUrlInput] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Image upload state — ported from CreateTaskWizard's pattern. Each
    // upload returns a remote URL plus a local object-URL preview so the
    // thumbnail renders immediately without a round-trip.
    const [images, setImages] = useState<UploadedImage[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reset every time the modal opens — no carry-over from a prior open.
    useEffect(() => {
        if (!open) return;
        setCurrentStep(1);
        setHighestStepReached(1);
        setStepErrors([]);
        setFormData({ title: '', urgency: 'P3', dueDate: '', description: '', referenceUrls: [] });
        setIncludeRequestDetails(false);
        setNewUrlInput('');
        setImages([]);
        setUploading(false);
        setUploadError(null);
        setIsDragOver(false);
        setError(null);
    }, [open]);

    // Escape closes — only when no submit is in flight so a stray Esc
    // mid-submit doesn't strand the request.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !submitting) onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, submitting, onClose]);

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

    const validateStep1 = (): string[] => {
        const errs: string[] = [];
        if (!formData.title.trim()) errs.push('Title is required.');
        return errs;
    };

    const handleNext = () => {
        const errs = validateStep1();
        setStepErrors(errs);
        if (errs.length > 0) return;
        setCurrentStep(2);
        setHighestStepReached(2);
    };

    const handleBack = () => {
        setStepErrors([]);
        setCurrentStep(1);
    };

    const addUrl = () => {
        const url = newUrlInput.trim();
        if (!url) return;
        setFormData((prev) => ({ ...prev, referenceUrls: [...prev.referenceUrls, url] }));
        setNewUrlInput('');
    };

    const handleSubmit = async () => {
        // Step 2 submit re-validates step 1 in case the user somehow
        // ended up here with bad data (e.g. browser-back from a closed
        // modal restoring partial state).
        const errs = validateStep1();
        if (errs.length > 0) {
            setStepErrors(errs);
            setCurrentStep(1);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch('/fast/api/tasks/self', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: formData.title.trim(),
                    description: formData.description.trim() || undefined,
                    urgency: includeRequestDetails ? formData.urgency : 'P3',
                    dueDate: includeRequestDetails ? (formData.dueDate || undefined) : undefined,
                    referenceUrls: includeRequestDetails ? formData.referenceUrls : [],
                    fileUrls: includeRequestDetails ? images.map((i) => i.url) : [],
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

    // Mirrors CreateTaskWizard's min-due-date rule: 5-minute tasks can
    // be set for today, everything else gets H+1 as the floor.
    const minDueDate = (() => {
        const d = new Date();
        if (formData.urgency === '5-minute') return d.toISOString().split('T')[0];
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    })();

    if (!open) return null;

    const activePriority = PRIORITY_LEVELS.find((p) => p.value === formData.urgency);

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
                                Self-assigned task. Lands in your active inbox.
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

                {/* Step indicator — mirrors CreateTaskWizard's pattern but with 2
                    steps instead of 3 (no assignee step). */}
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

                {/* Body */}
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

                    {/* ===== STEP 1: Title + (optional) details ===== */}
                    {currentStep === 1 && (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-500 font-medium">
                                    Title <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    autoFocus
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                    placeholder="e.g. Follow up on Brand X invoice"
                                />
                            </div>

                            {/* Include-request-details toggle — collapsed Step 1
                                shows only the Title above + this switch.
                                Identical pattern to CreateTaskWizard:382 so the
                                two modals read as one design system. */}
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
                                        Optional — priority, deadline, description (with paste-to-attach), and links.
                                        Skip if a title is enough.
                                    </p>
                                </div>
                            </label>

                            {includeRequestDetails && (
                                <>
                                    {/* Priority pill group — five buttons in one row
                                        on desktop, two-column wrap on mobile. */}
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

                                    {/* Description block — wraps the textarea so
                                        paste/drop bubble up regardless of where in
                                        the box the user dropped. Image thumbnails
                                        render above the textarea once uploaded;
                                        Click-X removes them client-side. */}
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
                                                            <img
                                                                src={img.preview}
                                                                alt={`Attachment ${idx + 1}`}
                                                                className="h-16 w-auto rounded-lg border border-slate-200 object-cover"
                                                            />
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

                                    {/* URL / Link adder — mirrors CreateTaskWizard's
                                        chip-list pattern. Enter inside the input adds
                                        the URL without a click. */}
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
                        </>
                    )}

                    {/* ===== STEP 2: Review & Submit ===== */}
                    {currentStep === 2 && (
                        <>
                            {/* Self-Assigned chip — visible cue that this is a
                                personal card (replaces the Channel / Brand Tag
                                metadata that the brief asked us to drop). */}
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 rounded-full text-xs font-semibold text-indigo-700">
                                <Check className="w-3 h-3" /> Self-Assigned
                            </div>

                            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                                <div>
                                    <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 mb-0.5">Title</div>
                                    <div className="text-sm font-medium text-slate-800">
                                        {formData.title || <span className="text-slate-400">—</span>}
                                    </div>
                                </div>
                                {includeRequestDetails ? (
                                    <>
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
                                                        <img
                                                            key={`review-img-${i}`}
                                                            src={img.preview}
                                                            alt={`Attachment ${i + 1}`}
                                                            className="h-14 w-auto rounded-lg border border-slate-200 object-cover"
                                                        />
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
                                    </>
                                ) : (
                                    <p className="text-xs text-slate-500 italic">
                                        No request details added. The card lands in your inbox with default priority (P3)
                                        and no deadline.
                                    </p>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => setCurrentStep(1)}
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                            >
                                ← Edit details
                            </button>
                        </>
                    )}
                </div>

                {/* Footer — Back/Next on step 1, Back/Create Card on step 2 */}
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

                    {currentStep === 1 ? (
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
        </div>
    );
}

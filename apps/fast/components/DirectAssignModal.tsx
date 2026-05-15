'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
    X, Send, Loader2, Check,
    ChevronLeft, ChevronRight, Pencil, ImagePlus, FileText, ExternalLink, Paperclip, Smile,
} from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/lib/auth/use-auth';
import { RichTextEditor, type RichTextEditorHandle } from '@/components/RichTextEditor';
import { EmojiPicker } from '@/components/chat/EmojiPicker';
import { ImageLightbox } from '@/components/ImageLightbox';

interface ChannelOption {
    id: string;
    name: string;
    isPrivate: boolean;
    isArchived: boolean;
}

interface DirectAssignModalProps {
    open: boolean;
    onClose: () => void;
    onSubmitted?: (result: { taskId: string; taskToken: string; channelId: string }) => void;
    defaultChannelId?: string | null;

    // ─── "Convert a message to a task" mode ────────────────────────────────
    // When sourceMessageId is set, the modal:
    //   1. Pre-fills description (and image attachments) from the source message
    //   2. Locks the channel selection (channel is implied by the message)
    //   3. Submits to /api/tasks/direct-assign-from-message which edits the
    //      original message in place into a card instead of posting a new one.
    sourceMessageId?: string | null;
    defaultDescription?: string;
    defaultImages?: { url: string; preview: string }[];
    defaultFileUrls?: string[];

    // Slash-command (/req) flow: jump straight to the Review step (skipping
    // request-details + priority pages, like sourceMessageId does) and call
    // onCancel with the current description when the user closes the modal
    // without submitting, so the parent can restore the draft.
    startAtReview?: boolean;
    onCancel?: (description: string) => void;
}

const REQUEST_TYPES = [
    { value: 'fix_request', label: 'Partner Request' },
    { value: 'google_sheets', label: 'Google Sheets Maintenance' },
    { value: 'other', label: 'Other' },
];

const PRIORITY_LEVELS = [
    { value: 'P1', label: 'P1', sublabel: 'Critical / Blocker', description: 'Very Important - Very Urgent', color: 'bg-rose-500',  ring: 'ring-rose-500/30' },
    { value: 'P2', label: 'P2', sublabel: 'High Priority',      description: 'Very Important - Not Urgent', color: 'bg-orange-500', ring: 'ring-orange-500/30' },
    { value: 'P3', label: 'P3', sublabel: 'Normal',             description: 'Not Important - Very Urgent', color: 'bg-amber-500',  ring: 'ring-amber-500/30' },
    { value: 'P4', label: 'P4', sublabel: 'Low Priority',       description: 'Not Important - Not Urgent', color: 'bg-emerald-500', ring: 'ring-emerald-500/30' },
    { value: '5-minute', label: '5 Min', sublabel: '5-Minute Quick Fix', description: '', color: '', ring: 'ring-sky-400/30', customStyle: { backgroundColor: '#56CDFC', color: '#ffffff' } as any },
];

const STEP_LABELS = ['Request Details', 'Priority & Description', 'Review & Submit'];
const STEP_SUBTITLES = [
    'Optional: add request type, brand code, and title',
    'How urgent is this and describe the details',
    'Review your task before posting',
];

function htmlToPlainText(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:div|p|li|tr|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
}

export function DirectAssignModal({
    open, onClose, onSubmitted, defaultChannelId,
    sourceMessageId, defaultDescription, defaultImages, defaultFileUrls,
    startAtReview, onCancel,
}: DirectAssignModalProps) {
    const isFromMessage = !!sourceMessageId;
    const { profile } = useAuth();

    // Wizard state
    const [currentStep, setCurrentStep] = useState(1);
    const [highestStepReached, setHighestStepReached] = useState(1);
    const [stepErrors, setStepErrors] = useState<string[]>([]);
    const [editingFromReview, setEditingFromReview] = useState(false);

    // Whether to include the optional Request Details section
    const [includeRequestDetails, setIncludeRequestDetails] = useState(false);

    const [channels, setChannels] = useState<ChannelOption[]>([]);
    const [brandCodes, setBrandCodes] = useState<string[]>([]);
    const [brandSearchOpen, setBrandSearchOpen] = useState(false);

    const [formData, setFormData] = useState({
        channelId: '',
        requestType: 'fix_request',
        brandCode: '',
        title: '',
        urgency: 'P3',
        description: '',
        dueDate: '',
        fileUrls: [] as string[],
        referenceUrls: [] as string[],
    });
    const [newUrlInput, setNewUrlInput] = useState('');

    // Image attachments — multiple, paste/drag/drop or click. Separate from files.
    const [images, setImages] = useState<{ url: string; preview: string }[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const fileUploadRef = useRef<HTMLInputElement>(null);
    const pasteZoneRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<RichTextEditorHandle | null>(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset & fetch when modal opens
    useEffect(() => {
        if (!open) return;
        // Both "Convert message → task" and the /req slash-command jump straight
        // to the review step. Description is pre-filled and the user can usually
        // just hit submit; the Edit buttons + Back still let them step backwards
        // for priority/request-details if needed.
        const startStep = (sourceMessageId || startAtReview) ? 3 : 1;
        setCurrentStep(startStep);
        setHighestStepReached(startStep);
        setStepErrors([]);
        setEditingFromReview(false);
        setIncludeRequestDetails(false);
        setFormData({
            channelId: '',
            requestType: 'fix_request',
            brandCode: '',
            title: '',
            urgency: 'P3',
            description: defaultDescription || '',
            dueDate: '',
            fileUrls: defaultFileUrls || [],
            referenceUrls: [],
        });
        setImages(defaultImages || []);
        setUploadError(null);
        setError(null);

        fetch('/fast/api/channels?purpose=assign_task')
            .then((r) => (r.ok ? r.json() : []))
            .then((list: ChannelOption[]) => {
                const active = list.filter((c) => !c.isArchived);
                setChannels(active);
                if (defaultChannelId && active.some((c) => c.id === defaultChannelId)) {
                    setFormData((f) => ({ ...f, channelId: defaultChannelId }));
                } else if (active.length > 0) {
                    setFormData((f) => ({ ...f, channelId: active[0].id }));
                }
            })
            .catch(() => setChannels([]));

        fetch('/fast/api/brand-codes').then((r) => (r.ok ? r.json() : [])).then(setBrandCodes).catch(() => {});
    // defaultDescription/defaultImages/defaultFileUrls/sourceMessageId are read at open-time only;
    // changing them mid-open shouldn't blow away the user's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, defaultChannelId]);

    // User-initiated close: backdrop click, X button, ESC. Hands the current
    // description back to the parent (the /req composer uses it to restore the
    // draft) before closing. The successful-submit path calls onClose() directly.
    const closeWithCancel = useCallback(() => {
        if (submitting) return;
        if (onCancel) onCancel(formData.description || '');
        onClose();
    }, [submitting, onCancel, formData.description, onClose]);

    // ESC closes
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !submitting) closeWithCancel();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, submitting, closeWithCancel]);

    // Image upload handlers (paste/drop/select). Each call appends to the images list.
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
            setUploadError(err.message || 'Failed to upload image');
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

    // Step navigation
    const validateStep = (step: number): boolean => {
        const errors: string[] = [];
        // Channel must be set before submitting; the value comes from the
        // channel header that opened the modal, so missing here means the
        // entry point lost context. When converting a message we skip this
        // because the channel is implied by sourceMessageId on the server.
        if (!isFromMessage && !formData.channelId) {
            errors.push('No channel selected — open Direct Assign from a channel header.');
        }
        if (step === 1 && includeRequestDetails) {
            if (!formData.title.trim()) errors.push('Please enter a request title.');
            if (formData.requestType === 'fix_request' && !formData.brandCode) errors.push('Please select a brand code.');
        } else if (step === 2) {
            const text = htmlToPlainText(formData.description);
            if (!text) errors.push('Please enter a description.');
            // If Request Details is OFF we have no explicit title field — derive it
            // from the first line of the description, but require something there.
            if (!includeRequestDetails && !text) errors.push('Description is also used as the title — please enter at least one line.');
        }
        setStepErrors(errors);
        return errors.length === 0;
    };

    const handleNext = () => {
        if (!validateStep(currentStep)) return;
        const nextStep = Math.min(currentStep + 1, 3);
        setCurrentStep(nextStep);
        setHighestStepReached((prev) => Math.max(prev, nextStep));
    };

    const handleBack = () => {
        setStepErrors([]);
        setCurrentStep((prev) => Math.max(prev - 1, 1));
    };

    const goToStep = (step: number, fromReview = false) => {
        setStepErrors([]);
        setEditingFromReview(fromReview);
        setCurrentStep(step);
    };

    // Build the "title" we send to the API. Prefer the explicit Title field
    // when Request Details is on; otherwise derive from the first non-empty
    // line of the description (Slack-style). Brand code prefix mirrors the
    // request form behaviour.
    const effectiveTitle = useMemo(() => {
        if (includeRequestDetails && formData.title.trim()) {
            return formData.brandCode
                ? `[${formData.brandCode}] ${formData.title.trim()}`
                : formData.title.trim();
        }
        const desc = htmlToPlainText(formData.description);
        const firstLine = desc.split('\n').find((l) => l.trim().length > 0) || '';
        return firstLine.slice(0, 120) || 'Direct Assign';
    }, [includeRequestDetails, formData.title, formData.brandCode, formData.description]);

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            // Map collected inputs to the existing /api/tasks/direct-assign attachments shape.
            const attachments: Array<{ url: string; name: string; type: string; size: number; isImage: boolean }> = [];
            for (const img of images) {
                attachments.push({
                    url: img.url,
                    name: img.url.split('/').pop() || 'image',
                    type: 'image/*',
                    size: 0,
                    isImage: true,
                });
            }
            for (const url of formData.fileUrls) {
                attachments.push({
                    url,
                    name: url.split('/').pop() || 'file',
                    type: 'application/octet-stream',
                    size: 0,
                    isImage: false,
                });
            }
            for (const url of formData.referenceUrls) {
                attachments.push({
                    url,
                    name: url,
                    type: 'text/uri-list',
                    size: 0,
                    isImage: false,
                });
            }

            const endpoint = isFromMessage
                ? '/fast/api/tasks/direct-assign-from-message'
                : '/fast/api/tasks/direct-assign';
            const payload = isFromMessage
                ? {
                    messageId: sourceMessageId,
                    title: effectiveTitle,
                    description: formData.description || null,
                    urgency: formData.urgency,
                    dueDate: formData.dueDate || null,
                    attachments,
                }
                : {
                    channelId: formData.channelId,
                    title: effectiveTitle,
                    description: formData.description || null,
                    urgency: formData.urgency,
                    dueDate: formData.dueDate || null,
                    attachments,
                };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data?.error || 'Failed to post task');
                setSubmitting(false);
                return;
            }
            const resolvedChannelId = isFromMessage ? (data.channelId || '') : formData.channelId;
            onSubmitted?.({ taskId: data.taskId, taskToken: data.taskToken, channelId: resolvedChannelId });
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Network error');
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    const minDueDate = (() => {
        const d = new Date();
        if (formData.urgency === '5-minute') return d.toISOString().split('T')[0];
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    })();

    return (
        <div
            className="fixed inset-0 z-[95] flex items-stretch sm:items-center sm:justify-center bg-black/50 backdrop-blur-sm sm:p-4"
            onClick={() => !submitting && closeWithCancel()}
        >
            <div
                className="w-full max-w-3xl bg-white border-0 sm:border border-slate-200 rounded-none sm:rounded-3xl shadow-2xl flex flex-col h-full max-h-screen sm:h-auto sm:max-h-[92vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">{isFromMessage ? 'Convert Message to Task' : 'Direct Assign'}</h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {isFromMessage
                                ? 'Your message will be replaced in the channel with a Direct Assign card any team member can claim.'
                                : 'Post a task into a team channel — any member of that channel can claim it.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => !submitting && closeWithCancel()}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Step Progress Bar */}
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
                                            className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                                                isCompleted ? 'bg-indigo-600 text-white' :
                                                isActive ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' :
                                                'bg-white border-2 border-slate-300 text-slate-400'
                                            }`}
                                        >
                                            {isCompleted ? <Check className="w-4 h-4" /> : stepNum}
                                        </div>
                                        <span className={`text-xs mt-1.5 font-medium whitespace-nowrap ${
                                            isActive || isCompleted ? 'text-indigo-600' : 'text-slate-400'
                                        }`}>{label}</span>
                                    </div>
                                    {stepNum < 3 && (
                                        <div className={`flex-1 h-0.5 mx-2 mb-5 ${
                                            highestStepReached > stepNum ? 'bg-indigo-600' : 'bg-slate-200'
                                        }`} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Step Title */}
                <div className="px-6 pt-4 pb-3">
                    <h3 className="text-base font-bold text-slate-900">{STEP_LABELS[currentStep - 1]}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{STEP_SUBTITLES[currentStep - 1]}</p>
                </div>

                {/* Body — single scroll region */}
                <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">
                    {/* ===== STEP 1: Request Details (optional) ===== */}
                    {currentStep === 1 && (
                        <>
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
                                    <p className="text-xs text-slate-400">Optional — request type, brand code, and a short title. Skip if you just want to write the description.</p>
                                </div>
                            </label>

                            {includeRequestDetails && (
                                <>
                                    {/* Request Type */}
                                    <div className="space-y-2">
                                        <label className="text-sm text-slate-500 font-medium">Request Type</label>
                                        <div className="flex flex-wrap gap-3">
                                            {REQUEST_TYPES.map((rt) => (
                                                <label key={rt.value} className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="radio" name="da-requestType"
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

                                    {/* Brand Code — searchable, only for Partner Request */}
                                    {formData.requestType === 'fix_request' && (
                                        <div className="space-y-2 relative">
                                            <label className="text-sm text-slate-500 font-medium">Brand Code <span className="text-rose-500">*</span></label>
                                            <input
                                                type="text"
                                                value={formData.brandCode}
                                                onChange={(e) => setFormData({ ...formData, brandCode: e.target.value.toUpperCase() })}
                                                onFocus={() => setBrandSearchOpen(true)}
                                                placeholder="Type or search brand code..."
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                            />
                                            {brandSearchOpen && (
                                                <>
                                                    <div className="fixed inset-0 z-30" onClick={() => setBrandSearchOpen(false)} />
                                                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-40 max-h-48 overflow-y-auto">
                                                        {brandCodes
                                                            .filter((c) => !formData.brandCode || c.toLowerCase().includes(formData.brandCode.toLowerCase()))
                                                            .map((code) => (
                                                                <button
                                                                    key={code}
                                                                    type="button"
                                                                    onClick={() => { setFormData({ ...formData, brandCode: code }); setBrandSearchOpen(false); }}
                                                                    className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                                                                >
                                                                    {code}
                                                                </button>
                                                            ))}
                                                        {brandCodes.filter((c) => !formData.brandCode || c.toLowerCase().includes(formData.brandCode.toLowerCase())).length === 0 && (
                                                            <p className="px-4 py-3 text-sm text-slate-400">No matching brand codes</p>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* Title */}
                                    <div className="space-y-1.5">
                                        <label className="text-sm text-slate-500 font-medium">Request Title / Subject <span className="text-rose-500">*</span></label>
                                        <input
                                            type="text"
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            placeholder="Brief title for your request"
                                            maxLength={200}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                        />
                                    </div>
                                </>
                            )}

                            {!includeRequestDetails && (
                                <p className="text-xs text-slate-400 italic">
                                    Skipping this section. The first line of your description on the next step will be used as the task title.
                                </p>
                            )}
                        </>
                    )}

                    {/* ===== STEP 2: Priority & Description ===== */}
                    {currentStep === 2 && (
                        <>
                            {/* Priority chips */}
                            <div className="space-y-2">
                                <label className="text-sm text-slate-500 font-medium">Priority Level</label>
                                <div className="flex gap-2 flex-wrap">
                                    {PRIORITY_LEVELS.map((p) => (
                                        <button
                                            key={p.value}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, urgency: p.value })}
                                            className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all shadow-sm ${
                                                formData.urgency === p.value
                                                    ? (p as any).customStyle ? `ring-2 ${p.ring}` : `${p.color} text-slate-900 ring-2 ${p.ring}`
                                                    : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                            }`}
                                            style={formData.urgency === p.value && (p as any).customStyle ? (p as any).customStyle : undefined}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                                {(() => {
                                    const sel = PRIORITY_LEVELS.find((p) => p.value === formData.urgency);
                                    if (!sel) return null;
                                    const tone = sel.value === 'P1' ? ['bg-rose-50','border-rose-200','bg-rose-500','text-rose-700','text-rose-600']
                                              : sel.value === 'P2' ? ['bg-orange-50','border-orange-200','bg-orange-500','text-orange-700','text-orange-600']
                                              : sel.value === 'P3' ? ['bg-amber-50','border-amber-200','bg-amber-500','text-amber-700','text-amber-600']
                                              : sel.value === 'P4' ? ['bg-emerald-50','border-emerald-200','bg-emerald-500','text-emerald-700','text-emerald-600']
                                              : ['bg-sky-50','border-sky-200','bg-sky-500','text-sky-700','text-sky-600'];
                                    return (
                                        <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border ${tone[0]} ${tone[1]}`}>
                                            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${tone[2]}`} />
                                            <div>
                                                <p className={`text-xs font-bold ${tone[3]}`}>{sel.sublabel}</p>
                                                {sel.description && <p className={`text-xs mt-0.5 ${tone[4]}`}>{sel.description}</p>}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Preferred Deadline — sits in the main form alongside priority/desc, not in Review. */}
                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-500 font-medium">Preferred Deadline <span className="text-slate-400">(Optional)</span></label>
                                <input
                                    type="date"
                                    value={formData.dueDate}
                                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                                    min={minDueDate}
                                    style={{ colorScheme: 'light' }}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                                />
                                <p className="text-xs text-slate-400">
                                    {formData.urgency === '5-minute' ? 'Quick tasks can be set for today' : 'Minimum deadline is tomorrow (H+1)'}
                                </p>
                            </div>

                            {/* Composer — channel-message-style. Description body + chip strip for
                                attachments + bottom action row (image, file, emoji). Ctrl+V on the
                                whole container handles pasted screenshots. */}
                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-500 font-medium">
                                    Request Description <span className="text-rose-500">*</span>
                                </label>
                                <div
                                    onPaste={handlePaste}
                                    onDrop={handleDrop}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                                    onDragLeave={() => setIsDragOver(false)}
                                    className={`rounded-xl border ${isDragOver ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/30' : 'border-slate-200 bg-white'} transition-colors`}
                                >
                                    {/* Attachment chip strip — image thumbs + file chips, mixed inline like the channel composer. */}
                                    {(images.length > 0 || formData.fileUrls.length > 0) && (
                                        <div className="flex flex-wrap gap-2 p-3 border-b border-slate-100">
                                            {images.map((img, idx) => (
                                                <div key={`img-${idx}`} className="relative group">
                                                    <button
                                                        type="button"
                                                        onClick={() => setLightboxUrl(img.preview)}
                                                        className="block focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded-lg"
                                                        title="Click to preview"
                                                    >
                                                        <Image src={img.preview} alt={`Image ${idx + 1}`} width={120} height={80} className="h-16 w-auto rounded-lg border border-slate-200 object-cover hover:opacity-90 transition-opacity cursor-zoom-in" unoptimized />
                                                    </button>
                                                    <button type="button" onClick={() => removeImageAt(idx)}
                                                        className="absolute -top-1.5 -right-1.5 p-0.5 bg-slate-700 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                        aria-label="Remove image">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                            {formData.fileUrls.map((url, i) => (
                                                <div key={`file-${i}`} className="flex items-center gap-2 pl-2 pr-1 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs max-w-[220px]">
                                                    <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                                    <span className="truncate text-slate-700">{url.split('/').pop() || url}</span>
                                                    <button type="button" onClick={() => setFormData({ ...formData, fileUrls: formData.fileUrls.filter((_, idx) => idx !== i) })}
                                                        className="text-slate-400 hover:text-rose-600 flex-shrink-0">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Editor body */}
                                    <RichTextEditor
                                        ref={editorRef}
                                        value={formData.description}
                                        onChange={(html) => setFormData((f) => ({ ...f, description: html }))}
                                        placeholder="Describe what you need in detail. Paste (Ctrl+V) screenshots, attach files, add emoji…"
                                        minHeight="140px"
                                        maxHeight="320px"
                                    />

                                    {/* Action row — image, file, emoji icons */}
                                    <div className="flex items-center gap-1 px-3 py-2 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                            title="Attach images"
                                        >
                                            <ImagePlus className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => fileUploadRef.current?.click()}
                                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                            title="Attach files"
                                        >
                                            <Paperclip className="w-4 h-4" />
                                        </button>
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setShowEmojiPicker((v) => !v)}
                                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                title="Emoji"
                                            >
                                                <Smile className="w-4 h-4" />
                                            </button>
                                            <EmojiPicker
                                                open={showEmojiPicker}
                                                position="above"
                                                onSelect={(emoji) => {
                                                    editorRef.current?.insertText(emoji);
                                                    setShowEmojiPicker(false);
                                                }}
                                                onClose={() => setShowEmojiPicker(false)}
                                            />
                                        </div>
                                        {uploading && (
                                            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500">
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
                                            </span>
                                        )}
                                    </div>

                                    {/* Hidden file inputs — triggered by the bottom action buttons. */}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp,image/gif"
                                        multiple
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                    <input
                                        ref={fileUploadRef}
                                        type="file"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            const fd = new FormData();
                                            fd.append('file', file);
                                            try {
                                                const res = await fetch('/fast/api/upload', { method: 'POST', body: fd });
                                                if (res.ok) {
                                                    const data = await res.json();
                                                    setFormData((prev) => ({ ...prev, fileUrls: [...prev.fileUrls, data.url] }));
                                                }
                                            } catch {}
                                            if (fileUploadRef.current) fileUploadRef.current.value = '';
                                        }}
                                    />
                                </div>
                                {uploadError && <p className="text-xs text-rose-500 mt-1">{uploadError}</p>}
                            </div>

                            {/* Reference URLs */}
                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-500 font-medium">
                                    Add URL / Link <span className="text-slate-400">(Optional)</span>
                                </label>
                                <div className="space-y-2">
                                    {formData.referenceUrls.length > 0 && (
                                        <div className="space-y-1.5">
                                            {formData.referenceUrls.map((url, i) => (
                                                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs">
                                                    <ExternalLink className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                                                    <a href={url} target="_blank" rel="noopener noreferrer" className="truncate flex-1 text-indigo-600 hover:underline">{url}</a>
                                                    <button type="button" onClick={() => setFormData({ ...formData, referenceUrls: formData.referenceUrls.filter((_, idx) => idx !== i) })}
                                                        className="text-rose-400 hover:text-rose-600"><X className="w-3.5 h-3.5" /></button>
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
                                            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (newUrlInput.trim()) {
                                                    setFormData((prev) => ({ ...prev, referenceUrls: [...prev.referenceUrls, newUrlInput.trim()] }));
                                                    setNewUrlInput('');
                                                }
                                            }}
                                            className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 flex-shrink-0"
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
                            <div className="space-y-4">
                                {/* Requester — read-only summary; no Edit button since channel + profile are fixed at entry. */}
                                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                                    <h4 className="text-sm font-semibold text-slate-700 mb-3">Requester</h4>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <div className="text-slate-500">Channel</div>
                                        <div className="text-slate-900 font-medium">
                                            {(() => {
                                                const ch = channels.find((c) => c.id === formData.channelId);
                                                return ch ? `${ch.isPrivate ? '🔒 ' : '# '}${ch.name}` : '—';
                                            })()}
                                        </div>
                                        <div className="text-slate-500">Division</div>
                                        <div className="text-slate-900 font-medium">{profile?.teamName || '—'}</div>
                                        <div className="text-slate-500">Full Name</div>
                                        <div className="text-slate-900 font-medium">{profile?.name || '—'}</div>
                                        <div className="text-slate-500">Email</div>
                                        <div className="text-slate-900 font-medium">{profile?.email || '—'}</div>
                                    </div>
                                </div>

                                {/* Request Details — only when toggled on */}
                                {includeRequestDetails && (
                                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-sm font-semibold text-slate-700">Request Details</h4>
                                            <button type="button" onClick={() => goToStep(1, true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg">
                                                <Pencil className="w-3 h-3" /> Edit
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                            <div className="text-slate-500">Request Type</div>
                                            <div className="text-slate-900 font-medium">{REQUEST_TYPES.find((rt) => rt.value === formData.requestType)?.label || formData.requestType}</div>
                                            {formData.requestType === 'fix_request' && formData.brandCode && (
                                                <>
                                                    <div className="text-slate-500">Brand Code</div>
                                                    <div className="text-slate-900 font-medium">{formData.brandCode}</div>
                                                </>
                                            )}
                                            <div className="text-slate-500">Title</div>
                                            <div className="text-slate-900 font-medium">{formData.title || '—'}</div>
                                        </div>
                                    </div>
                                )}

                                {/* Priority & Description */}
                                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-semibold text-slate-700">Priority & Description</h4>
                                        <button type="button" onClick={() => goToStep(2, true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg">
                                            <Pencil className="w-3 h-3" /> Edit
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <div className="text-slate-500">Priority</div>
                                        <div className="text-slate-900 font-medium">
                                            {(() => {
                                                const p = PRIORITY_LEVELS.find((pl) => pl.value === formData.urgency);
                                                return p ? `${p.label} - ${p.sublabel}` : formData.urgency;
                                            })()}
                                        </div>
                                        <div className="text-slate-500">Preferred Deadline</div>
                                        <div className="text-slate-900 font-medium">{formData.dueDate || '—'}</div>
                                        <div className="text-slate-500">Description</div>
                                        <div
                                            className="col-span-2 mt-1 bg-white rounded-lg border border-slate-200 p-3 text-sm text-slate-900 [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_s]:line-through [&_strike]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5"
                                            dangerouslySetInnerHTML={{ __html: formData.description || '—' }}
                                        />
                                        {images.length > 0 && (
                                            <>
                                                <div className="text-slate-500">Images</div>
                                                <div className="col-span-2 mt-1 grid grid-cols-3 gap-2">
                                                    {images.map((img, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => setLightboxUrl(img.preview)}
                                                            className="block focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded-lg"
                                                            title="Click to preview"
                                                        >
                                                            <Image src={img.preview} alt={`Image ${idx + 1}`} width={300} height={200} className="max-h-32 w-full object-cover rounded-lg hover:opacity-90 transition-opacity cursor-zoom-in" unoptimized />
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                        {formData.fileUrls.length > 0 && (
                                            <>
                                                <div className="text-slate-500">Files</div>
                                                <div className="col-span-2 mt-1 space-y-1.5">
                                                    {formData.fileUrls.map((url, i) => (
                                                        <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                                                            <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                                            <a href={url} target="_blank" rel="noopener noreferrer" className="truncate text-indigo-600 hover:underline">{url.split('/').pop() || url}</a>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                        {formData.referenceUrls.length > 0 && (
                                            <>
                                                <div className="text-slate-500">Links</div>
                                                <div className="col-span-2 mt-1 space-y-1.5">
                                                    {formData.referenceUrls.map((url, i) => (
                                                        <div key={i} className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs">
                                                            <ExternalLink className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                                                            <a href={url} target="_blank" rel="noopener noreferrer" className="truncate text-indigo-600 hover:underline">{url}</a>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                        </>
                    )}

                    {/* Errors */}
                    {(stepErrors.length > 0 || error) && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm space-y-1">
                            {error && <p>{error}</p>}
                            {stepErrors.map((err, i) => (
                                <p key={i} className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                                    {err}
                                </p>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer / Navigation */}
                <div className="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-200 bg-slate-50/50 sm:rounded-b-3xl pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-4">
                    {editingFromReview && currentStep < 3 ? (
                        <>
                            {/* When editing from Review on step 2, the user has no other
                                way to reach step 1's request-details fields (title, brand
                                code, request type), so expose a side-by-side button that
                                jumps there with the toggle pre-flipped on. */}
                            {currentStep === 2 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!validateStep(2)) return;
                                        setIncludeRequestDetails(true);
                                        setCurrentStep(1);
                                    }}
                                    className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-full hover:bg-slate-50 transition-all shadow-sm flex justify-center items-center gap-2 text-sm"
                                >
                                    <Pencil className="w-4 h-4" /> Add Request Details
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => { if (validateStep(currentStep)) { setEditingFromReview(false); setCurrentStep(3); } }}
                                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full transition-all shadow-sm flex justify-center items-center gap-2 text-sm"
                            >
                                <Check className="w-4 h-4" /> Back to Review
                            </button>
                        </>
                    ) : (
                        <>
                            {currentStep > 1 && (
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-full hover:bg-slate-50 transition-all shadow-sm flex justify-center items-center gap-2 text-sm"
                                >
                                    <ChevronLeft className="w-4 h-4" /> Back
                                </button>
                            )}
                            {currentStep < 3 ? (
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full transition-all shadow-sm flex justify-center items-center gap-2 text-sm"
                                >
                                    Next <ChevronRight className="w-4 h-4" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={submitting || uploading}
                                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full transition-all shadow-sm disabled:opacity-50 flex justify-center items-center gap-2 text-sm"
                                >
                                    {submitting
                                        ? (<><Loader2 className="w-4 h-4 animate-spin" /> {isFromMessage ? 'Converting…' : 'Posting…'}</>)
                                        : (<>{isFromMessage ? 'Convert message to task' : 'Post to channel'} <Send className="w-4 h-4" /></>)}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
            {/* Image lightbox — sits above the modal so attachments can be previewed full-size. */}
            <ImageLightbox
                src={lightboxUrl}
                images={images.map((img) => img.preview)}
                onClose={() => setLightboxUrl(null)}
            />
        </div>
    );
}

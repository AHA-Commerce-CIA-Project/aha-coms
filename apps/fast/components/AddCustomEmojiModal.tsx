'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Upload, Image as ImageIcon, Loader2 } from 'lucide-react';
import { fetchCustomEmojis, type CustomEmoji } from '@/lib/customEmojis';

interface Props {
    open: boolean;
    onClose: () => void;
    onCreated?: (emoji: CustomEmoji) => void;
}

const NAME_RE = /^[a-z][a-z0-9_-]{1,31}$/;
const SOFT_SIZE_LIMIT = 256 * 1024; // 256KB — Slack uses 128KB but we're more lenient

export function AddCustomEmojiModal({ open, onClose, onCreated }: Props) {
    const [name, setName] = useState('');
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [imageWarning, setImageWarning] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reset every time the modal opens — stale state from a previous open is confusing.
    useEffect(() => {
        if (!open) return;
        setName('');
        setImageUrl(null);
        setImageWarning(null);
        setUploading(false);
        setSubmitting(false);
        setError(null);
    }, [open]);

    // ESC closes
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !submitting && !uploading) onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, submitting, uploading, onClose]);

    if (!open) return null;

    const handlePickFile = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            setError('Please choose an image file (PNG, JPEG, GIF, or WebP).');
            return;
        }
        setError(null);
        setImageWarning(file.size > SOFT_SIZE_LIMIT
            ? 'Image is larger than 256KB. It will still upload, but smaller files load faster.'
            : null);
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/upload', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Upload failed');
            setImageUrl(data.url);
        } catch (err: any) {
            setError(err?.message || 'Failed to upload image');
        } finally {
            setUploading(false);
        }
    };

    // Strip leading/trailing colons as the user types so "::foo::" → "foo".
    const handleNameChange = (raw: string) => {
        const cleaned = raw.replace(/^:+|:+$/g, '').toLowerCase();
        setName(cleaned);
    };

    const validName = NAME_RE.test(name);
    const canSave = validName && !!imageUrl && !uploading && !submitting;

    const handleSave = async () => {
        if (!canSave) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch('/api/emojis/custom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, imageUrl }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data?.error || 'Failed to save emoji');
                setSubmitting(false);
                return;
            }
            // Force-refresh the cache so the picker sees the new entry immediately.
            await fetchCustomEmojis(true);
            onCreated?.(data);
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Network error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => !submitting && !uploading && onClose()}
        >
            <div
                className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-slate-900">Add emoji</h2>
                    <button
                        type="button"
                        onClick={() => !submitting && !uploading && onClose()}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tab — single "Custom emoji" pill matches the Slack reference. */}
                <div className="px-5 pt-3 border-b border-slate-100">
                    <div className="inline-block py-2 px-1 border-b-2 border-indigo-600 text-sm font-semibold text-indigo-600">
                        Custom emoji
                    </div>
                </div>

                <div className="px-5 py-4 space-y-5">
                    <p className="text-sm text-slate-500 leading-relaxed">
                        Your custom emoji will be available to everyone in your workspace. You&apos;ll find it in the Custom tab of the emoji picker.
                    </p>

                    {/* Step 1 — image */}
                    <section className="space-y-2">
                        <h3 className="text-sm font-bold text-slate-800">1. Upload an image</h3>
                        <p className="text-xs text-slate-500">
                            Square images under 256KB and with transparent backgrounds work best. If your image is too large, we&apos;ll still upload it, but smaller files load faster.
                        </p>

                        <div className="flex items-center gap-3 mt-1">
                            {/* Preview tile */}
                            <div className="w-16 h-16 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                                {imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={imageUrl} alt="Preview" className="w-full h-full object-contain" />
                                ) : (
                                    <ImageIcon className="w-6 h-6 text-slate-300" />
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading || submitting}
                                className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                                {uploading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                                ) : (
                                    <><Upload className="w-4 h-4" /> {imageUrl ? 'Replace image' : 'Upload Image'}</>
                                )}
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/gif,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handlePickFile(f);
                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                }}
                            />
                        </div>
                        {imageWarning && (
                            <p className="text-xs text-amber-600">{imageWarning}</p>
                        )}
                    </section>

                    <div className="border-t border-slate-100" />

                    {/* Step 2 — name */}
                    <section className="space-y-2">
                        <h3 className="text-sm font-bold text-slate-800">2. Give it a name</h3>
                        <p className="text-xs text-slate-500">
                            This is also what you&apos;ll type to add this emoji to your messages.
                        </p>
                        <div className="relative">
                            <input
                                type="text"
                                value={name ? `:${name}:` : ''}
                                onChange={(e) => handleNameChange(e.target.value)}
                                placeholder=":party-parrot:"
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                autoFocus
                            />
                        </div>
                        {name && !validName && (
                            <p className="text-xs text-rose-500">
                                Use lowercase letters, digits, &quot;-&quot;, or &quot;_&quot; (2–32 chars, must start with a letter).
                            </p>
                        )}
                    </section>

                    {error && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50/50">
                    <button
                        type="button"
                        onClick={() => !submitting && !uploading && onClose()}
                        className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-white rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={!canSave}
                        className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>) : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

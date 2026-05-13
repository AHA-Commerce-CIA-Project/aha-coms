'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Smile, Paperclip, Image as ImageIcon, X, FileText, Loader2 } from 'lucide-react';
import { EmojiPicker } from './EmojiPicker';
import { ImageLightbox } from '@/components/ImageLightbox';

interface Attachment {
    url: string;
    name: string;
    type: string;
    size: number;
    isImage: boolean;
}

interface MessageInputProps {
    otherUserName: string;
    onSend: (content: string, attachments?: Attachment[]) => void;
    disabled?: boolean;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function MessageInput({ otherUserName, onSend, disabled }: MessageInputProps) {
    const [content, setContent] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [uploading, setUploading] = useState(false);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
        }
    }, [content]);

    const handleSubmit = () => {
        if ((!content.trim() && attachments.length === 0) || disabled || uploading) return;
        onSend(content.trim(), attachments.length > 0 ? attachments : undefined);
        setContent('');
        setAttachments([]);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleEmojiSelect = (emoji: string) => {
        const textarea = textareaRef.current;
        if (textarea) {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const newText = content.substring(0, start) + emoji + content.substring(end);
            setContent(newText);
            // Set cursor after emoji
            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
                textarea.focus();
            }, 0);
        } else {
            setContent((prev) => prev + emoji);
        }
    };

    const handleFileUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const formData = new FormData();
                formData.append('file', file);

                const res = await fetch('/api/chat/upload', {
                    method: 'POST',
                    body: formData,
                });

                if (res.ok) {
                    const data = await res.json();
                    setAttachments((prev) => [...prev, {
                        url: data.url,
                        name: data.name,
                        type: data.type,
                        size: data.size,
                        isImage: data.isImage,
                    }]);
                } else {
                    const err = await res.json();
                    alert(err.error || 'Upload failed');
                }
            }
        } catch (err) {
            alert('Upload failed. Please try again.');
        } finally {
            setUploading(false);
            // Reset file inputs
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (imageInputRef.current) imageInputRef.current.value = '';
        }
    };

    const removeAttachment = (idx: number) => {
        setAttachments((prev) => prev.filter((_, i) => i !== idx));
    };

    const hasContent = content.trim() || attachments.length > 0;

    return (
        <div className="border-t border-slate-200 bg-white px-6 py-4">
            {/* Attachment previews */}
            {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                    {attachments.map((att, idx) => (
                        <div
                            key={idx}
                            className="relative group"
                        >
                            {att.isImage ? (
                                <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200">
                                    <button
                                        type="button"
                                        onClick={() => setLightboxUrl(att.url)}
                                        className="block w-full h-full"
                                        title="Click to preview"
                                    >
                                        <img
                                            src={att.url}
                                            alt={att.name}
                                            className="w-full h-full object-cover cursor-zoom-in"
                                        />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => removeAttachment(idx)}
                                        className="absolute top-1 right-1 p-0.5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <div className="relative flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl max-w-[200px]">
                                    <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-slate-700 truncate">{att.name}</p>
                                        <p className="text-[10px] text-slate-400">{formatFileSize(att.size)}</p>
                                    </div>
                                    <button
                                        onClick={() => removeAttachment(idx)}
                                        className="p-0.5 text-slate-400 hover:text-slate-600 rounded-full flex-shrink-0"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Uploading indicator */}
            {uploading && (
                <div className="flex items-center gap-2 mb-2 text-sm text-indigo-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Uploading...</span>
                </div>
            )}

            {/* Main input area */}
            <div className="flex items-end gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-400 transition-all">
                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${otherUserName}...`}
                    rows={1}
                    disabled={disabled || uploading}
                    className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none leading-relaxed max-h-40"
                />
                <button
                    onClick={handleSubmit}
                    disabled={!hasContent || disabled || uploading}
                    className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm flex-shrink-0"
                >
                    <Send className="w-4 h-4" />
                </button>
            </div>

            {/* Action bar */}
            <div className="flex items-center gap-1 mt-2 ml-1">
                {/* Emoji picker toggle */}
                <div className="relative">
                    <button
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Emojis"
                    >
                        <Smile className="w-[18px] h-[18px]" />
                    </button>
                    <EmojiPicker
                        open={showEmojiPicker}
                        onClose={() => setShowEmojiPicker(false)}
                        onSelect={handleEmojiSelect}
                    />
                </div>

                {/* Image upload */}
                <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploading}
                    className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
                    title="Send image"
                >
                    <ImageIcon className="w-[18px] h-[18px]" />
                </button>
                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files)}
                />

                {/* File upload */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
                    title="Attach file"
                >
                    <Paperclip className="w-[18px] h-[18px]" />
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files)}
                />

                <span className="text-[11px] text-slate-400 ml-2">
                    <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono border border-slate-200">Enter</kbd> to send · <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-mono border border-slate-200">Shift+Enter</kbd> new line
                </span>
            </div>

            <ImageLightbox
                src={lightboxUrl}
                images={attachments.filter((a) => a.isImage).map((a) => a.url)}
                onClose={() => setLightboxUrl(null)}
            />
        </div>
    );
}

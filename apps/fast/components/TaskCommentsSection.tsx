'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send as SendIcon, Pencil, X as XIcon, Check, Loader2, Paperclip, Smile, AtSign, ListOrdered, List, Hash, SmilePlus } from 'lucide-react';
import { ImageLightbox } from '@/components/ImageLightbox';
import { linkifyText, linkifyHtml } from '@/lib/linkify';
import { EmojiPicker } from '@/components/chat/EmojiPicker';
import { COMMENT_DRAFT_EVENT } from '@/lib/use-comment-drafts';
import { isHtml, sanitizeRichText } from '@/lib/sanitize';
import { useCustomEmojiMap } from '@/lib/customEmojis';
import { renderShortcodes } from '@/lib/renderShortcodes';

interface CommentAttachment {
    url: string;
    name?: string;
    type?: string;
    size?: number;
    isImage?: boolean;
}

interface CommentReaction {
    id: string;
    emoji: string;
    user_id: string;
    user_name: string | null;
    created_at: string;
}

interface Comment {
    id: string;
    author_name: string;
    author_email: string | null;
    author_user_id: string | null;
    author_image?: string | null;
    is_team: boolean;
    message: string;
    attachments?: CommentAttachment[];
    created_at: string;
    updated_at?: string;
    edited?: boolean;
    // Phase-2 sync: true when this comment is paired with a channel-thread reply.
    mirrored?: boolean;
    reactions?: CommentReaction[];
}

interface Props {
    taskId: string;
    /** Set when viewing /track — comments go through token-based APIs */
    token?: string;
    /** Authenticated user id — needed to decide which comments are editable in session mode */
    currentUserId?: string;
    /** Author name sent when posting via token (requester) */
    requesterName?: string;
    /** Author email sent when posting via token (requester) */
    requesterEmail?: string;
    /** Visual density — 'compact' for modals on /tasks and /nexus, 'regular' for /track */
    size?: 'compact' | 'regular';
    /** When set, scroll to this comment and flash-highlight it after load (e.g., from a notification deep-link) */
    highlightCommentId?: string | null;
}

const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

// Parse legacy/inline markdown images so existing comments (pre-attachment field)
// still render their images. New comments store images in `attachments` only.
function parseInlineImages(message: string) {
    const parts: Array<{ type: 'text' | 'image'; content?: string; url?: string; alt?: string }> = [];
    let lastIdx = 0;
    imagePattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = imagePattern.exec(message)) !== null) {
        if (m.index > lastIdx) {
            const text = message.slice(lastIdx, m.index).replace(/^\n+|\n+$/g, '');
            if (text) parts.push({ type: 'text', content: text });
        }
        parts.push({ type: 'image', url: m[2], alt: m[1] || 'attachment' });
        lastIdx = imagePattern.lastIndex;
    }
    if (lastIdx < message.length) {
        const text = message.slice(lastIdx).replace(/^\n+/, '');
        if (text) parts.push({ type: 'text', content: text });
    }
    return parts;
}

function formatCommentTime(iso: string) {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function TaskCommentsSection({
    taskId, token, currentUserId, requesterName, requesterEmail, size = 'compact', highlightCommentId,
}: Props) {
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [draft, setDraft] = useState('');
    const customEmojiMap = useCustomEmojiMap();
    const [draftAttachments, setDraftAttachments] = useState<CommentAttachment[]>([]);
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingDraft, setEditingDraft] = useState('');
    const [editingAttachments, setEditingAttachments] = useState<CommentAttachment[]>([]);
    const [editSaving, setEditSaving] = useState(false);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [lightboxGallery, setLightboxGallery] = useState<string[]>([]);
    // Open the lightbox with the clicked URL plus its sibling images so the
    // user can paginate without closing the preview.
    const openLightbox = (url: string, gallery: string[]) => {
        setLightboxGallery(gallery);
        setLightboxUrl(url);
    };
    const [error, setError] = useState<string | null>(null);
    const [flashId, setFlashId] = useState<string | null>(null);
    // Composer is a contenteditable div (not textarea) so the markdown list
    // shortcut + B/I/U/Strike formatting can apply, matching the channel/DM
    // composer's experience. The state still tracks HTML strings.
    const composerRef = useRef<HTMLDivElement>(null);
    const editRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    // Tracks which comment is currently requesting an emoji to react with.
    // null = no picker open. Only one picker is active at a time.
    const [reactionPickerCommentId, setReactionPickerCommentId] = useState<string | null>(null);
    // Active formatting state for the toolbar — tracks the current selection's
    // queryCommandState so buttons can highlight while the caret is inside
    // bold/italic/list ranges.
    const [activeFormats, setActiveFormats] = useState({
        bold: false, italic: false, underline: false, strikeThrough: false,
        insertOrderedList: false, insertUnorderedList: false,
    });

    // @mention autocomplete — populated lazily on first @ keystroke and reused for the session.
    const [mentionUsers, setMentionUsers] = useState<{ id: string; name: string; email: string; image: string | null }[]>([]);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionAnchor, setMentionAnchor] = useState<number>(0); // selectionStart of the '@'
    const [mentionActiveIdx, setMentionActiveIdx] = useState(0);

    const apiBase = `/api/tasks/${taskId}/comments`;
    // localStorage key — one draft per task. Cleared on successful post.
    const draftStorageKey = `task-comment-draft:${taskId}`;
    const uploadUrl = token
        ? `/api/chat/upload?token=${encodeURIComponent(token)}&taskId=${encodeURIComponent(taskId)}`
        : '/api/chat/upload';

    const fetchComments = useCallback(async () => {
        try {
            const url = token ? `${apiBase}?token=${encodeURIComponent(token)}` : apiBase;
            const res = await fetch(url);
            if (res.ok) setComments(await res.json());
        } catch {}
        setLoading(false);
    }, [apiBase, token]);

    useEffect(() => {
        setLoading(true);
        setComments([]);
        setEditingId(null);
        setError(null);

        // Restore any saved draft for this task — survives accidental modal
        // close (Esc, backdrop click, navigating away). Cleared after a
        // successful post.
        let restoredText = '';
        let restoredAttachments: CommentAttachment[] = [];
        if (typeof window !== 'undefined') {
            try {
                const raw = window.localStorage.getItem(draftStorageKey);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') {
                        if (typeof parsed.text === 'string') restoredText = parsed.text;
                        if (Array.isArray(parsed.attachments)) restoredAttachments = parsed.attachments;
                    }
                }
            } catch {}
        }
        setDraft(restoredText);
        setDraftAttachments(restoredAttachments);
        // Seed the contenteditable with the saved HTML draft. Without this the
        // editor would render empty even when state.draft has content (React
        // doesn't sync state into innerHTML on its own for uncontrolled divs).
        if (composerRef.current) composerRef.current.innerHTML = restoredText;

        fetchComments();
    }, [taskId, fetchComments, draftStorageKey]);

    // Persist draft to localStorage on every change. Empty drafts (no text,
    // no attachments) are removed so we don't leave stale keys around.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!draft && draftAttachments.length === 0) {
            window.localStorage.removeItem(draftStorageKey);
        } else {
            try {
                window.localStorage.setItem(
                    draftStorageKey,
                    JSON.stringify({ text: draft, attachments: draftAttachments }),
                );
            } catch {}
        }
        // Notify same-tab listeners (task lists) so the Draft pill updates
        // immediately. Cross-tab updates are picked up via the 'storage' event.
        window.dispatchEvent(new CustomEvent(COMMENT_DRAFT_EVENT, { detail: { taskId } }));
    }, [draft, draftAttachments, draftStorageKey, taskId]);

    // Scroll to + flash-highlight a specific comment after comments load (notification deep-link).
    useEffect(() => {
        if (!highlightCommentId || loading || comments.length === 0) return;
        const target = comments.find(c => c.id === highlightCommentId);
        if (!target) return;
        const t = setTimeout(() => {
            const el = document.getElementById(`task-comment-${highlightCommentId}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setFlashId(highlightCommentId);
            setTimeout(() => setFlashId(null), 3000);
        }, 120);
        return () => clearTimeout(t);
    }, [highlightCommentId, loading, comments]);

    // contenteditable auto-sizes from min/max-height CSS — no JS-driven resize
    // needed. Kept as a no-op so existing call sites don't break.
    const autoGrow = (_el?: any) => { /* no-op for contenteditable */ };

    const updateActiveFormats = useCallback(() => {
        try {
            setActiveFormats({
                bold: document.queryCommandState('bold'),
                italic: document.queryCommandState('italic'),
                underline: document.queryCommandState('underline'),
                strikeThrough: document.queryCommandState('strikeThrough'),
                insertOrderedList: document.queryCommandState('insertOrderedList'),
                insertUnorderedList: document.queryCommandState('insertUnorderedList'),
            });
        } catch {}
    }, []);

    useEffect(() => {
        const onSel = () => updateActiveFormats();
        document.addEventListener('selectionchange', onSel);
        return () => document.removeEventListener('selectionchange', onSel);
    }, [updateActiveFormats]);

    // Split the caret-block on every <br> so each soft-broken line becomes its
    // own block. Required before applying a list command (toolbar or markdown
    // shortcut) so only the current line becomes the list item, not the line
    // ABOVE that's joined to it by a soft break.
    const splitSoftBreaksAtCaret = (editor: HTMLDivElement | null) => {
        if (!editor) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
        const range = sel.getRangeAt(0);
        let block: HTMLElement | null = null;
        let n: Node | null = range.startContainer;
        while (n && n !== editor) {
            if (n.nodeType === Node.ELEMENT_NODE) {
                const tg = (n as HTMLElement).tagName;
                if (tg === 'LI') return;
                if (tg === 'DIV' || tg === 'P') { block = n as HTMLElement; break; }
            }
            n = n.parentNode;
        }
        if (!block) block = editor;
        if (!/<br\b[^>]*>/i.test(block.innerHTML)) return;
        const marker = document.createElement('span');
        marker.setAttribute('data-caret-marker', '1');
        range.insertNode(marker);
        const parts = block.innerHTML.split(/<br\b[^>]*>/i);
        block.innerHTML = parts.map(p => `<div>${p && p.trim().length > 0 ? p : '<br>'}</div>`).join('');
        const restored = block.querySelector('span[data-caret-marker="1"]');
        if (restored) {
            const newRange = document.createRange();
            newRange.setStartBefore(restored);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
            restored.remove();
        }
    };

    const execFormat = (editor: HTMLDivElement | null, command: string, value?: string) => {
        editor?.focus();
        if (command === 'insertOrderedList' || command === 'insertUnorderedList') {
            splitSoftBreaksAtCaret(editor);
        }
        document.execCommand(command, false, value);
        updateActiveFormats();
    };

    const uploadBlob = async (blob: Blob, filename: string): Promise<CommentAttachment | null> => {
        const fd = new FormData();
        fd.append('file', new File([blob], filename, { type: blob.type }));
        try {
            const res = await fetch(uploadUrl, { method: 'POST', body: fd });
            if (!res.ok) return null;
            const data = await res.json();
            if (!data?.url) return null;
            return {
                url: data.url,
                name: data.name || filename,
                type: data.type,
                size: data.size,
                isImage: data.isImage ?? blob.type.startsWith('image/'),
            };
        } catch {
            return null;
        }
    };

    const pasteHandler = (mode: 'new' | 'edit') => async (e: React.ClipboardEvent<HTMLDivElement>) => {
        const items = e.clipboardData?.items;
        if (items) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (!file) continue;
                    setUploading(true);
                    setError(null);
                    const att = await uploadBlob(file, file.name || `paste-${Date.now()}.png`);
                    setUploading(false);
                    if (att) {
                        if (mode === 'new') setDraftAttachments(prev => [...prev, att]);
                        else setEditingAttachments(prev => [...prev, att]);
                    } else {
                        setError('Failed to upload image. Try again.');
                    }
                    return;
                }
            }
        }
        // Strip pasted formatting (color, font, classes from Notion/Docs/Slack)
        // so the comment inherits the editor's default look. Plain-text only.
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        if (text) {
            document.execCommand('insertText', false, text);
        }
    };

    // ── Composer helpers: file picker, emoji insert, @mention popover ────────
    const handleFilePick = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        setError(null);
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const att = await uploadBlob(f, f.name);
            if (att) setDraftAttachments(prev => [...prev, att]);
            else setError('Failed to upload file. Try again.');
        }
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Insert text at the current caret in the composer using execCommand.
    // Works on contenteditable selection without us tracking offsets.
    const insertAtCursor = (text: string) => {
        composerRef.current?.focus();
        document.execCommand('insertText', false, text);
        // Sync state from DOM so subsequent draft persistence sees the new content.
        if (composerRef.current) setDraft(composerRef.current.innerHTML);
    };

    const handleEmojiSelect = (emoji: string) => {
        insertAtCursor(emoji);
        setShowEmojiPicker(false);
    };

    // Detect @<query> immediately before the caret. Operates on the current
    // text node's content via the Selection API (composer is contenteditable
    // now, so there's no selectionStart/selectionEnd to read).
    const updateMentionState = () => {
        const editor = composerRef.current;
        if (!editor) { setMentionQuery(null); return; }
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) { setMentionQuery(null); return; }
        const range = sel.getRangeAt(0);
        if (!editor.contains(range.startContainer)) { setMentionQuery(null); return; }
        if (range.startContainer.nodeType !== Node.TEXT_NODE) { setMentionQuery(null); return; }

        const textBefore = (range.startContainer.textContent || '').slice(0, range.startOffset);
        const at = textBefore.lastIndexOf('@');
        if (at < 0) { setMentionQuery(null); return; }
        const head = textBefore.slice(at + 1);
        if (/\s/.test(head)) { setMentionQuery(null); return; }
        const charBefore = at > 0 ? textBefore[at - 1] : ' ';
        if (!/\s/.test(charBefore) && at !== 0) { setMentionQuery(null); return; }

        if (mentionUsers.length === 0) {
            fetch('/fast/api/chat/users').then(r => r.ok ? r.json() : []).then(setMentionUsers).catch(() => {});
        }
        setMentionAnchor(at);
        setMentionQuery(head);
        setMentionActiveIdx(0);
    };

    const filteredMentionUsers = mentionQuery === null
        ? []
        : mentionUsers
            .filter(u => u.name.toLowerCase().includes(mentionQuery.toLowerCase()) || u.email.toLowerCase().includes(mentionQuery.toLowerCase()))
            .slice(0, 6);

    // Replace the in-flight @<query> in the current text node with @<handle>.
    // The mentionAnchor index is offsets WITHIN the text node where '@' sits.
    const selectMention = (user: { id: string; name: string }) => {
        const editor = composerRef.current;
        if (!editor) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (range.startContainer.nodeType !== Node.TEXT_NODE) return;
        const textNode = range.startContainer as Text;
        const handle = user.name.replace(/\s+/g, '.');
        const before = (textNode.textContent || '').slice(0, mentionAnchor);
        const after = (textNode.textContent || '').slice(range.startOffset);
        textNode.textContent = `${before}@${handle} ${after}`;
        const newRange = document.createRange();
        newRange.setStart(textNode, before.length + handle.length + 2);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        setMentionQuery(null);
        setDraft(editor.innerHTML);
    };

    // Markdown shortcut: typing "1." / "1" / "1)" / "-" / "*" + space at the
    // start of a line → numbered/bullet list. Bypasses execCommand and builds
    // the list element manually so empty-block / adjacent-block quirks in
    // Chrome's list logic don't merge the line above into the new list item.
    // Slack-style list behavior: when the caret is inside an <li>, Shift+Enter
    // creates the next list item; on an empty <li>, it exits the list. This
    // mirrors what the channel/DM composer does. Returns true if handled.
    const tryListAwareSoftBreak = (editor: HTMLDivElement): boolean => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return false;
        const range = sel.getRangeAt(0);
        if (!editor.contains(range.startContainer)) return false;
        let li: HTMLElement | null = null;
        let n: Node | null = range.startContainer;
        while (n && n !== editor) {
            if (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === 'LI') {
                li = n as HTMLElement;
                break;
            }
            n = n.parentNode;
        }
        if (!li) return false;
        const isEmpty = !(li.textContent || '').trim();
        if (isEmpty) {
            const list = li.parentElement;
            if (!list || !list.parentNode) return false;
            const newBlock = document.createElement('div');
            newBlock.appendChild(document.createElement('br'));
            list.parentNode.insertBefore(newBlock, list.nextSibling);
            li.remove();
            if (list.children.length === 0) list.remove();
            const r = document.createRange();
            r.setStart(newBlock, 0);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
        } else {
            const newLi = document.createElement('li');
            const tail = range.cloneRange();
            tail.setEndAfter(li);
            const tailContent = tail.extractContents();
            while (tailContent.firstChild) {
                const child = tailContent.firstChild;
                if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName === 'LI') {
                    while (child.firstChild) newLi.appendChild(child.firstChild);
                    (child as Element).remove();
                } else {
                    newLi.appendChild(child);
                }
            }
            if (!newLi.firstChild) newLi.appendChild(document.createElement('br'));
            li.parentNode!.insertBefore(newLi, li.nextSibling);
            const r = document.createRange();
            r.setStart(newLi, 0);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
        }
        updateActiveFormats();
        return true;
    };

    const tryMarkdownListShortcut = (editor: HTMLDivElement) => {
        try {
            if (document.queryCommandState('insertOrderedList') || document.queryCommandState('insertUnorderedList')) return false;
        } catch {}
        splitSoftBreaksAtCaret(editor);
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
        const range = sel.getRangeAt(0);
        if (!editor.contains(range.startContainer)) return false;
        let block: HTMLElement | null = null;
        let nb: Node | null = range.startContainer;
        while (nb && nb !== editor) {
            if (nb.nodeType === Node.ELEMENT_NODE) {
                const tg = (nb as HTMLElement).tagName;
                if (tg === 'DIV' || tg === 'P') { block = nb as HTMLElement; break; }
            }
            nb = nb.parentNode;
        }
        const beforeRange = document.createRange();
        beforeRange.setStart(block || editor, 0);
        beforeRange.setEnd(range.startContainer, range.startOffset);
        const before = beforeRange.toString();
        let listTag: 'ol' | 'ul' | null = null;
        if (before === '1.' || before === '1' || before === '1)') listTag = 'ol';
        else if (before === '-' || before === '*') listTag = 'ul';
        if (!listTag) return false;
        const list = document.createElement(listTag);
        const li = document.createElement('li');
        li.appendChild(document.createElement('br'));
        list.appendChild(li);
        if (block) {
            block.parentNode?.replaceChild(list, block);
        } else {
            beforeRange.deleteContents();
            const r = sel.rangeCount > 0 ? sel.getRangeAt(0) : range;
            r.insertNode(list);
        }
        const newRange = document.createRange();
        newRange.setStart(li, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        return true;
    };

    const handleSend = async () => {
        // Pull current HTML from the editor (state may lag a frame on rapid input).
        const html = (composerRef.current?.innerHTML || draft).trim();
        // Plain-text version is used to decide if the comment is empty —
        // an HTML payload like "<div><br></div>" is visually empty.
        const plain = (composerRef.current?.textContent || '').trim();
        if ((!plain && draftAttachments.length === 0) || sending) return;
        setSending(true);
        setError(null);
        try {
            const body: any = { message: html, attachments: draftAttachments };
            if (token) {
                body.token = token;
                if (requesterName) body.authorName = requesterName;
                if (requesterEmail) body.authorEmail = requesterEmail;
            }
            const res = await fetch(apiBase, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                setDraft('');
                setDraftAttachments([]);
                if (composerRef.current) composerRef.current.innerHTML = '';
                if (typeof window !== 'undefined') {
                    try { window.localStorage.removeItem(draftStorageKey); } catch {}
                    window.dispatchEvent(new CustomEvent(COMMENT_DRAFT_EVENT, { detail: { taskId } }));
                }
                await fetchComments();
            } else {
                setError('Failed to send comment.');
            }
        } catch {
            setError('Network error.');
        }
        setSending(false);
    };

    const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        // Mention autocomplete keyboard nav takes precedence when the popover is showing.
        if (mentionQuery !== null && filteredMentionUsers.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setMentionActiveIdx(i => (i + 1) % filteredMentionUsers.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setMentionActiveIdx(i => (i - 1 + filteredMentionUsers.length) % filteredMentionUsers.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                selectMention(filteredMentionUsers[mentionActiveIdx]);
                return;
            }
            if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return; }
        }
        // Markdown list shortcut on Space — same flow as the channel composer.
        if (e.key === ' ' && composerRef.current) {
            if (tryMarkdownListShortcut(composerRef.current)) {
                e.preventDefault();
                setDraft(composerRef.current.innerHTML);
                return;
            }
        }
        // Shift+Enter inside a list: continue the list (or exit on empty).
        // Outside a list: fall through to browser default (insert <br>).
        if (e.key === 'Enter' && e.shiftKey && composerRef.current) {
            if (tryListAwareSoftBreak(composerRef.current)) {
                e.preventDefault();
                setDraft(composerRef.current.innerHTML);
                return;
            }
        }
        // Enter = submit, Shift+Enter = new line.
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (!sending && !uploading) handleSend();
        }
    };

    const canEdit = (c: Comment) => {
        if (token) {
            return !c.author_user_id;
        }
        return !!currentUserId && c.author_user_id === currentUserId;
    };

    const startEdit = (c: Comment) => {
        setEditingId(c.id);
        setEditingDraft(c.message);
        setEditingAttachments(Array.isArray(c.attachments) ? [...c.attachments] : []);
        setTimeout(() => {
            // Seed the contenteditable with the existing comment HTML so the
            // user sees their formatting (lists, bold, etc.) on edit.
            if (editRef.current) editRef.current.innerHTML = c.message;
            editRef.current?.focus();
        }, 0);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditingDraft('');
        setEditingAttachments([]);
    };

    // Toggle a reaction emoji on a comment. Optimistically updates the local
    // comments state on a clean response so the picker closes instantly without
    // needing to re-fetch every time. Network failures revert by re-fetching.
    const toggleReaction = useCallback(async (commentId: string, emoji: string) => {
        if (!currentUserId) return; // /track public users can't react.
        try {
            const res = await fetch(`${apiBase}/${commentId}/reactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emoji }),
            });
            if (!res.ok) {
                fetchComments();
                return;
            }
            const data = await res.json();
            setComments(prev => prev.map(c => {
                if (c.id !== commentId) return c;
                const reactions = Array.isArray(c.reactions) ? [...c.reactions] : [];
                if (data.action === 'added' && data.reaction) {
                    reactions.push({
                        id: data.reaction.id,
                        emoji: data.reaction.emoji,
                        user_id: data.reaction.userId,
                        user_name: data.reaction.user?.name || null,
                        created_at: data.reaction.createdAt,
                    });
                } else if (data.action === 'removed') {
                    const idx = reactions.findIndex(r => r.user_id === currentUserId && r.emoji === emoji);
                    if (idx >= 0) reactions.splice(idx, 1);
                }
                return { ...c, reactions };
            }));
        } catch {
            fetchComments();
        }
    }, [apiBase, currentUserId, fetchComments]);

    const saveEdit = async (commentId: string) => {
        const html = (editRef.current?.innerHTML || editingDraft).trim();
        const plain = (editRef.current?.textContent || '').trim();
        if ((!plain && editingAttachments.length === 0) || editSaving) return;
        setEditSaving(true);
        setError(null);
        try {
            const body: any = { message: html || ' ', attachments: editingAttachments };
            if (token) {
                body.token = token;
                if (requesterEmail) body.authorEmail = requesterEmail;
            }
            const res = await fetch(`${apiBase}/${commentId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                const updated = await res.json();
                setComments(prev => prev.map(c => c.id === commentId ? { ...c, ...updated } : c));
                cancelEdit();
            } else {
                setError('Failed to save edit.');
            }
        } catch {
            setError('Network error.');
        }
        setEditSaving(false);
    };

    const handleEditKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === ' ' && editRef.current) {
            if (tryMarkdownListShortcut(editRef.current)) {
                e.preventDefault();
                setEditingDraft(editRef.current.innerHTML);
                return;
            }
        }
        if (e.key === 'Enter' && e.shiftKey && editRef.current) {
            if (tryListAwareSoftBreak(editRef.current)) {
                e.preventDefault();
                setEditingDraft(editRef.current.innerHTML);
                return;
            }
        }
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (editingId && !editSaving) saveEdit(editingId);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    };

    // Slack/Linear-style row sizing — avatar on the left, content fills the
    // rest of the width. Bubbles are gone: images get their own cards, text
    // sits flat next to a clear name+time header, and the entire row is left-
    // aligned regardless of author. Easier to scan than chat bubbles + lets
    // image attachments breathe.
    const avatarSize = size === 'regular' ? 'w-9 h-9' : 'w-8 h-8';
    const bodyTextClass = size === 'regular' ? 'text-sm' : 'text-[13px]';
    const initialsSize = size === 'regular' ? 'text-sm' : 'text-xs';
    const metaSize = size === 'regular' ? 'text-[11px]' : 'text-[10px]';
    const nameSize = size === 'regular' ? 'text-sm' : 'text-xs';

    const renderAttachmentStrip = (
        list: CommentAttachment[],
        onRemove: (idx: number) => void,
    ) => list.length === 0 ? null : (
        <div className="flex flex-wrap gap-2 mt-2">
            {list.map((a, i) => (
                <div key={i} className="relative group">
                    {a.isImage ? (
                        <img
                            src={a.url}
                            alt={a.name || 'attachment'}
                            className="w-20 h-20 object-cover rounded-lg border border-slate-200 cursor-zoom-in"
                            onClick={() => openLightbox(a.url, list.filter((x) => x.isImage).map((x) => x.url))}
                        />
                    ) : (
                        <div className="w-20 h-20 rounded-lg border border-slate-200 flex items-center justify-center bg-slate-50 text-[10px] text-slate-500 p-1 text-center break-all">
                            {a.name || 'file'}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => onRemove(i)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white border border-slate-300 rounded-full text-slate-500 hover:text-rose-600 hover:border-rose-300 flex items-center justify-center shadow-sm transition-colors"
                        title="Remove"
                    >
                        <XIcon className="w-3 h-3" />
                    </button>
                </div>
            ))}
        </div>
    );

    return (
        <div>
            <p className={`text-slate-500 mb-2 font-semibold flex items-center gap-1.5 ${size === 'regular' ? 'text-sm' : ''}`}>
                <MessageSquare className="w-4 h-4 text-indigo-500" /> Comments
                {comments.length > 0 && <span className="text-xs text-slate-400">({comments.length})</span>}
            </p>

            {comments.length > 0 && (
                <div className={`space-y-3 mb-3 overflow-y-auto ${size === 'regular' ? 'max-h-[28rem]' : 'max-h-80'}`}>
                    {comments.map(c => {
                        const isEditing = editingId === c.id;
                        const editable = canEdit(c);
                        const atts = Array.isArray(c.attachments) ? c.attachments : [];
                        const isFlashed = flashId === c.id;
                        // Pre-compute the gallery once per comment so every clickable
                        // image (inline + attached) opens the same lightbox set in
                        // DOM order. Cheap, avoids duplicating the slice three times.
                        const inlineUrls = parseInlineImages(c.message)
                            .filter((p) => p.type === 'image' && p.url)
                            .map((p) => p.url as string);
                        const attImageUrls = atts.filter((a) => a.isImage).map((a) => a.url);
                        const commentGallery = [...inlineUrls, ...attImageUrls];
                        const imageAttachments = atts.filter((a) => a.isImage);
                        const docAttachments = atts.filter((a) => !a.isImage);
                        return (
                            <div
                                key={c.id}
                                id={`task-comment-${c.id}`}
                                className={`group flex gap-3 px-2 py-2 -mx-2 rounded-xl transition-all duration-700 hover:bg-slate-50 ${isFlashed ? 'bg-amber-50 ring-2 ring-amber-300' : ''}`}
                            >
                                <div className={`${avatarSize} rounded-full flex items-center justify-center ${initialsSize} font-bold flex-shrink-0 overflow-hidden ${
                                    c.is_team ? 'bg-indigo-100 text-indigo-600' : 'bg-gradient-to-br from-slate-200 to-slate-300 text-slate-700'
                                }`}>
                                    {c.author_image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={c.author_image} alt={c.author_name} className="w-full h-full object-cover" />
                                    ) : (c.author_name?.charAt(0)?.toUpperCase() || '?')}
                                </div>
                                <div className="flex-1 min-w-0">
                                    {/* Header — name + time + edit affordance, all on one line. */}
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <span className={`${nameSize} font-bold text-slate-900 truncate`}>
                                            {c.author_name}
                                            {c.is_team && (
                                                <span className="ml-1.5 text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full align-middle">
                                                    Team
                                                </span>
                                            )}
                                        </span>
                                        <span className={`${metaSize} text-slate-400`}>
                                            {formatCommentTime(c.created_at)}
                                        </span>
                                        {c.edited && (
                                            <span className={`${metaSize} text-slate-400 italic`}>edited</span>
                                        )}
                                        {c.mirrored && (
                                            // Subtle marker: this comment is paired with a thread
                                            // reply on the source channel (Direct Assign card).
                                            // Edits, deletes, and reactions stay in sync.
                                            <span
                                                className={`${metaSize} inline-flex items-center gap-0.5 text-indigo-500 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full`}
                                                title="Synced with channel thread"
                                            >
                                                <Hash className="w-2.5 h-2.5" /> via channel
                                            </span>
                                        )}
                                        {editable && !isEditing && (
                                            <button
                                                onClick={() => startEdit(c)}
                                                className="ml-auto p-1 text-slate-400 hover:text-indigo-600 hover:bg-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Edit"
                                            >
                                                <Pencil className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>

                                    {isEditing ? (
                                        <div className="w-full">
                                            <div
                                                ref={editRef}
                                                contentEditable
                                                suppressContentEditableWarning
                                                onInput={(e) => setEditingDraft((e.currentTarget as HTMLDivElement).innerHTML)}
                                                onPaste={pasteHandler('edit')}
                                                onKeyDown={handleEditKeyDown}
                                                data-placeholder="Edit comment. Enter = save, Shift+Enter = new line, Esc = cancel"
                                                className={`w-full bg-white border border-indigo-300 rounded-xl px-3 py-2 ${bodyTextClass} text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5 [&_a]:text-indigo-600 [&_a]:underline`}
                                                style={{ minHeight: '44px', maxHeight: '200px', overflowY: 'auto' }}
                                            />
                                            {renderAttachmentStrip(editingAttachments, (idx) => setEditingAttachments(prev => prev.filter((_, i) => i !== idx)))}
                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                <button
                                                    onClick={() => saveEdit(c.id)}
                                                    disabled={editSaving || (!editingDraft.trim() && editingAttachments.length === 0)}
                                                    className="px-3 py-1 text-[11px] text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-full transition-colors inline-flex items-center gap-1"
                                                >
                                                    {editSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                                                </button>
                                                <button
                                                    onClick={cancelEdit}
                                                    className="px-3 py-1 text-[11px] text-slate-500 hover:bg-slate-100 rounded-full transition-colors inline-flex items-center gap-1"
                                                >
                                                    <XIcon className="w-3 h-3" /> Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Body — render rich HTML when the comment was
                                                composed in the new contenteditable editor
                                                (B/I/U, lists, etc.); fall back to the legacy
                                                plain-text + inline-image renderer for older
                                                comments. */}
                                            {c.message && c.message.trim().length > 0 && (
                                                isHtml(c.message) ? (
                                                    <div
                                                        className={`${bodyTextClass} text-slate-800 leading-relaxed break-words [&_a]:text-indigo-600 [&_a]:underline [&_a:hover]:text-indigo-700 [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_s]:line-through [&_strike]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:bg-slate-100 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono`}
                                                        dangerouslySetInnerHTML={{ __html: renderShortcodes(linkifyHtml(sanitizeRichText(c.message)), customEmojiMap) }}
                                                    />
                                                ) : (
                                                    <div className={`${bodyTextClass} text-slate-800 leading-relaxed whitespace-pre-wrap break-words [&_a]:text-indigo-600 [&_a]:underline [&_a:hover]:text-indigo-700`}>
                                                        {parseInlineImages(c.message).map((p, i) => p.type === 'image' ? (
                                                            <img
                                                                key={`inline-${i}`}
                                                                src={p.url!}
                                                                alt={p.alt}
                                                                onClick={(e) => { e.stopPropagation(); openLightbox(p.url!, commentGallery); }}
                                                                className="block max-w-md max-h-72 my-2 rounded-xl border border-slate-200 cursor-zoom-in hover:opacity-95 hover:shadow-md transition-all"
                                                            />
                                                        ) : (
                                                            <span key={`text-${i}`} dangerouslySetInnerHTML={{ __html: linkifyText(p.content || '') }} />
                                                        ))}
                                                    </div>
                                                )
                                            )}

                                            {/* Image attachments — full-width image cards.
                                                Multi-image comments arrange them in a tidy
                                                2-column grid so the row doesn't blow up. */}
                                            {imageAttachments.length > 0 && (
                                                <div className={`mt-2 ${imageAttachments.length === 1 ? '' : 'grid grid-cols-2 gap-2'}`}>
                                                    {imageAttachments.map((a, i) => (
                                                        <img
                                                            key={`att-${i}`}
                                                            src={a.url}
                                                            alt={a.name || 'attachment'}
                                                            onClick={(e) => { e.stopPropagation(); openLightbox(a.url, commentGallery); }}
                                                            className={`rounded-xl border border-slate-200 cursor-zoom-in hover:opacity-95 hover:shadow-md transition-all ${
                                                                imageAttachments.length === 1
                                                                    ? 'max-w-md max-h-80 object-contain bg-slate-50'
                                                                    : 'w-full h-40 object-cover'
                                                            }`}
                                                        />
                                                    ))}
                                                </div>
                                            )}

                                            {/* Document attachments — pill rows below the
                                                images. Click to download/open in new tab. */}
                                            {docAttachments.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    {docAttachments.map((a, i) => (
                                                        <a
                                                            key={`doc-${i}`}
                                                            href={a.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors max-w-full"
                                                        >
                                                            <Paperclip className="w-3 h-3 flex-shrink-0" />
                                                            <span className="truncate">{a.name || 'file'}</span>
                                                        </a>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Reactions row — group existing reactions by emoji
                                                so duplicate reactions show as count pills, then a
                                                trailing "+ add" button opens the picker for this
                                                comment. Only shown for authenticated users. */}
                                            {currentUserId && (() => {
                                                const reactions = Array.isArray(c.reactions) ? c.reactions : [];
                                                const grouped = new Map<string, { emoji: string; count: number; mine: boolean; names: string[] }>();
                                                for (const r of reactions) {
                                                    const g = grouped.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false, names: [] };
                                                    g.count += 1;
                                                    if (r.user_id === currentUserId) g.mine = true;
                                                    if (r.user_name) g.names.push(r.user_name);
                                                    grouped.set(r.emoji, g);
                                                }
                                                const groups = Array.from(grouped.values());
                                                const showRow = groups.length > 0 || true; // always show "+ add" button
                                                if (!showRow) return null;
                                                return (
                                                    <div className="flex flex-wrap items-center gap-1 mt-1.5 relative">
                                                        {groups.map((g) => (
                                                            <button
                                                                key={g.emoji}
                                                                type="button"
                                                                onClick={() => toggleReaction(c.id, g.emoji)}
                                                                title={g.names.join(', ')}
                                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                                                                    g.mine
                                                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                                                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                                }`}
                                                            >
                                                                <span>{g.emoji}</span>
                                                                <span className="font-semibold">{g.count}</span>
                                                            </button>
                                                        ))}
                                                        <button
                                                            type="button"
                                                            onClick={() => setReactionPickerCommentId(prev => prev === c.id ? null : c.id)}
                                                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border border-dashed transition-colors ${
                                                                reactionPickerCommentId === c.id
                                                                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                                                    : 'border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300'
                                                            } opacity-0 group-hover:opacity-100 ${groups.length > 0 ? 'opacity-100' : ''}`}
                                                            title="Add reaction"
                                                        >
                                                            <SmilePlus className="w-3.5 h-3.5" />
                                                        </button>
                                                        <EmojiPicker
                                                            open={reactionPickerCommentId === c.id}
                                                            onClose={() => setReactionPickerCommentId(null)}
                                                            onSelect={(emoji) => {
                                                                toggleReaction(c.id, emoji);
                                                                setReactionPickerCommentId(null);
                                                            }}
                                                            position="below"
                                                        />
                                                    </div>
                                                );
                                            })()}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {loading && comments.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading…
                </div>
            )}

            {/* Composer */}
            <div className="flex items-start gap-2">
                <div className="flex-1 relative">
                    {/* Mini toolbar — Bold / Italic / Underline / Strike / Numbered / Bullet.
                        Mirrors the channel composer's lite formatting strip. The list buttons
                        also work after Shift+Enter thanks to splitSoftBreaksAtCaret in execFormat. */}
                    <div className="flex items-center gap-0.5 mb-1">
                        {[
                            { cmd: 'bold', icon: <span className="font-bold">B</span>, title: 'Bold (Ctrl+B)' },
                            { cmd: 'italic', icon: <span className="italic">I</span>, title: 'Italic (Ctrl+I)' },
                            { cmd: 'underline', icon: <span className="underline">U</span>, title: 'Underline (Ctrl+U)' },
                            { cmd: 'strikeThrough', icon: <span className="line-through">S</span>, title: 'Strikethrough' },
                        ].map(b => (
                            <button
                                key={b.cmd}
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); execFormat(composerRef.current, b.cmd); }}
                                className={`w-6 h-6 flex items-center justify-center text-[11px] rounded transition-colors ${activeFormats[b.cmd as keyof typeof activeFormats] ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100'}`}
                                title={b.title}
                            >
                                {b.icon}
                            </button>
                        ))}
                        <span className="w-px h-4 bg-slate-200 mx-1" />
                        <button
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); execFormat(composerRef.current, 'insertOrderedList'); }}
                            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${activeFormats.insertOrderedList ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100'}`}
                            title="Numbered list"
                        >
                            <ListOrdered className="w-3.5 h-3.5" />
                        </button>
                        <button
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); execFormat(composerRef.current, 'insertUnorderedList'); }}
                            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${activeFormats.insertUnorderedList ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100'}`}
                            title="Bullet list"
                        >
                            <List className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div
                        ref={composerRef}
                        contentEditable={!sending}
                        suppressContentEditableWarning
                        onInput={(e) => { setDraft((e.currentTarget as HTMLDivElement).innerHTML); updateMentionState(); }}
                        onKeyUp={() => updateMentionState()}
                        onClick={() => updateMentionState()}
                        onPaste={pasteHandler('new')}
                        onKeyDown={handleComposerKeyDown}
                        data-placeholder="Write a comment — Enter to send, @ to mention, Ctrl+V to paste a screenshot"
                        className={`w-full ${size === 'regular' ? 'px-4 py-2.5 text-sm' : 'px-3 py-2 text-xs'} bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 leading-relaxed disabled:opacity-50 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5 [&_a]:text-indigo-600 [&_a]:underline overflow-y-auto`}
                        style={{ minHeight: size === 'regular' ? '44px' : '36px', maxHeight: '200px' }}
                    />
                    {renderAttachmentStrip(draftAttachments, (idx) => setDraftAttachments(prev => prev.filter((_, i) => i !== idx)))}
                    {uploading && (
                        <div className="absolute right-2 top-2 inline-flex items-center gap-1 text-[10px] text-indigo-600 bg-white/80 px-1.5 py-0.5 rounded-full">
                            <Loader2 className="w-3 h-3 animate-spin" /> Uploading
                        </div>
                    )}

                    {/* @mention popover — anchored to the composer, rendered above */}
                    {mentionQuery !== null && filteredMentionUsers.length > 0 && (
                        <div className="absolute bottom-full left-0 mb-1 w-[260px] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                            <div className="py-1 max-h-[240px] overflow-y-auto">
                                {filteredMentionUsers.map((u, idx) => (
                                    <button
                                        key={u.id}
                                        type="button"
                                        onMouseDown={e => { e.preventDefault(); selectMention(u); }}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${idx === mentionActiveIdx ? 'bg-indigo-50' : 'hover:bg-indigo-50'}`}
                                    >
                                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 overflow-hidden">
                                            {u.image ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={u.image} alt={u.name} className="w-6 h-6 rounded-full object-cover" />
                                            ) : (
                                                u.name.charAt(0).toUpperCase()
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-xs font-semibold text-slate-800 truncate">{u.name}</div>
                                            <div className="text-[10px] text-slate-500 truncate">{u.email}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Composer action row — file, image, emoji, @ mention */}
                    <div className="flex items-center gap-0.5 mt-1.5 ml-0.5">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading || sending}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors disabled:opacity-40"
                            title="Attach file or image"
                        >
                            <Paperclip className="w-3.5 h-3.5" />
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => handleFilePick(e.target.files)}
                        />
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowEmojiPicker(v => !v)}
                                disabled={sending}
                                className="p-1 text-slate-400 hover:text-amber-500 hover:bg-slate-100 rounded transition-colors disabled:opacity-40"
                                title="Insert emoji"
                            >
                                <Smile className="w-3.5 h-3.5" />
                            </button>
                            <EmojiPicker
                                open={showEmojiPicker}
                                onClose={() => setShowEmojiPicker(false)}
                                onSelect={handleEmojiSelect}
                                position="above"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => insertAtCursor('@')}
                            disabled={sending}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors disabled:opacity-40"
                            title="Tag a user"
                        >
                            <AtSign className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handleSend}
                    disabled={(!draft.trim() && draftAttachments.length === 0) || sending || uploading}
                    title="Send (Enter)"
                    className={`${size === 'regular' ? 'p-2.5' : 'p-2'} bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-colors self-start`}
                >
                    {sending ? (
                        <Loader2 className={size === 'regular' ? 'w-4 h-4 animate-spin' : 'w-3.5 h-3.5 animate-spin'} />
                    ) : (
                        <SendIcon className={size === 'regular' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
                    )}
                </button>
            </div>

            {error && <p className="text-[11px] text-rose-600 mt-1.5">{error}</p>}

            <ImageLightbox src={lightboxUrl} images={lightboxGallery} onClose={() => setLightboxUrl(null)} />
        </div>
    );
}

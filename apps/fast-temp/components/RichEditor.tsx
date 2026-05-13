'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Smile } from 'lucide-react';
import { EmojiPicker } from '@/components/chat/EmojiPicker';

interface RichEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    minHeight?: string;
}

function execCmd(command: string, value?: string) {
    document.execCommand(command, false, value);
}

function isActive(command: string): boolean {
    try { return document.queryCommandState(command); } catch { return false; }
}

// URL detector — matches http(s)://… and bare www.… up to whitespace.
const URL_REGEX = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/i;

// Find the trailing URL token immediately before the caret. Walks backwards
// across the current text node only (links don't span line breaks).
function findTrailingUrl(textBefore: string): { url: string; start: number } | null {
    // Strip trailing whitespace the user may have just typed.
    const trimmed = textBefore.replace(/\s+$/, '');
    if (!trimmed) return null;
    // Take the last whitespace-delimited token.
    const lastSpace = Math.max(trimmed.lastIndexOf(' '), trimmed.lastIndexOf(' '), trimmed.lastIndexOf('\t'));
    const token = lastSpace >= 0 ? trimmed.slice(lastSpace + 1) : trimmed;
    if (!URL_REGEX.test(token)) return null;
    // Trim trailing punctuation that's almost never part of the URL.
    const cleaned = token.replace(/[).,;:!?'"]+$/, '');
    if (!URL_REGEX.test(cleaned)) return null;
    return { url: cleaned, start: trimmed.length - cleaned.length };
}

// Strip inline styling (color, background, font, size) and class attributes from
// pasted HTML so it inherits the editor's default look. Preserves structural
// tags (b, i, u, s, a, ul, ol, li, code, br, p, div) and link hrefs.
function sanitizePastedHtml(html: string): string {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    const walk = (node: Node) => {
        if (node.nodeType === 1) {
            const el = node as HTMLElement;
            // Wipe all style/class so colors and fonts don't leak in.
            el.removeAttribute('style');
            el.removeAttribute('class');
            el.removeAttribute('color');
            el.removeAttribute('face');
            el.removeAttribute('size');
            el.removeAttribute('bgcolor');
            // Drop tags Word/Docs/Notion add for layout — their children are kept.
            const tag = el.tagName.toLowerCase();
            if (tag === 'span' || tag === 'font' || tag === 'meta' || tag === 'style' || tag === 'o:p') {
                const parent = el.parentNode;
                while (el.firstChild) parent?.insertBefore(el.firstChild, el);
                parent?.removeChild(el);
                return;
            }
            // For anchors, preserve href but strip target/rel-rewrites; we'll
            // re-add target=_blank on render.
            if (tag === 'a') {
                const href = el.getAttribute('href');
                el.removeAttribute('target');
                el.removeAttribute('rel');
                if (href) {
                    el.setAttribute('href', href);
                    el.setAttribute('target', '_blank');
                    el.setAttribute('rel', 'noopener noreferrer');
                }
            }
        }
        // Walk children (snapshot first because we may unwrap).
        Array.from(node.childNodes).forEach(walk);
    };
    walk(wrapper);
    return wrapper.innerHTML;
}

export function RichEditor({ value, onChange, placeholder = 'Write your note...', minHeight = '100px' }: RichEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const isInitialized = useRef(false);
    const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});
    const [showEmoji, setShowEmoji] = useState(false);

    useEffect(() => {
        if (editorRef.current && !isInitialized.current) {
            editorRef.current.innerHTML = value || '';
            isInitialized.current = true;
        }
    }, [value]);

    useEffect(() => {
        return () => { isInitialized.current = false; };
    }, []);

    const handleInput = () => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
        }
        checkActiveFormats();
    };

    const checkActiveFormats = useCallback(() => {
        setActiveFormats({
            bold: isActive('bold'),
            italic: isActive('italic'),
            underline: isActive('underline'),
            strikeThrough: isActive('strikeThrough'),
            insertOrderedList: isActive('insertOrderedList'),
            insertUnorderedList: isActive('insertUnorderedList'),
        });
    }, []);

    // Check formats on selection change
    useEffect(() => {
        const handler = () => checkActiveFormats();
        document.addEventListener('selectionchange', handler);
        return () => document.removeEventListener('selectionchange', handler);
    }, [checkActiveFormats]);

    // Try to convert the URL token immediately before the caret into a clickable
    // link. Returns true if a link was inserted (caller should NOT also let the
    // browser handle the triggering keystroke beyond inserting whitespace).
    const linkifyAtCaret = useCallback((): boolean => {
        if (!editorRef.current) return false;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        if (node.nodeType !== 3) return false; // only run on text nodes
        if (!editorRef.current.contains(node)) return false;
        // Don't re-link if we're already inside an <a>.
        let parent: Node | null = node.parentNode;
        while (parent && parent !== editorRef.current) {
            if ((parent as HTMLElement).tagName === 'A') return false;
            parent = parent.parentNode;
        }
        const textBefore = (node.nodeValue || '').slice(0, range.startOffset);
        const match = findTrailingUrl(textBefore);
        if (!match) return false;

        // Build the anchor.
        const href = match.url.startsWith('http') ? match.url : `https://${match.url}`;
        const a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = match.url;

        // Replace the URL portion with the anchor, keeping any leading text.
        const replaceRange = document.createRange();
        replaceRange.setStart(node, match.start);
        replaceRange.setEnd(node, match.start + match.url.length);
        replaceRange.deleteContents();
        replaceRange.insertNode(a);

        // Drop the caret right after the link so the next keystroke (space/enter)
        // continues normally outside the anchor.
        const after = document.createRange();
        after.setStartAfter(a);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
        return true;
    }, []);

    // List commands operate on the current block element. If the block contains
    // soft <br> breaks (Shift+Enter), the *whole* block becomes one list item
    // — including pre-break content the user didn't intend. Split soft-broken
    // lines into separate <div> blocks first so only the caret line is
    // converted into the new list item. Hoisted above handleKeyDown so the
    // markdown shortcut path can call it before prefix detection.
    const splitSoftBreaksAtCaret = () => {
        const editor = editorRef.current;
        if (!editor) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
        const range = sel.getRangeAt(0);
        let block: HTMLElement | null = null;
        let n: Node | null = range.startContainer;
        while (n && n !== editor) {
            if (n.nodeType === Node.ELEMENT_NODE) {
                const tag = (n as HTMLElement).tagName;
                if (tag === 'LI') return;
                if (tag === 'DIV' || tag === 'P') { block = n as HTMLElement; break; }
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

    // Markdown shortcuts + URL auto-linkify on Space/Enter.
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        // Auto-link the trailing URL when the user presses Space or Enter.
        // Run BEFORE the markdown shortcut so a typed URL doesn't get eaten.
        if (e.key === ' ' || e.key === 'Enter') {
            const linked = linkifyAtCaret();
            if (linked) {
                // Let the original key (space/enter) still be inserted by the browser.
                handleInput();
            }
        }

        if (e.key !== ' ') return;
        if (!editorRef.current) return;
        if (isActive('insertOrderedList') || isActive('insertUnorderedList')) return;

        // Normalize soft-broken lines into separate blocks first so the typed
        // prefix is alone in its own block.
        splitSoftBreaksAtCaret();

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
        const range = sel.getRangeAt(0);
        if (!editorRef.current.contains(range.startContainer)) return;

        // Find the closest block-level ancestor — the "line" we'll replace.
        let block: HTMLElement | null = null;
        let nb: Node | null = range.startContainer;
        while (nb && nb !== editorRef.current) {
            if (nb.nodeType === Node.ELEMENT_NODE) {
                const tg = (nb as HTMLElement).tagName;
                if (tg === 'DIV' || tg === 'P') { block = nb as HTMLElement; break; }
            }
            nb = nb.parentNode;
        }

        const beforeRange = document.createRange();
        beforeRange.setStart(block || editorRef.current, 0);
        beforeRange.setEnd(range.startContainer, range.startOffset);
        const before = beforeRange.toString();

        let listTag: 'ol' | 'ul' | null = null;
        if (before === '1.' || before === '1' || before === '1)') listTag = 'ol';
        else if (before === '-' || before === '*') listTag = 'ul';
        if (!listTag) return;

        e.preventDefault();

        // Manual list construction — bypasses Chrome's execCommand quirks
        // (silent no-op on empty blocks, merging adjacent blocks into the
        // new list item).
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
        handleInput();
    };

    // Strip color/font/background from pasted content so it inherits the editor's
    // default styling. Without this, copying from Notion/Docs/Slack pastes blue
    // (or whatever the source theme used) into the note.
    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
        const html = e.clipboardData.getData('text/html');
        const text = e.clipboardData.getData('text/plain');
        e.preventDefault();
        if (html) {
            const cleaned = sanitizePastedHtml(html);
            document.execCommand('insertHTML', false, cleaned);
        } else if (text) {
            // Plain-text paste: insert as-is, then linkify any trailing URL.
            document.execCommand('insertText', false, text);
            linkifyAtCaret();
        }
        handleInput();
    };

    // Cmd/Ctrl-click on a link inside the editor opens it in a new tab. Plain
    // click stays as cursor placement (default contentEditable behavior).
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const anchor = target.closest('a') as HTMLAnchorElement | null;
        if (!anchor) return;
        if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            window.open(anchor.href, '_blank', 'noopener,noreferrer');
        }
    };

    const insertEmoji = (emoji: string) => {
        editorRef.current?.focus();
        execCmd('insertText', emoji);
        handleInput();
        setShowEmoji(false);
    };

    const toolbarBtn = (command: string, label: string, title: string, extraClass = '') => {
        const active = activeFormats[command];
        return (
            <button
                type="button"
                onMouseDown={e => {
                    e.preventDefault();
                    if (command === 'insertOrderedList' || command === 'insertUnorderedList') {
                        splitSoftBreaksAtCaret();
                    }
                    execCmd(command);
                    checkActiveFormats();
                }}
                className={`w-9 h-9 flex items-center justify-center text-sm rounded-lg transition-all ${extraClass} ${
                    active
                        ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                        : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
                }`}
                title={title}
            >
                {label}
            </button>
        );
    };

    return (
        <div>
            {/* Toolbar */}
            <div className="flex items-center gap-0.5 pb-2 mb-2 border-b border-slate-100">
                {toolbarBtn('bold', 'B', 'Bold (Ctrl+B)', 'font-bold')}
                {toolbarBtn('italic', 'I', 'Italic (Ctrl+I)', 'italic')}
                {toolbarBtn('underline', 'U', 'Underline (Ctrl+U)', 'underline')}
                {toolbarBtn('strikeThrough', 'S', 'Strikethrough', 'line-through')}

                <div className="w-px h-5 bg-slate-200 mx-1.5" />

                <button type="button" onMouseDown={e => {
                    e.preventDefault();
                    const url = prompt('Enter URL:');
                    if (!url) return;
                    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
                    const sel = window.getSelection();
                    // If text is selected, wrap it; otherwise insert the URL itself.
                    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                        execCmd('createLink', href);
                        // Force target=_blank on the freshly-created link.
                        const a = (sel.anchorNode?.parentElement?.closest('a') ||
                            sel.focusNode?.parentElement?.closest('a')) as HTMLAnchorElement | null;
                        if (a) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
                    } else {
                        const a = document.createElement('a');
                        a.href = href;
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';
                        a.textContent = url;
                        if (sel && sel.rangeCount > 0) {
                            const r = sel.getRangeAt(0);
                            r.insertNode(a);
                            r.setStartAfter(a);
                            r.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(r);
                        }
                    }
                    handleInput();
                }}
                    className="w-9 h-9 flex items-center justify-center text-sm text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Link">
                    🔗
                </button>

                {toolbarBtn('insertOrderedList', '1.', 'Numbered list (type "1." + space)')}
                {toolbarBtn('insertUnorderedList', '•', 'Bullet list (type "-" + space)')}

                <div className="w-px h-5 bg-slate-200 mx-1.5" />

                <div className="relative">
                    <button type="button" onMouseDown={e => {
                        e.preventDefault();
                        setShowEmoji(v => !v);
                    }}
                        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                            showEmoji ? 'text-indigo-600 bg-indigo-50' : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
                        }`} title="Emoji">
                        <Smile className="w-4 h-4" />
                    </button>
                    <EmojiPicker
                        open={showEmoji}
                        position="below"
                        onSelect={insertEmoji}
                        onClose={() => setShowEmoji(false)}
                    />
                </div>

                <button type="button" onMouseDown={e => {
                    e.preventDefault();
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
                        const range = sel.getRangeAt(0);
                        const code = document.createElement('code');
                        code.style.cssText = 'background:#f1f5f9;padding:2px 6px;border-radius:4px;font-family:ui-monospace,monospace;font-size:0.85em';
                        try { range.surroundContents(code); handleInput(); } catch {}
                    }
                }}
                    className="w-9 h-9 flex items-center justify-center text-xs text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors font-mono" title="Inline code">
                    {'</>'}
                </button>
            </div>

            {/* Editor area */}
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onKeyUp={checkActiveFormats}
                onMouseUp={checkActiveFormats}
                onPaste={handlePaste}
                onClick={handleClick}
                data-placeholder={placeholder}
                className="w-full text-sm text-slate-700 outline-none leading-relaxed overflow-y-auto empty:before:content-[attr(data-placeholder)] empty:before:text-slate-300 empty:before:pointer-events-none [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_strike]:line-through [&_s]:line-through [&_a]:text-indigo-600 [&_a]:underline [&_a:hover]:text-indigo-700 [&_a]:cursor-pointer [&_ul]:list-disc [&_ul]:pl-7 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-7 [&_ol]:my-1 [&_li]:mb-0.5 [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono"
                style={{ minHeight }}
            />
        </div>
    );
}

'use client';

import { forwardRef, useRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Code } from 'lucide-react';

interface RichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    disabled?: boolean;
    minHeight?: string;
    maxHeight?: string;
}

/** Imperative API exposed via ref — lets the parent inject text/emojis without re-mounting. */
export interface RichTextEditorHandle {
    /** Insert a string at the current selection (or end of editor). */
    insertText: (text: string) => void;
    /** Move keyboard focus into the editor body. */
    focus: () => void;
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor({
    value,
    onChange,
    placeholder,
    disabled,
    minHeight = '100px',
    maxHeight = '280px',
}: RichTextEditorProps, externalRef) {
    const editorRef = useRef<HTMLDivElement>(null);
    const initialValueRef = useRef(value);
    const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});

    // Set innerHTML ONCE on mount. The editor's DOM is then fully owned by the browser
    // and `value` prop is only used for the initial state. Parent reads via onChange.
    useEffect(() => {
        if (editorRef.current) {
            editorRef.current.innerHTML = initialValueRef.current || '';
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const updateActiveFormats = useCallback(() => {
        setActiveFormats({
            bold: document.queryCommandState('bold'),
            italic: document.queryCommandState('italic'),
            underline: document.queryCommandState('underline'),
            strikeThrough: document.queryCommandState('strikeThrough'),
            insertOrderedList: document.queryCommandState('insertOrderedList'),
            insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        });
    }, []);

    useEffect(() => {
        const handler = () => updateActiveFormats();
        document.addEventListener('selectionchange', handler);
        return () => document.removeEventListener('selectionchange', handler);
    }, [updateActiveFormats]);

    const emit = () => {
        const html = editorRef.current?.innerHTML || '';
        onChange(html);
    };

    useImperativeHandle(externalRef, () => ({
        focus: () => editorRef.current?.focus(),
        insertText: (text: string) => {
            const el = editorRef.current;
            if (!el) return;
            el.focus();
            // Restore selection inside the editor if focus didn't already produce one.
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) {
                const range = document.createRange();
                range.selectNodeContents(el);
                range.collapse(false);
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
            document.execCommand('insertText', false, text);
            emit();
        },
    }), []); // eslint-disable-line react-hooks/exhaustive-deps

    // List commands act on the current block. Shift+Enter creates a soft <br>
    // INSIDE that block, so clicking the list button after a Shift+Enter makes
    // the whole block (including the pre-break line) into a single list item.
    // Split soft-broken lines into separate <div> blocks first so only the
    // caret line becomes the new list item.
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
        if (!/<br\s*\/?>/i.test(block.innerHTML)) return;
        const marker = document.createElement('span');
        marker.setAttribute('data-caret-marker', '1');
        range.insertNode(marker);
        const parts = block.innerHTML.split(/<br\s*\/?>/i);
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

    const execFormat = (command: string) => {
        editorRef.current?.focus();
        if (command === 'insertOrderedList' || command === 'insertUnorderedList') {
            splitSoftBreaksAtCaret();
        }
        document.execCommand(command, false);
        updateActiveFormats();
        emit();
    };

    const handleInput = () => {
        emit();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.metaKey || e.ctrlKey) {
            if (e.key === 'b') { e.preventDefault(); execFormat('bold'); }
            if (e.key === 'i') { e.preventDefault(); execFormat('italic'); }
            if (e.key === 'u') { e.preventDefault(); execFormat('underline'); }
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const text = e.clipboardData.getData('text/plain');
        if (text) {
            e.preventDefault();
            document.execCommand('insertText', false, text);
        }
    };

    const handleInlineCode = () => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
            const range = sel.getRangeAt(0);
            const code = document.createElement('code');
            code.className = 'bg-slate-200 text-rose-600 px-1 rounded text-sm font-mono';
            code.appendChild(range.extractContents());
            range.insertNode(code);
            range.setStartAfter(code);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            emit();
        }
    };

    const btn = (cmd: string, icon: React.ReactNode, title: string) => (
        <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); execFormat(cmd); }}
            className={`p-1.5 rounded transition-colors ${
                activeFormats[cmd]
                    ? 'text-indigo-600 bg-indigo-50'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
            title={title}
            disabled={disabled}
        >
            {icon}
        </button>
    );

    return (
        <div className="border border-slate-200 rounded-xl bg-slate-50 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-colors">
            <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 bg-white rounded-t-xl">
                {btn('bold', <Bold className="w-4 h-4" />, 'Bold (⌘B)')}
                {btn('italic', <Italic className="w-4 h-4" />, 'Italic (⌘I)')}
                {btn('underline', <Underline className="w-4 h-4" />, 'Underline (⌘U)')}
                {btn('strikeThrough', <Strikethrough className="w-4 h-4" />, 'Strikethrough')}
                <div className="w-px h-4 bg-slate-200 mx-1" />
                {btn('insertOrderedList', <ListOrdered className="w-4 h-4" />, 'Numbered list')}
                {btn('insertUnorderedList', <List className="w-4 h-4" />, 'Bullet list')}
                <div className="w-px h-4 bg-slate-200 mx-1" />
                <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleInlineCode(); }}
                    className="p-1.5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    title="Inline code"
                    disabled={disabled}
                >
                    <Code className="w-4 h-4" />
                </button>
            </div>
            <div
                ref={editorRef}
                contentEditable={!disabled}
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                data-placeholder={placeholder}
                style={{ minHeight, maxHeight }}
                className="overflow-y-auto px-4 py-3 text-sm text-slate-900 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_s]:line-through [&_strike]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:bg-slate-200 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono"
            />
        </div>
    );
});

'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

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

export function RichEditor({ value, onChange, placeholder = 'Write your note...', minHeight = '100px' }: RichEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const isInitialized = useRef(false);
    const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});

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

    const toolbarBtn = (command: string, label: string, title: string, extraClass = '') => {
        const active = activeFormats[command];
        return (
            <button
                type="button"
                onMouseDown={e => {
                    e.preventDefault();
                    execCmd(command);
                    checkActiveFormats();
                }}
                className={`w-8 h-8 flex items-center justify-center text-xs rounded-lg transition-all ${extraClass} ${
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
                    if (url) execCmd('createLink', url);
                }}
                    className="w-8 h-8 flex items-center justify-center text-xs text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Link">
                    🔗
                </button>

                {toolbarBtn('insertOrderedList', '1.', 'Numbered list')}
                {toolbarBtn('insertUnorderedList', '•', 'Bullet list')}

                <div className="w-px h-5 bg-slate-200 mx-1.5" />

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
                    className="w-8 h-8 flex items-center justify-center text-[10px] text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors font-mono" title="Inline code">
                    {'</>'}
                </button>
            </div>

            {/* Editor area */}
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyUp={checkActiveFormats}
                onMouseUp={checkActiveFormats}
                data-placeholder={placeholder}
                className="w-full text-sm text-slate-700 outline-none leading-relaxed overflow-y-auto empty:before:content-[attr(data-placeholder)] empty:before:text-slate-300 empty:before:pointer-events-none [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_strike]:line-through [&_s]:line-through [&_a]:text-indigo-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-7 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-7 [&_ol]:my-1 [&_li]:mb-0.5 [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono"
                style={{ minHeight }}
            />
        </div>
    );
}

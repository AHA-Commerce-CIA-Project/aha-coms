'use client';

import { useState, useRef, useEffect } from 'react';
import { Smile, X, Search } from 'lucide-react';

interface EmojiPickerProps {
    onSelect: (emoji: string) => void;
    open: boolean;
    onClose: () => void;
    position?: 'above' | 'below';
}

const EMOJI_CATEGORIES = [
    {
        name: 'Smileys',
        icon: '😀',
        emojis: [
            '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
            '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
            '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫',
            '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒',
            '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒',
            '🤕', '🤢', '🤮', '🥴', '😵', '🤯', '🥳', '🥸', '😎', '🤓',
            '🧐', '😕', '🫤', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺',
            '🥹', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖',
            '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬',
        ],
    },
    {
        name: 'Gestures',
        icon: '👋',
        emojis: [
            '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌',
            '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉',
            '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛',
            '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💪',
        ],
    },
    {
        name: 'Hearts',
        icon: '❤️',
        emojis: [
            '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
            '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
            '💟', '♥️', '🫶', '💑', '💏', '💌', '💋', '😍', '🥰', '😘',
        ],
    },
    {
        name: 'Objects',
        icon: '🎉',
        emojis: [
            '🎉', '🎊', '🎈', '🎁', '🎗️', '🏆', '🥇', '🥈', '🥉', '⚽',
            '🏀', '🏈', '⚾', '🎯', '🎮', '🎲', '🧩', '📱', '💻', '🖥️',
            '📷', '📸', '📹', '🎬', '📺', '📻', '🎵', '🎶', '🎤', '🎧',
            '📚', '📖', '📝', '✏️', '📌', '📎', '🔗', '📊', '📈', '📉',
            '🗂️', '📁', '📂', '📋', '📄', '📃', '🗓️', '📅', '🔔', '🔕',
            '💡', '🔑', '🗝️', '🛠️', '⚙️', '🔧', '🔨', '🪛', '💰', '💵',
        ],
    },
    {
        name: 'Nature',
        icon: '🌟',
        emojis: [
            '🌟', '⭐', '🌙', '☀️', '🌤️', '⛅', '🌈', '🔥', '💧', '🌊',
            '🌸', '🌺', '🌻', '🌹', '🌷', '🌱', '🌲', '🌳', '🍀', '🍁',
            '🍂', '🍃', '🌿', '☘️', '🪴', '🐶', '🐱', '🐭', '🐰', '🦊',
            '🐻', '🐼', '🐸', '🐵', '🦁', '🐯', '🐮', '🐷', '🐣', '🦋',
        ],
    },
    {
        name: 'Food',
        icon: '🍕',
        emojis: [
            '🍕', '🍔', '🍟', '🌭', '🍿', '🧂', '🥚', '🍳', '🥞', '🧇',
            '🥓', '🍗', '🍖', '🌮', '🌯', '🥙', '🍜', '🍝', '🍣', '🍱',
            '🥘', '🍲', '🫕', '🥗', '🍿', '🍩', '🍪', '🎂', '🍰', '🧁',
            '🍫', '🍬', '🍭', '🍮', '🍯', '☕', '🍵', '🧋', '🥤', '🍺',
        ],
    },
];

export function EmojiPicker({ onSelect, open, onClose, position = 'below' }: EmojiPickerProps) {
    const [activeCategory, setActiveCategory] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open, onClose]);

    if (!open) return null;

    const allEmojis = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
    const filteredEmojis = searchQuery
        ? [...new Set(allEmojis)] // When searching, show all unique emojis
        : EMOJI_CATEGORIES[activeCategory].emojis;

    return (
        <div
            ref={ref}
            className={`absolute right-0 w-[340px] bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden z-[70] ${
                position === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
                <span className="text-sm font-bold text-slate-700">Emojis</span>
                <button
                    onClick={onClose}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Search */}
            <div className="px-3 pb-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search emojis..."
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all"
                    />
                </div>
            </div>

            {/* Category tabs */}
            {!searchQuery && (
                <div className="flex items-center gap-0.5 px-3 pb-2 border-b border-slate-100">
                    {EMOJI_CATEGORIES.map((cat, idx) => (
                        <button
                            key={cat.name}
                            onClick={() => setActiveCategory(idx)}
                            title={cat.name}
                            className={`p-1.5 text-base rounded-lg transition-colors ${
                                activeCategory === idx
                                    ? 'bg-indigo-50'
                                    : 'hover:bg-slate-50'
                            }`}
                        >
                            {cat.icon}
                        </button>
                    ))}
                </div>
            )}

            {/* Emoji grid */}
            <div className="h-[200px] overflow-y-auto px-3 py-2">
                {!searchQuery && (
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                        {EMOJI_CATEGORIES[activeCategory].name}
                    </p>
                )}
                <div className="grid grid-cols-8 gap-0.5">
                    {filteredEmojis.map((emoji, idx) => (
                        <button
                            key={`${emoji}-${idx}`}
                            onClick={() => {
                                onSelect(emoji);
                                onClose();
                            }}
                            className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-indigo-50 transition-colors"
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

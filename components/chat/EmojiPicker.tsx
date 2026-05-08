'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Smile, X, Search } from 'lucide-react';

interface EmojiPickerProps {
    onSelect: (emoji: string) => void;
    open: boolean;
    onClose: () => void;
    position?: 'above' | 'below';
}

// Keyword lookup for emoji search
const EMOJI_KEYWORDS: Record<string, string[]> = {
    '😀': ['grin', 'happy', 'smile'], '😃': ['smile', 'happy'], '😄': ['smile', 'happy', 'laugh'], '😁': ['grin', 'teeth'], '😆': ['laugh', 'lol'],
    '😅': ['sweat', 'nervous', 'laugh'], '🤣': ['rofl', 'lol', 'laugh'], '😂': ['joy', 'laugh', 'cry', 'lol', 'haha'], '🙂': ['smile', 'okay'],
    '🙃': ['upside', 'sarcasm'], '😉': ['wink'], '😊': ['blush', 'smile', 'happy'], '😇': ['angel', 'innocent', 'halo'],
    '🥰': ['love', 'heart', 'adore'], '😍': ['love', 'heart', 'eyes'], '🤩': ['star', 'excited', 'wow'], '😘': ['kiss', 'love'],
    '😗': ['kiss'], '😚': ['kiss', 'blush'], '😙': ['kiss', 'whistle'], '🥲': ['happy', 'cry', 'sad'],
    '😋': ['yum', 'delicious', 'tongue'], '😛': ['tongue'], '😜': ['wink', 'tongue', 'crazy'], '🤪': ['crazy', 'zany'],
    '😝': ['tongue', 'squint'], '🤑': ['money', 'rich'], '🤗': ['hug'], '🤭': ['oops', 'giggle'], '🤫': ['shh', 'quiet', 'secret'],
    '🤔': ['think', 'hmm', 'wonder'], '🫡': ['salute'], '🤐': ['zip', 'quiet', 'mute'], '🤨': ['raised', 'eyebrow', 'sus'],
    '😐': ['neutral', 'meh'], '😑': ['meh', 'blank'], '😶': ['silent', 'speechless'], '😏': ['smirk'],
    '😒': ['unamused', 'bored'], '🙄': ['eye', 'roll', 'whatever'], '😬': ['grimace', 'awkward', 'cringe'], '😌': ['relieved', 'calm'],
    '😔': ['sad', 'pensive'], '😪': ['sleepy'], '😴': ['sleep', 'zzz'], '😷': ['mask', 'sick'], '🤒': ['sick', 'fever'],
    '🤕': ['hurt', 'bandage'], '🤢': ['nauseous', 'sick'], '🤮': ['vomit', 'sick', 'puke'], '🥴': ['drunk', 'woozy'],
    '😵': ['dizzy'], '🤯': ['mind', 'blown', 'explode'], '🥳': ['party', 'celebrate', 'birthday'], '🥸': ['disguise'],
    '😎': ['cool', 'sunglasses'], '🤓': ['nerd', 'geek'], '🧐': ['monocle', 'inspect'], '😕': ['confused'],
    '😟': ['worried'], '🙁': ['frown', 'sad'], '😮': ['surprised', 'oh'], '😯': ['surprised', 'hushed'],
    '😲': ['shocked', 'astonished'], '😳': ['flushed', 'embarrassed'], '🥺': ['pleading', 'puppy', 'please'],
    '🥹': ['holding', 'tears', 'grateful'], '😨': ['fear', 'scared'], '😰': ['anxious', 'sweat'], '😥': ['sad', 'disappointed'],
    '😢': ['cry', 'sad', 'tear'], '😭': ['cry', 'sob', 'loud'], '😱': ['scream', 'horror', 'omg'],
    '😤': ['angry', 'huff', 'steam'], '😡': ['angry', 'mad', 'rage'], '😠': ['angry', 'mad'], '🤬': ['swear', 'curse', 'angry'],
    '👋': ['wave', 'hi', 'hello', 'bye'], '🤚': ['raised', 'hand', 'stop'], '🖐️': ['hand', 'five'], '✋': ['hand', 'stop', 'high five'],
    '🖖': ['vulcan', 'spock'], '👌': ['ok', 'perfect', 'nice'], '🤌': ['pinch', 'italian'], '🤏': ['small', 'tiny', 'pinch'],
    '✌️': ['peace', 'victory'], '🤞': ['cross', 'fingers', 'hope', 'luck'], '🤟': ['love', 'rock'],
    '🤘': ['rock', 'metal', 'horns'], '🤙': ['call', 'shaka', 'hang loose'],
    '👈': ['left', 'point'], '👉': ['right', 'point'], '👆': ['up', 'point'], '👇': ['down', 'point'],
    '☝️': ['up', 'point', 'one'], '👍': ['thumbs up', 'like', 'yes', 'ok', 'good', 'nice'], '👎': ['thumbs down', 'dislike', 'no', 'bad'],
    '✊': ['fist', 'power'], '👊': ['punch', 'fist bump'], '🤛': ['fist', 'left'], '🤜': ['fist', 'right'],
    '👏': ['clap', 'applause', 'bravo'], '🙌': ['raise', 'hooray', 'celebration'], '🫶': ['heart', 'hands', 'love'],
    '👐': ['open', 'hands'], '🤲': ['palms', 'up'], '🤝': ['handshake', 'deal', 'agree'], '🙏': ['pray', 'please', 'thank', 'namaste', 'hope'],
    '✍️': ['write', 'writing'], '💪': ['muscle', 'strong', 'flex', 'bicep'],
    '❤️': ['heart', 'love', 'red'], '🧡': ['heart', 'orange'], '💛': ['heart', 'yellow'], '💚': ['heart', 'green'],
    '💙': ['heart', 'blue'], '💜': ['heart', 'purple'], '🖤': ['heart', 'black'], '🤍': ['heart', 'white'],
    '💔': ['broken', 'heart', 'sad'], '💕': ['hearts', 'love'], '💞': ['revolving', 'hearts'], '💓': ['heartbeat'],
    '💗': ['growing', 'heart'], '💖': ['sparkling', 'heart'], '💘': ['cupid', 'arrow', 'heart'], '💝': ['gift', 'heart', 'ribbon'],
    '💌': ['love', 'letter', 'mail', 'envelope'],
    '🎉': ['party', 'celebrate', 'tada', 'congrats'], '🎊': ['confetti', 'party'], '🎈': ['balloon', 'party'],
    '🎁': ['gift', 'present', 'birthday'], '🏆': ['trophy', 'winner', 'champion'], '🥇': ['gold', 'first', 'medal', 'winner'],
    '🎮': ['game', 'controller'], '📱': ['phone', 'mobile'], '💻': ['laptop', 'computer'],
    '📷': ['camera', 'photo'], '📚': ['books', 'study', 'read'], '📝': ['memo', 'note', 'write'],
    '📊': ['chart', 'bar', 'graph', 'stats'], '📈': ['chart', 'up', 'growth'], '📉': ['chart', 'down', 'decline'],
    '💡': ['idea', 'light', 'bulb'], '🔑': ['key', 'important'], '⚙️': ['gear', 'settings'],
    '💰': ['money', 'bag', 'rich'], '💵': ['money', 'dollar', 'cash'],
    '🌟': ['star', 'glow', 'sparkle'], '⭐': ['star', 'favorite'], '🔥': ['fire', 'hot', 'lit', 'flame'],
    '💧': ['water', 'drop', 'tear'], '🌊': ['wave', 'ocean', 'sea'], '🌈': ['rainbow'],
    '🌸': ['cherry', 'blossom', 'flower', 'sakura'], '🌹': ['rose', 'flower', 'love'],
    '🍀': ['clover', 'luck', 'lucky'], '🐶': ['dog', 'puppy'], '🐱': ['cat', 'kitten'],
    '🍕': ['pizza', 'food'], '🍔': ['burger', 'hamburger', 'food'], '🍟': ['fries', 'food'],
    '☕': ['coffee', 'tea', 'hot', 'drink'], '🍺': ['beer', 'drink', 'cheers'],
    '🎂': ['cake', 'birthday'], '🍩': ['donut', 'doughnut'],
    // Symbols
    '✅': ['check', 'checkmark', 'tick', 'yes', 'done', 'completed', 'approved', 'ok', 'green'],
    '☑️': ['check', 'checkbox', 'tick', 'done', 'ballot'],
    '✔️': ['check', 'tick', 'done', 'yes', 'mark'],
    '❌': ['x', 'cross', 'no', 'wrong', 'cancel', 'close', 'fail', 'red'],
    '✖️': ['x', 'cross', 'multiply', 'cancel'],
    '⛔': ['no', 'forbidden', 'stop', 'block'],
    '🚫': ['no', 'prohibited', 'forbidden', 'ban', 'not'],
    '⚠️': ['warning', 'caution', 'alert'],
    '❗': ['exclamation', 'important', 'alert'],
    '❓': ['question', 'ask', 'huh'],
    '❕': ['exclamation', 'white'],
    '❔': ['question', 'white'],
    '💯': ['hundred', 'perfect', 'score', '100'],
    '✨': ['sparkle', 'shiny', 'magic', 'new'],
    '➕': ['plus', 'add'],
    '➖': ['minus', 'subtract'],
    '➗': ['divide'],
    '🔴': ['red', 'circle', 'dot', 'live', 'recording'],
    '🟢': ['green', 'circle', 'dot', 'go'],
    '🟡': ['yellow', 'circle', 'dot'],
    '🔵': ['blue', 'circle', 'dot'],
    '🟣': ['purple', 'circle', 'dot'],
    '🟠': ['orange', 'circle', 'dot'],
    '⚫': ['black', 'circle', 'dot'],
    '⚪': ['white', 'circle', 'dot'],
    '🆗': ['ok', 'okay'],
    '🆕': ['new'],
    '🆒': ['cool'],
    '🆙': ['up', 'level'],
    '🔝': ['top'],
    '🔥': ['fire', 'hot', 'lit', 'flame'],
};

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
    {
        name: 'Symbols',
        icon: '✅',
        emojis: [
            '✅', '☑️', '✔️', '❌', '✖️', '⛔', '🚫', '⚠️', '❗', '❓',
            '❕', '❔', '💯', '✨', '➕', '➖', '➗', '🆗', '🆕', '🆒',
            '🆙', '🔝', '🔥', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫',
            '⚪', '🟤',
        ],
    },
];

export function EmojiPicker({ onSelect, open, onClose, position = 'below' }: EmojiPickerProps) {
    const [activeCategory, setActiveCategory] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    // Inline marker element that stays in the original parent location so we
    // can read the trigger's bounding rect even though the picker UI is
    // portalled to document.body (to escape ancestor `transform` containment).
    const anchorMarkerRef = useRef<HTMLSpanElement>(null);
    const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

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

    // Position the picker as fixed relative to the viewport. The anchor marker
    // is rendered inline next to the trigger button so we can read its rect;
    // the picker UI is portalled to body so ancestor transforms (e.g. the
    // hover-action toolbar's `-translate-y-1/2`) don't constrain `fixed`.
    useLayoutEffect(() => {
        if (!open) {
            setCoords(null);
            return;
        }
        const compute = () => {
            const marker = anchorMarkerRef.current;
            if (!marker) return;
            // The marker is `display: inline-block` with size 0; its parent
            // (the wrapper around the trigger button) is the meaningful anchor.
            const anchorEl = marker.parentElement || marker;
            const r = anchorEl.getBoundingClientRect();
            const PICKER_W = 340;
            // Approximate height: header (~84) + tabs (~36) + grid (200) + padding
            const PICKER_H = 360;
            const M = 8;
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            // Vertical: prefer requested side, flip if it doesn't fit.
            let top = position === 'above' ? r.top - PICKER_H - M : r.bottom + M;
            if (position === 'above' && top < M) top = r.bottom + M;
            if (position === 'below' && top + PICKER_H > vh - M) top = Math.max(M, r.top - PICKER_H - M);
            if (top < M) top = M;
            if (top + PICKER_H > vh - M) top = Math.max(M, vh - PICKER_H - M);

            // Horizontal: right-align to anchor by default, then clamp.
            let left = r.right - PICKER_W;
            if (left < M) left = M;
            if (left + PICKER_W > vw - M) left = vw - PICKER_W - M;
            setCoords({ top, left });
        };
        compute();
        // Only recompute on resize — not on scroll. Scroll events fire while
        // the user scrolls inside the emoji grid; if the anchor's hover
        // toolbar happens to collapse mid-scroll, its rect goes to zero and
        // the picker would snap to the viewport edge.
        window.addEventListener('resize', compute);
        return () => {
            window.removeEventListener('resize', compute);
        };
    }, [open, position]);

    if (!open) return null;

    const allEmojis = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
    const filteredEmojis = searchQuery
        ? [...new Set(allEmojis)].filter(e => {
            const q = searchQuery.toLowerCase();
            const keywords = EMOJI_KEYWORDS[e];
            return keywords ? keywords.some(k => k.includes(q)) : false;
          })
        : EMOJI_CATEGORIES[activeCategory].emojis;

    const pickerUi = (
        <div
            ref={ref}
            style={coords ? { top: coords.top, left: coords.left, visibility: 'visible' } : { visibility: 'hidden' }}
            className="fixed w-[340px] bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden z-[120]"
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
                {filteredEmojis.length === 0 && searchQuery ? (
                    <p className="text-center text-sm text-slate-400 py-6">No emojis found for &quot;{searchQuery}&quot;</p>
                ) : (
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
                )}
            </div>
        </div>
    );

    return (
        <>
            <span ref={anchorMarkerRef} aria-hidden style={{ display: 'inline-block', width: 0, height: 0 }} />
            {mounted ? createPortal(pickerUi, document.body) : null}
        </>
    );
}

'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Smile, X, Search, Clock, Plus, Sparkles } from 'lucide-react';
import { bumpEmojiFrequent, getEmojiFrequents, subscribeEmojiFrequents } from '@/lib/emojiFrequents';
import { useCustomEmojis, type CustomEmoji } from '@/lib/customEmojis';
import { AddCustomEmojiModal } from '@/components/AddCustomEmojiModal';

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
    // activeCategory is 'custom' for the workspace custom emoji tab, otherwise
    // an index into EMOJI_CATEGORIES.
    const [activeCategory, setActiveCategory] = useState<number | 'custom'>(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [frequents, setFrequents] = useState<string[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const customEmojis = useCustomEmojis();
    const customByName: Record<string, CustomEmoji> = {};
    for (const e of customEmojis) customByName[e.name] = e;
    // Inline marker element that stays in the original parent location so we
    // can read the trigger's bounding rect even though the picker UI is
    // portalled to document.body (to escape ancestor `transform` containment).
    const anchorMarkerRef = useRef<HTMLSpanElement>(null);
    const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    // Refresh the frequents row whenever the picker opens (and stay subscribed
    // so a sibling picker bumping a token also updates ours).
    useEffect(() => {
        if (!open) return;
        setFrequents(getEmojiFrequents(15));
        const unsub = subscribeEmojiFrequents(() => setFrequents(getEmojiFrequents(15)));
        return unsub;
    }, [open]);

    useEffect(() => {
        // Skip the outside-click handler while the Add Emoji modal is open —
        // otherwise clicking the modal backdrop would close the picker too,
        // even though the modal sits visually on top.
        if (!open || showAddModal) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open, showAddModal, onClose]);

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
            // Approximate height: header (~84) + tabs (~36) + grid (240) + footer (~40) + padding
            const PICKER_H = 440;
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

    const pickEmoji = (token: string) => {
        bumpEmojiFrequent(token);
        onSelect(token);
        onClose();
    };

    // Build the list of tokens to render. A "token" is either a unicode
    // character ("🎉") or a shortcode (":party-parrot:"). Frequents, custom
    // emojis, and unicode all share the same token type so the grid is uniform.
    let visibleTokens: string[];
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const allEmojis = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
        const matchingUnicode = [...new Set(allEmojis)].filter((e) => {
            const keywords = EMOJI_KEYWORDS[e];
            return keywords ? keywords.some((k) => k.includes(q)) : false;
        });
        const matchingCustom = customEmojis
            .filter((c) => c.name.includes(q))
            .map((c) => `:${c.name}:`);
        // Custom matches first — they're more memorable when present.
        visibleTokens = [...matchingCustom, ...matchingUnicode];
    } else if (activeCategory === 'custom') {
        visibleTokens = customEmojis.map((c) => `:${c.name}:`);
    } else {
        visibleTokens = EMOJI_CATEGORIES[activeCategory].emojis;
    }

    // Renders a single token as either an image (custom shortcode) or text (unicode).
    const renderToken = (token: string) => {
        if (token.startsWith(':') && token.endsWith(':') && token.length > 2) {
            const name = token.slice(1, -1);
            const ce = customByName[name];
            if (ce) {
                // eslint-disable-next-line @next/next/no-img-element
                return <img src={ce.imageUrl} alt={token} className="w-6 h-6 object-contain" />;
            }
        }
        return <span>{token}</span>;
    };

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
                    {/* Custom tab — always visible so the user can browse their workspace
                        emojis (or see the empty state with the Add Emoji prompt). */}
                    <button
                        onClick={() => setActiveCategory('custom')}
                        title="Custom"
                        className={`p-1.5 rounded-lg transition-colors ${
                            activeCategory === 'custom' ? 'bg-indigo-50' : 'hover:bg-slate-50'
                        }`}
                    >
                        <Sparkles className="w-4 h-4 text-indigo-500" />
                    </button>
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
            <div className="h-[240px] overflow-y-auto px-3 py-2">
                {/* Frequently Used — only when not searching and we actually have history. */}
                {!searchQuery && frequents.length > 0 && (
                    <>
                        <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                            <Clock className="w-3 h-3" /> Frequently Used
                        </p>
                        <div className="grid grid-cols-8 gap-0.5 mb-2">
                            {frequents.map((emoji, idx) => (
                                <button
                                    key={`freq-${emoji}-${idx}`}
                                    onClick={() => pickEmoji(emoji)}
                                    className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-indigo-50 transition-colors"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </>
                )}
                {!searchQuery && (
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                        {activeCategory === 'custom' ? 'Custom' : EMOJI_CATEGORIES[activeCategory].name}
                    </p>
                )}
                {visibleTokens.length === 0 && searchQuery ? (
                    <p className="text-center text-sm text-slate-400 py-6">No emojis found for &quot;{searchQuery}&quot;</p>
                ) : visibleTokens.length === 0 && activeCategory === 'custom' ? (
                    <div className="text-center px-4 py-6">
                        <Sparkles className="w-6 h-6 text-indigo-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-500 font-medium">No custom emojis yet</p>
                        <p className="text-xs text-slate-400 mt-1">Click <span className="font-semibold">Add Emoji</span> below to upload your first one.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-8 gap-0.5">
                        {visibleTokens.map((token, idx) => (
                            <button
                                key={`${token}-${idx}`}
                                onClick={() => pickEmoji(token)}
                                title={token}
                                className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-indigo-50 transition-colors"
                            >
                                {renderToken(token)}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer — Add Emoji opens the upload modal. */}
            <div className="border-t border-slate-100 px-3 py-2">
                <button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Add Emoji
                </button>
            </div>
        </div>
    );

    return (
        <>
            <span ref={anchorMarkerRef} aria-hidden style={{ display: 'inline-block', width: 0, height: 0 }} />
            {mounted ? createPortal(pickerUi, document.body) : null}
            {mounted ? createPortal(
                <AddCustomEmojiModal
                    open={showAddModal}
                    onClose={() => setShowAddModal(false)}
                    onCreated={(e) => {
                        // Drop the user on the Custom tab so they immediately see their new emoji.
                        setActiveCategory('custom');
                        setShowAddModal(false);
                    }}
                />,
                document.body,
            ) : null}
        </>
    );
}

'use client';

// Shared @mention rendering primitives for comment / thread-reply surfaces.
//
// Two consumers currently:
//   - apps/fast/components/TaskCommentsSection.tsx (task comments + /track)
//   - apps/fast/components/channels/RoutineTaskDetailModal.tsx (routine
//     task detail modal's mirrored channel-thread replies)
//
// Why a shared module: PR #34 originally inlined highlightMentions inside
// TaskCommentsSection. Duplicating ~150 lines into the routine modal would
// drift over time; one module + two thin call sites is the boring correct
// shape.
//
// Architecture:
//   - highlightMentions(html): pure DOM walk that wraps @Handle.Name tokens
//     in styled spans with data-mention="<handle>". No state, no React.
//   - useMentionPopover(): React hook that returns
//       { onMentionContainerClick, popoverElement }
//     The consumer attaches `onMentionContainerClick` to the PARENT
//     container of the rendered comments (single stable listener — no
//     useEffect rebinding race) and renders `popoverElement` anywhere
//     inside its tree (it portals to document.body internally).

import { useCallback, useEffect, useState, type ReactNode, type RefCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Send as SendIcon } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────

/**
 * Wrap @Handle.Name mentions in a styled clickable badge for display.
 *
 * HTML-safe: walks only text nodes, skips <a> descendants so an email-
 * anchor like `mailto:foo@bar.com` doesn't get its local part eaten.
 * Mentions must be preceded by whitespace or the start of the text node
 * so mid-word `@` (typically inside emails / file paths) is left alone.
 *
 * The emitted span carries `data-mention="<handle>"` for the click
 * handler downstream, and `select-none pointer-events-auto` to defend
 * against:
 *   - rapid-click text selection that spills onto the rich-text editor
 *     below and accidentally activates format buttons (`select-none`),
 *   - ancestor `pointer-events: none` cascades from the modal portal
 *     that would otherwise kill every click before it lands
 *     (`pointer-events-auto`).
 */
export function highlightMentions(html: string): string {
    if (!html || !html.includes('@')) return html;
    if (typeof window === 'undefined') return html;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    const MENTION_RE = /(^|\s)(@[A-Za-z][A-Za-z0-9._-]*)/g;
    const walk = (node: Node) => {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'A') return;
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            if (!text.includes('@')) return;
            MENTION_RE.lastIndex = 0;
            let match: RegExpExecArray | null;
            const parts: { text: string; isMention: boolean }[] = [];
            let lastIdx = 0;
            while ((match = MENTION_RE.exec(text)) !== null) {
                const start = match.index + match[1].length;
                const end = MENTION_RE.lastIndex;
                if (start > lastIdx) parts.push({ text: text.slice(lastIdx, start), isMention: false });
                parts.push({ text: match[2], isMention: true });
                lastIdx = end;
            }
            if (lastIdx === 0) return;
            if (lastIdx < text.length) parts.push({ text: text.slice(lastIdx), isMention: false });
            const frag = document.createDocumentFragment();
            for (const p of parts) {
                if (p.isMention) {
                    const span = document.createElement('span');
                    span.className =
                        'px-1.5 py-0.5 rounded font-medium ' +
                        'bg-blue-50 text-blue-600 ' +
                        'dark:bg-blue-950/50 dark:text-blue-400 ' +
                        'hover:underline cursor-pointer ' +
                        'select-none pointer-events-auto';
                    span.setAttribute('data-mention', p.text.slice(1));
                    span.textContent = p.text;
                    frag.appendChild(span);
                } else {
                    frag.appendChild(document.createTextNode(p.text));
                }
            }
            node.parentNode?.replaceChild(frag, node);
            return;
        }
        Array.from(node.childNodes).forEach(walk);
    };
    walk(wrapper);
    return wrapper.innerHTML;
}

// ─────────────────────────────────────────────────────────────────────────
// Popover hook
// ─────────────────────────────────────────────────────────────────────────

interface MentionUser {
    id: string;
    name: string;
    email: string;
    image: string | null;
    role?: string | null;
    teamName?: string | null;
}

interface ProfilePopoverState {
    user: MentionUser;
    rect: { left: number; top: number; bottom: number };
}

export interface UseMentionPopoverResult {
    /**
     * Attach to the PARENT container of every rendered comment / reply
     * via `ref={containerRef}`. The hook registers a native click
     * listener on the container the moment React mounts the node — and
     * cleans it up if the node ever unmounts/remounts (e.g. a
     * conditional render that gates the comments list on
     * `comments.length > 0`).
     *
     * This is a CALLBACK ref, not a RefObject. Reason: PR #44 used a
     * RefObject + useEffect with `[openProfilePopoverForBadge]` as the
     * dep. The comments list lives inside `{comments.length > 0 && …}`,
     * so the ref node didn't exist on initial render — useEffect
     * bailed silently, and ref-mutation later doesn't re-fire effects.
     * The listener stayed unattached forever unless `mentionUsers`
     * happened to update (which it didn't for view-only sessions), so
     * every mention click fell on the floor. Callback refs fix this:
     * React calls the ref function with the node on mount and with
     * null on unmount, so we can attach/cleanup in lockstep with the
     * DOM lifecycle.
     *
     * The listener runs in CAPTURE phase (`{ capture: true }`) so it
     * fires before any descendant or ancestor has a chance to call
     * `stopPropagation()` on the bubble. Together: callback ref +
     * capture phase = listener gets attached at the right time AND
     * cannot be swallowed by anything else in the click chain.
     *
     * The listener filters via `closest('[data-mention]')`, so non-
     * mention clicks fall through unaffected.
     */
    containerRef: RefCallback<HTMLDivElement>;
    /**
     * Portal-rendered popover element. Render anywhere inside the
     * consumer's tree — it portals to document.body internally so
     * ancestor overflow/clip rules don't affect it.
     */
    popoverElement: ReactNode;
}

export function useMentionPopover(): UseMentionPopoverResult {
    const router = useRouter();
    const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
    const [profilePopover, setProfilePopover] = useState<ProfilePopoverState | null>(null);

    const openProfilePopoverForBadge = useCallback((badge: HTMLElement) => {
        const rawHandle = badge.getAttribute('data-mention') || '';
        const cleanedHandle = rawHandle.startsWith('@') ? rawHandle.slice(1) : rawHandle;
        if (!cleanedHandle) return;
        const rect = badge.getBoundingClientRect();
        const needle = cleanedHandle.toLowerCase();
        const findUser = (list: MentionUser[]) =>
            list.find((u) => u.name.replace(/\s+/g, '.').toLowerCase() === needle);
        const cached = findUser(mentionUsers);
        if (cached) {
            setProfilePopover({ user: cached, rect: { left: rect.left, top: rect.top, bottom: rect.bottom } });
            return;
        }
        fetch('/fast/api/chat/users')
            .then((r) => (r.ok ? r.json() : []))
            .then((list: MentionUser[]) => {
                setMentionUsers(list);
                const u = findUser(list);
                if (u) {
                    setProfilePopover({ user: u, rect: { left: rect.left, top: rect.top, bottom: rect.bottom } });
                } else {
                    console.warn('Mention user lookup failed for handle:', cleanedHandle);
                }
            })
            .catch((err) => {
                console.warn('Mention user fetch failed:', err);
            });
    }, [mentionUsers]);

    // Track the container DOM node via state so the listener-attach
    // effect re-runs when the node mounts/unmounts. A plain useRef
    // would not trigger an effect re-run when the comments list
    // appears after first render — see PR #44's regression: the list
    // is gated on `comments.length > 0`, so the node only existed
    // AFTER the first fetch resolved, but useEffect had already run
    // and bailed with a null ref. Listener stayed unattached forever.
    const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);
    const containerRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
        setContainerNode(node);
    }, []);

    // Native click listener attached directly to the container node in
    // CAPTURE phase. Two reasons capture (not bubble):
    //
    //   1. Defence in depth — if any descendant component ever calls
    //      `e.stopPropagation()` in its own bubble handler (a comment
    //      row, a rich-text wrapper, anything React Strict Mode might
    //      remount mid-flight), the bubble can be killed before
    //      reaching the container. Capture-phase listeners on the
    //      container fire on the way DOWN, so nothing further down
    //      the tree gets to stop them.
    //
    //   2. The task detail modal at apps/fast/app/tasks/page.tsx:1108
    //      has `onClick={e => e.stopPropagation()}` to defeat
    //      backdrop-click-to-close. Even though that handler is on
    //      an ANCESTOR (above the container in the tree), the prior
    //      bubble-phase listener was robust against it; capture
    //      retains that robustness AND adds defence against
    //      descendant stoppers.
    //
    // Effect re-runs whenever `containerNode` or `openProfilePopoverForBadge`
    // change, so the listener attaches the moment React mounts the
    // comments list and cleans up on unmount.
    useEffect(() => {
        if (!containerNode) return;
        const onClick = (ev: MouseEvent) => {
            const target = ev.target as HTMLElement | null;
            const badge = target?.closest?.('[data-mention]') as HTMLElement | null;
            if (!badge) return;
            ev.preventDefault();
            ev.stopPropagation();
            // Belt-and-suspenders against rapid-click text selection
            // spilling into the rich-text editor and tripping its
            // Cmd+U / Cmd+B heuristics. select-none on the badge is
            // the suspenders; this is the belt.
            if (typeof window !== 'undefined') {
                window.getSelection()?.removeAllRanges();
            }
            openProfilePopoverForBadge(badge);
        };
        containerNode.addEventListener('click', onClick, { capture: true });
        return () => containerNode.removeEventListener('click', onClick, { capture: true });
    }, [containerNode, openProfilePopoverForBadge]);

    // Click-outside dismiss. Allows clicks on other mention badges to
    // re-anchor the popover instead of doing close-then-open flicker.
    useEffect(() => {
        if (!profilePopover) return;
        const onDown = (ev: MouseEvent) => {
            const t = ev.target as HTMLElement | null;
            if (t?.closest('[data-userprofile-popover]')) return;
            if (t?.closest('[data-mention]')) return;
            setProfilePopover(null);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [profilePopover]);

    const popoverElement: ReactNode = profilePopover && typeof window !== 'undefined'
        ? createPortal(
              <ProfileCard
                  state={profilePopover}
                  onClose={() => setProfilePopover(null)}
                  onSendDm={(userId) => {
                      setProfilePopover(null);
                      router.push(`/messages?with=${encodeURIComponent(userId)}`);
                  }}
              />,
              document.body,
          )
        : null;

    return { containerRef, popoverElement };
}

// ─────────────────────────────────────────────────────────────────────────
// Inline popover card (kept private — consumers use the hook)
// ─────────────────────────────────────────────────────────────────────────

function ProfileCard({
    state,
    onClose: _onClose,
    onSendDm,
}: {
    state: ProfilePopoverState;
    onClose: () => void;
    onSendDm: (userId: string) => void;
}) {
    const POPOVER_WIDTH = 260;
    const spaceBelow = typeof window !== 'undefined' ? window.innerHeight - state.rect.bottom : 9999;
    const aboveInsteadOfBelow = spaceBelow < 200 && state.rect.top > 200;
    const top = aboveInsteadOfBelow
        ? Math.max(8, state.rect.top - 8)
        : state.rect.bottom + 6;
    const left = typeof window !== 'undefined'
        ? Math.max(8, Math.min(state.rect.left, window.innerWidth - POPOVER_WIDTH - 8))
        : state.rect.left;
    const u = state.user;
    const roleLabel = u.role === 'admin' ? 'Master' : u.role === 'leader' ? 'Leader' : u.role === 'member' ? 'Member' : null;
    const roleClass = u.role === 'admin'
        ? 'bg-purple-50 text-purple-700'
        : u.role === 'leader'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-slate-100 text-slate-600';
    return (
        <div
            data-userprofile-popover
            style={{
                position: 'fixed',
                left,
                ...(aboveInsteadOfBelow && typeof window !== 'undefined'
                    ? { bottom: window.innerHeight - top }
                    : { top }),
                width: POPOVER_WIDTH,
            }}
            className="bg-white border border-slate-200 rounded-2xl shadow-xl z-[200] overflow-hidden"
        >
            <div className="p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-base font-bold flex-shrink-0 overflow-hidden">
                    {u.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.image} alt={u.name} className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                        u.name.charAt(0).toUpperCase()
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800 truncate">{u.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {roleLabel && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${roleClass}`}>
                                {roleLabel}
                            </span>
                        )}
                        {u.teamName && (
                            <span className="text-[10px] font-medium text-slate-500 truncate">{u.teamName}</span>
                        )}
                    </div>
                </div>
            </div>
            <div className="px-3 pb-3">
                <button
                    type="button"
                    onClick={() => onSendDm(u.id)}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                >
                    <SendIcon className="w-3.5 h-3.5" /> Send Direct Message
                </button>
            </div>
        </div>
    );
}

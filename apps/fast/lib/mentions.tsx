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

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
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
     * via `ref={containerRef}`. The hook registers a single native
     * `click` listener on the container during its lifetime; React's
     * synthetic event delegation is bypassed entirely, so:
     *
     *   - Ancestors with `onClick={e => e.stopPropagation()}` (e.g.
     *     the task detail modal's inner wrapper to defeat backdrop-
     *     click-to-close) cannot swallow the click — the native
     *     listener fires during bubble at the container, BEFORE the
     *     synthetic event reaches the ancestor.
     *   - One binding for the lifetime of the consumer; never re-binds
     *     on comments rerender. No race window like the per-badge
     *     useEffect approach in PR #42.
     *
     * The listener filters via `closest('[data-mention]')`, so non-
     * mention clicks inside the container fall through unaffected
     * (the consumer's normal handlers still work).
     */
    containerRef: RefObject<HTMLDivElement | null>;
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

    // Native click listener attached directly to the container ref.
    // Bypasses React's synthetic event delegation entirely: in the task
    // detail modal at apps/fast/app/tasks/page.tsx:1108 (and the parallel
    // /nexus modal), the inner wrapper has `onClick={e =>
    // e.stopPropagation()}` to defeat backdrop-click-to-close. That
    // stopPropagation also stops React's synthetic delegation at the
    // root container — any React onClick handler we install at the
    // container level never fires for clicks inside the modal. A native
    // listener attached directly to the container, by contrast, fires
    // during bubble at the container BEFORE the synthetic system gets
    // involved, so it cannot be swallowed by upstream React handlers.
    //
    // One listener, one binding, no rebinding race — different from
    // PR #42's per-badge approach which re-bound on every comments
    // rerender and left a window where clicks fell on the floor.
    const containerRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const onClick = (ev: MouseEvent) => {
            const target = ev.target as HTMLElement | null;
            const badge = target?.closest?.('[data-mention]') as HTMLElement | null;
            if (!badge) return;
            // Belt-and-suspenders against rapid-click text selection
            // spilling into the rich-text editor and tripping its
            // Cmd+U / Cmd+B heuristics. select-none on the badge is
            // the suspenders; this is the belt.
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof window !== 'undefined') {
                window.getSelection()?.removeAllRanges();
            }
            openProfilePopoverForBadge(badge);
        };
        container.addEventListener('click', onClick);
        return () => container.removeEventListener('click', onClick);
    }, [openProfilePopoverForBadge]);

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

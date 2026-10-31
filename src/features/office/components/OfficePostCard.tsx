import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { AvatarStack } from '../../../components/ui/AvatarStack';
import { AuthImage } from '../../../components/ui/AuthImage';
import { Modal } from '../../../components/ui/Modal';
import { useAuthStore } from '../../../store/authStore';
import type { OfficePost } from '../../../services/http/officeApi';
import { REACTIONS, timeAgo } from '../officeMeta';
import { PeoplePopover } from './PeoplePopover';

/** On phones there is no hover: a tap on a reaction that has people opens the list instead. */
const noHover = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none)').matches;

interface Props {
  post: OfficePost;
  /** Position in the grid, for the staggered entry. */
  index?: number;
  /** Called once when a post you haven't seen has been on screen for a moment. */
  onViewed: (id: string) => void;
  onReact: (post: OfficePost, emoji: string) => void;
  onToggleResolved: (post: OfficePost) => void;
}

/** One notice or issue: author, text (4 lines, then "Read more"), photo, reactions, who has seen it, resolved state. */
export const OfficePostCard: React.FC<Props> = ({ post, index = 0, onViewed, onReact, onToggleResolved }) => {
  const me = useAuthStore((s) => s.user);
  const ref = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [zoom, setZoom] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const [popover, setPopover] = useState<string | null>(null); // 'r:<emoji>' or 'seen'

  // Mark as seen once at least half the card has been visible for a moment.
  useEffect(() => {
    const el = ref.current;
    if (!post.is_new || !el || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer);
        if (entry.isIntersecting) timer = setTimeout(() => onViewed(post.id), 800);
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [post.id, post.is_new, onViewed]);

  // "Read more" only when the text really is cut off at 4 lines.
  useLayoutEffect(() => {
    const el = textRef.current;
    if (el && !expanded) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [post.text, expanded]);

  const reactions = new Map(post.reactions.map((r) => [r.emoji, r]));
  const mine = post.author?.id === me?.id;

  return (
    <article
      ref={ref}
      style={{ animationDelay: `${Math.min(index, 9) * 55}ms`, animationFillMode: 'both' }}
      className={`animate-fade-in tm-lift relative flex flex-col hover:z-20 focus-within:z-20 gap-3 rounded-[20px] bg-[var(--tm-card)] p-4 shadow-soft-sm ${post.resolved ? 'opacity-75' : ''}`}
    >
      {/* Author, time, state */}
      <div className="flex items-center gap-2">
        <PersonLink userId={post.author?.id} className="flex min-w-0 items-center gap-2">
          <Avatar name={post.author?.name ?? 'Someone'} src={post.author?.avatar_url ?? undefined} size="sm" />
          <span className="truncate text-[13px] font-semibold text-[var(--tm-ink)]">{mine ? 'You' : (post.author?.name ?? 'Someone')}</span>
        </PersonLink>
        <span className="shrink-0 text-[11.5px] text-[var(--tm-ink-muted)]" title={new Date(post.created_at).toLocaleString()}>
          · {timeAgo(post.created_at)}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {post.is_new && (
            <span className="rounded-full bg-[var(--tm-danger)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--tm-on-primary)]">New</span>
          )}
          {post.resolved && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--tm-success-bg)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--tm-success)]">
              <CheckCircle2 className="h-3 w-3" />
              Resolved
            </span>
          )}
        </span>
      </div>

      {/* Text */}
      <div>
        <p
          ref={textRef}
          className={`whitespace-pre-wrap break-words text-[14px] leading-snug ${expanded ? '' : 'line-clamp-4'} ${
            post.resolved ? 'text-[var(--tm-ink-muted)]' : 'text-[var(--tm-ink)]'
          }`}
        >
          {post.text}
        </p>
        {(clamped || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="mt-1 text-[12px] font-bold text-[var(--tm-primary-dark)] hover:underline"
          >
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>

      {/* Attachments */}
      {post.photo && (
        <button
          type="button"
          onClick={() => setZoom(true)}
          aria-label="Enlarge photo"
          className="block h-16 w-16 overflow-hidden rounded-[12px] border border-[var(--tm-border)]"
        >
          <AuthImage url={post.photo.url} alt={`Photo for: ${post.text.slice(0, 60)}`} className="h-full w-full object-cover" />
        </button>
      )}

      {post.resolved && post.resolved_by && (
        <p className="text-[11.5px] text-[var(--tm-success)]">
          Resolved by {post.resolved_by.id === me?.id ? 'you' : post.resolved_by.name}
          {post.resolved_at ? ` · ${timeAgo(post.resolved_at)}` : ''}
        </p>
      )}

      {/* Reactions */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reactions">
        {REACTIONS.map((emoji) => {
          const r = reactions.get(emoji);
          const key = `r:${emoji}`;
          const open = popover === key && !!r?.users.length;
          return (
            <div
              key={emoji}
              className="relative"
              onMouseEnter={() => !noHover() && r?.users.length && setPopover(key)}
              onMouseLeave={() => !noHover() && setPopover((p) => (p === key ? null : p))}
            >
              <button
                type="button"
                aria-pressed={!!r?.mine}
                aria-expanded={open}
                onClick={() => (noHover() && r?.users.length ? setPopover(open ? null : key) : onReact(post, emoji))}
                className={`inline-flex h-6 items-center gap-1 rounded-full bg-[var(--tp-chip)] px-2 text-[11.5px] text-[var(--tp-chip-ink)] transition-transform hover:scale-105 ${
                  r?.mine ? 'font-bold ring-1 ring-[var(--tm-primary-light)]' : r ? 'font-semibold' : 'opacity-60 hover:opacity-100'
                }`}
              >
                <span>{emoji}</span>
                {r && <span className="tabular-nums">{r.count}</span>}
              </button>
              {open && r && (
                <>
                  {noHover() && <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setPopover(null)} />}
                  <PeoplePopover title={`${emoji} ${r.count} ${r.count === 1 ? 'reaction' : 'reactions'}`} people={r.users} meId={me?.id}>
                    {noHover() && (
                      <button
                        type="button"
                        onClick={() => {
                          setPopover(null);
                          onReact(post, emoji);
                        }}
                        className="mt-1.5 w-full rounded-full bg-[var(--tp-chip)] py-1.5 text-[12px] font-bold text-[var(--tp-chip-ink)]"
                      >
                        {r.mine ? 'Remove my reaction' : `React ${emoji}`}
                      </button>
                    )}
                  </PeoplePopover>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer: seen by + resolve */}
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex min-w-0 items-center text-[11.5px] text-[var(--tm-ink-muted)]">
          {post.seen_by.length > 0 ? (
            <>
              <button
                type="button"
                aria-expanded={popover === 'seen'}
                onClick={() => setPopover((p) => (p === 'seen' ? null : 'seen'))}
                className="flex min-w-0 items-center gap-2 rounded-full hover:text-[var(--tm-ink)]"
              >
                <AvatarStack size="xs" max={4} spreadOnHover={false} people={post.seen_by.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatar_url ?? undefined }))} />
                <span className="truncate">Seen by {post.seen_count}</span>
              </button>
              {popover === 'seen' && (
                <>
                  <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setPopover(null)} />
                  <PeoplePopover title={`Seen by ${post.seen_count}`} people={post.seen_by} meId={me?.id} />
                </>
              )}
            </>
          ) : (
            <span>Not seen yet</span>
          )}
        </div>
        {post.can_resolve && (
          <button
            type="button"
            onClick={() => onToggleResolved(post)}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-[var(--tm-border-strong)] px-2.5 text-[11.5px] font-bold text-[var(--tm-ink)] transition-colors hover:bg-[var(--tp-chip)] focus-visible:outline-none focus-visible:shadow-glow"
          >
            {post.resolved ? <RotateCcw className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            {post.resolved ? 'Reopen' : 'Mark resolved'}
          </button>
        )}
      </div>

      {post.photo && (
        <Modal isOpen={zoom} onClose={() => setZoom(false)} title="Photo" maxWidth="lg">
          <AuthImage url={post.photo.url} alt="Full-size photo" className="max-h-[70vh] w-full rounded-[var(--tm-radius-sm)] object-contain" />
        </Modal>
      )}
    </article>
  );
};

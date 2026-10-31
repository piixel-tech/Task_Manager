import React from 'react';
import { motion } from 'motion/react';
import { FileText, Link2, X } from 'lucide-react';
import { Avatar } from './Avatar';
import { PersonLink } from './PersonLink';
import { fadeUp } from './motion';
import { useMotionPrefs } from './useMotionPrefs';
import { formatDate } from '../../utils/time';

/**
 * Building blocks for "composer on top, compact cards below" lists (Requirements, Checklist,
 * Deliverables, Mid-way changes). Presentation only: callers keep their own data and actions.
 */

/** The white card at the top of a list that holds the "add something" controls. */
export const ComposerCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`space-y-3 rounded-[var(--tm-radius-card)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-4 shadow-soft-sm ${className}`}>
    {children}
  </div>
);

/**
 * Wrap the cards in this: 12px between them, a staggered entry, and (inside an `AnimatePresence`)
 * a smooth collapse when one is removed. Give it a `key` that changes with the filter to replay the entry.
 */
export const ItemList: React.FC<{ children: React.ReactNode; label?: string; className?: string }> = ({ children, label, className = '' }) => (
  <div role="list" aria-label={label} className={className}>
    {children}
  </div>
);

export interface ItemCardProps {
  /** Glyph in the round tile on the left. */
  icon: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  /** Dim it (a resolved or finished item). */
  muted?: boolean;
  /** Tint the tile with the success colour. */
  done?: boolean;
  className?: string;
}

/** One compact white card: round icon tile, then whatever the item needs. Fades up in a stagger, collapses on exit. */
export const ItemCard: React.FC<ItemCardProps> = ({ icon, children, id, muted, done, className = '' }) => {
  const { reduced } = useMotionPrefs();
  return (
    <motion.div
      role="listitem"
      variants={fadeUp}
      exit={
        reduced
          ? { opacity: 0, transition: { duration: 0 } }
          : { opacity: 0, height: 0, paddingTop: 0, overflow: 'hidden', transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] } }
      }
      className="pt-3 first:pt-0"
    >
      <article
        id={id}
        className={`flex gap-3.5 rounded-[var(--tm-radius-card)] border border-[var(--tm-border)] p-4 shadow-soft-sm ${
          muted ? 'bg-[var(--tm-card-muted)]' : 'bg-[var(--tm-card)]'
        } ${className}`}
      >
        <span
          aria-hidden
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
            done ? 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]' : 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]'
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">{children}</div>
      </article>
    </motion.div>
  );
};

/** Author avatar + name + date, the line every item carries. */
export const AuthorStamp: React.FC<{
  person: { id: string; name: string; avatar_url: string | null } | null | undefined;
  date: string;
  /** Prefix for the name, e.g. "Added by". */
  verb?: string;
}> = ({ person, date, verb }) => (
  <div className="flex min-w-0 items-center gap-2 text-[12px] text-[var(--tm-ink-muted)]">
    <PersonLink userId={person?.id} className="flex min-w-0 items-center gap-2">
      <Avatar name={person?.name ?? '?'} src={person?.avatar_url ?? undefined} size="xs" />
      <span className="truncate font-semibold text-[var(--tm-ink-soft)]">
        {verb ? `${verb} ` : ''}
        {person?.name ?? 'Former member'}
      </span>
    </PersonLink>
    <span aria-hidden>·</span>
    <time dateTime={date} className="whitespace-nowrap">
      {formatDate(date, 'MMM d, h:mm a')}
    </time>
  </div>
);

/** A small pill for a file or link; `onRemove` adds the little x. */
export const FileChip: React.FC<{
  name: string;
  kind: 'upload' | 'link';
  title?: string;
  onOpen: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}> = ({ name, kind, title, onOpen, onRemove, removeLabel }) => (
  <span className="inline-flex items-center rounded-full bg-[var(--tm-card-muted)] text-[12px] font-semibold text-[var(--tm-ink)]">
    <button
      type="button"
      onClick={onOpen}
      title={title}
      className={`flex items-center gap-1.5 rounded-full py-1.5 pl-3 hover:bg-[var(--tm-bg-sunken)] ${onRemove ? 'pr-2' : 'pr-3'}`}
    >
      {kind === 'link' ? <Link2 className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
      <span className="max-w-[180px] truncate">{name}</span>
    </button>
    {onRemove && (
      <button
        type="button"
        aria-label={removeLabel ?? `Remove ${name}`}
        onClick={onRemove}
        className="mr-1 grid h-6 w-6 place-items-center rounded-full text-[var(--tm-ink-muted)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-danger)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    )}
  </span>
);

/** Skeleton cards shaped like `ItemCard`, for the loading state. */
export const ItemCardSkeletons: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="space-y-3" aria-busy="true" aria-label="Loading">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex gap-3.5 rounded-[var(--tm-radius-card)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-4 shadow-soft-sm">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[var(--tm-bg-sunken)]" />
        <div className="flex-1 space-y-2.5 pt-1">
          <div className="h-3.5 w-2/5 animate-pulse rounded-full bg-[var(--tm-bg-sunken)]" />
          <div className="h-3 w-3/5 animate-pulse rounded-full bg-[var(--tm-bg-sunken)]" />
        </div>
      </div>
    ))}
  </div>
);

import React from 'react';
import { AvatarStack, type AvatarStackPerson } from './AvatarStack';

export interface FolderCardProps {
  title: string;
  subtitle: string;
  /** Member avatars shown on the folder front. */
  people?: AvatarStackPerson[];
  /** Pill shown on the folder front, top right (company, Head, Read-only...). */
  badge?: React.ReactNode;
  /** Extra content under the subtitle. */
  footer?: React.ReactNode;
  onClick?: () => void;
  /** Hover text for the whole folder (e.g. a project's short description). */
  tooltip?: string;
}

const BACK = 'color-mix(in srgb, var(--tm-ink-soft) 88%, var(--tm-card))';
const FRONT = 'color-mix(in srgb, var(--tm-ink-soft) 100%, var(--tm-card))';

const sheet =
  'absolute rounded-[10px] bg-[var(--tm-card)] shadow-soft-xs transition-transform duration-300 ease-out motion-reduce:transition-none';

/**
 * A folder: file sheets peek out of the back, member avatars sit on the front. On hover or focus the folder
 * opens slightly and the sheets lift. Decorative only; it carries no data of its own.
 */
export const FolderCard: React.FC<FolderCardProps> = ({ title, subtitle, people = [], badge, footer, onClick, tooltip }) => (
  <div
    title={tooltip || undefined}
    role="button"
    tabIndex={0}
    onClick={onClick}
    onKeyDown={(e) => {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onClick?.();
      }
    }}
    className="group cursor-pointer rounded-[var(--tm-radius-lg)] p-4 text-center outline-none transition-colors duration-[var(--tm-dur-fast)] hover:bg-[var(--tm-bg-sunken)] focus-visible:bg-[var(--tm-bg-sunken)] focus-visible:shadow-glow"
  >
    <div className="relative mx-auto aspect-[4/3] w-full max-w-[260px]">
      {/* back panel with its tab */}
      <div className="absolute left-0 top-[6%] h-[14%] w-[44%] rounded-t-[14px]" style={{ background: BACK }} />
      <div className="absolute inset-x-0 bottom-0 top-[14%] rounded-[18px] rounded-tl-none" style={{ background: BACK }} />

      {/* sheets peeking out */}
      <div className={`${sheet} inset-x-[14%] top-[10%] bottom-[34%] -rotate-3 group-hover:-translate-y-3 group-focus-visible:-translate-y-3`} />
      <div className={`${sheet} inset-x-[10%] top-[16%] bottom-[30%] rotate-2 delay-75 group-hover:-translate-y-5 group-focus-visible:-translate-y-5`}>
        <div className="mx-4 mt-4 space-y-2">
          <div className="h-1.5 w-2/3 rounded-full bg-[var(--tm-border-strong)]" />
          <div className="h-1.5 w-1/2 rounded-full bg-[var(--tm-border)]" />
        </div>
      </div>

      {/* front panel: tilts open */}
      <div
        className="absolute inset-x-0 bottom-0 top-[34%] origin-bottom rounded-[18px] shadow-soft-sm transition-transform duration-300 ease-out [transform-style:preserve-3d] group-hover:[transform:perspective(700px)_rotateX(-16deg)] group-focus-visible:[transform:perspective(700px)_rotateX(-16deg)] motion-reduce:transition-none motion-reduce:group-hover:[transform:none] motion-reduce:group-focus-visible:[transform:none]"
        style={{ background: FRONT }}
      >
        <div className="flex h-full flex-col justify-between p-3.5">
          <div className="flex justify-end">{badge}</div>
          <div className="flex justify-start">
            <AvatarStack people={people} max={3} size="xs" spreadOnHover={false} />
          </div>
        </div>
      </div>
    </div>

    <div className="mt-3 truncate text-[14px] font-bold text-[var(--tm-ink)]" title={title}>
      {title}
    </div>
    <div className="mt-0.5 text-[12.5px] font-semibold text-[var(--tm-ink-muted)]">{subtitle}</div>
    {footer && <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">{footer}</div>}
  </div>
);

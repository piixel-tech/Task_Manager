import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind height class, e.g. `h-4`. */
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

const radii = {
  sm: 'rounded-[8px]',
  md: 'rounded-[var(--tm-radius-sm)]',
  lg: 'rounded-[var(--tm-radius-lg)]',
  full: 'rounded-full'
};

/** Shimmering placeholder block. Use instead of a spinner. */
export const Skeleton: React.FC<SkeletonProps> = ({
  className = 'h-4 w-full',
  rounded = 'md',
  ...props
}) => <div className={`skeleton ${radii[rounded]} ${className}`} aria-hidden {...props} />;

/** A card-shaped loading placeholder. */
export const SkeletonCard: React.FC<{ lines?: number; className?: string }> = ({
  lines = 3,
  className = ''
}) => (
  <div
    className={`bg-[var(--tm-card)] border border-[var(--tm-border)] rounded-[var(--tm-radius-xl)] p-6 shadow-soft-xs ${className}`}
  >
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 w-10" rounded="full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
    <div className="mt-5 space-y-2.5">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  </div>
);

/** Grid of skeleton cards for a page-level loading state. */
export const SkeletonGrid: React.FC<{ count?: number; className?: string }> = ({
  count = 6,
  className = 'grid gap-5 sm:grid-cols-2 xl:grid-cols-3'
}) => (
  <div className={className}>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);

/** Rows for table-ish loading states. */
export const SkeletonRows: React.FC<{ count?: number }> = ({ count = 5 }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="flex items-center gap-4 bg-[var(--tm-card)] border border-[var(--tm-border)] rounded-[var(--tm-radius-lg)] px-5 py-4"
      >
        <Skeleton className="h-9 w-9" rounded="full" />
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-3 w-1/6" />
        <div className="flex-1" />
        <Skeleton className="h-6 w-20" rounded="full" />
      </div>
    ))}
  </div>
);

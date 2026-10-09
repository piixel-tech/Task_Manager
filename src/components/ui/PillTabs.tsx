import React, { useId } from 'react';
import { motion } from 'motion/react';
import { useMotionPrefs } from './useMotionPrefs';
import { spring } from './motion';

export interface PillTabItem {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface PillTabsProps {
  tabs: PillTabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'md';
  /** `track` draws a sunken rail behind the pills; `bare` sits on the canvas. */
  variant?: 'track' | 'bare';
  className?: string;
}

/**
 * Pill filter tabs. The active background is a single shared element that
 * slides between tabs via a `layoutId`, so switching reads as one movement.
 */
export const PillTabs: React.FC<PillTabsProps> = ({
  tabs,
  activeTab,
  onChange,
  size = 'md',
  variant = 'track',
  className = ''
}) => {
  const { reduced } = useMotionPrefs();
  const layoutId = `pill-tabs-${useId().replace(/:/g, '')}`;

  const pad = size === 'sm' ? 'px-3.5 h-8 text-[12px]' : 'px-4.5 h-10 text-[13px]';

  return (
    <div
      role="tablist"
      className={`inline-flex max-w-full items-center gap-1 overflow-x-auto scrollbar-none
        ${variant === 'track' ? 'rounded-full bg-[var(--tm-bg-sunken)] p-1' : ''} ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`relative inline-flex shrink-0 items-center gap-2 rounded-full font-semibold
              transition-colors duration-[var(--tm-dur-fast)] ${pad}
              ${
                isActive
                  ? 'text-white'
                  : 'text-[var(--tm-ink-soft)] hover:text-[var(--tm-ink)]'
              }`}
          >
            {isActive && (
              <motion.span
                layoutId={reduced ? undefined : layoutId}
                className="absolute inset-0 rounded-full bg-[var(--tm-primary)] shadow-soft-sm"
                transition={reduced ? { duration: 0 } : spring}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-2 whitespace-nowrap">
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5
                    text-[10px] font-bold leading-[17px] tabular-nums
                    ${
                      isActive
                        ? 'bg-white/22 text-white'
                        : 'bg-[var(--tm-card)] text-[var(--tm-ink-muted)]'
                    }`}
                >
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};

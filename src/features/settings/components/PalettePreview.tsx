import React from 'react';
import { PALETTE_KEYS, type PaletteColors } from '../../../services/http/festivalApi';

/**
 * A miniature of the app (top bar, card, button, badges, text) painted with a palette.
 * The palette's variables are set on this element only, so it never changes the real page.
 * `banner` adds the festive strip used by festival themes.
 */
export const PalettePreview: React.FC<{ colors: PaletteColors; dark: boolean; banner?: { emoji: string; text: string } }> = ({ colors, dark, banner }) => {
  const vars = Object.fromEntries(PALETTE_KEYS.map((k) => [`--${k}`, colors[k]])) as React.CSSProperties;
  const solid = dark ? colors.primary : colors.text;
  const solidInk = dark ? colors.bg : colors.surface;
  const accentInk = dark ? colors.bg : colors.text;
  return (
    <div style={vars} className="overflow-hidden rounded-[var(--tm-radius-lg)] border border-[var(--border)] bg-[var(--bg)] p-4" aria-label="Preview">
      <div className="mb-3 flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[12px] font-bold text-[var(--text)]">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors.accent }} />
        Task Manager
        <span className="ml-auto text-[var(--text-muted)]">Home</span>
      </div>
      {banner && (
        <div
          className="mb-3 flex items-center gap-2 rounded-full px-4 py-1.5 text-[12px] font-semibold"
          style={{ background: `color-mix(in srgb, ${colors.accent} 45%, ${colors.surface})`, color: colors.text }}
        >
          {banner.emoji && <span aria-hidden>{banner.emoji}</span>}
          <span className="truncate">{banner.text || 'Festive greeting'}</span>
        </div>
      )}
      <div className="rounded-[var(--tm-radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-[14px] font-extrabold text-[var(--text)]">Design review</p>
        <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">Website redesign › Homepage · due tomorrow</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: solid, color: solidInk }}>
            Start timer
          </span>
          <span className="rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: colors.accent, color: accentInk }}>
            3 new
          </span>
          <span className="rounded-full px-3 py-1 text-[12px] font-bold" style={{ background: colors['primary-soft'], color: colors.primary }}>
            In progress
          </span>
          <span className="text-[12px] font-bold" style={{ color: colors.primary }}>
            View details
          </span>
        </div>
      </div>
    </div>
  );
};

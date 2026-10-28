import React from 'react';

interface Props {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** What it turns on, for screen readers. */
  label: string;
  disabled?: boolean;
}

/** An on/off switch. */
export const Switch: React.FC<Props> = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
      checked ? 'bg-[var(--tm-primary)]' : 'bg-[var(--tm-border-strong)]'
    }`}
  >
    <span
      className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`}
    />
  </button>
);

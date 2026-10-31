import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
  helperText?: string;
  pill?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, helperText, className = '', id, pill: _pill = false, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block pl-1 text-[12px] font-semibold text-[var(--tm-ink-soft)]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={`w-full appearance-none rounded-full border bg-[var(--tm-card)] py-3 pl-5 pr-11
              text-[14px] font-medium text-[var(--tm-ink)] outline-none transition-[border-color,box-shadow]
              duration-[var(--tm-dur-fast)] focus:shadow-glow
              ${
                error
                  ? 'border-[var(--tm-danger)]'
                  : 'border-[var(--tm-border)] hover:border-[var(--tm-border-strong)] focus:border-[var(--tm-primary)]'
              } ${className}`}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--tm-ink-muted)]" />
        </div>
        {error ? (
          <p className="text-[12px] font-medium text-[var(--tm-danger)]">{error}</p>
        ) : helperText ? (
          <p className="text-[12px] text-[var(--tm-ink-muted)]">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = 'Select';

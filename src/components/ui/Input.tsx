import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** Fully rounded, for search fields and inline filters. */
  pill?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { label, error, helperText, leftIcon, rightIcon, className = '', id, pill = false, ...props },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[12px] font-semibold text-[var(--tm-ink-soft)]"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="pointer-events-none absolute left-4 text-[var(--tm-ink-muted)]">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full bg-[var(--tm-card)] px-4 py-3 text-[14px] text-[var(--tm-ink)]
              placeholder:text-[var(--tm-ink-muted)] border transition-colors
              duration-[var(--tm-dur-fast)] outline-none
              ${pill ? 'rounded-full' : 'rounded-[var(--tm-radius-md)]'}
              ${leftIcon ? 'pl-11' : ''} ${rightIcon ? 'pr-11' : ''}
              ${
                error
                  ? 'border-[var(--tm-danger)] focus:border-[var(--tm-danger)]'
                  : 'border-[var(--tm-border)] hover:border-[var(--tm-border-strong)] focus:border-[var(--tm-primary)]'
              } ${className}`}
            aria-invalid={!!error}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-4 text-[var(--tm-ink-muted)]">{rightIcon}</div>
          )}
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

Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const taId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={taId} className="block text-[12px] font-semibold text-[var(--tm-ink-soft)]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={taId}
          className={`w-full rounded-[var(--tm-radius-md)] border bg-[var(--tm-card)] px-4 py-3
            text-[14px] leading-relaxed text-[var(--tm-ink)] outline-none
            placeholder:text-[var(--tm-ink-muted)] transition-colors duration-[var(--tm-dur-fast)]
            ${
              error
                ? 'border-[var(--tm-danger)]'
                : 'border-[var(--tm-border)] hover:border-[var(--tm-border-strong)] focus:border-[var(--tm-primary)]'
            } ${className}`}
          {...props}
        />
        {error ? (
          <p className="text-[12px] font-medium text-[var(--tm-danger)]">{error}</p>
        ) : helperText ? (
          <p className="text-[12px] text-[var(--tm-ink-muted)]">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

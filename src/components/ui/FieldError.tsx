import React from 'react';

/** The red line under a field. Our Input, Select and Textarea draw their own from `error`; use this for anything else. */
export const FieldError: React.FC<{ message?: string; className?: string }> = ({ message, className = '' }) =>
  message ? (
    <p role="alert" className={`mt-1.5 pl-1 text-[12px] font-medium text-[var(--tm-danger)] ${className}`}>
      {message}
    </p>
  ) : null;

/**
 * A box around a field that is not a plain input (a people picker, an editor, a group of choices): it gets the red outline and the
 * message when something is wrong, and is where the page scrolls to (`name` is the key given to useFieldErrors).
 */
export const FieldGroup: React.FC<{ name: string; error?: string; children: React.ReactNode; className?: string }> = ({ name, error, children, className = '' }) => (
  <div data-field={name} className={className}>
    <div data-invalid={error ? 'true' : undefined} className={error ? 'rounded-[var(--tm-radius-md)]' : undefined}>
      {children}
    </div>
    <FieldError message={error} />
  </div>
);

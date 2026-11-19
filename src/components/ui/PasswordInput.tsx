import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from './Input';

/** The app's Input for passwords, with a Show / Hide button. */
export const PasswordInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'rightIcon'>>((props, ref) => {
  const [shown, setShown] = useState(false);
  return (
    <Input
      ref={ref}
      {...props}
      type={shown ? 'text' : 'password'}
      rightIcon={
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          className="flex h-6 w-6 items-center justify-center rounded-full hover:text-[var(--tm-ink)]"
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  );
});
PasswordInput.displayName = 'PasswordInput';

import React from 'react';
import { Check, Circle } from 'lucide-react';
import { PASSWORD_RULES } from '../../utils/passwordRules';

interface PasswordRulesProps {
  password: string;
  /** Shown as a last rule when set: the confirmation field matches. */
  confirm?: string;
}

/** The password rules as a checklist that ticks off while the person types. Takes its colour from the surrounding text. */
export const PasswordRules: React.FC<PasswordRulesProps> = ({ password, confirm }) => {
  const rules = PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(password) }));
  if (confirm !== undefined) rules.push({ id: 'match', label: 'Both passwords match', ok: password.length > 0 && password === confirm });
  return (
    <ul className="space-y-1.5 text-[13px]" aria-label="Password rules" aria-live="polite">
      {rules.map((r) => (
        <li key={r.id} className={`flex items-center gap-2 transition-opacity ${r.ok ? 'font-semibold opacity-100' : 'opacity-60'}`}>
          {r.ok ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <span>
            {r.label}
            <span className="sr-only">{r.ok ? ' — done' : ' — not yet'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
};

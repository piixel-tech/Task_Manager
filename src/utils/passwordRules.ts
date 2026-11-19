/** The rules for a new password when resetting. The server enforces the same ones (backend/app/services/password_reset.py). */
export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'letter', label: 'A letter', test: (p) => /[A-Za-z]/.test(p) },
  { id: 'number', label: 'A number', test: (p) => /\d/.test(p) }
];

export const passwordIsValid = (password: string): boolean => PASSWORD_RULES.every((r) => r.test(password));

/** A random temporary password that passes the rules, e.g. "Kf7m-Qx29-Tn4w". */
export const generatePassword = (): string => {
  const letters = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (chars: string, n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => chars[v % chars.length]).join('');
  return `${pick(letters, 4)}-${pick(letters + digits, 4)}-${pick(digits, 2)}${pick(letters, 2)}`;
};

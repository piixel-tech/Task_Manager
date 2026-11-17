import { useCallback, useEffect, useState } from 'react';
import { goToField } from '../utils/formValidation';

/** The field to bring into view: the fields the person must fix, in the order they appear on the page. */
function firstFieldWithError(keys: string[]): Element | null {
  const els = keys.map((k) => document.querySelector(`[data-field="${k}"]`)).filter((e): e is Element => !!e);
  els.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  return els[0] ?? null;
}

/**
 * Per-field error messages for a form's own checks ("Enter a task name"), shown under each field instead of in a banner.
 *
 *   const f = useFieldErrors<'title' | 'due'>();
 *   if (!title.trim()) return f.fail({ title: 'Enter a task name' });   // several at once: f.fail({ title: …, due: … })
 *   <Input data-field="title" error={f.errors.title} onChange={(e) => { f.clear('title'); … }} />
 *
 * `fail` also scrolls to the first field with a message and puts the cursor in it. Mark each field (or the box around a custom one,
 * see FieldGroup) with `data-field="<key>"`.
 */
export function useFieldErrors<K extends string>() {
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  const [tick, setTick] = useState(0);

  const fail = useCallback((next: Partial<Record<K, string>>) => {
    setErrors(next);
    setTick((t) => t + 1);
  }, []);
  const clear = useCallback((key: K) => setErrors((cur) => (cur[key] ? { ...cur, [key]: undefined } : cur)), []);
  const reset = useCallback(() => setErrors({}), []);

  // Once the messages are on screen, go to the first one.
  useEffect(() => {
    if (!tick) return;
    const keys = Object.entries(errors).filter(([, v]) => !!v).map(([k]) => k);
    const target = firstFieldWithError(keys);
    if (!target) return;
    const inner = target.matches('input, select, textarea') ? target : target.querySelector('input, select, textarea, button, [contenteditable="true"]');
    goToField(inner ?? target);
    if (inner && inner !== target) target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { errors, fail, clear, reset, any: Object.values(errors).some(Boolean) };
}

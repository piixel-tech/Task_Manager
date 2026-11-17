/**
 * Our own form validation messages, in place of the browser's grey pop-ups ("Please fill out this field").
 *
 * `installFormValidation()` is mounted once for the whole app. It switches native validation off on every form (noValidate), and on
 * submit it checks the fields itself, using the same attributes (required, type="email", minLength, min, max, pattern…). Each problem
 * gets a red message right under its field, a red border, and the first one is scrolled to and focused. The message clears as soon as
 * the person edits that field. Because it works from the attributes, every form (current and future) behaves the same.
 */

const MARK = 'data-guard-invalid';
const TEXT_ID = 'data-field-error';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const isControl = (el: unknown): el is Control =>
  el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;

/** The field's name for people: its label, else its aria-label, placeholder or name. */
export function labelOf(el: Control): string {
  const named = el.getAttribute('data-label');
  if (named) return named;
  const fromLabel = Array.from(el.labels ?? [])
    .map((l) => l.textContent ?? '')
    .join(' ');
  const raw = fromLabel || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '';
  return raw
    .replace(/\(optional\)/gi, '')
    .replace(/[*:]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const lower = (s: string) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const PICK_TYPES = new Set(['date', 'time', 'month', 'week', 'datetime-local']);

/** What is wrong with a field, in a short plain sentence. Empty when it is fine. */
export function messageFor(el: Control): string {
  const v = el.validity;
  if (v.valid) return '';
  const label = labelOf(el);
  const name = label ? lower(label) : 'this field';
  const type = el instanceof HTMLInputElement ? el.type : el instanceof HTMLSelectElement ? 'select' : 'textarea';

  if (v.valueMissing) {
    if (type === 'checkbox') return label ? `Tick “${label}” to continue` : 'Tick this box to continue';
    if (type === 'radio') return label ? `Choose an option for “${label}”` : 'Choose an option';
    if (type === 'select') return label ? `Choose an option for “${label}”` : 'Choose an option';
    if (type === 'file') return 'Choose a file';
    if (PICK_TYPES.has(type)) return label ? `Pick ${article(name)} ${name}` : 'Pick a date';
    return label ? `Enter ${article(name)} ${name}` : 'Fill in this field';
  }
  if (v.typeMismatch) {
    if (type === 'email') return 'Enter a valid email address, like name@company.com';
    if (type === 'url') return 'Enter a valid web address, starting with https://';
    return `Check the ${name}`;
  }
  if (v.tooShort) return `${upperFirst(name)} needs at least ${el.getAttribute('minlength')} characters`;
  if (v.tooLong) return `${upperFirst(name)} can be at most ${el.getAttribute('maxlength')} characters`;
  if (v.rangeUnderflow) return PICK_TYPES.has(type) ? `Pick a date on or after ${el.getAttribute('min')}` : `${upperFirst(name)} must be ${el.getAttribute('min')} or more`;
  if (v.rangeOverflow) return PICK_TYPES.has(type) ? `Pick a date on or before ${el.getAttribute('max')}` : `${upperFirst(name)} must be ${el.getAttribute('max')} or less`;
  if (v.patternMismatch) return el.getAttribute('title') || `${upperFirst(name)} isn’t in the right format`;
  if (v.stepMismatch || v.badInput) return 'Enter a valid number';
  if (v.customError && el.validationMessage) return el.validationMessage;
  return `Check the ${name}`;
}

/** Where the message goes: under the field's own box (our inputs wrap theirs in a relative div), or under its label for ticks. */
const anchorOf = (el: Control): Element => {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return el.closest('label') ?? el;
  const parent = el.parentElement;
  return parent && parent.classList.contains('relative') && parent.children.length <= 3 ? parent : el;
};

let counter = 0;

export function clearFieldError(el: Control): void {
  if (!el.hasAttribute(MARK)) return;
  document.getElementById(el.getAttribute('aria-errormessage') ?? '')?.remove();
  el.removeAttribute(MARK);
  el.removeAttribute('data-invalid');
  el.removeAttribute('aria-invalid');
  el.removeAttribute('aria-errormessage');
}

/** Put a message under the field, outline it in red and mark it for screen readers. */
export function showFieldError(el: Control, message: string): void {
  clearFieldError(el);
  // Our own components already draw their error from props (and set aria-invalid): don't draw it twice.
  if (el.getAttribute('aria-invalid') === 'true') return;
  const id = `field-error-${(counter += 1)}`;
  const p = document.createElement('p');
  p.id = id;
  p.setAttribute('role', 'alert');
  p.setAttribute(TEXT_ID, '');
  p.className = 'mt-1.5 pl-1 text-[12px] font-medium text-[var(--tm-danger)]';
  p.textContent = message;
  anchorOf(el).insertAdjacentElement('afterend', p);
  el.setAttribute(MARK, '');
  el.setAttribute('data-invalid', 'true');
  el.setAttribute('aria-invalid', 'true');
  el.setAttribute('aria-errormessage', id);
}

/** The fields of a form that are not valid right now. */
export const invalidControls = (form: HTMLFormElement): Control[] =>
  Array.from(form.elements).filter((c): c is Control => isControl(c) && c.willValidate && !c.disabled && !c.validity.valid);

/** Check a form: show every problem under its field, and return the first field with one (or null). */
export function validateForm(form: HTMLFormElement): Control | null {
  const bad = invalidControls(form);
  bad.forEach((c) => showFieldError(c, messageFor(c)));
  return bad[0] ?? null;
}

/** Bring a field into view and put the cursor in it. */
export function goToField(el: Element): void {
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  if (el instanceof HTMLElement) el.focus({ preventScroll: true });
}

/** Turn native validation off for every form and handle it ourselves. Returns the clean-up. */
export function installFormValidation(): () => void {
  // Native validation runs when a submit button is pressed or Enter is typed, before the submit event: switch it off just before.
  const switchOff = (e: Event) => {
    const form = (e.target as Element | null)?.closest?.('form');
    if (form && !form.noValidate) form.noValidate = true;
  };

  const onSubmit = (e: Event) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    form.noValidate = true;
    const first = validateForm(form);
    if (first) {
      e.preventDefault();
      e.stopPropagation(); // the form's own handler never sees an invalid submit
      goToField(first);
    }
  };

  // Code that asks the browser to check (reportValidity) still gets our message, not the browser's bubble.
  const onInvalid = (e: Event) => {
    if (!isControl(e.target)) return;
    e.preventDefault();
    showFieldError(e.target, messageFor(e.target));
  };

  const onEdit = (e: Event) => {
    if (isControl(e.target)) clearFieldError(e.target);
  };

  document.addEventListener('pointerdown', switchOff, true);
  document.addEventListener('click', switchOff, true);
  document.addEventListener('keydown', switchOff, true);
  document.addEventListener('focusin', switchOff, true);
  document.addEventListener('submit', onSubmit, true);
  document.addEventListener('invalid', onInvalid, true);
  document.addEventListener('input', onEdit, true);
  document.addEventListener('change', onEdit, true);
  return () => {
    document.removeEventListener('pointerdown', switchOff, true);
    document.removeEventListener('click', switchOff, true);
    document.removeEventListener('keydown', switchOff, true);
    document.removeEventListener('focusin', switchOff, true);
    document.removeEventListener('submit', onSubmit, true);
    document.removeEventListener('invalid', onInvalid, true);
    document.removeEventListener('input', onEdit, true);
    document.removeEventListener('change', onEdit, true);
  };
}

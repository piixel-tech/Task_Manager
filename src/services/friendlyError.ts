/**
 * Turns whatever the server (or the network) said into a sentence a person can act on. The API's own messages are mostly
 * already written for people ("Only a pending request can be cancelled") and pass through; the technical ones (status codes,
 * validation jargon, framework errors, stack-trace words) are replaced.
 */

const NETWORK = 'We can’t reach the server. Check your connection and try again.';
const SERVER = 'Something went wrong on our side. Please try again in a moment.';

/** Technical wording that should never reach a person. */
const TECHNICAL = /traceback|internal server error|objectid|pymongo|motor|beanie|mongo|duplicate key|e11000|keyerror|typeerror|undefined|nonetype|validation error|pydantic|stack|exception|errno|econn|socket|axios|status code|json|unexpected token|failed to fetch|networkerror|cors|<html|<!doctype/i;

/** Exact messages the API sends that read badly, with what to say instead. */
const REWRITES: [RegExp, string][] = [
  [/^insufficient permissions\.?$/i, 'You don’t have permission to do that.'],
  [/^not authenticated\.?$/i, 'Your session has ended. Please sign in again.'],
  [/could not validate credentials|invalid (or expired )?token|token (has )?expired|signature has expired/i, 'Your session has ended. Please sign in again.'],
  [/^not found\.?$/i, 'We couldn’t find that. It may have been removed.'],
  [/^method not allowed\.?$/i, 'That isn’t possible right now.'],
  [/^forbidden\.?$/i, 'You don’t have permission to do that.'],
  [/^bad request\.?$/i, 'That didn’t go through. Check what you entered and try again.'],
  [/^conflict\.?$/i, 'That changed while you were working. Refresh and try again.'],
  [/^unprocessable (content|entity)\.?$/i, 'Some of what you entered needs another look.']
];

interface PydanticItem {
  type?: string;
  loc?: (string | number)[];
  msg?: string;
  ctx?: Record<string, unknown>;
}

const prettyField = (loc?: (string | number)[]): string => {
  const name = [...(loc ?? [])].reverse().find((p) => typeof p === 'string' && !['body', 'query', 'path'].includes(p));
  return typeof name === 'string' ? name.replace(/_/g, ' ').replace(/\bid\b/i, '').trim() : '';
};

/** One validation problem from the API, in plain words. */
export function friendlyValidation(item: PydanticItem): string {
  const field = prettyField(item.loc);
  const subject = field ? field : 'this';
  const type = item.type ?? '';
  const ctx = item.ctx ?? {};
  if (type === 'missing') return field ? `Fill in the ${field}.` : 'Something is missing. Check the form and try again.';
  if (type === 'string_too_short' || type === 'too_short') {
    return Number(ctx.min_length) <= 1 ? (field ? `Enter the ${field}.` : 'Fill in the empty field.') : `The ${subject} needs at least ${ctx.min_length} characters.`;
  }
  if (type === 'string_too_long' || type === 'too_long') return `The ${subject} can be at most ${ctx.max_length} characters.`;
  if (type.startsWith('int_') || type.startsWith('float_') || type === 'int_parsing') return `Enter a valid number for the ${subject}.`;
  if (type.includes('email')) return 'Enter a valid email address.';
  if (type.startsWith('greater_than') || type.startsWith('less_than')) return `The ${subject} is outside the allowed range.`;
  if (type.includes('url')) return 'Enter a valid web address.';
  if (type.includes('date') || type.includes('time')) return `Pick a valid ${field && /date|time/.test(field) ? field : 'date'}.`;
  if (type === 'value_error' || type === 'assertion_error') {
    // "Value error, The end date cannot be before the start date": the part after the comma was written for people
    const text = (item.msg ?? '').replace(/^(value|assertion) error,?\s*/i, '').trim();
    if (text && !TECHNICAL.test(text)) return /[.!?]$/.test(text) ? text : `${text}.`;
  }
  return 'Some of what you entered needs another look.';
}

const byStatus = (status: number): string => {
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 403) return 'You don’t have permission to do that.';
  if (status === 404) return 'We couldn’t find that. It may have been removed.';
  if (status === 408) return 'That took too long. Please try again.';
  if (status === 409) return 'That changed while you were working. Refresh and try again.';
  if (status === 413) return 'That file is too large.';
  if (status === 422) return 'Some of what you entered needs another look.';
  if (status === 429) return 'Too many tries in a row. Wait a moment and try again.';
  if (status >= 500) return SERVER;
  return '';
};

/** A message the API wrote: kept when it reads like a sentence for people, replaced when it is technical. */
function cleanDetail(text: string, status: number | undefined, fallback: string): string {
  const t = text.trim();
  if (!t) return (status && byStatus(status)) || fallback;
  for (const [pattern, say] of REWRITES) if (pattern.test(t)) return say;
  if (TECHNICAL.test(t) || t.length > 240) return (status && byStatus(status)) || fallback;
  return t;
}

/**
 * The friendly message for an error. `status` and `detail` come from the API response; with no response the network is down.
 * `fallback` is what to say when nothing better can be told ("Could not save the task").
 */
export function friendlyMessage(input: { status?: number; detail?: unknown; networkDown?: boolean; message?: string }, fallback = 'Something went wrong. Please try again.'): string {
  if (input.networkDown) return NETWORK;
  const { status, detail } = input;
  if (typeof detail === 'string') return cleanDetail(detail, status, fallback);
  if (detail && !Array.isArray(detail) && typeof detail === 'object' && typeof (detail as { message?: unknown }).message === 'string') {
    return cleanDetail((detail as { message: string }).message, status, fallback);
  }
  if (Array.isArray(detail) && detail.length > 0) return friendlyValidation(detail[0] as PydanticItem);
  if (status) return byStatus(status) || fallback;
  if (input.message) return cleanDetail(input.message, undefined, fallback);
  return fallback;
}

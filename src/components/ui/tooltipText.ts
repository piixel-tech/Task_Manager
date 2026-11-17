/**
 * What an icon-only control's tooltip says: its name, verb first, 1 to 4 words, plus its keyboard shortcut when it has one.
 * The text comes from the control itself (`data-tooltip`, else `aria-label`, else `title`) and is tidied here, so a label written
 * for a screen reader ("Previous month", "Emoji") reads as an action ("Show previous month", "Add emoji").
 */

export const MAX_WORDS = 4;

/** Names that are nouns, rewritten as actions. Keys are lower case. */
const REWRITE: Record<string, string> = {
  emoji: 'Add emoji',
  bold: 'Make bold',
  italic: 'Make italic',
  underline: 'Underline text',
  strikethrough: 'Strike through',
  link: 'Add link',
  quote: 'Add quote',
  'bulleted list': 'Add bulleted list',
  'numbered list': 'Add numbered list',
  'inline code': 'Mark as code',
  'code block': 'Add code block',
  menu: 'Open menu',
  'toggle menu': 'Open menu',
  'account menu': 'Open account menu',
  notifications: 'Open notifications',
  calendar: 'Open calendar',
  settings: 'Open settings',
  home: 'Go home',
  back: 'Go back',
  'back to chats': 'Go back to chats',
  'group info': 'View group info',
  filters: 'Filter results',
  react: 'Add reaction',
  'add a reaction': 'Add reaction',
  'focus mode': 'Set focus mode',
  attach: 'Attach file',
  'attach files, drive files or create a google doc or sheet': 'Attach or create file',
  send: 'Send message',
  'record a voice note': 'Record voice note',
  'message actions': 'Open message actions',
  'message info': 'View message info',
  'scheduled messages': 'View scheduled messages',
  'messages that mention me': 'Show my mentions',
  'new group': 'Create new group',
  'new project': 'Create new project',
  'request client approval': 'Request approval',
  'go to the pinned message': 'Go to pinned message',
  'choose a month': 'Choose a month',
  search: 'Search',
  'what is this?': 'Explain this',
  'open photo': 'Open photo',
  'enlarge photo': 'Enlarge photo'
};

/** Words that already start an action: the label is kept as written. */
const VERBS = new Set(
  [
    'add', 'attach', 'cancel', 'choose', 'clear', 'close', 'copy', 'create', 'delete', 'discard', 'dismiss', 'download', 'edit', 'enlarge',
    'expand', 'collapse', 'explain', 'filter', 'go', 'hide', 'invite', 'make', 'mark', 'move', 'open', 'pause', 'pick', 'pin', 'play', 'record',
    'reload', 'remind', 'remove', 'rename', 'request', 'reset', 'resume', 'revoke', 'save', 'search', 'select', 'send', 'set', 'show', 'sort',
    'start', 'stop', 'toggle', 'unpin', 'upload', 'view', 'zoom', 'refresh', 'retry', 'undo', 'apply', 'sign', 'log', 'join', 'leave', 'share'
  ]
);

/** Keyboard shortcuts, by the finished tooltip text. */
const SHORTCUT: Record<string, string> = {
  Search: 'Ctrl K',
  'Make bold': 'Ctrl B',
  'Make italic': 'Ctrl I',
  'Underline text': 'Ctrl U',
  'Add link': 'Ctrl K',
  'Send message': 'Enter',
  Close: 'Esc',
  'Close preview': 'Esc',
  'Close dialog': 'Esc',
  'Close menu': 'Esc',
  'Show previous file': '←',
  'Show next file': '→'
};

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The finished tooltip for a control's raw name; `shortcut` is empty when there is none. */
export function tooltipFor(raw: string, shortcut = ''): { text: string; shortcut: string } {
  const clean = raw.replace(/\s+/g, ' ').replace(/[….]+$/, '').trim();
  const key = clean.toLowerCase();
  let text = REWRITE[key];
  if (!text) {
    const first = key.split(' ')[0];
    if (/^(previous|next)\b/.test(key)) text = `Show ${key}`;
    else if (VERBS.has(first)) text = clean;
    else if (first === 'new') text = `Create ${key}`;
    else text = `Open ${key}`;
  }
  const words = text.split(' ');
  if (words.length > MAX_WORDS) text = words.slice(0, MAX_WORDS).join(' ');
  text = sentence(text);
  return { text, shortcut: shortcut || SHORTCUT[text] || '' };
}

import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';

const TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'span'];
const ATTRS = ['href', 'target', 'rel', 'class', 'data-type', 'data-id', 'data-label'];

// Links in messages always open in a new tab and don't hand the page a way back.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }
});

/** Clean HTML for display (the server already cleans it; this is the second lock on the door). */
export function safeHtml(html: string, meId?: string): string {
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATTRS, ALLOW_DATA_ATTR: false });
  // Mark mentions of the viewer so they can stand out.
  return meId && /^[0-9a-f]{24}$/.test(meId) ? clean.split(`data-id="${meId}"`).join(`data-id="${meId}" data-me="true"`) : clean;
}

interface Props {
  html: string;
  /** Mentions of this person are highlighted. */
  meId?: string;
  className?: string;
}

/** Shows rich text from the editor. Older plain-text messages don't use this. */
export const RichText: React.FC<Props> = ({ html, meId, className = '' }) => {
  const clean = useMemo(() => safeHtml(html, meId), [html, meId]);
  return <div className={`rich-content break-words text-[14px] leading-snug ${className}`} dangerouslySetInnerHTML={{ __html: clean }} />;
};

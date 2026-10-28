import React, { Suspense, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import { Bold, Braces, Code, Italic, Link2, List, ListOrdered, Quote, Smile, Strikethrough, Underline as UnderlineIcon } from 'lucide-react';

const EmojiPicker = React.lazy(() => import('emoji-picker-react'));

export interface MentionPerson {
  id: string;
  name: string;
  role?: string;
}

export interface RichEditorHandle {
  clear: () => void;
  focus: () => void;
  isEmpty: () => boolean;
  /** Sanitized on the server; this is what the editor produced. */
  html: () => string;
  setHtml: (html: string) => void;
}

interface Props {
  /** Starting content. Change the component's `key` to load something else. */
  initialHtml?: string;
  placeholder?: string;
  /** Who the @ picker offers. Leave out for no mentions. */
  people?: MentionPerson[];
  onChange?: (state: { html: string; empty: boolean }) => void;
  /** Called on Enter (Shift+Enter makes a new line). Leave out for a multi-line field with a button elsewhere. */
  onSubmit?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Controls at the left and right of the bottom row (attach, voice note, send...). */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Tallest the writing area grows before it scrolls. */
  maxHeightClass?: string;
  label?: string;
}

const MAX_SUGGESTIONS = 6;

const normalizeUrl = (raw: string): string => {
  const url = raw.trim();
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(url)) return `mailto:${url}`;
  return `https://${url}`;
};

/** A small popup list for @mentions, drawn by hand so it needs no extra library. */
function mentionPopup() {
  let box: HTMLDivElement | null = null;
  let items: MentionPerson[] = [];
  let index = 0;
  let pick: ((p: MentionPerson) => void) | null = null;

  const draw = (rect: DOMRect | null) => {
    if (!box) return;
    box.replaceChildren(
      ...items.map((p, i) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.setAttribute('role', 'option');
        row.className = `flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] font-semibold ${
          i === index ? 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]' : 'text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]'
        }`;
        row.textContent = p.name + (p.role === 'client' ? ' (client)' : '');
        row.onmousedown = (e) => {
          e.preventDefault(); // keep the editor focused
          pick?.(p);
        };
        return row;
      })
    );
    if (items.length === 0) {
      const none = document.createElement('div');
      none.className = 'px-3 py-2 text-[12.5px] text-[var(--tm-ink-muted)]';
      none.textContent = 'No one matches';
      box.append(none);
    }
    if (rect) {
      box.style.left = `${Math.min(rect.left, window.innerWidth - 240)}px`;
      box.style.top = `${rect.top - box.offsetHeight - 6}px`; // above the caret: the composer sits at the bottom
    }
  };

  return {
    onStart: (props: SuggestionProps<MentionPerson>) => {
      box = document.createElement('div');
      box.setAttribute('role', 'listbox');
      box.setAttribute('aria-label', 'Mention someone');
      box.className = 'fixed z-[60] w-56 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-card)] p-1 shadow-soft-lg';
      document.body.append(box);
      items = props.items;
      index = 0;
      pick = (p) => props.command({ id: p.id, label: p.name } as never);
      draw(props.clientRect?.() ?? null);
    },
    onUpdate: (props: SuggestionProps<MentionPerson>) => {
      items = props.items;
      index = Math.min(index, Math.max(items.length - 1, 0));
      pick = (p) => props.command({ id: p.id, label: p.name } as never);
      draw(props.clientRect?.() ?? null);
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      const { key } = props.event;
      if (key === 'Escape') return false;
      if (items.length === 0) return false;
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        index = (index + (key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        draw(null);
        return true;
      }
      if (key === 'Enter' || key === 'Tab') {
        pick?.(items[index]);
        return true;
      }
      return false;
    },
    onExit: () => {
      box?.remove();
      box = null;
    }
  };
}

/**
 * The rich message box shared across the app: bold, italic, underline, strike, links, lists, quotes, code,
 * emoji and @mentions. It produces HTML; the server cleans it again before storing, and RichText shows it safely.
 */
export const RichEditor = forwardRef<RichEditorHandle, Props>(function RichEditor(
  { initialHtml = '', placeholder = 'Type a message', people, onChange, onSubmit, autoFocus, disabled, leading, trailing, maxHeightClass = 'max-h-40', label = 'Message' },
  ref
) {
  const peopleRef = useRef(people);
  const submitRef = useRef(onSubmit);
  const changeRef = useRef(onChange);
  const editorRef = useRef<Editor | null>(null);
  const suggesting = useRef(false);
  peopleRef.current = people;
  submitRef.current = onSubmit;
  changeRef.current = onChange;

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);

  const editor = useEditor({
    content: initialHtml,
    autofocus: autoFocus ? 'end' : false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } }
      }),
      Placeholder.configure({ placeholder }),
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: {
          char: '@',
          items: ({ query }: { query: string }) => {
            const q = query.trim().toLowerCase();
            return (peopleRef.current ?? []).filter((p) => p.name.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS);
          },
          render: () => {
            const popup = mentionPopup();
            return {
              onStart: (p: SuggestionProps<MentionPerson>) => {
                suggesting.current = true;
                popup.onStart(p);
              },
              onUpdate: popup.onUpdate,
              onKeyDown: popup.onKeyDown,
              onExit: () => {
                suggesting.current = false;
                popup.onExit();
              }
            };
          }
        }
      })
    ],
    editorProps: {
      attributes: { class: 'rich-content tiptap min-h-[24px] outline-none text-[14px] leading-snug text-[var(--tm-ink)]', role: 'textbox', 'aria-multiline': 'true', 'aria-label': label },
      handleKeyDown: (_view, e) => {
        if (e.key !== 'Enter' || e.isComposing || !submitRef.current) return false;
        const ed = editorRef.current;
        const inBlock = !!ed && (ed.isActive('bulletList') || ed.isActive('orderedList') || ed.isActive('codeBlock'));
        if (e.ctrlKey || e.metaKey || (!e.shiftKey && !suggesting.current && !inBlock)) {
          e.preventDefault();
          submitRef.current();
          return true;
        }
        return false;
      }
    },
    onUpdate: ({ editor: ed }) => changeRef.current?.({ html: ed.getHTML(), empty: ed.isEmpty })
  });
  editorRef.current = editor;

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        editor?.commands.clearContent(true);
        changeRef.current?.({ html: '', empty: true });
      },
      focus: () => editor?.commands.focus('end'),
      isEmpty: () => !editor || editor.isEmpty,
      html: () => editor?.getHTML() ?? '',
      setHtml: (html) => editor?.commands.setContent(html, { emitUpdate: true })
    }),
    [editor]
  );

  const active = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: !!ed?.isActive('bold'),
      italic: !!ed?.isActive('italic'),
      underline: !!ed?.isActive('underline'),
      strike: !!ed?.isActive('strike'),
      link: !!ed?.isActive('link'),
      bullet: !!ed?.isActive('bulletList'),
      ordered: !!ed?.isActive('orderedList'),
      quote: !!ed?.isActive('blockquote'),
      code: !!ed?.isActive('code'),
      codeBlock: !!ed?.isActive('codeBlock')
    })
  });

  if (!editor) return null;

  const applyLink = () => {
    const url = linkUrl.trim();
    const chain = editor.chain().focus();
    if (!url) {
      chain.extendMarkRange('link').unsetLink().run();
    } else if (editor.state.selection.empty && !editor.isActive('link')) {
      const href = normalizeUrl(url);
      chain.insertContent(`<a href="${href.replace(/"/g, '&quot;')}">${url.replace(/</g, '&lt;')}</a> `).run();
    } else {
      chain.extendMarkRange('link').setLink({ href: normalizeUrl(url) }).run();
    }
    setLinkOpen(false);
    setLinkUrl('');
  };

  const buttons: { label: string; icon: React.ReactNode; on: boolean; run: () => void }[] = [
    { label: 'Bold', icon: <Bold className="h-4 w-4" />, on: active.bold, run: () => editor.chain().focus().toggleBold().run() },
    { label: 'Italic', icon: <Italic className="h-4 w-4" />, on: active.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Underline', icon: <UnderlineIcon className="h-4 w-4" />, on: active.underline, run: () => editor.chain().focus().toggleUnderline().run() },
    { label: 'Strikethrough', icon: <Strikethrough className="h-4 w-4" />, on: active.strike, run: () => editor.chain().focus().toggleStrike().run() },
    {
      label: 'Link',
      icon: <Link2 className="h-4 w-4" />,
      on: active.link,
      run: () => {
        setLinkUrl(editor.getAttributes('link').href ?? '');
        setLinkOpen((o) => !o);
        setEmojiOpen(false);
      }
    },
    { label: 'Bulleted list', icon: <List className="h-4 w-4" />, on: active.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
    { label: 'Numbered list', icon: <ListOrdered className="h-4 w-4" />, on: active.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: 'Quote', icon: <Quote className="h-4 w-4" />, on: active.quote, run: () => editor.chain().focus().toggleBlockquote().run() },
    { label: 'Inline code', icon: <Code className="h-4 w-4" />, on: active.code, run: () => editor.chain().focus().toggleCode().run() },
    { label: 'Code block', icon: <Braces className="h-4 w-4" />, on: active.codeBlock, run: () => editor.chain().focus().toggleCodeBlock().run() }
  ];

  return (
    <div className="relative rounded-2xl border border-[var(--tm-border)] bg-[var(--tm-bg)] focus-within:border-[var(--tm-primary)]">
      <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 overflow-x-auto border-b border-[var(--tm-border)] px-2 py-1">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            title={b.label}
            aria-label={b.label}
            aria-pressed={b.on}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()} // don't steal the selection from the editor
            onClick={b.run}
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${
              b.on ? 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]' : 'text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)]'
            }`}
          >
            {b.icon}
          </button>
        ))}
        <button
          type="button"
          title="Emoji"
          aria-label="Emoji"
          aria-expanded={emojiOpen}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setEmojiOpen((o) => !o);
            setLinkOpen(false);
          }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)]"
        >
          <Smile className="h-4 w-4" />
        </button>
      </div>

      {linkOpen && (
        <form
          className="flex items-center gap-2 border-b border-[var(--tm-border)] px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Paste a web address"
            aria-label="Link address"
            className="min-w-0 flex-1 rounded-lg border border-[var(--tm-border)] bg-[var(--tm-card)] px-3 py-1.5 text-[13px] outline-none focus:border-[var(--tm-primary)]"
          />
          <button type="submit" className="rounded-lg bg-[var(--tm-primary)] px-3 py-1.5 text-[12.5px] font-bold text-[var(--tm-on-primary)]">
            {linkUrl.trim() ? 'Apply' : 'Remove'}
          </button>
        </form>
      )}

      {emojiOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-2">
          <Suspense fallback={<div className="rounded-xl border border-[var(--tm-border)] bg-[var(--tm-card)] p-4 text-[12px]">Loading emoji…</div>}>
            <EmojiPicker
              width={320}
              height={380}
              lazyLoadEmojis
              previewConfig={{ showPreview: false }}
              onEmojiClick={(e) => {
                editor.chain().focus().insertContent(e.emoji).run();
              }}
            />
          </Suspense>
        </div>
      )}

      <div className={`${maxHeightClass} overflow-y-auto px-3.5 py-2.5`} onClick={() => editor.commands.focus()}>
        <EditorContent editor={editor} />
      </div>

      {(leading || trailing) && (
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <div className="flex items-center gap-1">{leading}</div>
          <div className="flex items-center gap-1">{trailing}</div>
        </div>
      )}
    </div>
  );
});

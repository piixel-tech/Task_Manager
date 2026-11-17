import { describe, expect, it } from 'vitest';

/**
 * In-app guidance rules, checked against the source so a new page cannot slip past them:
 *  - every page header carries a line saying what the page is for,
 *  - every such line (page headers and card subtitles) is under 12 words.
 */
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

// Every source file of the app as text (Vite reads them; tests are left out).
const raw = import.meta.glob(['/src/**/*.tsx', '!/src/**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const ALL = Object.entries(raw).map(([path, text]) => ({ path: path.replace(/^\//, ''), text }));

describe('guidance lines', () => {
  it('reads the app’s source files', () => {
    expect(ALL.length).toBeGreaterThan(100);
  });

  it('gives every page header a description', () => {
    const missing: string[] = [];
    for (const { path, text } of ALL) {
      if (path.endsWith('components/ui/PageHeader.tsx')) continue;
      for (const m of text.matchAll(/<PageHeader\b[\s\S]*?\n\s*\/>|<PageHeader\b[^>]*?\/>/g)) {
        if (!/\bdescription=/.test(m[0])) missing.push(path);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps every subtitle under 12 words', () => {
    const tooLong: string[] = [];
    const check = (path: string, line: string) => {
      if (words(line) > 11) tooLong.push(`${path}: ${line}`);
    };
    for (const { path, text } of ALL) {
      // description="…" (not on dialogs or empty states, which explain at more length)
      for (const m of text.matchAll(/description=(?:"([^"]*)"|\{'([^']*)'\}|\{`([^`$]*)`\})/g)) {
        const before = text.slice(Math.max(0, (m.index ?? 0) - 160), m.index);
        if (/<(Modal|EmptyState|ConfirmDialog)\b/.test(before)) continue;
        check(path, m[1] ?? m[2] ?? m[3] ?? '');
      }
      // <CardDescription>…</CardDescription>: each quoted sentence in a conditional counts on its own
      for (const m of text.matchAll(/<CardDescription[^>]*>([\s\S]*?)<\/CardDescription>/g)) {
        const body = m[1];
        const quoted = [...body.matchAll(/'([^']{3,})'|"([^"]{3,})"/g)].map((q) => q[1] ?? q[2]);
        if (quoted.length > 0) quoted.forEach((q) => check(path, q));
        else check(path, body.replace(/\s+/g, ' '));
      }
    }
    expect(tooLong).toEqual([]);
  });
});

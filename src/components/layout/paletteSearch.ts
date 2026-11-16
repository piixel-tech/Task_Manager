export type ResultKind = 'task' | 'project' | 'person' | 'office' | 'page';

export interface Result {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle?: string;
  status?: string;
  path: string;
  avatarName?: string;
  /** Everything about the item that a search should find (never shown). */
  haystack: string;
}

/** Lower case, accents removed, spaces squeezed: "Café  Menü" and "cafe menu" are the same text. */
export const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const tokens = (query: string): string[] => normalize(query).split(' ').filter(Boolean);

/** Every word of the query must appear somewhere in the text, in any order, as the start or the middle of a word (so "ho" finds "Homepage" and "photo"). */
export const matchesQuery = (haystack: string, query: string): boolean => {
  const words = tokens(query);
  if (words.length === 0) return true;
  const text = normalize(haystack);
  return words.every((w) => text.includes(w));
};

/** Lower is better: title starts with the query, then a word in the title starts with it, then anywhere in the title, then elsewhere. */
export const score = (r: Pick<Result, 'title' | 'subtitle'>, query: string): number => {
  const q = normalize(query);
  if (!q) return 0;
  const title = normalize(r.title);
  if (title.startsWith(q)) return 0;
  if (title.split(' ').some((w) => w.startsWith(q))) return 1;
  if (title.includes(q)) return 2;
  if (tokens(query).every((w) => title.includes(w))) return 3;
  if (r.subtitle && normalize(r.subtitle).includes(q)) return 4;
  return 5;
};

export const searchResults = (all: Result[], query: string): Result[] =>
  query.trim()
    ? all
        .filter((r) => matchesQuery(`${r.title} ${r.subtitle ?? ''} ${r.status ?? ''} ${r.haystack}`, query))
        .map((r, i) => ({ r, s: score(r, query), i }))
        .sort((a, b) => a.s - b.s || a.i - b.i)
        .map((x) => x.r)
    : all;

/** With a query show plenty of each kind; with none, a short taste of each. */
export const capPerKind = (rs: Result[], perKind: number): Result[] => {
  const seen = new Map<ResultKind, number>();
  return rs.filter((r) => {
    const n = (seen.get(r.kind) ?? 0) + 1;
    seen.set(r.kind, n);
    return n <= perKind;
  });
};

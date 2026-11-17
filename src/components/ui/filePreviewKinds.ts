/** What the shared file preview can show, worked out from a file's name and type. */
export type PreviewKind = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'csv' | 'docx' | 'xlsx' | 'none';

const ext = (name: string): string => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'json', 'log', 'xml', 'yaml', 'yml', 'ini', 'conf', 'env', 'html', 'css', 'js', 'ts', 'tsx', 'jsx', 'py', 'sql', 'sh', 'rtf']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'weba']);

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const kindOfFile = (f: { name: string; mime: string }): PreviewKind => {
  const mime = (f.mime || '').toLowerCase();
  const e = ext(f.name);
  if (mime === 'application/pdf' || e === 'pdf') return 'pdf';
  if (mime.startsWith('image/') || IMAGE_EXT.has(e)) return 'image';
  // The file's own type wins: a voice note is audio/webm, a screen recording video/webm.
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/') || VIDEO_EXT.has(e)) return 'video';
  if (AUDIO_EXT.has(e)) return 'audio';
  if (mime === 'text/csv' || e === 'csv') return 'csv';
  if (mime === DOCX_MIME || e === 'docx') return 'docx';
  if (mime === XLSX_MIME || e === 'xlsx') return 'xlsx';
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml' || TEXT_EXT.has(e)) return 'text';
  return 'none';
};

/** A type the browser can show on its own in a new tab (so "Open in new tab" never ends up as a download). */
export const opensInTab = (kind: PreviewKind): boolean => kind === 'image' || kind === 'pdf' || kind === 'video' || kind === 'audio' || kind === 'text';

/** The type to give the downloaded bytes when the server's own is missing or too generic. */
export const mimeFor = (f: { name: string; mime: string }, kind: PreviewKind): string => {
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'text') return 'text/plain;charset=utf-8';
  if (f.mime && f.mime !== 'application/octet-stream') return f.mime;
  return 'application/octet-stream';
};

/** Comma-separated values with quotes ("a, b", "say ""hi"""), as rows of cells. Blank lines are skipped. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) endCell();
    else if (c === '\n') endRow();
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

/** Picks the delimiter that splits the first line the most: comma, semicolon or tab. */
export const guessDelimiter = (text: string): string => {
  const first = text.split('\n', 1)[0] ?? '';
  const count = (d: string) => first.split(d).length;
  return [',', ';', '\t'].reduce((best, d) => (count(d) > count(best) ? d : best), ',');
};

export const formatBytes = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

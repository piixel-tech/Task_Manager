import { describe, expect, it } from 'vitest';
import { guessDelimiter, kindOfFile, mimeFor, opensInTab, parseCsv } from './filePreviewKinds';

const kind = (name: string, mime = '') => kindOfFile({ name, mime });

describe('what the preview can show', () => {
  it('tells the kinds apart by type, falling back to the extension', () => {
    expect(kind('a.png', 'image/png')).toBe('image');
    expect(kind('scan', 'image/jpeg')).toBe('image');
    expect(kind('photo.JPG', 'application/octet-stream')).toBe('image');
    expect(kind('brief.pdf', 'application/pdf')).toBe('pdf');
    expect(kind('brief.pdf')).toBe('pdf');
    expect(kind('clip.mp4', 'video/mp4')).toBe('video');
    expect(kind('note.mp3', 'audio/mpeg')).toBe('audio');
    expect(kind('voice.webm', 'audio/webm')).toBe('audio');
    expect(kind('data.csv', 'text/csv')).toBe('csv');
    expect(kind('report.docx')).toBe('docx');
    expect(kind('budget.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('xlsx');
    expect(kind('readme.md', 'text/markdown')).toBe('text');
    expect(kind('config.json', 'application/json')).toBe('text');
  });

  it('says "none" for what it cannot show, so those get a download card', () => {
    expect(kind('deck.pptx')).toBe('none');
    expect(kind('old.doc', 'application/msword')).toBe('none');
    expect(kind('old.xls')).toBe('none');
    expect(kind('bundle.zip', 'application/zip')).toBe('none');
    expect(kind('thing', 'application/octet-stream')).toBe('none');
  });

  it('only offers "Open in new tab" for what a browser shows by itself', () => {
    expect((['image', 'pdf', 'video', 'audio', 'text'] as const).every((k) => opensInTab(k))).toBe(true);
    expect((['csv', 'docx', 'xlsx', 'none'] as const).some((k) => opensInTab(k))).toBe(false);
  });

  it('gives PDFs and text a type the browser will display', () => {
    expect(mimeFor({ name: 'a.pdf', mime: 'application/octet-stream' }, 'pdf')).toBe('application/pdf');
    expect(mimeFor({ name: 'a.txt', mime: '' }, 'text')).toContain('text/plain');
    expect(mimeFor({ name: 'a.png', mime: 'image/png' }, 'image')).toBe('image/png');
  });
});

describe('parseCsv', () => {
  it('splits rows and cells, and handles quotes', () => {
    const csv = ['name,notes', 'Ada,"likes, commas"', 'Bo,"say ""hi"""', ''].join('\n');
    expect(parseCsv(csv)).toEqual([
      ['name', 'notes'],
      ['Ada', 'likes, commas'],
      ['Bo', 'say "hi"']
    ]);
  });

  it('copes with Windows line endings, blank lines and a missing final newline', () => {
    expect(parseCsv('a,b\r\n\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ]);
  });

  it('keeps a newline inside quotes in the cell', () => {
    expect(parseCsv('a,"two\nlines"\n')).toEqual([['a', 'two\nlines']]);
  });

  it('guesses semicolons and tabs', () => {
    expect(guessDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(guessDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(guessDelimiter('a,b,c')).toBe(',');
    expect(parseCsv('a;b\n1;2', guessDelimiter('a;b\n1;2'))).toEqual([
      ['a', 'b'],
      ['1', '2']
    ]);
  });
});

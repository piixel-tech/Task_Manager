import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, ExternalLink, File as FileIcon, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Presentation, X, ZoomIn, ZoomOut } from 'lucide-react';
import { api } from '../../services/api';
import { assetApi } from '../../services/http/taskApi';
import { usePreviewStore, type PreviewFile } from '../../store/usePreviewStore';
import { toast } from '../../store/useToastStore';
import { formatDate } from '../../utils/time';
import { Button } from './Button';
import { formatBytes, guessDelimiter, kindOfFile, mimeFor, opensInTab, parseCsv, type PreviewKind } from './filePreviewKinds';

const TEXT_LIMIT = 500_000; // characters shown for a text file
const ROW_LIMIT = 500;
const COL_LIMIT = 40;
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

const KIND_ICON: Record<PreviewKind, React.ElementType> = {
  image: FileImage,
  pdf: FileText,
  video: FileVideo,
  audio: FileAudio,
  text: FileText,
  csv: FileSpreadsheet,
  docx: FileText,
  xlsx: FileSpreadsheet,
  none: FileIcon
};

/** What the preview holds once the bytes have arrived. */
type Loaded = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; blob: Blob; url: string };

const readText = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('Could not read the file'));
    r.readAsText(blob);
  });

/** The cells of a table (CSV or Excel sheet): a capped grid, with a note when it was cut. */
const Table: React.FC<{ rows: string[][] }> = ({ rows }) => {
  const shown = rows.slice(0, ROW_LIMIT).map((r) => r.slice(0, COL_LIMIT));
  const cut = rows.length > ROW_LIMIT || rows.some((r) => r.length > COL_LIMIT);
  if (shown.length === 0) return <p className="p-6 text-center text-[13px] text-[var(--tm-ink-muted)]">This sheet is empty.</p>;
  return (
    <div className="p-4">
      <table className="min-w-full border-separate border-spacing-0 text-left text-[12.5px]">
        <tbody>
          {shown.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => {
                const head = i === 0;
                const Cell = head ? 'th' : 'td';
                return (
                  <Cell
                    key={j}
                    className={`border-b border-r border-[var(--tm-border)] px-3 py-1.5 align-top ${
                      head ? 'sticky top-0 bg-[var(--tm-card-muted)] font-bold text-[var(--tm-ink)]' : 'bg-[var(--tm-card)] text-[var(--tm-ink-soft)]'
                    }`}
                  >
                    {cell}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {cut && <p className="mt-3 text-[12px] text-[var(--tm-ink-muted)]">Showing the first {ROW_LIMIT} rows and {COL_LIMIT} columns. Download the file to see everything.</p>}
    </div>
  );
};

const Message: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid h-full min-h-[240px] place-items-center p-6 text-center text-[13.5px] text-[var(--tm-ink-soft)]">{children}</div>
);

/** A clean card for a file that cannot be previewed here: the icon, the name and a Download button. */
const FileCard: React.FC<{ file: PreviewFile; kind: PreviewKind; reason: string; onDownload: () => void; busy: boolean }> = ({ file, kind, reason, onDownload, busy }) => {
  const Icon = kind === 'none' && /\.pptx?$/i.test(file.name) ? Presentation : KIND_ICON[kind];
  return (
    <div className="grid h-full min-h-[280px] place-items-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-[var(--tm-radius-card)] bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]">
          <Icon className="h-9 w-9" />
        </span>
        <p className="break-all text-[15px] font-bold text-[var(--tm-ink)]">{file.name}</p>
        <p className="text-[12.5px] text-[var(--tm-ink-muted)]">{formatBytes(file.size)}</p>
        <p className="text-[13px] text-[var(--tm-ink-soft)]">{reason}</p>
        <Button onClick={onDownload} isLoading={busy} leftIcon={<Download className="h-4 w-4" />}>
          Download
        </Button>
      </div>
    </div>
  );
};

/** Word documents, drawn in the page by docx-preview (loaded only when one is opened). */
const DocxView: React.FC<{ blob: Blob; onFail: (m: string) => void }> = ({ blob, onFail }) => {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        if (live && host.current) {
          host.current.innerHTML = '';
          await renderAsync(blob, host.current, undefined, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true });
        }
      } catch {
        if (live) onFail('This Word file could not be shown here.');
      }
    })();
    return () => {
      live = false;
    };
  }, [blob, onFail]);
  return <div ref={host} className="docx-host min-h-full overflow-auto bg-[var(--tm-bg-sunken)] p-4" aria-label="Document" />;
};

/** Excel workbooks as tables, one tab per sheet (read-excel-file, loaded only when one is opened). */
const XlsxView: React.FC<{ blob: Blob; onFail: (m: string) => void }> = ({ blob, onFail }) => {
  const [sheets, setSheets] = useState<{ sheet: string; data: string[][] }[] | null>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const readExcelFile = (await import('read-excel-file/browser')).default;
        const result = await readExcelFile(blob);
        if (!live) return;
        const cell = (v: unknown): string => (v == null ? '' : v instanceof Date ? v.toLocaleDateString() : String(v));
        setSheets(result.map((s) => ({ sheet: s.sheet, data: s.data.map((row) => row.map(cell)) })));
      } catch {
        if (live) onFail('This Excel file could not be shown here.');
      }
    })();
    return () => {
      live = false;
    };
  }, [blob, onFail]);
  if (!sheets) return <Message>Opening the workbook…</Message>;
  return (
    <div>
      {sheets.length > 1 && (
        <div role="tablist" aria-label="Sheets" className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-[var(--tm-border)] bg-[var(--tm-card)] px-3 py-2">
          {sheets.map((s, i) => (
            <button
              key={s.sheet}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`shrink-0 rounded-full px-3 py-1 text-[12.5px] font-semibold ${i === active ? 'bg-[var(--tm-ink)] text-[var(--tm-card)]' : 'text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)]'}`}
            >
              {s.sheet}
            </button>
          ))}
        </div>
      )}
      <Table rows={sheets[active]?.data ?? []} />
    </div>
  );
};

/** Text and CSV, read from the downloaded bytes. */
const TextView: React.FC<{ blob: Blob; csv: boolean; onFail: (m: string) => void }> = ({ blob, csv, onFail }) => {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    readText(blob)
      .then((t) => live && setText(t))
      .catch(() => live && onFail('This file could not be read.'));
    return () => {
      live = false;
    };
  }, [blob, onFail]);
  const rows = useMemo(() => (csv && text != null ? parseCsv(text, guessDelimiter(text)) : null), [csv, text]);
  if (text == null) return <Message>Opening the file…</Message>;
  if (rows) return <Table rows={rows} />;
  const cut = text.length > TEXT_LIMIT;
  return (
    <div className="p-4">
      <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-[var(--tm-ink)]">{cut ? text.slice(0, TEXT_LIMIT) : text}</pre>
      {cut && <p className="mt-3 text-[12px] text-[var(--tm-ink-muted)]">Showing the first part of the file. Download it to read the rest.</p>}
    </div>
  );
};

/**
 * The one file preview for the whole app (mounted once). Clicking a file anywhere opens it here: name, size, who uploaded it and when;
 * Download (the only thing that saves a file), Open in new tab, previous / next when there are several files, Esc or a click outside to close.
 * Images zoom, PDFs scroll, video and audio play, text and CSV show as text and tables, Word and Excel are drawn in the page, and anything
 * else gets a clean card with a Download button.
 */
export const FilePreviewHost: React.FC = () => {
  const { files, index, isOpen, close, go } = usePreviewStore();
  const file: PreviewFile | undefined = isOpen ? files[index] : undefined;
  const kind = file ? kindOfFile(file) : 'none';

  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [failure, setFailure] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const fail = useCallback((m: string) => setFailure(m), []);

  // Fetch the bytes with the login token whenever the file changes.
  useEffect(() => {
    if (!file) return;
    let live = true;
    let objectUrl = '';
    setLoaded({ status: 'loading' });
    setFailure(null);
    setZoom(1);
    api
      .get<Blob>(file.url.replace(/^\/api\/v1/, ''), { responseType: 'blob' })
      .then(({ data }) => {
        if (!live) return;
        const blob = new Blob([data], { type: mimeFor(file, kind) });
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ status: 'ready', blob, url: objectUrl });
      })
      .catch((err) => live && setLoaded({ status: 'error', message: err instanceof Error ? err.message : 'Could not open the file' }));
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, kind]);

  // Esc closes just the preview (even over a dialog); the arrow keys step through several files.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      } else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (kind === 'image' && (e.key === '+' || e.key === '=')) setZoom((z) => ZOOM_STEPS.find((s) => s > z) ?? z);
      else if (kind === 'image' && e.key === '-') setZoom((z) => [...ZOOM_STEPS].reverse().find((s) => s < z) ?? z);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, close, go, kind]);

  const download = async () => {
    if (!file) return;
    setBusy(true);
    try {
      await assetApi.download(file);
    } catch (err) {
      toast.error('Could not download the file', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  if (!file) return null;
  const Icon = KIND_ICON[kind];
  const several = files.length > 1;
  const sub = [formatBytes(file.size), file.owner?.name ? `Uploaded by ${file.owner.name}` : null, file.created_at ? formatDate(file.created_at, 'MMM d, yyyy, h:mm a') : null].filter(Boolean).join(' · ');

  const body = (() => {
    if (loaded.status === 'loading') return <Message>Opening {file.name}…</Message>;
    if (loaded.status === 'error') return <FileCard file={file} kind="none" reason={`${loaded.message}. You can still download it.`} onDownload={download} busy={busy} />;
    if (failure) return <FileCard file={file} kind={kind} reason={failure} onDownload={download} busy={busy} />;
    switch (kind) {
      case 'image':
        return (
          <div className="h-full overflow-auto bg-[var(--tm-bg-sunken)] p-4">
            <img src={loaded.url} alt={file.name} style={{ width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? '100%' : 'none' }} className="mx-auto block h-auto select-none" draggable={false} />
          </div>
        );
      case 'pdf':
        return <iframe title={file.name} src={loaded.url} className="h-full min-h-[60vh] w-full border-0 bg-[var(--tm-card)]" />;
      case 'video':
        return (
          <div className="grid h-full place-items-center bg-[var(--tm-bg-sunken)] p-4">
            <video src={loaded.url} controls className="max-h-full max-w-full rounded-[var(--tm-radius-md)]" />
          </div>
        );
      case 'audio':
        return (
          <div className="grid h-full min-h-[240px] place-items-center gap-4 p-6">
            <Icon className="h-14 w-14 text-[var(--tm-primary-dark)]" />
            <audio src={loaded.url} controls className="w-full max-w-md" />
          </div>
        );
      case 'text':
      case 'csv':
        return <TextView blob={loaded.blob} csv={kind === 'csv'} onFail={fail} />;
      case 'docx':
        return <DocxView blob={loaded.blob} onFail={fail} />;
      case 'xlsx':
        return <XlsxView blob={loaded.blob} onFail={fail} />;
      default:
        return (
          <FileCard
            file={file}
            kind="none"
            reason="This kind of file can’t be previewed here."
            onDownload={download}
            busy={busy}
          />
        );
    }
  })();

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Preview of ${file.name}`}>
      <button type="button" aria-label="Close preview" className="absolute inset-0 cursor-default bg-[var(--tm-ink)]/60 backdrop-blur-sm" onClick={close} />
      <div className="relative z-10 flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[var(--tm-radius-card)] border border-[var(--tm-border)] bg-[var(--tm-card)] shadow-soft-lg">
        <header className="flex flex-wrap items-center gap-3 border-b border-[var(--tm-border)] px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--tm-radius-md)] bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[14.5px] font-bold text-[var(--tm-ink)]" title={file.name}>
              {file.name}
            </h2>
            <p className="truncate text-[12px] text-[var(--tm-ink-muted)]">{sub}</p>
          </div>

          <div className="flex items-center gap-1.5">
            {several && (
              <>
                <Button variant="ghost" size="sm" aria-label="Previous file" onClick={() => go(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[3rem] text-center text-[12px] font-semibold tabular-nums text-[var(--tm-ink-soft)]" aria-live="polite">
                  {index + 1} / {files.length}
                </span>
                <Button variant="ghost" size="sm" aria-label="Next file" onClick={() => go(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
            {kind === 'image' && loaded.status === 'ready' && !failure && (
              <>
                <Button variant="ghost" size="sm" aria-label="Zoom out" disabled={zoom <= ZOOM_STEPS[0]} onClick={() => setZoom((z) => [...ZOOM_STEPS].reverse().find((s) => s < z) ?? z)}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <button type="button" onClick={() => setZoom(1)} aria-label="Reset zoom" className="min-w-[3.25rem] rounded-full px-2 py-1 text-center text-[12px] font-semibold tabular-nums text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)]">
                  {Math.round(zoom * 100)}%
                </button>
                <Button variant="ghost" size="sm" aria-label="Zoom in" disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} onClick={() => setZoom((z) => ZOOM_STEPS.find((s) => s > z) ?? z)}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </>
            )}
            {opensInTab(kind) && loaded.status === 'ready' && !failure && (
              <Button variant="outline" size="sm" onClick={() => window.open(loaded.url, '_blank', 'noopener,noreferrer')} leftIcon={<ExternalLink className="h-4 w-4" />}>
                Open in new tab
              </Button>
            )}
            <Button size="sm" onClick={download} isLoading={busy} leftIcon={<Download className="h-4 w-4" />}>
              Download
            </Button>
            <Button variant="ghost" size="sm" aria-label="Close" onClick={close}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto" data-preview-body>
          {body}
        </div>
      </div>
    </div>,
    document.body
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { Check, Download } from 'lucide-react';

type Phase = 'idle' | 'loading' | 'done' | 'error';

export interface DownloadButtonProps {
  /** Does the download. Call `progress(0–100)` as bytes arrive, or `progress(null)` when the size is unknown. Reject to show the error. */
  onDownload: (progress: (percent: number | null) => void) => Promise<void>;
  /** What the button does, for screen readers and the tooltip, e.g. "Download report.pdf". */
  label?: string;
  size?: 'sm' | 'md';
  /** Called with the failure, e.g. to show a toast. */
  onError?: (err: Error) => void;
  className?: string;
}

const BOX = { sm: 28, md: 36 };
const DONE_RESET_MS = 2000;

/**
 * Rounded-square download button. Clicking morphs it into a round progress ring that fills with the real progress, then
 * into a filled check circle, then back to the download icon after 2 seconds. A failure shows a red "!" and clicking
 * again retries. Reduced motion: the morphs and the spinner are instant, the ring still fills.
 */
export const DownloadButton: React.FC<DownloadButtonProps> = ({ onDownload, label = 'Download', size = 'md', onError, className = '' }) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [percent, setPercent] = useState<number | null>(null);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (reset.current) clearTimeout(reset.current);
    };
  }, []);

  const run = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (phase === 'loading' || phase === 'done') return;
    if (reset.current) clearTimeout(reset.current);
    setPercent(0);
    setPhase('loading');
    try {
      await onDownload((p) => alive.current && setPercent(p === null ? null : Math.max(0, Math.min(100, Math.round(p)))));
      if (!alive.current) return;
      setPhase('done');
      reset.current = setTimeout(() => alive.current && setPhase('idle'), DONE_RESET_MS);
    } catch (err) {
      if (!alive.current) return;
      setPhase('error');
      onError?.(err instanceof Error ? err : new Error('Download failed'));
    }
  };

  const px = BOX[size];
  const ringR = px / 2 - 3;
  const circ = 2 * Math.PI * ringR;
  const indeterminate = phase === 'loading' && percent === null;
  const offset = circ - ((percent ?? 25) / 100) * circ;

  const text =
    phase === 'loading' ? `Downloading${percent !== null ? ` ${percent}%` : ''}` : phase === 'done' ? 'Downloaded' : phase === 'error' ? 'Download failed. Try again' : label;

  const look =
    phase === 'done'
      ? 'rounded-full bg-[var(--tm-success)] text-[var(--tm-on-primary)]'
      : phase === 'error'
        ? 'rounded-full bg-[var(--tm-danger-bg)] text-[var(--tm-danger)] ring-1 ring-[var(--tm-danger-ring)]'
        : phase === 'loading'
          ? 'rounded-full bg-[var(--tm-card-muted)] text-[var(--tm-primary-dark)]'
          : 'rounded-[10px] bg-[var(--tm-card-muted)] text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]';

  return (
    <button
      type="button"
      onClick={run}
      aria-label={text}
      aria-busy={phase === 'loading' || undefined}
      title={text}
      data-phase={phase}
      style={{ width: px, height: px }}
      className={`relative grid shrink-0 place-items-center transition-[background-color,border-radius,color] duration-300 ease-[var(--tm-ease)]
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tm-primary)] ${look} ${className}`}
    >
      <Download
        className={`absolute h-[46%] w-[46%] transition-all duration-200 ${phase === 'idle' ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
        aria-hidden
      />

      <svg
        className={`absolute inset-0 -rotate-90 transition-opacity duration-200 ${phase === 'loading' ? 'opacity-100' : 'opacity-0'}`}
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        aria-hidden
      >
        <circle cx={px / 2} cy={px / 2} r={ringR} fill="none" stroke="var(--tm-border-strong)" strokeWidth={2.5} opacity={0.5} />
        <circle
          cx={px / 2}
          cy={px / 2}
          r={ringR}
          fill="none"
          stroke="var(--tm-primary)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className={indeterminate ? 'tm-spin-arc' : ''}
          style={{ transition: indeterminate ? undefined : 'stroke-dashoffset 220ms linear' }}
        />
      </svg>

      <Check
        strokeWidth={3}
        className={`absolute h-[48%] w-[48%] transition-all duration-300 ${phase === 'done' ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
        aria-hidden
      />
      <span
        className={`absolute text-[15px] font-black leading-none transition-all duration-200 ${phase === 'error' ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
        aria-hidden
      >
        !
      </span>
    </button>
  );
};

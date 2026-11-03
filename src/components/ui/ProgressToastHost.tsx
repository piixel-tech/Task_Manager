import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, Check, ChevronDown, Copy, MoreVertical, Pause, Play, RotateCcw, X } from 'lucide-react';
import { jobControls } from '../../services/jobs';
import { jobPercent, jobSummary, useJobsStore, type Job } from '../../store/useJobsStore';
import { toast } from '../../store/useToastStore';
import { useMotionPrefs } from './useMotionPrefs';

/** A clock that ticks once a second while something is running, so "4 seconds left" counts down. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const iconBtn =
  'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--tm-ink-soft)] transition-colors hover:bg-[var(--tm-card-muted)] hover:text-[var(--tm-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-primary-light)]';

const ProgressCard: React.FC<{ job: Job }> = ({ job }) => {
  const { reduced } = useMotionPrefs();
  const [menu, setMenu] = useState(false);
  const now = useNow(job.status === 'running');
  const pct = jobPercent(job);
  const failed = job.status === 'error';
  const done = job.status === 'done';
  const active = job.status === 'running' || job.status === 'paused';
  const indeterminate = !job.determinate && job.status === 'running';
  const fill = failed ? 'var(--tm-danger)' : done ? 'var(--tm-success)' : 'var(--tm-accent)';

  const copy = async () => {
    setMenu(false);
    const lines = [job.title, jobSummary(job, now), ...job.items.map((i) => `- ${i.name}: ${i.status}`)];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.info('Details copied');
    } catch {
      toast.error('Could not copy the details');
    }
  };

  return (
    <motion.div
      layout={!reduced}
      role="group"
      aria-label={job.title}
      initial={reduced ? false : { opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="glass-strong pointer-events-auto relative overflow-hidden rounded-[var(--tm-radius-lg)] pb-[3px]"
    >
      <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
        <span
          className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
            failed
              ? 'bg-[var(--tm-danger-bg)] text-[var(--tm-danger)]'
              : done
                ? 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]'
                : 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]'
          }`}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={job.status}
              initial={reduced ? false : { scale: 0.4, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="grid place-items-center"
            >
              {failed ? (
                <AlertCircle className="h-4 w-4" />
              ) : done ? (
                <Check className="h-4 w-4" strokeWidth={3} />
              ) : job.status === 'paused' ? (
                <Pause className="h-4 w-4" />
              ) : (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
              )}
            </motion.span>
          </AnimatePresence>
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-bold text-[var(--tm-ink)]">{job.title}</p>
          <p
            className={`mt-0.5 text-[12px] tabular-nums ${failed ? 'font-medium text-[var(--tm-danger)]' : 'text-[var(--tm-ink-muted)]'}`}
            aria-live={failed || done ? 'assertive' : 'off'}
          >
            {jobSummary(job, now)}
          </p>
          {failed && (
            <button
              type="button"
              onClick={() => jobControls.retry(job.id)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] px-3 py-1 text-[12px] font-bold text-[var(--tm-ink)] transition-colors hover:border-[var(--tm-solid)]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
        </div>

        <div className="relative flex shrink-0 items-center gap-0.5">
          {job.pausable && active && (
            <button
              type="button"
              className={iconBtn}
              aria-label={job.status === 'paused' ? 'Resume' : 'Pause'}
              title={job.status === 'paused' ? 'Resume' : 'Pause'}
              onClick={() => (job.status === 'paused' ? jobControls.resume(job.id) : jobControls.pause(job.id))}
            >
              {job.status === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
          )}
          {!done && (
            <button type="button" className={iconBtn} aria-label="Cancel" title="Cancel" onClick={() => jobControls.cancel(job.id)}>
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            className={iconBtn}
            aria-label={job.expanded ? 'Collapse details' : 'Expand details'}
            aria-expanded={job.expanded}
            title={job.expanded ? 'Collapse' : 'Expand'}
            onClick={() => jobControls.toggle(job.id)}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${job.expanded ? 'rotate-180' : ''}`} />
          </button>
          <button
            type="button"
            className={iconBtn}
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={menu}
            title="More"
            onClick={() => setMenu((m) => !m)}
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} aria-hidden />
              <div
                role="menu"
                onKeyDown={(e) => e.key === 'Escape' && setMenu(false)}
                className="glass-strong absolute bottom-full right-0 z-20 mb-1 w-44 rounded-[var(--tm-radius-md)] p-1.5"
              >
                {failed && (
                  <MenuItem icon={<RotateCcw className="h-3.5 w-3.5" />} label="Retry" onClick={() => (setMenu(false), jobControls.retry(job.id))} />
                )}
                {active && <MenuItem icon={<X className="h-3.5 w-3.5" />} label="Cancel" onClick={() => (setMenu(false), jobControls.cancel(job.id))} />}
                {!active && <MenuItem icon={<X className="h-3.5 w-3.5" />} label="Dismiss" onClick={() => (setMenu(false), jobControls.dismiss(job.id))} />}
                <MenuItem icon={<Copy className="h-3.5 w-3.5" />} label="Copy details" onClick={copy} />
              </div>
            </>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {job.expanded && (
          <motion.ul
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="max-h-48 space-y-2 overflow-y-auto border-t border-[var(--tm-border)] px-4 py-3"
            aria-label="Details"
          >
            {job.items.map((it) => {
              const p = it.status === 'done' ? 100 : Math.floor((Math.min(it.loaded, it.size) / it.size) * 100);
              return (
                <li key={it.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="min-w-0 truncate font-semibold text-[var(--tm-ink)]">{it.name}</span>
                    <span className={`shrink-0 tabular-nums ${it.status === 'error' ? 'text-[var(--tm-danger)]' : 'text-[var(--tm-ink-muted)]'}`}>
                      {it.status === 'done' ? <Check className="h-3.5 w-3.5 text-[var(--tm-success)]" strokeWidth={3} /> : it.status === 'error' ? 'Failed' : it.status === 'queued' ? 'Waiting' : job.determinate ? `${p}%` : '…'}
                    </span>
                  </div>
                  {job.determinate && (
                    <div className="h-1 overflow-hidden rounded-full bg-[var(--tm-bg-sunken)]">
                      <div
                        className="h-full rounded-full transition-[width] duration-200"
                        style={{ width: `${p}%`, background: it.status === 'error' ? 'var(--tm-danger)' : 'var(--tm-accent)' }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* The thin progress bar along the bottom edge, in the theme accent */}
      <div
        className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--tm-bg-sunken)]"
        role="progressbar"
        aria-label={`${job.title} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : pct}
      >
        {indeterminate ? (
          <motion.div
            className="h-full w-1/3 rounded-full"
            style={{ background: fill }}
            animate={reduced ? undefined : { x: ['-100%', '300%'] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
          />
        ) : (
          <motion.div className="h-full rounded-r-full" style={{ background: fill }} initial={false} animate={{ width: `${failed ? Math.max(pct, 8) : pct}%` }} transition={{ duration: 0.3, ease: 'easeOut' }} />
        )}
      </div>
    </motion.div>
  );
};

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className="flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-[12.5px] font-semibold text-[var(--tm-ink)] transition-colors hover:bg-[var(--tm-card-muted)]"
  >
    <span className="text-[var(--tm-primary-dark)]">{icon}</span>
    {label}
  </button>
);

/**
 * The floating progress card at the bottom right: one card per running job (uploads, Drive attaches, assigning, creating and
 * submitting tasks), stacked. See `runJob` in services/jobs.ts for how a job is started.
 */
export const ProgressToastHost: React.FC = () => {
  const jobs = useJobsStore((s) => s.jobs);
  return (
    <div
      aria-label="Progress"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2.5"
    >
      <AnimatePresence initial={false}>
        {jobs.map((job) => (
          <ProgressCard key={job.id} job={job} />
        ))}
      </AnimatePresence>
    </div>
  );
};

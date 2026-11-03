import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isJobCancelled, jobControls, runJob } from './jobs';
import { formatLeft, jobPercent, jobSummary, useJobsStore } from '../store/useJobsStore';

const jobs = () => useJobsStore.getState().jobs;
const only = () => {
  expect(jobs()).toHaveLength(1);
  return jobs()[0];
};
/** Lets pending promise callbacks run (the timers are faked, so a setTimeout would never fire). */
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  useJobsStore.setState({ jobs: [] });
});
afterEach(() => {
  vi.useRealTimers();
  useJobsStore.setState({ jobs: [] });
});

describe('runJob', () => {
  it('shows a running card, then a tick, then hides it 3 seconds after it finishes', async () => {
    const p = runJob({ title: 'Assigning task', run: async () => 'ok' });
    await expect(p).resolves.toBe('ok');
    expect(only()).toMatchObject({ title: 'Assigning task', status: 'done' });
    expect(jobSummary(only(), Date.now())).toBe('Done');
    vi.advanceTimersByTime(2900);
    expect(jobs()).toHaveLength(1);
    vi.advanceTimersByTime(200);
    expect(jobs()).toHaveLength(0);
  });

  it('reports a real percentage and an estimate for items, and only "Working…" for a single action', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p = runJob({
      title: 'Uploading 2 files',
      items: [{ name: 'a.png', size: 100 }, { name: 'b.png', size: 100 }],
      run: async (ctl) => {
        ctl.progress(0, 100);
        ctl.finish(0);
        ctl.progress(1, 50);
        await gate;
      }
    });
    await tick();
    const job = only();
    expect(jobPercent(job)).toBe(75);
    vi.advanceTimersByTime(4000);
    expect(jobSummary(only(), Date.now())).toBe('75% · 2 seconds left'); // 150 of 200 in 4 s: 50 more take 1.33 s, rounded up
    release();
    await p;
    expect(jobPercent(only())).toBe(100);

    const single = runJob({ title: 'Creating task', run: () => new Promise(() => undefined) });
    void single;
    await tick();
    const card = jobs().find((j) => j.title === 'Creating task')!;
    expect(card.determinate).toBe(false);
    expect(jobSummary(card, Date.now())).toBe('Working…');
  });

  it('on failure shows the error and waits; Retry runs it again and only then resolves', async () => {
    let calls = 0;
    const p = runJob({
      title: 'Submitting task',
      run: async () => {
        if (++calls === 1) throw new Error('Server said no');
        return 'second time';
      }
    });
    await tick();
    expect(only()).toMatchObject({ status: 'error', error: 'Server said no' });
    expect(jobSummary(only(), Date.now())).toBe('Server said no');
    jobControls.retry(only().id);
    await expect(p).resolves.toBe('second time');
    expect(calls).toBe(2);
    expect(only().status).toBe('done');
  });

  it('retry skips what already finished', async () => {
    const done = new Set<number>();
    let failOnce = true;
    const p = runJob({
      title: 'Uploading 2 files',
      items: [{ name: 'a', size: 1 }, { name: 'b', size: 1 }],
      run: async (ctl) => {
        for (const i of [0, 1]) {
          if (done.has(i)) continue;
          if (i === 1 && failOnce) {
            failOnce = false;
            throw new Error('b failed');
          }
          done.add(i);
          ctl.finish(i);
        }
      }
    });
    await tick();
    expect(only().items.map((i) => i.status)).toEqual(['done', 'queued']);
    jobControls.retry(only().id);
    await p;
    expect([...done]).toEqual([0, 1]);
  });

  it('dismissing a failed job rejects with the original error', async () => {
    const p = runJob({ title: 'Creating task', run: async () => Promise.reject(new Error('nope')) });
    const caught = p.catch((e) => e);
    await tick();
    jobControls.dismiss(only().id);
    expect(await caught).toMatchObject({ message: 'nope' });
    expect(jobs()).toHaveLength(0);
  });

  it('Cancel rejects with JobCancelled straight away, even for work that cannot be aborted', async () => {
    const p = runJob({ title: 'Creating task', run: () => new Promise(() => undefined) });
    const caught = p.catch((e) => e);
    await tick();
    jobControls.cancel(only().id);
    expect(isJobCancelled(await caught)).toBe(true);
    expect(jobs()).toHaveLength(0);
  });

  it('Pause aborts the transfer in flight and holds the next step until Resume', async () => {
    const started: boolean[] = [];
    const p = runJob({
      title: 'Uploading a.png',
      items: [{ name: 'a.png', size: 10 }],
      pausable: true,
      run: async (ctl) => {
        for (;;) {
          await ctl.checkpoint();
          try {
            started.push(true);
            await new Promise<void>((resolve, reject) => {
              ctl.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
              if (started.length > 1) setTimeout(resolve, 10); // the restarted transfer completes
            });
            ctl.finish(0);
            return;
          } catch (err) {
            if (ctl.interrupted(err)) continue;
            throw err;
          }
        }
      }
    });
    await tick();
    ctl_progress: {
      jobControls.pause(only().id);
      await tick();
      expect(only().status).toBe('paused');
      expect(only().items[0]).toMatchObject({ status: 'queued', loaded: 0 });
      expect(started).toHaveLength(1); // nothing restarts while paused
      break ctl_progress;
    }
    jobControls.resume(only().id);
    await tick();
    vi.advanceTimersByTime(20);
    await p;
    expect(started).toHaveLength(2);
    expect(only().status).toBe('done');
  });

  it('ignores Pause for jobs that cannot pause', async () => {
    void runJob({ title: 'Assigning task', run: () => new Promise(() => undefined) });
    await tick();
    jobControls.pause(only().id);
    expect(only().status).toBe('running');
  });

  it('stacks several jobs and keeps them apart', async () => {
    void runJob({ title: 'one', run: () => new Promise(() => undefined) });
    void runJob({ title: 'two', run: () => new Promise(() => undefined) });
    await tick();
    expect(jobs().map((j) => j.title)).toEqual(['one', 'two']);
    jobControls.cancel(jobs()[0].id);
    expect(jobs().map((j) => j.title)).toEqual(['two']);
  });
});

describe('formatLeft', () => {
  it('says seconds, then minutes', () => {
    expect(formatLeft(1)).toBe('1 second left');
    expect(formatLeft(4)).toBe('4 seconds left');
    expect(formatLeft(59)).toBe('59 seconds left');
    expect(formatLeft(61)).toBe('2 minutes left');
    expect(formatLeft(60)).toBe('1 minute left');
  });
});

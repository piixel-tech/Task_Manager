import { describe, expect, it } from 'vitest';
import { ARTICLES, CATEGORIES, audiencesFor, bodyFor } from './helpContent';

const visibleTo = (role: 'admin' | 'employee' | 'client', isHead = false) => {
  const audiences = audiencesFor(role, isHead);
  return ARTICLES.filter((a) => a.for.some((x) => audiences.includes(x)));
};

describe('help content', () => {
  it('has unique ids, known categories and an answer for every question', () => {
    const ids = ARTICLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    const categories = new Set(CATEGORIES.map((c) => c.id));
    for (const a of ARTICLES) {
      expect(categories.has(a.category), a.id).toBe(true);
      expect(a.q.length, a.id).toBeGreaterThan(8);
      expect(!!a.text || (a.steps?.length ?? 0) > 0, a.id).toBe(true);
      expect(a.for.length, a.id).toBeGreaterThan(0);
    }
  });

  it('only relates to questions that exist, and never to itself', () => {
    const ids = new Set(ARTICLES.map((a) => a.id));
    for (const a of ARTICLES) for (const r of a.related ?? []) {
      expect(ids.has(r), `${a.id} -> ${r}`).toBe(true);
      expect(r, a.id).not.toBe(a.id);
    }
  });

  it('points "Take me there" at real parts of the app, for every role that can read it', () => {
    const route = /^\/(admin|app|client)\/[a-z-]+(\/[a-z-]+)?$/;
    for (const role of ['admin', 'employee', 'client'] as const) {
      const prefix = role === 'admin' ? '/admin' : role === 'client' ? '/client' : '/app';
      for (const a of visibleTo(role, true)) {
        const link = bodyFor(a, role).goTo;
        if (link) expect(link.to({ prefix }), `${a.id} (${role})`).toMatch(route);
      }
    }
  });

  it('keeps the audiences apart', () => {
    const admin = visibleTo('admin').map((a) => a.id);
    const employee = visibleTo('employee').map((a) => a.id);
    const head = visibleTo('employee', true).map((a) => a.id);
    const client = visibleTo('client').map((a) => a.id);
    expect(admin).toContain('leave-decide');
    expect(employee).not.toContain('leave-decide');
    expect(client).not.toContain('leave-decide');
    expect(employee).not.toContain('sub-visibility-set'); // a head topic
    expect(head).toContain('sub-visibility-set');
    expect(head).toEqual(expect.arrayContaining(employee)); // heads read the employee answers too
    expect(client).toContain('cl-approve');
    expect(employee).not.toContain('cl-approve');
    // no team-only answer leaks to clients
    expect(client.filter((id) => !id.startsWith('cl-'))).toEqual([]);
  });

  it('words an answer for the admin panel when it differs', () => {
    const a = ARTICLES.find((x) => x.id === 'tasks-timer-who')!;
    expect(bodyFor(a, 'employee').q).toBe('Who can see what I am working on?');
    expect(bodyFor(a, 'admin').q).toBe('How do I see who is working on what?');
  });

  it('keeps the help short: at most 5 categories, and 20 questions per panel, each with a short answer', () => {
    expect(CATEGORIES.length).toBeLessThanOrEqual(5);
    for (const [role, head] of [['admin', false], ['employee', true], ['client', false]] as const) {
      expect(visibleTo(role, head).length, role).toBeLessThanOrEqual(20);
    }
    for (const a of ARTICLES) expect((a.steps?.length ?? 0), a.id).toBeLessThanOrEqual(4);
  });

  it('covers the features people do not find on their own', () => {
    const q = ARTICLES.map((a) => a.q.toLowerCase()).join('\n');
    for (const needle of ['close the browser', 'switch to another task', 'who can see what i am working on', 'turn a chat message into a task', 'undo, cancel', 'send a message later', 'submit my work for review', 'connect google']) {
      expect(q, needle).toContain(needle);
    }
  });
});

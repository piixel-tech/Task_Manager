import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { EmailInvite, guestPayload, isEmail, jobOf, MemberSelect, type GuestPerson } from './GuestFields';

const PEOPLE: GuestPerson[] = [
  { id: 'u1', name: 'Dana Designer', avatar_url: null, title: 'Art Director', role: 'employee', company: 'Piixel' },
  { id: 'u2', name: 'Dan Developer', avatar_url: null, title: '', role: 'employee', company: 'Unwork' },
  { id: 'u3', name: 'Ada Admin', avatar_url: null, role: 'admin' }
];

let members: string[] = [];
let emails: string[] = [];
const Harness = () => {
  const [m, setM] = useState<string[]>([]);
  const [e, setE] = useState<string[]>([]);
  members = m;
  emails = e;
  return (
    <>
      <MemberSelect people={PEOPLE} value={m} onChange={setM} />
      <EmailInvite value={e} onChange={setE} />
    </>
  );
};

const openList = () => fireEvent.click(screen.getByRole('combobox'));
const box = () => screen.getByLabelText('Invite by email') as HTMLInputElement;
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });

afterEach(() => {
  cleanup();
  members = [];
  emails = [];
});

describe('Add members', () => {
  it('groups everyone by company, with a count, and keeps people without one under Other', () => {
    render(<Harness />);
    openList();
    const headers = screen.getAllByRole('presentation').filter((n) => n.tagName === 'LI').map((n) => n.textContent);
    expect(headers).toEqual(['Piixel1', 'Unwork1', 'Other1']);
    fireEvent.change(screen.getByLabelText('Search members'), { target: { value: 'dan' } });
    expect(screen.getAllByRole('presentation').filter((n) => n.tagName === 'LI').map((n) => n.textContent)).toEqual(['Piixel1', 'Unwork1']);
  });

  it('shows every person it is given, however many', () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: `p${i}`, name: `Person ${i}`, avatar_url: null, role: 'employee', company: i % 2 ? 'Piixel' : 'Unwork' }));
    render(<MemberSelect people={many} value={[]} onChange={() => {}} />);
    openList();
    expect(screen.getAllByRole('option')).toHaveLength(150);
  });

  it('lists everyone with their name and job role (the account role when there is no title)', () => {
    render(<Harness />);
    openList();
    const rows = screen.getAllByRole('option').map((o) => within(o).getAllByText(/./).map((n) => n.textContent));
    expect(rows.flat()).toEqual(expect.arrayContaining(['Dana Designer', 'Art Director', 'Dan Developer', 'Employee', 'Ada Admin', 'Admin']));
    expect(jobOf(PEOPLE[2])).toBe('Admin');
  });

  it('searches by name or role, and picks several at once, shown as chips', () => {
    render(<Harness />);
    openList();
    fireEvent.change(screen.getByLabelText('Search members'), { target: { value: 'art' } });
    expect(screen.getAllByRole('option')).toHaveLength(1); // Art Director
    fireEvent.change(screen.getByLabelText('Search members'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('option', { name: /Dana Designer/ }).querySelector('button')!);
    fireEvent.click(screen.getByRole('option', { name: /Ada Admin/ }).querySelector('button')!);
    expect(members).toEqual(['u1', 'u3']);
    expect(screen.getByText('2 selected')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Selected members' })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(2);
  });

  it('un-picks from the list or with a chip’s x', () => {
    render(<Harness />);
    openList();
    fireEvent.click(screen.getByRole('option', { name: /Dan Developer/ }).querySelector('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Dan Developer' }));
    expect(members).toEqual([]);
  });

  it('says so when nobody matches', () => {
    render(<Harness />);
    openList();
    fireEvent.change(screen.getByLabelText('Search members'), { target: { value: 'zzz' } });
    expect(screen.getByText('No one matches.')).toBeTruthy();
  });
});

describe('Invite by email', () => {
  it('adds a valid address as a chip on Enter, without submitting the form', () => {
    let submitted = false;
    render(
      <form onSubmit={() => (submitted = true)}>
        <Harness />
      </form>
    );
    type('client@example.org');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(emails).toEqual(['client@example.org']);
    expect(box().value).toBe('');
    expect(submitted).toBe(false);
    expect(within(screen.getByRole('list', { name: 'Invited by email' })).getByText('client@example.org')).toBeTruthy();
  });

  it('refuses a badly formed address and says why, then clears the message as they type', () => {
    render(<Harness />);
    type('not an email');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toMatch(/name@company\.com/);
    expect(emails).toEqual([]);
    type('not an email!');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not add the same address twice, whatever its case', () => {
    render(<Harness />);
    type('Boss@Corp.io');
    fireEvent.keyDown(box(), { key: 'Enter' });
    type('boss@corp.io');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(emails).toEqual(['Boss@Corp.io']);
    expect(screen.getByRole('alert').textContent).toMatch(/already added/);
  });

  it('removes the last chip with Backspace on an empty box', () => {
    render(<Harness />);
    type('a@b.co');
    fireEvent.keyDown(box(), { key: 'Enter' });
    fireEvent.keyDown(box(), { key: 'Backspace' });
    expect(emails).toEqual([]);
  });

  it('isEmail is strict about the obvious mistakes', () => {
    expect(isEmail('a@b.co')).toBe(true);
    for (const bad of ['a@b', 'a b@c.com', '@c.com', 'a@@c.com', '<x@y.com>', 'a@b.c,d@e.fg']) expect(isEmail(bad)).toBe(false);
  });
});

describe('both lists reach the booking as guests', () => {
  it('sends teammates by id and addresses lower-cased', () => {
    expect(guestPayload(['u1', 'u3'], ['Boss@Corp.io'])).toEqual([{ user_id: 'u1' }, { user_id: 'u3' }, { email: 'boss@corp.io' }]);
  });
});

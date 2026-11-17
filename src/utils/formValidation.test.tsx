import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { installFormValidation, labelOf, messageFor } from './formValidation';

let off: () => void;
beforeEach(() => {
  off = installFormValidation();
});
afterEach(() => {
  off();
  cleanup();
});

const Form: React.FC<{ onSubmit: () => void }> = ({ onSubmit }) => (
  <form
    onSubmit={(e) => {
      e.preventDefault();
      onSubmit();
    }}
  >
    <label htmlFor="title">Title</label>
    <input id="title" data-label="task name" required />
    <label htmlFor="due">Due date</label>
    <input id="due" type="date" required />
    <label htmlFor="who">Assignee</label>
    <select id="who" required>
      <option value="">Select</option>
      <option value="a">Ada</option>
    </select>
    <label htmlFor="mail">Email</label>
    <input id="mail" type="email" defaultValue="not-an-email" />
    <label htmlFor="pw">Code</label>
    <input id="pw" pattern="[0-9]+" defaultValue="abc" />
    <label>
      <input type="checkbox" required /> I agree
    </label>
    <button type="submit">Save</button>
  </form>
);

describe('our own form messages', () => {
  it('shows a friendly message under every problem field instead of the browser pop-up', () => {
    const submitted = vi.fn();
    render(<Form onSubmit={submitted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(submitted).not.toHaveBeenCalled(); // an invalid form never reaches its own handler
    expect(screen.getByText('Enter a task name')).toBeTruthy(); // the field names itself
    expect(screen.getByText('Pick a due date')).toBeTruthy();
    expect(screen.getByText('Choose an option for “Assignee”')).toBeTruthy();
    expect(screen.getByText('Enter a valid email address, like name@company.com')).toBeTruthy();
    expect(screen.getByText('Code isn’t in the right format')).toBeTruthy();
    expect(screen.getByText('Tick “I agree” to continue')).toBeTruthy();
    expect(screen.getAllByRole('alert')).toHaveLength(6);
  });

  it('turns native validation off on the form and outlines each bad field', () => {
    render(<Form onSubmit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const form = document.querySelector('form')!;
    expect(form.noValidate).toBe(true);
    const title = screen.getByLabelText('Title');
    expect(title.getAttribute('data-invalid')).toBe('true');
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(title.getAttribute('aria-errormessage')!)?.textContent).toBe('Enter a task name');
  });

  it('puts the cursor in the first field with a problem', () => {
    render(<Form onSubmit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Title'));
  });

  it('clears a message as soon as the person edits that field', () => {
    render(<Form onSubmit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Write copy' } });
    expect(screen.queryByText('Enter a task name')).toBeNull();
    expect(screen.getByLabelText('Title').hasAttribute('data-invalid')).toBe(false);
    expect(screen.getByText('Pick a due date')).toBeTruthy(); // the others stay
  });

  it('does not repeat a message when the form is submitted again', () => {
    render(<Form onSubmit={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getAllByText('Enter a task name')).toHaveLength(1);
  });

  it('lets a valid form through', () => {
    const submitted = vi.fn();
    render(
      <form onSubmit={(e) => (e.preventDefault(), submitted())}>
        <label htmlFor="n">Name</label>
        <input id="n" required defaultValue="Ada" />
        <button type="submit">Go</button>
      </form>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('words the common cases', () => {
    render(
      <div>
        <label htmlFor="a">Reason</label>
        <textarea id="a" required />
        <label htmlFor="b">Amount (optional)</label>
        <input id="b" type="number" min={1} max={5} defaultValue="9" />
        <label htmlFor="c">Site</label>
        <input id="c" type="url" defaultValue="nope" />
      </div>
    );
    expect(messageFor(screen.getByLabelText('Reason') as HTMLTextAreaElement)).toBe('Enter a reason');
    expect(labelOf(screen.getByLabelText(/Amount/) as HTMLInputElement)).toBe('Amount');
    expect(messageFor(screen.getByLabelText(/Amount/) as HTMLInputElement)).toBe('Amount must be 5 or less');
    expect(messageFor(screen.getByLabelText('Site') as HTMLInputElement)).toBe('Enter a valid web address, starting with https://');
  });
});

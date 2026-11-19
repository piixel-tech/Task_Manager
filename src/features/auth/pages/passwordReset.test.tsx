import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { ResetPasswordPage } from './ResetPasswordPage';
import { PasswordRules } from '../../../components/ui/PasswordRules';
import { generatePassword, passwordIsValid } from '../../../utils/passwordRules';
import { passwordApi, ResetLinkGoneError } from '../../../services/http/passwordApi';
import { useToastStore } from '../../../store/useToastStore';

vi.mock('../../../services/http/passwordApi', async (orig) => {
  const real = await orig<typeof import('../../../services/http/passwordApi')>();
  return { ...real, passwordApi: { forgot: vi.fn(), checkLink: vi.fn(), reset: vi.fn() } };
});

const api = vi.mocked(passwordApi);

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/login" element={<p>login-page</p>} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
});
afterEach(cleanup);

describe('password rules', () => {
  it('ticks each rule live', () => {
    const { rerender } = render(<PasswordRules password="" confirm="" />);
    expect(screen.getAllByText(/not yet/)).toHaveLength(4);
    rerender(<PasswordRules password="abcdefg1" confirm="abcdefg1" />);
    expect(screen.getAllByText(/done/)).toHaveLength(4);
    rerender(<PasswordRules password="abcdefg1" confirm="abcdefg2" />);
    expect(screen.getByText(/Both passwords match/).textContent).toContain('not yet');
  });

  it('generated passwords always pass the rules', () => {
    for (let i = 0; i < 50; i++) expect(passwordIsValid(generatePassword())).toBe(true);
  });
});

describe('Forgot password', () => {
  it('shows the server answer and offers a way back', async () => {
    api.forgot.mockResolvedValue('If an account exists, we sent a link.');
    renderAt('/forgot-password');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect((await screen.findByRole('status')).textContent).toBe('If an account exists, we sent a link.');
    expect(api.forgot).toHaveBeenCalledWith('a@b.co');
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toBeTruthy();
  });
});

describe('Reset password', () => {
  it('shows the expired page with a way to ask for a new link', async () => {
    api.checkLink.mockResolvedValue({ valid: false, reason: 'expired' });
    renderAt('/reset-password/tok');
    expect(await screen.findByText('This link has expired.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Send a new link' }).getAttribute('href')).toBe('/forgot-password');
  });

  it('says so when the link was already used', async () => {
    api.checkLink.mockResolvedValue({ valid: false, reason: 'used' });
    renderAt('/reset-password/tok');
    expect(await screen.findByText('This link was already used.')).toBeTruthy();
  });

  it('only enables the button when the rules and the confirmation are met, can show the password, and redirects with a toast', async () => {
    api.checkLink.mockResolvedValue({ valid: true });
    api.reset.mockResolvedValue();
    renderAt('/reset-password/tok');
    const submit = await screen.findByRole('button', { name: 'Reset password' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    const first = screen.getByLabelText('New password') as HTMLInputElement;
    fireEvent.change(first, { target: { value: 'brand-new-1' } });
    expect((submit as HTMLButtonElement).disabled).toBe(true); // confirmation still empty
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'brand-new-1' } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    expect(first.type).toBe('password');
    fireEvent.click(screen.getAllByRole('button', { name: 'Show password' })[0]);
    expect(first.type).toBe('text');

    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByText('login-page')).toBeTruthy());
    expect(api.reset).toHaveBeenCalledWith('tok', 'brand-new-1');
    expect(useToastStore.getState().toasts.map((t) => t.title)).toContain('Password updated');
  });

  it('switches to the expired page if the link dies while typing', async () => {
    api.checkLink.mockResolvedValue({ valid: true });
    api.reset.mockRejectedValue(new ResetLinkGoneError('gone'));
    renderAt('/reset-password/tok');
    await screen.findByRole('button', { name: 'Reset password' });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'brand-new-1' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'brand-new-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByRole('link', { name: 'Send a new link' })).toBeTruthy();
  });
});

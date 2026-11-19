import { AxiosError } from 'axios';
import { api, getErrorMessage } from '../api';

export type ResetLinkState = { valid: true } | { valid: false; reason: 'invalid' | 'used' | 'expired' };

/** The reset link is no longer usable (expired, already used, or replaced by a newer one). */
export class ResetLinkGoneError extends Error {}

export const passwordApi = {
  /** Always resolves with the same message, whether or not the address has an account. */
  forgot: async (email: string): Promise<string> => {
    try {
      return (await api.post<{ message: string }>('/auth/forgot-password', { email })).data.message;
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Could not send the link. Try again in a moment.'));
    }
  },

  checkLink: async (token: string): Promise<ResetLinkState> => {
    try {
      const { valid, reason } = (await api.post<{ valid: boolean; reason: string | null }>('/auth/reset-password/check', { token })).data;
      return valid ? { valid: true } : { valid: false, reason: (reason as 'invalid' | 'used' | 'expired') ?? 'invalid' };
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Could not check this link. Try again.'));
    }
  },

  reset: async (token: string, newPassword: string): Promise<void> => {
    try {
      await api.post('/auth/reset-password', { token, new_password: newPassword });
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 410) throw new ResetLinkGoneError('This link has expired or was already used.');
      throw new Error(getErrorMessage(err, 'Could not reset your password'));
    }
  },

  /** Admin: email a member a one-time reset link. */
  sendResetLink: async (userId: string): Promise<void> => {
    try {
      await api.post(`/users/${userId}/send-reset-link`);
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Could not send the reset link'));
    }
  },

  /** Admin: set a temporary password the member must change at their next sign-in. */
  setTemporaryPassword: async (userId: string, password: string): Promise<void> => {
    try {
      await api.post(`/users/${userId}/temporary-password`, { password });
    } catch (err) {
      throw new Error(getErrorMessage(err, 'Could not set the temporary password'));
    }
  }
};

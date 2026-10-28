import { useCallback } from 'react';
import { useConfirmStore, type ConfirmOptions } from '../store/useConfirmStore';

/**
 * Confirm-then-run helper for create / edit / delete actions.
 *
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: 'Deactivate Sam?',
 *     danger: true,
 *     action: () => userService.deleteUser(id),
 *     successTitle: 'Member deactivated'
 *   });
 *
 * Shows the confirmation dialog, runs `action` (with a spinner), shows a success
 * toast, and resolves true. If `action` throws, the error appears in the dialog
 * and it stays open for a retry. Resolves false when the user cancels.
 * Needs <ConfirmHost /> mounted once (see app/providers.tsx).
 */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const open = useConfirmStore((s) => s.open);
  return useCallback((options) => open(options), [open]);
}

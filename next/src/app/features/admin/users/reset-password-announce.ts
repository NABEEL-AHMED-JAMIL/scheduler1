import { copyText } from '../../../shared/ui/clipboard.util';
import { ToastService } from '../../../shared/ui/toast.service';
import { ResetPasswordResult } from './reset-password-dialog';

/** How long the toast -- and with it the one copy of the password the console holds -- stays. */
export const RESET_NOTICE_MS = 120_000;

/**
 * What a reset that happened says, after its dialog has closed: whose password it was, that they choose their own at
 * their next sign-in (the server set mustChangePassword on somebody else's account), and "Copy password" -- to the
 * clipboard only. A toast like every other notice (owner 2026-10-19 #29: one place, the top right), kept two minutes
 * rather than four seconds and carrying the one action. The password is never rendered and never logged; it lives only in
 * the action's closure, which goes when the toast does (dismissed, two minutes, or the page left).
 */
export function announceReset(toasts: ToastService, result: ResetPasswordResult): number {
  const password = result.password;
  return toasts.success(result.own ? 'Use it the next time you sign in.' : 'They\'ll be asked to choose a new one at their next sign-in.', {
    title: result.own ? 'Your password has been reset.' : `Password reset for ${result.name}.`,
    duration: RESET_NOTICE_MS,
    action: password ? { label: 'Copy password', doneLabel: 'Copied', run: () => copyText(password) } : undefined,
  });
}

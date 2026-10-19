import { describe, it, expect, afterEach, vi } from 'vitest';
import { ToastService } from './toast.service';

/**
 * Repeated clicks on Save or Run with the same problem stacked four or five identical error
 * toasts. The same message in the same tone now restarts the one on screen instead.
 */
describe('ToastService', () => {
  afterEach(() => vi.useRealTimers());

  it('shows a repeated message once, and keeps it up for the full time from the repeat', () => {
    vi.useFakeTimers();
    const toasts = new ToastService();
    toasts.error('Check the highlighted fields.');
    vi.advanceTimersByTime(5000);
    toasts.error('Check the highlighted fields.');

    expect(toasts.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(toasts.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(toasts.toasts()).toHaveLength(0);
  });

  it('still shows different messages, and the same words in another tone, separately', () => {
    const toasts = new ToastService();
    toasts.error('A');
    toasts.error('B');
    toasts.success('A');
    expect(toasts.toasts().map(t => t.tone + ':' + t.message)).toEqual(['crit:A', 'crit:B', 'ok:A']);
  });
});

describe('ToastService: one notice system (owner 2026-10-19 #29)', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps a toast with its own duration, and tells its owner when it goes', () => {
    vi.useFakeTimers();
    const toasts = new ToastService();
    const closed = vi.fn();
    toasts.success('Password reset.', { duration: 120_000, onClose: closed, action: { label: 'Copy password', run: () => true } });
    vi.advanceTimersByTime(119_000);
    expect(toasts.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1_000);
    expect(toasts.toasts()).toHaveLength(0);
    expect(closed).toHaveBeenCalledOnce();
  });

  it('never merges two toasts that carry an action: each is about its own moment', () => {
    const toasts = new ToastService();
    toasts.success('Password reset.', { action: { label: 'Copy', run: () => true } });
    toasts.success('Password reset.', { action: { label: 'Copy', run: () => true } });
    expect(toasts.toasts()).toHaveLength(2);
  });
});

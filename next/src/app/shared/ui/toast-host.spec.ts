import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ToastHost } from './toast-host';
import { ToastService } from './toast.service';

/**
 * Owner 2026-10-19 #29: every toast and notice at the top right, on every screen, in the one host. It used to stack
 * bottom-left while the reset-password notice and the idle warning sat bottom-centre. Layout the test DOM cannot measure
 * is read from the template; behaviour -- roles, dismiss, Escape, the action -- is rendered.
 */
describe('toast placement', () => {
  const read = async (path: string) => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    return fs.readFileSync(`${root}/src/app/${path}`, 'utf8');
  };

  it('stacks at the top right, under the top bar, above dialogs, and lets clicks through its gaps', async () => {
    const source = await read('shared/ui/toast-host.ts');
    const at = source.indexOf('class="toast-stack');
    const stack = source.slice(at + 7, source.indexOf('"', at + 7)).split(/\s+/);
    expect(stack).toEqual(expect.arrayContaining(['fixed', 'right-4', 'pointer-events-none', 'z-[1100]']));
    expect(stack).not.toContain('left-4');
    expect(stack).not.toContain('bottom-4');
    expect(source).toContain('.toast-stack { top: calc(3.5rem');
    expect(source).toContain('pointer-events-auto');
  });

  it('is the only floating notice: the reset-password notice is gone and the idle warning sits where toasts do', async () => {
    const users = await read('features/admin/users/users.html');
    expect(users).not.toContain('app-reset-password-notice');
    const idle = await read('core/auth/idle-guard.ts');
    expect(idle).toContain('toast-stack');
    expect(idle).not.toMatch(/bottom-4/);
  });
});

describe('ToastHost', () => {
  afterEach(() => vi.useRealTimers());

  function host() {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(ToastHost);
    const toasts = TestBed.inject(ToastService);
    return { fixture, toasts, el: fixture.nativeElement as HTMLElement };
  }

  it('says a failure as an alert and anything else politely, and dismisses with the button', () => {
    const { fixture, toasts, el } = host();
    toasts.error('Could not save.');
    toasts.success('Saved.');
    fixture.detectChanges();
    const shown = [...el.querySelectorAll('[data-test="toast"]')];
    expect(shown.map(t => [t.getAttribute('role'), t.getAttribute('aria-live')])).toEqual([['alert', 'assertive'], ['status', 'polite']]);
    expect(el.querySelector('section')?.getAttribute('aria-label')).toBe('Notifications');
    (shown[0].querySelector('[data-test="toast-dismiss"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-test="toast"]')).toHaveLength(1);
  });

  it('dismisses the newest with Escape from inside the stack', () => {
    const { fixture, toasts, el } = host();
    toasts.info('First');
    toasts.info('Second');
    fixture.detectChanges();
    el.querySelector('section')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect([...el.querySelectorAll('[data-test="toast"]')].map(t => t.textContent?.trim())).toEqual(['First']);
  });

  it('holds a toast while it is hovered, and runs its action', async () => {
    vi.useFakeTimers();
    const { fixture, toasts, el } = host();
    const run = vi.fn(() => true);
    toasts.success('Password reset for Alex.', { title: 'Done', action: { label: 'Copy password', doneLabel: 'Copied', run } });
    fixture.detectChanges();
    const toast = el.querySelector('[data-test="toast"]') as HTMLElement;
    toast.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(10_000);
    expect(toasts.toasts()).toHaveLength(1);
    (toast.querySelector('[data-test="toast-action"]') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(run).toHaveBeenCalledOnce();
    expect(toast.querySelector('[data-test="toast-action"]')?.textContent).toContain('Copied');
    toast.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(4000);
    expect(toasts.toasts()).toHaveLength(0);
  });
});

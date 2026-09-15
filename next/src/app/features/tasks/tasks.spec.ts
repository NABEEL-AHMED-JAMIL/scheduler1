import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { Tasks } from './tasks';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';

/**
 * "Copied" has to be a statement about the clipboard, not about the click.
 *
 * copyText already reports whether the copy happened, because it often does not: a deployment
 * served over plain HTTP has no Clipboard API at all, an unfocused document is refused, and the
 * execCommand fallback can be refused too. The payload is the one thing on this screen people copy
 * in order to paste it somewhere that matters -- a ticket, a config file -- so a tick over a
 * clipboard that still holds the previous contents is worse than no control at all: it is silently
 * the wrong JSON, with nothing on screen to suggest it.
 */

function tasksScreen() {
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: () => of({}), post: () => of({}), put: () => of({}) } },
      { provide: ToastService, useValue: toast },
      { provide: Dialog, useValue: { open: () => ({ closed: of(undefined) }) } },
      { provide: AuthService, useValue: { user: () => null, canManageTasks: () => true } },
    ],
  });
  // ngOnInit is deliberately not run: load() has nothing to do with the clipboard.
  const component = TestBed.runInInjectionContext(() => new Tasks());
  return { component, toast };
}

const TASK = {
  taskDetailId: 7714,
  taskName: 'Hurricanes ETL',
  taskStatus: 'Active',
  taskPayload: '{"pipelineId":"F768926"}',
};

/** Lets the copy promise and the handler behind it settle, without running the 1.5s tick timer. */
function settle(): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, 0));
}

/** The clipboard as a browser that will not copy presents it: no async API, and a refused fallback. */
function clipboardRefuses() {
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  const originalExec = (document as any).execCommand;
  (document as any).execCommand = () => false;
  return () => {
    (document as any).execCommand = originalExec;
    if (originalDescriptor) Object.defineProperty(navigator, 'clipboard', originalDescriptor);
    else delete (navigator as any).clipboard;
  };
}

/** A clipboard that takes the text, so the tick is telling the truth. */
function clipboardAccepts(written: string[]) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: (value: string) => { written.push(value); return Promise.resolve(); } },
    configurable: true,
  });
  return () => {
    if (originalDescriptor) Object.defineProperty(navigator, 'clipboard', originalDescriptor);
    else delete (navigator as any).clipboard;
  };
}

describe('Tasks payload copy', () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('does not show the copied tick when the clipboard refused the payload', async () => {
    restore = clipboardRefuses();
    const { component, toast } = tasksScreen();

    component.copyPayload(TASK as any);
    await settle();

    // The tick is the only thing that ever tells the reader the copy worked, and it must not
    // appear over a clipboard that still holds whatever was there before.
    expect(component.copiedId()).toBeNull();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('shows the copied tick once the clipboard has actually taken the payload', async () => {
    const written: string[] = [];
    restore = clipboardAccepts(written);
    const { component, toast } = tasksScreen();

    component.copyPayload(TASK as any);
    await settle();

    expect(written).toEqual([TASK.taskPayload]);
    expect(component.copiedId()).toBe(TASK.taskDetailId);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps a second row tick when a slower copy of the first one clears late', async () => {
    vi.useFakeTimers();
    try {
      const written: string[] = [];
      restore = clipboardAccepts(written);
      const { component } = tasksScreen();

      component.copyPayload(TASK as any);
      await vi.advanceTimersByTimeAsync(1000);
      component.copyPayload({ ...TASK, taskDetailId: 8820 } as any);
      await vi.advanceTimersByTimeAsync(0);
      expect(component.copiedId()).toBe(8820);

      // The first row's 1.5s timer now fires while the second row is the one showing the tick.
      await vi.advanceTimersByTimeAsync(600);
      expect(component.copiedId()).toBe(8820);
    } finally {
      vi.useRealTimers();
    }
  });
});

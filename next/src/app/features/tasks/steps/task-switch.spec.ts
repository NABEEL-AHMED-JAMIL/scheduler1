import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StepTaskEntry, TaskState, stateOf, withSwitchedLine } from './steps.model';
import { TaskStatePill, TaskSwitch } from './task-switch';

@Component({
  imports: [TaskSwitch, TaskStatePill],
  template: `
    <app-task-switch [task]="task()" [busy]="busy()" (switched)="asked.push($event)" />
    <app-task-state [state]="state().state" [reason]="state().reason" [overridden]="!!task().overridden" />
  `,
})
class Host {
  readonly task = signal<StepTaskEntry>({ code: 'join', name: 'Join', enabled: true, available: true, overridable: true });
  readonly busy = signal(false);
  readonly asked: (boolean | null)[] = [];
  state(): { state: TaskState; reason: string } { return stateOf(this.task()); }
}

function mount(task?: Partial<StepTaskEntry>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(Host);
  if (task) fixture.componentInstance.task.update(t => ({ ...t, ...task }));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const box = () => el.querySelector<HTMLInputElement>('input[role="switch"]')!;
  return { fixture, el, box, host: fixture.componentInstance };
}

describe('TaskSwitch -- one switch for the step builder and the Task Registry', () => {
  it('asks to switch off, and shows what Core then said', () => {
    const { box, host, fixture } = mount();
    expect(box().getAttribute('aria-label')).toBe('Switch Join on in this workspace');
    box().checked = false;
    box().dispatchEvent(new Event('change'));
    expect(host.asked).toEqual([false]);
    host.task.update(t => withSwitchedLine([t], { code: 'join', enabled: false, overridden: true })[0]);
    fixture.detectChanges();
    expect(box().checked).toBe(false);
  });

  it('goes back to where it was when the switch is refused', () => {
    const { box, host, fixture } = mount();
    host.busy.set(true);
    fixture.detectChanges();
    box().checked = false;
    box().dispatchEvent(new Event('change'));
    // Refused: the line is unchanged, and the host is no longer busy.
    host.busy.set(false);
    fixture.detectChanges();
    expect(box().checked).toBe(true);
  });

  it('offers Default only once the workspace has switched it', () => {
    const { el, host, fixture } = mount();
    expect(el.querySelector('button')).toBeNull();
    host.task.update(t => ({ ...t, enabled: false, overridden: true }));
    fixture.detectChanges();
    const reset = el.querySelector<HTMLButtonElement>('button')!;
    expect(reset.getAttribute('aria-label')).toBe('Put Join back to its default');
    reset.click();
    expect(host.asked).toEqual([null]);
  });

  it('cannot switch on a task the platform cannot run, nor a legacy one, nor while a switch is on its way', () => {
    expect(mount({ available: false, enabled: false }).box().disabled).toBe(true);
    expect(mount({ overridable: false }).box().disabled).toBe(true);
    const { box, host, fixture } = mount();
    host.busy.set(true);
    fixture.detectChanges();
    expect(box().disabled).toBe(true);
  });
});

describe('TaskStatePill', () => {
  it('says On, Off (switched here) or Unavailable, with the reason', () => {
    const on = mount().el.querySelector('app-task-state')!;
    expect(on.textContent!.trim()).toBe('On');
    const off = mount({ enabled: false, overridden: true }).el.querySelector('app-task-state')!;
    expect(off.textContent).toContain('Off');
    expect(off.textContent).toContain('Switched here');
    expect(off.textContent).toContain('Switched off in this workspace.');
    const gone = mount({ available: false, enabled: false, disabledReason: 'storage-service is off' }).el.querySelector('app-task-state')!;
    expect(gone.querySelector('.pill-warn')!.textContent!.trim()).toBe('Unavailable');
    expect(gone.textContent).toContain('storage-service is off');
  });
});

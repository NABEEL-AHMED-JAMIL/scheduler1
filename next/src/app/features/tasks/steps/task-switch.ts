import { Component, computed, input, output } from '@angular/core';
import { DataText } from '../../../shared/ui/data-text';
import { StepTaskEntry, TaskState } from './steps.model';

/**
 * A task's switch in a workspace (MIG-231's POST steps/tasks/enabled): On/Off, and Default once the workspace has
 * switched it. The step builder's Settings table and the Task Registry's panel (MIG-250) both draw it, so a task is
 * switched the same way wherever an administrator meets it. It only says what was asked -- `switched` with true,
 * false or null (back to the default); the host calls Core and hands the answer back as `task`.
 *
 * The box shows what Core last said, not the click: a refused switch leaves it as it was.
 */
@Component({
  selector: 'app-task-switch',
  host: { class: 'inline-flex items-center justify-end gap-1' },
  template: `
    @if (task().overridden) {
      <button type="button" class="btn btn-ghost btn-sm" [attr.aria-label]="'Put ' + name() + ' back to its default'"
              [disabled]="busy()" (click)="switched.emit(null)">Default</button>
    }
    <input type="checkbox" class="checkbox align-middle" role="switch" [checked]="!!task().enabled"
           [attr.aria-label]="'Switch ' + name() + ' on in this workspace'"
           [disabled]="busy() || task().overridable === false || (task().available === false && !task().enabled)"
           (change)="flip($event)" />
  `,
})
export class TaskSwitch {
  readonly task = input.required<StepTaskEntry>();
  readonly busy = input(false);
  readonly switched = output<boolean | null>();
  readonly name = computed(() => this.task().name || this.task().code);

  flip(event: Event): void {
    const box = event.target as HTMLInputElement;
    const wanted = box.checked;
    box.checked = !!this.task().enabled;
    this.switched.emit(wanted);
  }
}

/** A task's state here as the registry and the step builder print it: On, Off or Unavailable, switched here, and why. */
@Component({
  selector: 'app-task-state',
  imports: [DataText],
  template: `
    <span class="pill" [class.pill-brand]="state() === 'On'" [class.pill-neutral]="state() === 'Off'"
          [class.pill-warn]="state() === 'Unavailable'">{{ state() }}</span>
    @if (overridden()) { <span class="pill pill-neutral ml-1" title="This workspace switched it; Default puts it back">Switched here</span> }
    @if (reason()) {
      <app-data-text class="block mt-1 text-[color:var(--text-secondary)]" [value]="reason()"
                     [label]="state() === 'Unavailable' ? 'Why it is unavailable' : 'Why it is off'" [lines]="2" />
    }
  `,
})
export class TaskStatePill {
  readonly state = input.required<TaskState>();
  readonly reason = input('');
  readonly overridden = input(false);
}

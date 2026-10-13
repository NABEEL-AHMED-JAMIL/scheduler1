import { Component, ViewEncapsulation, computed, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { StatusPill } from '../../../shared/ui/status-pill';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { RunTimelineStore } from './run-timeline.store';
import { StepExecution } from './run-steps.model';
import { RUN_LOG_STYLES, levelClass, levelWord } from '../logs/run-log.model';

export interface RunStepLogData {
  store: RunTimelineStore;
  step: StepExecution;
  name: string;
}

/**
 * The steps table's Log button: one step's own lines (sourceJob.json/stepLogs) in the side panel over the right, the
 * table still beside it. "Open in Log" closes the panel and shows the run's Log filtered to this step.
 */
@Component({
  selector: 'app-run-step-log-panel',
  imports: [SidePanel, Icon, StatusPill, ServerTimePipe],
  encapsulation: ViewEncapsulation.None,
  styles: RUN_LOG_STYLES,
  template: `
    <app-side-panel [heading]="'Step ' + (data.step.index + 1) + ' · ' + data.name" [subtitle]="data.step.key + ' · ' + data.step.task">
      <div class="flex items-center gap-2 mb-3 text-xs text-[color:var(--text-secondary)]">
        <app-status [label]="data.step.status" />
        @if (data.step.startedAt) { <span class="tabular">{{ data.step.startedAt | serverTime:'timeSec' }}</span> }
      </div>
      <div class="run-log-lines is-wrap" data-test="step-log-lines">
        @if (lines(); as list) {
          @if (list === 'error') {
            <div class="run-log-line">The step's lines could not be read.</div>
          } @else {
            @for (line of list; track line.lineNo) {
              <div class="run-log-line" [attr.data-level]="levelWord(line.level)">
                <span class="run-log-time">{{ line.loggedAt ? (line.loggedAt | serverTime:'timeSec') : '—' }}</span>
                <span class="run-log-level" [class]="'run-log-level ' + levelClass(levelWord(line.level))">{{ levelWord(line.level) }}</span>
                <span class="run-log-msg">{{ line.message }}</span>
              </div>
            } @empty {
              <div class="run-log-line">This step wrote no log lines.</div>
            }
          }
        } @else {
          <div class="run-log-line">Reading the step's lines…</div>
        }
      </div>
      <div foot class="flex justify-end gap-2">
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close('log')" data-test="open-in-log">
          <app-icon name="terminal" />Open in Log
        </button>
      </div>
    </app-side-panel>
  `,
})
export class RunStepLogPanel {
  readonly data = inject<RunStepLogData>(DIALOG_DATA);
  readonly ref = inject<DialogRef<'log' | undefined>>(DialogRef);
  readonly levelWord = levelWord;
  readonly levelClass = levelClass;

  constructor() {
    this.data.store.readLines(this.data.step.stepExecutionId);
  }

  readonly lines = computed(() => {
    const id = this.data.step.stepExecutionId;
    return id === null || id === undefined ? 'error' as const : this.data.store.lines().get(id);
  });
}

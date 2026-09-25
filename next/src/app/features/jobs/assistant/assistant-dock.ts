import { Component, input, model, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../shared/ui/icon';
import { JobAssistant } from './job-assistant';

/**
 * The job assistant as a panel over a list, rather than a page that replaces it. Jobs and Run
 * history each had a copy of this markup, and the two had already drifted (one titled with the
 * job's name, the other "Job assistant #id"); neither said what the panel was to a screen reader.
 */
@Component({
  selector: 'app-assistant-dock',
  imports: [Icon, RouterLink, JobAssistant],
  template: `
    <div class="fixed bottom-4 right-4 z-50 w-[34rem] max-w-[calc(100vw-2rem)] card shadow-2xl
                flex flex-col overflow-hidden"
         role="region" [attr.aria-label]="'Assistant for ' + (jobName() || 'job #' + jobId())"
         [style.height]="minimised() ? 'auto' : 'min(40rem, calc(100vh - 3rem))'">
      <div class="flex items-center gap-2 px-3.5 py-2.5 border-b shrink-0 border-subtle">
        <app-icon name="chat" size="0.95em" class="icon-info shrink-0" />
        <span class="text-sm font-medium mr-auto truncate" [title]="jobName() || 'Job assistant'">
          {{ jobName() || 'Job assistant' }}
          <span class="text-[color:var(--text-muted)] font-normal">#{{ jobId() }}</span>
        </span>
        <a class="btn btn-ghost btn-sm" [routerLink]="['/operations/jobs', jobId(), 'assistant']"
           title="Open the full page"><app-icon name="maximize" />Full page</a>
        <button type="button" class="btn btn-ghost btn-icon"
                (click)="minimised.set(!minimised())"
                [attr.aria-expanded]="!minimised()"
                [attr.aria-label]="minimised() ? 'Expand' : 'Minimise'">
          <app-icon [name]="minimised() ? 'chevronRight' : 'chevronDown'" />
        </button>
        <button type="button" class="btn btn-ghost btn-icon" (click)="closed.emit()"
                aria-label="Close"><app-icon name="close" /></button>
      </div>

      @if (!minimised()) {
        <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
          <!-- Guarded on the id itself: String(undefined) is the text "undefined", which would
               travel into every link this panel builds and reach the server as a job id. -->
          @if (jobId()) {
            <app-job-assistant [jobId]="jobId()" [compact]="true" />
          }
        </div>
      }
    </div>
  `,
})
export class AssistantDock {
  readonly jobId = input.required<string>();
  /** The job's name when the screen knows it; the panel falls back to "Job assistant". */
  readonly jobName = input('');
  /** Owned by the screen, so opening the panel on another job can show it expanded again. */
  readonly minimised = model(false);
  readonly closed = output<void>();
}

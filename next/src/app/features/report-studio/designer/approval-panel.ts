import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { ReportStudioApi, studioError } from '../report-studio.api';
import { Problem, TemplateDetail } from '../report-studio.model';
import { ProblemList } from '../problem-list';

export interface ApprovalData { templateId: string; name: string; version: number; revision: number; }

/**
 * "Ask for approval" (MIG-404, the designer's header): the saved draft, valid, is put forward with a note; the request
 * shows on the template until someone who may publish (report-publish) publishes it, or the draft is discarded. A draft
 * saved after the request says so, so the approver knows what they read is not what is asked about. The approval
 * workflow in the Task inbox comes in phase 7.
 */
@Component({
  selector: 'app-rs-approval-panel',
  imports: [SidePanel, Icon, FormsModule, ProblemList],
  template: `
    <app-side-panel [heading]="'Ask for approval: ' + data.name + ' v' + data.version"
                    subtitle="Someone who may publish templates reviews the draft. Nothing changes until it is published.">
      <div class="form-stack">
        <label class="field">
          <span class="label">Note for the approver (optional)</span>
          <textarea class="input text-sm" rows="4" maxlength="500" [ngModel]="note()" (ngModelChange)="note.set($event)" aria-label="Note"
                    placeholder="Department chart changed; the table now shows September."></textarea>
        </label>
        <p class="text-xs text-[color:var(--text-muted)]">Revision {{ data.revision }} of the draft is the one put forward. Saving again afterwards is shown on the request.</p>
        @if (error()) {
          <div role="alert" class="flex flex-col gap-2">
            <p class="field-note text-[color:var(--crit-text)]">{{ error() }}</p>
            @if (problems().length) { <app-report-problems [problems]="problems()" /> }
          </div>
        }
      </div>
      <div foot class="flex justify-end gap-2">
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="ask()"><app-icon name="send" />Ask for approval</button>
      </div>
    </app-side-panel>
  `,
})
export class ApprovalPanel {
  readonly data = inject<ApprovalData>(DIALOG_DATA);
  readonly ref = inject<DialogRef<TemplateDetail | undefined>>(DialogRef);
  private readonly api = inject(ReportStudioApi);
  readonly note = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly problems = signal<Problem[]>([]);

  ask(): void {
    this.busy.set(true);
    this.error.set('');
    this.api.requestApproval(this.data.templateId, this.data.revision, this.note().trim()).subscribe({
      next: t => { this.busy.set(false); this.ref.close(t); },
      error: e => {
        this.busy.set(false);
        const err = studioError(e, 'The request could not be made.');
        this.error.set(err.message);
        this.problems.set(err.problems);
      },
    });
  }
}

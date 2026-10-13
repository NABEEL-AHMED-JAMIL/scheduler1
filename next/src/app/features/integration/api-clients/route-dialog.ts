import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { ToastService } from '../../../shared/ui/toast.service';
import { ApiClientsApi, EventRouteRow, RouteTarget } from './api-clients.api';

export interface RouteDialogData {
  pipelines: RouteTarget[];
  route?: EventRouteRow | null;
}

/**
 * MIG-332: one event route -- an event type of your own systems (order.received) and the pipeline or workflow it starts,
 * optionally checking the event's data against one of your data contracts first.
 */
@Component({
  selector: 'app-event-route-dialog',
  imports: [Field, FormDialog],
  template: `
    <app-form-dialog [heading]="data.route ? 'Change the route for ' + data.route.eventType : 'New event route'"
        subtitle="POST /v1/events with this type starts what the route names."
        [confirmLabel]="data.route ? 'Save' : 'Add route'" busyLabel="Saving…"
        [saving]="saving()" [confirmDisabled]="!ready()" (cancelled)="ref.close(false)" (confirmed)="save()">
      <app-field label="Event type" for="routeType" hint="Letters, digits and . _ : -, such as order.received." [required]="true">
        <input id="routeType" class="input mono" maxlength="128" [value]="eventType()" (input)="eventType.set($any($event.target).value)"
               cdkFocusInitial />
      </app-field>
      <app-field label="Starts" for="routeKind">
        <select id="routeKind" class="input" [value]="kind()" (change)="kind.set($any($event.target).value)">
          <option value="PIPELINE">A pipeline's run</option>
          <option value="WORKFLOW">A workflow request</option>
        </select>
      </app-field>
      @if (kind() === 'PIPELINE') {
        <app-field label="Pipeline" for="routeJob">
          <select id="routeJob" class="input" [value]="jobId() ?? ''" (change)="jobId.set(num($any($event.target).value))">
            <option value="">Choose a pipeline</option>
            @for (p of data.pipelines; track p.jobId) { <option [value]="p.jobId">{{ p.name }}</option> }
          </select>
        </app-field>
      } @else {
        <app-field label="Workflow key" for="routeWorkflow" hint="The key of one of your workflows.">
          <input id="routeWorkflow" class="input mono" maxlength="128" [value]="workflowKey()"
                 (input)="workflowKey.set($any($event.target).value)" />
        </app-field>
      }
      <app-field label="Data contract (optional)" for="routeContract" hint="The name of a data contract the event's data must meet.">
        <input id="routeContract" class="input" maxlength="255" [value]="contractName()" (input)="contractName.set($any($event.target).value)" />
      </app-field>
      <label class="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" class="checkbox" [checked]="active()" (change)="active.set($any($event.target).checked)" />Active
      </label>
      @if (error()) { <p class="text-sm text-[color:var(--color-crit-500)]" role="alert">{{ error() }}</p> }
    </app-form-dialog>
  `,
})
export class RouteDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<RouteDialogData>(DIALOG_DATA);
  private readonly api = inject(ApiClientsApi);
  private readonly toast = inject(ToastService);

  readonly eventType = signal(this.data.route?.eventType ?? '');
  readonly kind = signal<'PIPELINE' | 'WORKFLOW'>(this.data.route?.targetKind ?? 'PIPELINE');
  readonly jobId = signal<number | null>(this.data.route?.jobId ?? null);
  readonly workflowKey = signal(this.data.route?.workflowKey ?? '');
  readonly contractName = signal(this.data.route?.contractName ?? '');
  readonly active = signal(this.data.route?.active ?? true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly ready = computed(() => !!this.eventType().trim() && !this.saving()
    && (this.kind() === 'PIPELINE' ? !!this.jobId() : !!this.workflowKey().trim()));

  num(value: string): number | null {
    const n = Number(value);
    return value && Number.isFinite(n) ? n : null;
  }

  save(): void {
    if (!this.ready()) return;
    this.saving.set(true);
    this.error.set('');
    const pipeline = this.kind() === 'PIPELINE';
    this.api.saveRoute({
      routeId: this.data.route?.routeId ?? null, eventType: this.eventType().trim(), targetKind: this.kind(),
      jobId: pipeline ? this.jobId() : null, workflowKey: pipeline ? null : this.workflowKey().trim(),
      contractName: this.contractName().trim() || null, contractVersion: this.data.route?.contractVersion ?? null, active: this.active(),
    }).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status === API_SUCCESS) {
          this.toast.success(r.message || 'Event route saved.');
          this.ref.close(true);
        } else {
          this.error.set(r.message || 'The route was refused.');
        }
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'The route could not be saved.'); },
    });
  }
}

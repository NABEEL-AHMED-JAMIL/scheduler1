import { Component, computed, inject, signal } from '@angular/core';
import { Combobox } from '../../../shared/ui/combobox';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/ui/icon';
import { parseTopicPartition, formatTopicPartition } from '../../../shared/ui/topic';

export interface TaskType {
  /** The author's id, so "Only mine" can match on identity rather than display text. */
  createdBy?: number | null;

  /** Filled in by the server on the way out; null on rows with no recorded author. */
  createdByName?: string | null;
  updatedByName?: string | null;

  sourceTaskTypeId?: number;
  serviceName: string;
  description?: string;
  queueTopicPartition?: string;
  status?: string;
  totalTaskLink?: number;
  kafkaConnectionProfileId?: number | null;
  kafkaConnectionProfileName?: string;
}

@Component({
  selector: 'app-task-type-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog, Icon, Combobox],
  template: `
    <app-form-dialog
        [heading]="isEdit() ? 'Edit topic' : 'New topic'"
        subtitle="A Kafka topic and the consumer behind it. Tasks pick a topic; the topic decides where their messages go."
        [confirmLabel]="isEdit() ? 'Save changes' : 'Create'"
        [saving]="saving()"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <form [formGroup]="form" class="form-stack">
        <app-field label="Name" for="serviceName" [required]="true"
                   [control]="form.get('serviceName')" [submitted]="submitted()"
                   hint="How the topic appears when a task picks it — usually the consumer's name.">
          <input id="serviceName" class="input" formControlName="serviceName"
                 placeholder="ETL Scrapping Pipeline" />
        </app-field>

        @if (needsWorkspace()) {
          <app-field label="Workspace" for="ttTenant" [required]="true"
                     [control]="form.get('tenantId')" [submitted]="submitted()"
                     hint="A topic belongs to one workspace; only that workspace's tasks can pick it.">
            <app-combobox id="ttTenant" formControlName="tenantId" [numeric]="true"
                          placeholder="Search workspaces…" [allowClear]="false" [options]="tenantOptions()" />
          </app-field>
        }

        <app-field label="Description" for="ttDescription"
                   [control]="form.get('description')" [submitted]="submitted()">
          <textarea id="ttDescription" class="input" rows="2" formControlName="description"
                    placeholder="What this consumer does"></textarea>
        </app-field>

        <div class="form-grid">
          <app-field label="Kafka topic" for="topic" [required]="true"
                     [control]="form.get('topic')" [submitted]="submitted()"
                     hint="Letters, digits, dots, underscores and hyphens — up to 249 characters."
                     [errorMessages]="{ pattern: 'Use letters, digits, dots, underscores or hyphens, such as test-user-1-topic.' }">
            <input id="topic" class="input mono" formControlName="topic" placeholder="scrapping-topic" />
          </app-field>

          <app-field label="Partition" for="partitions"
                     [control]="form.get('partitions')" [submitted]="submitted()"
                     hint="* for every partition, or one index from 0 to 10."
                     [errorMessages]="{ pattern: 'Use * or a single index from 0 to 10 — a list is not supported.' }">
            <input id="partitions" class="input mono" formControlName="partitions" placeholder="*" />
          </app-field>
        </div>

        <p class="field-note text-[color:var(--text-muted)] flex items-start gap-1.5">
          <app-icon name="server" size="0.9em" class="mt-px shrink-0" />
          <span>Publishes through <strong>{{ data.profileName || 'the profile it was opened from' }}</strong>.
            A topic belongs to the connection it was added under; to move it, add it under the other one.</span>
        </p>

        <app-field label="Status" for="ttStatus" [control]="form.get('status')" [submitted]="submitted()">
          <select id="ttStatus" class="input" formControlName="status">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </app-field>
      </form>
    </app-form-dialog>
  `,
})
export class TaskTypeDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{
    type?: TaskType;
    profiles: any[];
    /** The profile the dialog was opened from: the topic publishes through it, no choice offered. */
    defaultProfileId?: number | null;
    profileName?: string;
    /** The workspace a new topic belongs to, when the caller already knows it. */
    tenantId?: number | null;
    /** Offered to a platform admin who has to say which workspace a new topic is for. */
    tenants?: { tenantId: number; tenantName: string }[];
  }>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly isEdit = computed(() => !!this.data.type?.sourceTaskTypeId);


  /**
   * The server refuses a platform admin's new topic without a workspace (validateTaskTypeOwner):
   * a platform admin has no tenant of their own to file it under. Asked only when the caller
   * did not already say -- opened from a tenant's Kafka profile, the workspace is that tenant's.
   */
  readonly tenantOptions = computed(() => (this.data.tenants ?? []).map(t => ({ value: String(t.tenantId), label: t.tenantName })));

  readonly needsWorkspace = computed(() =>
    !this.isEdit() && this.auth.isPlatformAdmin() && this.data.tenantId == null);

  /** Stored as one string, "topic=x&partitions=[*]", but edited as two fields. */
  private parse(value?: string) { return parseTopicPartition(value); }

  readonly form: FormGroup = this.fb.group({
    sourceTaskTypeId: [this.data.type?.sourceTaskTypeId ?? null],
    serviceName: [this.data.type?.serviceName ?? '', Validators.required],
    description: [this.data.type?.description ?? ''],
    // The server's own pattern is ^topic=([a-zA-Z0-9._-]{1,249})&partitions=\[([0-9]+|\*)\]$
    // (see KafkaTopicPartitionUtil) -- letters, digits, dots, underscores and hyphens, since
    // the broker itself accepts all of those and names like "orders-v2" or "etl.jobs" are
    // real topics. A comma-separated partition list is still rejected. Enforced here to fail
    // in the field rather than as an error after save.
    topic: [this.parse(this.data.type?.queueTopicPartition).topic,
      [Validators.required, Validators.pattern(/^[a-zA-Z0-9._-]{1,249}$/)]],
    partitions: [this.parse(this.data.type?.queueTopicPartition).partitions,
      Validators.pattern(/^(\*|10|[0-9])$/)],
    // The type's own default -- saved on the type itself and shared with every tenant that
    // uses it (KafkaConnectionResolver falls back to it once no tenant override applies).
    defaultKafkaConnectionProfileId: [this.data.type?.kafkaConnectionProfileId ?? this.data.defaultProfileId ?? null],
    tenantId: [this.data.tenantId ?? null, this.needsWorkspace() ? Validators.required : []],
    status: [this.data.type?.status ?? 'Active'],
  });

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    const value = this.form.getRawValue();
    const payload: any = {
      sourceTaskTypeId: value.sourceTaskTypeId,
      serviceName: value.serviceName,
      description: value.description,
      queueTopicPartition: formatTopicPartition(value.topic, value.partitions),
      kafkaConnectionProfileId: value.defaultKafkaConnectionProfileId,
      status: value.status,
      tenantId: value.tenantId,
    };

    this.saving.set(true);
    const request = this.isEdit()
      ? this.http.put<ApiResponse>(`${API_BASE}/setting.json/updateSourceTaskType`, payload)
      : this.http.post<ApiResponse>(`${API_BASE}/setting.json/addSourceTaskType`, payload);

    request.subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          this.saving.set(false);
          this.toast.error(response.message);
          return;
        }
        this.saving.set(false);
        this.toast.success(response.message);
        this.ref.close(true);
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'The topic could not be saved.');
      },
    });
  }

}

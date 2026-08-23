import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
  imports: [ReactiveFormsModule, Field, FormDialog, Icon],
  template: `
    <app-form-dialog
        [heading]="isEdit() ? 'Edit task type' : 'New task type'"
        subtitle="Names a downstream consumer and the Kafka topic that reaches it."
        [confirmLabel]="isEdit() ? 'Save changes' : 'Create'"
        [saving]="saving()"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <form [formGroup]="form" class="form-stack">
        <app-field label="Service name" for="serviceName" [required]="true"
                   [control]="form.get('serviceName')" [submitted]="submitted()">
          <input id="serviceName" class="input" formControlName="serviceName"
                 placeholder="ETL Scrapping Pipeline" />
        </app-field>

        <app-field label="Description" for="ttDescription"
                   [control]="form.get('description')" [submitted]="submitted()">
          <textarea id="ttDescription" class="input" rows="2" formControlName="description"
                    placeholder="What this consumer does"></textarea>
        </app-field>

        <div class="form-grid">
          <app-field label="Topic" for="topic" [required]="true"
                     [control]="form.get('topic')" [submitted]="submitted()"
                     hint="Letters and hyphens only — the server rejects digits, dots and underscores."
                     [errorMessages]="{ pattern: 'Use letters and hyphens only, such as scrapping-topic.' }">
            <input id="topic" class="input mono" formControlName="topic" placeholder="scrapping-topic" />
          </app-field>

          <app-field label="Partition" for="partitions"
                     [control]="form.get('partitions')" [submitted]="submitted()"
                     hint="* for every partition, or one index from 0 to 10."
                     [errorMessages]="{ pattern: 'Use * or a single index from 0 to 10 — a list is not supported.' }">
            <input id="partitions" class="input mono" formControlName="partitions" placeholder="*" />
          </app-field>
        </div>

        @if (canRoute()) {
          <app-field label="Kafka connection" for="kafkaProfile"
                     [control]="form.get('kafkaConnectionProfileId')" [submitted]="submitted()"
                     hint="Leave unset to publish to your tenant's default cluster.">
            <select id="kafkaProfile" class="input" formControlName="kafkaConnectionProfileId">
              <option [ngValue]="null">Tenant default</option>
              @for (profile of data.profiles; track profile.kafkaConnectionProfileId) {
                <option [ngValue]="profile.kafkaConnectionProfileId">
                  {{ profile.profileName }}@if (profile.environmentLabel) { ({{ profile.environmentLabel }}) }
                </option>
              }
            </select>
          </app-field>
        } @else {
          <p class="field-note text-[color:var(--text-muted)] flex items-start gap-1.5">
            <app-icon name="info" size="0.9em" class="mt-px shrink-0" />
            <span>
              Kafka routing is a per-tenant override, so it is set by a tenant admin rather than
              here — a platform admin publishes unscoped.
            </span>
          </p>
        }

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
export class TaskTypeDialog implements OnInit {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ type?: TaskType; profiles: any[] }>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly isEdit = computed(() => !!this.data.type?.sourceTaskTypeId);

  /**
   * The route endpoints reject a platform admin outright -- the override is scoped to a
   * tenant and a platform admin has none. Offering the control would be offering a failure.
   */
  readonly canRoute = computed(() => !this.auth.isPlatformAdmin());

  /** Stored as one string, "topic=x&partitions=[*]", but edited as two fields. */
  private parse(value?: string) { return parseTopicPartition(value); }

  readonly form: FormGroup = this.fb.group({
    sourceTaskTypeId: [this.data.type?.sourceTaskTypeId ?? null],
    serviceName: [this.data.type?.serviceName ?? '', Validators.required],
    description: [this.data.type?.description ?? ''],
    // The server's own pattern is ^topic=([a-zA-Z-]*)&partitions=\[([0-9]+|\*)\]$, so a
    // digit in the topic or a comma-separated partition list is rejected. Enforced here to
    // fail in the field rather than as an error after save.
    topic: [this.parse(this.data.type?.queueTopicPartition).topic,
      [Validators.required, Validators.pattern(/^[a-zA-Z-]+$/)]],
    partitions: [this.parse(this.data.type?.queueTopicPartition).partitions,
      Validators.pattern(/^(\*|10|[0-9])$/)],
    kafkaConnectionProfileId: [this.data.type?.kafkaConnectionProfileId ?? null],
    status: [this.data.type?.status ?? 'Active'],
  });

  ngOnInit(): void {
    // The route is stored separately from the type, so it is read separately too.
    const id = this.data.type?.sourceTaskTypeId;
    if (!id || !this.canRoute()) return;
    this.http.get<ApiResponse<any>>(`${API_BASE}/setting.json/fetchKafkaRoute`,
      { params: { sourceTaskTypeId: id } }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) return;
        const routed = response.data?.kafkaConnectionProfileId ?? response.data?.profileId ?? null;
        if (routed) this.form.patchValue({ kafkaConnectionProfileId: routed });
      },
    });
  }

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
      status: value.status,
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
        const id = value.sourceTaskTypeId ?? (response.data as any)?.sourceTaskTypeId;
        this.applyRoute(id, value.kafkaConnectionProfileId, response.message);
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'The task type could not be saved.');
      },
    });
  }

  /** Routing lives behind its own endpoints, so it is a second call after the type is saved. */
  private applyRoute(id: number | undefined, profileId: number | null, message: string): void {
    const done = () => { this.saving.set(false); this.toast.success(message); this.ref.close(true); };
    if (!id || !this.canRoute()) { done(); return; }

    const call = profileId
      ? this.http.put<ApiResponse>(`${API_BASE}/setting.json/setKafkaRoute`, null,
          { params: { sourceTaskTypeId: id, kafkaConnectionProfileId: profileId } })
      : this.http.delete<ApiResponse>(`${API_BASE}/setting.json/deleteKafkaRoute`,
          { params: { sourceTaskTypeId: id } });

    call.subscribe({
      next: () => done(),
      // The type itself saved; a routing failure should say so rather than look like a total failure.
      error: () => {
        this.saving.set(false);
        this.toast.error('Saved, but the Kafka route could not be applied.');
        this.ref.close(true);
      },
    });
  }
}

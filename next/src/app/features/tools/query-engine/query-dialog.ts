import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Icon } from '../../../shared/ui/icon';
import { DbConnection, PreviewResult, QueryDefinition } from './types';

@Component({
  selector: 'app-query-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog, Icon],
  template: `
    <app-form-dialog
        [heading]="isEdit() ? 'Edit query' : 'New query'"
        subtitle="Check it against the connection before saving — preview reads a few rows only."
        [confirmLabel]="isEdit() ? 'Save changes' : 'Create'"
        [saving]="saving()"
        (cancelled)="ref.close(false)" (confirmed)="save()">

      <ng-container footer-start>
        <button type="button" class="btn btn-default btn-sm" [disabled]="busy()" (click)="validate()">
          <app-icon [name]="validating() ? 'refresh' : 'check'" [class.spin]="validating()" />
          Validate
        </button>
        <button type="button" class="btn btn-default btn-sm btn-intent-ok" [disabled]="busy()" (click)="preview()">
          <app-icon [name]="previewing() ? 'refresh' : 'play'" [class.spin]="previewing()" />
          Preview
        </button>
      </ng-container>

      <form [formGroup]="form" class="form-stack">
        <div class="form-grid">
          <app-field label="Query name" for="queryName" [required]="true"
                     [control]="form.get('queryName')" [submitted]="submitted()">
            <input id="queryName" class="input" formControlName="queryName"
                   placeholder="Daily order totals" />
          </app-field>

          <app-field label="Connection" for="connectionId" [required]="true"
                     [control]="form.get('databaseConnectionProfileId')" [submitted]="submitted()"
                     [hint]="data.connections.length ? '' : 'Add a database connection first.'">
            <select id="connectionId" class="input" formControlName="databaseConnectionProfileId">
              <option [ngValue]="null">Select a connection</option>
              @for (c of data.connections; track c.databaseConnectionProfileId) {
                <option [ngValue]="c.databaseConnectionProfileId">
                  {{ c.profileName }} — {{ c.databaseName }}
                </option>
              }
            </select>
          </app-field>
        </div>

        <app-field label="SQL" for="queryText" [required]="true"
                   [control]="form.get('queryText')" [submitted]="submitted()"
                   hint="Read-only statements. The result is written to storage when the query runs.">
          <textarea id="queryText" class="input mono leading-relaxed" rows="9"
                    formControlName="queryText" spellcheck="false"
                    placeholder="select created_at::date as day, count(*) as orders&#10;from orders&#10;group by 1 order by 1 desc"></textarea>
        </app-field>

        @if (validation(); as v) {
          <div class="card flex items-start gap-2 px-3 py-2.5 text-sm"
               [style.border-color]="v.ok ? 'var(--color-ok-500)' : 'var(--color-crit-500)'">
            <app-icon [name]="v.ok ? 'checkCircle' : 'xCircle'"
                      [class]="v.ok ? 'icon-ok' : 'icon-crit'" class="mt-0.5 shrink-0" />
            <span>{{ v.message }}</span>
          </div>
        }

        @if (previewResult(); as p) {
          <div class="form-section">
            <div class="form-section-title flex items-center gap-2">
              Preview
              <span class="pill pill-neutral">{{ p.rows.length }} rows</span>
              @if (p.truncated) {
                <span class="pill pill-warn"><app-icon name="alert" size="0.85em" />truncated</span>
              }
            </div>
            @if (!p.rows.length) {
              <p class="text-sm text-[color:var(--text-muted)]">The query ran and returned no rows.</p>
            } @else {
              <div class="overflow-auto max-h-64 rounded-md border" style="border-color: var(--border-subtle);">
                <table class="table-modern">
                  <thead><tr>@for (col of p.columns; track col) { <th>{{ col }}</th> }</tr></thead>
                  <tbody>
                    @for (row of p.rows; track $index) {
                      <tr>@for (cell of row; track $index) {
                        <td class="mono whitespace-nowrap">{{ cell === null ? '—' : cell }}</td>
                      }</tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }

        <app-field label="Status" for="queryStatus" [control]="form.get('status')" [submitted]="submitted()">
          <select id="queryStatus" class="input" formControlName="status">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </app-field>
      </form>
    </app-form-dialog>
  `,
})
export class QueryDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ query?: QueryDefinition; connections: DbConnection[] }>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly saving = signal(false);
  readonly validating = signal(false);
  readonly previewing = signal(false);
  readonly submitted = signal(false);
  readonly validation = signal<{ ok: boolean; message: string } | null>(null);
  readonly previewResult = signal<PreviewResult | null>(null);
  readonly isEdit = computed(() => !!this.data.query);
  readonly busy = computed(() => this.saving() || this.validating() || this.previewing());

  readonly form: FormGroup = this.fb.group({
    queryId: [this.data.query?.queryId ?? null],
    queryName: [this.data.query?.queryName ?? '', Validators.required],
    queryText: [this.data.query?.queryText ?? '', Validators.required],
    databaseConnectionProfileId: [this.data.query?.databaseConnectionProfileId ?? null, Validators.required],
    status: [this.data.query?.status ?? 'Active'],
  });

  private runnable(): boolean {
    const { queryText, databaseConnectionProfileId } = this.form.getRawValue();
    if (!queryText || !databaseConnectionProfileId) {
      this.toast.error('Pick a connection and write a query first.');
      return false;
    }
    return true;
  }

  validate(): void {
    if (!this.runnable()) return;
    this.validating.set(true);
    this.validation.set(null);
    const { queryText, databaseConnectionProfileId } = this.form.getRawValue();
    this.http.post<ApiResponse<any>>(`${API_BASE}/queryEngine.json/queries/validate`,
      { queryText, databaseConnectionProfileId }).subscribe({
      next: r => {
        this.validating.set(false);
        const valid = r.status === API_SUCCESS && (r.data?.valid ?? true);
        this.validation.set({ ok: valid, message: r.data?.message || r.message });
      },
      error: e => {
        this.validating.set(false);
        this.validation.set({ ok: false, message: e?.error?.message || 'The query could not be validated.' });
      },
    });
  }

  preview(): void {
    if (!this.runnable()) return;
    this.previewing.set(true);
    this.previewResult.set(null);
    const { queryText, databaseConnectionProfileId } = this.form.getRawValue();
    this.http.post<ApiResponse<PreviewResult>>(`${API_BASE}/queryEngine.json/queries/preview`,
      { queryText, databaseConnectionProfileId }).subscribe({
      next: r => {
        this.previewing.set(false);
        if (r.status === API_SUCCESS && r.data) {
          this.previewResult.set({ columns: r.data.columns ?? [], rows: r.data.rows ?? [], truncated: r.data.truncated });
          this.validation.set({ ok: true, message: 'The query ran against the connection.' });
        } else {
          this.validation.set({ ok: false, message: r.message });
        }
      },
      error: e => {
        this.previewing.set(false);
        this.validation.set({ ok: false, message: e?.error?.message || 'The preview could not be run.' });
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
    this.saving.set(true);
    const payload = this.form.getRawValue();
    const req = this.isEdit()
      ? this.http.put<ApiResponse>(`${API_BASE}/queryEngine.json/queries/update`, payload)
      : this.http.post<ApiResponse>(`${API_BASE}/queryEngine.json/queries/add`, payload);
    req.subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status === API_SUCCESS) { this.toast.success(r.message); this.ref.close(true); }
        else this.toast.error(r.message);
      },
      error: e => { this.saving.set(false); this.toast.error(e?.error?.message || 'The query could not be saved.'); },
    });
  }
}

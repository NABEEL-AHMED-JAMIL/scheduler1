import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { EngineSetting, fetchLimitError } from './configuration.models';

const ENDPOINT = () => `${API_BASE}/setting.json/engineSettings`;

/** The only setting a person may change here; everything else on the list is a cron's own. */
const EDITABLE_KEYS = new Set(['QUEUE_FETCH_LIMIT']);

/**
 * Engine settings, platform administrators only: the scheduler's fetch limit, and the two
 * watermarks the scheduler and the audit-log sync write on every pass. The watermarks are shown
 * so a stalled cron can be seen, and never offered for editing -- a hand-set watermark makes
 * the next pass skip or replay work.
 */
@Component({
  selector: 'app-engine-settings',
  imports: [TableShell, Icon, ServerTimePipe],
  templateUrl: './engine-settings.html',
})
export class EngineSettings implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly settings = signal<EngineSetting[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  /** The key being edited, and what is typed for it. */
  readonly editing = signal<string | null>(null);
  readonly draft = signal('');
  readonly draftError = signal('');
  readonly saving = signal(false);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<EngineSetting[]>>(ENDPOINT()).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        this.settings.set(response.data ?? []);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load the engine settings.');
      },
    });
  }

  /** Both the server's flag and the console's own list have to agree before an edit is offered. */
  canEdit(setting: EngineSetting): boolean {
    return setting.editable && EDITABLE_KEYS.has(setting.key);
  }

  startEdit(setting: EngineSetting): void {
    if (!this.canEdit(setting)) return;
    this.editing.set(setting.key);
    this.draft.set(setting.value ?? '');
    this.draftError.set('');
  }

  cancel(): void {
    this.editing.set(null);
    this.draftError.set('');
  }

  onDraft(text: string): void {
    this.draft.set(text);
    if (this.draftError()) this.draftError.set(fetchLimitError(text) ?? '');
  }

  save(): void {
    const key = this.editing();
    if (!key) return;
    const value = this.draft();
    const problem = fetchLimitError(value);
    if (problem) { this.draftError.set(problem); return; }
    this.draftError.set('');
    this.saving.set(true);
    this.http.put<ApiResponse<EngineSetting>>(ENDPOINT(), { key, value }).subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status !== API_SUCCESS) { this.toast.error(response.message); return; }
        const saved = response.data;
        this.settings.update(list => list.map(s => (s.key === key ? { ...s, ...(saved ?? { value }) } : s)));
        this.editing.set(null);
        this.toast.success(response.message || `${key} saved.`);
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'The setting could not be saved.');
      },
    });
  }
}

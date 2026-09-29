import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { Field } from '../../../shared/ui/field';
import {
  AUTH_MODES, BODY_TYPES, CollectionRow, EnvironmentRow, FolderRow, METHODS, PAGING_TYPES, PairRow, RequestEdit, RunResult,
  authLabel, authSettingsFor, blankRequest, bodyLabel, effectiveAuthMode, referenceName, requestEditOf, requestSaveOf,
} from './api-collections.model';
import { ApiCollectionsApi } from './api-collections.service';
import { PairsEditor } from './pairs-editor';
import { ResponseViewer } from './response-viewer';
import { folderOptions } from './folders';
import { LastTests } from './last-tests';

export interface RequestPanelData {
  collection: CollectionRow;
  /** null: a new API. */
  requestId: number | null;
  /** Where a new API goes. */
  folderId?: number | null;
  folders: FolderRow[];
  environments: EnvironmentRow[];
  /** The collection's default auth (only {{variables}}), for what "From the collection" signs in with. */
  defaultAuth: unknown;
  canManage: boolean;
}

type Tab = 'params' | 'headers' | 'auth' | 'body' | 'schemas' | 'settings';

/** Whether a {{variable}} an auth setting names is set in the environment a test runs with -- never its value. */
type SecretState = 'configured' | 'not set' | 'plain' | 'missing' | null;

/**
 * Edit, test and save one API (MIG-247), in the wide side panel. Every save is a new version of the collection.
 * The runner tests what is saved -- it takes the request's id, not its fields -- so unsaved changes are saved first
 * and the button says so. The answer comes back masked; a secret the run used never reaches the browser.
 */
@Component({
  selector: 'app-request-panel',
  imports: [SidePanel, Icon, Field, PairsEditor, ResponseViewer],
  templateUrl: './request-panel.html',
})
export class RequestPanel {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<RequestPanelData>(DIALOG_DATA);
  private readonly api = inject(ApiCollectionsApi);
  private readonly toast = inject(ToastService);
  private readonly lastTests = inject(LastTests);

  readonly methods = METHODS;
  readonly bodyTypes = BODY_TYPES;
  readonly authModes = AUTH_MODES;
  readonly pagingTypes = PAGING_TYPES;
  readonly folders = folderOptions(this.data.folders);
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'params', label: 'Params' }, { id: 'headers', label: 'Headers' }, { id: 'auth', label: 'Auth' },
    { id: 'body', label: 'Body' }, { id: 'schemas', label: 'Schemas' }, { id: 'settings', label: 'Settings' },
  ];
  readonly urlPlaceholder = '{{baseUrl}}/v1/patients';
  readonly envHint = 'Where its {{variables}} come from.';
  readonly variableHint = 'Write {{name}} to take a value from the environment; a credential is always a {{variable}}.';

  readonly edit = signal<RequestEdit | null>(null);
  private readonly savedAs = signal('');
  private changed = false;
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly saving = signal(false);
  readonly testing = signal(false);
  readonly error = signal('');
  readonly result = signal<RunResult | null>(null);
  readonly tab = signal<Tab>('params');
  readonly environmentId = signal<number | null>(
    (this.data.environments.find(e => e.isDefault) ?? this.data.environments[0])?.environmentId ?? null);
  readonly runVariables = signal<PairRow[]>([]);

  readonly dirty = computed(() => !!this.edit() && JSON.stringify(this.edit()) !== this.savedAs());
  readonly heading = computed(() => {
    const e = this.edit();
    if (!e?.requestId) return this.data.requestId ? 'API' : 'New API';
    return `${this.data.canManage ? 'Edit API' : 'API'} · ${e.name}`;
  });
  readonly testLabel = computed(() => !this.edit()?.requestId || this.dirty() ? 'Save & test' : 'Test');
  readonly busy = computed(() => this.saving() || this.testing());

  /** What the request signs in with: its own scheme, or the collection's, with each setting from the default auth. */
  readonly authView = computed(() => {
    const e = this.edit();
    const mode = effectiveAuthMode(e?.authMode, this.data.defaultAuth);
    const env = this.data.environments.find(x => x.environmentId === this.environmentId());
    const settings = authSettingsFor(mode, this.data.defaultAuth).map(([key, value]) => ({ key, value, secret: this.stateOf(value, env) }));
    return { mode, settings };
  });

  constructor() {
    if (this.data.requestId) {
      this.loading.set(true);
      this.api.getRequest(this.data.requestId).subscribe({
        next: r => {
          this.loading.set(false);
          if (r.status !== API_SUCCESS || !r.data) { this.loadError.set(r.message); return; }
          this.take(requestEditOf(r.data));
        },
        error: err => { this.loading.set(false); this.loadError.set(err?.error?.message || 'Could not read the API.'); },
      });
    } else {
      this.take(blankRequest(this.data.collection.collectionId, this.data.folderId ?? null), false);
    }
  }

  private take(e: RequestEdit, saved = true): void {
    this.edit.set(e);
    this.savedAs.set(saved ? JSON.stringify(e) : '');
  }

  private stateOf(value: string, env: EnvironmentRow | undefined): SecretState {
    const name = referenceName(value);
    if (!name) return null;
    const variable = env?.variables.find(v => v.key === name);
    if (!variable) return 'missing';
    if (!variable.secret) return 'plain';
    return variable.configured ? 'configured' : 'not set';
  }

  authText(mode: string): string { return authLabel(mode); }
  bodyText(type: string): string { return bodyLabel(type); }

  patch(change: Partial<RequestEdit>): void {
    this.edit.update(e => e ? { ...e, ...change } : e);
    this.error.set('');
  }

  /** A number input's text, as the editor keeps it. */
  num(event: Event): string { return String((event.target as HTMLInputElement).value ?? ''); }

  save(then?: () => void): void {
    const e = this.edit();
    if (!e || !this.data.canManage) return;
    const out = requestSaveOf(e);
    if ('error' in out) { this.error.set(out.error); return; }
    this.error.set('');
    this.saving.set(true);
    this.api.saveRequest(out.body).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message); return; }
        this.changed = true;
        this.take({ ...e, requestId: r.data.id });
        if (then) then(); else this.toast.success(`Saved as version ${r.data.version ?? ''}.`.replace(' .', '.'));
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'The API could not be saved.'); },
    });
  }

  /** Runs the saved API; unsaved changes are saved first, since the runner reads the saved definition. */
  test(): void {
    if (!this.data.canManage || !this.edit()) return;
    if (!this.edit()!.requestId || this.dirty()) { this.save(() => this.run()); return; }
    this.run();
  }

  private run(): void {
    const requestId = this.edit()?.requestId;
    if (!requestId) return;
    const variables = Object.fromEntries(this.runVariables().filter(v => v.enabled && v.key.trim()).map(v => [v.key.trim(), v.value]));
    this.testing.set(true);
    this.error.set('');
    this.api.test({ requestId, environmentId: this.environmentId(), variables }).subscribe({
      next: r => {
        this.testing.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.result.set(null); this.error.set(r.message); return; }
        this.result.set(r.data);
        this.lastTests.record(requestId, r.data);
      },
      error: err => { this.testing.set(false); this.error.set(err?.error?.message || 'The test could not run.'); },
    });
  }

  close(): void { this.ref.close(this.changed); }
}

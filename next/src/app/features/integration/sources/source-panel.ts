import { Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Observable } from 'rxjs';
import { API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { Field } from '../../../shared/ui/field';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ComboboxOption } from '../../../shared/ui/combobox';
import { ApiCollectionsApi } from '../api-collections/api-collections.service';
import { CollectionRow, EnvironmentRow, RequestRow } from '../api-collections/api-collections.model';
import {
  BucketRow, ConnectionRow, FORMATS, PreviewResult, SchemaField, SourceDetail, SourceEdit, SourceKind, blankSource, formatLabel,
  kindLabel, sourceEditOf, sourceSaveOf,
} from './sources.model';
import { SourcesApi } from './sources.service';
import { PreviewTable } from './preview-table';
import { SchemaView } from './schema-view';
import { ConnectionDialog, ConnectionDialogData } from './connection-dialog';

export interface SourcePanelData {
  /** null: a new source. */
  sourceId: number | null;
  canManage: boolean;
  /** A platform administrator's workspaces: a new source names the one it is for. */
  tenants?: ComboboxOption[];
}

type ResultTab = 'preview' | 'schema';

/**
 * One source, in the wide side panel (MIG-248): its kind's fields, then Test connection, Preview and Infer schema.
 * The service reads the saved source -- each action takes its id, not its fields -- so unsaved changes are saved
 * first. A preview's values come back masked by the service and are shown exactly as they came.
 */
@Component({
  selector: 'app-source-panel',
  imports: [SidePanel, Icon, Field, Segmented, ServerTimePipe, PreviewTable, SchemaView],
  templateUrl: './source-panel.html',
})
export class SourcePanel {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<SourcePanelData>(DIALOG_DATA);
  private readonly api = inject(SourcesApi);
  private readonly collectionsApi = inject(ApiCollectionsApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  private readonly results = viewChild<ElementRef<HTMLElement>>('results');

  readonly formats = FORMATS;
  readonly kindOptions: SegmentOption<SourceKind>[] = [
    { id: 'API', label: 'API', icon: 'plug' }, { id: 'FILE', label: 'File', icon: 'file' },
    { id: 'BUCKET', label: 'Bucket folder', icon: 'folder' }, { id: 'DATABASE', label: 'Database', icon: 'database' },
  ];
  readonly queryPlaceholder = 'select id, name, updated_at from customers';
  readonly envHint = 'Where its {{variables}} come from.';

  readonly detail = signal<SourceDetail | null>(null);
  readonly edit = signal<SourceEdit | null>(null);
  private readonly savedAs = signal('');
  private changed = false;
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly saving = signal(false);
  readonly running = signal<'' | 'test' | 'preview' | 'schema'>('');
  readonly error = signal('');

  readonly testResult = signal<PreviewResult | null>(null);
  readonly testMessage = signal('');
  readonly previewResult = signal<PreviewResult | null>(null);
  /** Why the service could not preview the source (Parquet, a refused bucket): shown in place of the rows. */
  readonly previewNote = signal('');
  readonly inferred = signal<PreviewResult | null>(null);
  readonly resultTab = signal<ResultTab>('preview');

  // The pickers, each read the first time its kind is shown.
  readonly buckets = signal<BucketRow[]>([]);
  readonly connections = signal<ConnectionRow[]>([]);
  readonly collections = signal<CollectionRow[]>([]);
  readonly requests = signal<RequestRow[]>([]);
  readonly versions = signal<number[]>([]);
  readonly environments = signal<EnvironmentRow[]>([]);
  private readonly read = new Set<string>();

  readonly dirty = computed(() => !!this.edit() && JSON.stringify(this.edit()) !== this.savedAs());
  readonly busy = computed(() => this.saving() || !!this.running());
  readonly heading = computed(() => {
    const e = this.edit();
    if (!e?.sourceId) return this.data.sourceId ? 'Source' : 'New source';
    return `${this.data.canManage ? 'Edit source' : 'Source'} · ${e.name}`;
  });
  readonly subtitle = computed(() => this.edit() ? kindLabel(this.edit()!.kind) : '');
  /** A platform administrator's connections, buckets and collections span workspaces: offer the source's own. */
  private readonly tenantId = computed(() => this.edit()?.tenantId ?? this.detail()?.tenantId ?? null);
  readonly tenantConnections = computed(() => this.connections().filter(c => !this.data.tenants || c.tenantId == null || c.tenantId === this.tenantId()));
  readonly tenantCollections = computed(() => this.collections().filter(c => !this.data.tenants || c.tenantId == null || c.tenantId === this.tenantId()));
  /** The stored alias stays choosable even when it is not (or no longer) among the workspace's connections. */
  readonly bucketOptions = computed(() => {
    const list = this.buckets().map(b => ({ value: b.bucket, label: b.label && b.label !== b.bucket ? `${b.label} (${b.bucket})` : b.bucket }));
    const alias = this.edit()?.storageAlias;
    if (alias && !list.some(b => b.value === alias)) list.push({ value: alias, label: `${alias} (not among this workspace's connections)` });
    return list;
  });
  /** The schema shown on the Schema tab: the one just inferred, else a fresh preview's, else the one the source kept. */
  readonly schemaShown = computed((): { schema: unknown; fields: SchemaField[] | null | undefined } | null => {
    const fresh = this.inferred() ?? this.previewResult();
    if (fresh?.schema) return { schema: fresh.schema, fields: fresh.fields };
    const d = this.detail();
    return d?.schema ? { schema: d.schema, fields: d.fields } : null;
  });
  readonly runHint = computed(() => !this.edit()?.sourceId || this.dirty() ? 'Unsaved changes are saved first: the service reads the saved source.' : '');

  constructor() {
    if (this.data.sourceId) {
      this.loading.set(true);
      this.api.get(this.data.sourceId).subscribe({
        next: r => {
          if (r.status !== API_SUCCESS || !r.data) { this.loading.set(false); this.loadError.set(r.message); return; }
          this.detail.set(r.data);
          const d = r.data;
          if (d.kind === 'API' && d.requestId) {
            // The source names its request only; the pickers need the request's collection.
            this.collectionsApi.getRequest(d.requestId).subscribe({
              next: q => { this.loading.set(false); this.opened(d, q.status === API_SUCCESS ? q.data?.collectionId ?? null : null); },
              error: () => { this.loading.set(false); this.opened(d, null); },
            });
          } else {
            this.loading.set(false);
            this.opened(d, null);
          }
        },
        error: err => { this.loading.set(false); this.loadError.set(err?.error?.message || 'Could not read the source.'); },
      });
    } else {
      this.take(blankSource('FILE'), false);
      this.pickersFor('FILE');
    }
  }

  private opened(d: SourceDetail, collectionId: number | null): void {
    this.take(sourceEditOf(d, collectionId));
    this.pickersFor(this.edit()!.kind);
    if (collectionId) this.readCollection(collectionId, false);
  }

  private take(e: SourceEdit, saved = true): void {
    this.edit.set(e);
    this.savedAs.set(saved ? JSON.stringify(e) : '');
  }

  /** A read that may be refused (a member without API Collections, say): the picker is then empty, never an error. */
  private once<T>(key: string, call: () => Observable<ApiResponse<T>>, done: (data: T) => void): void {
    if (this.read.has(key)) return;
    this.read.add(key);
    call().subscribe({ next: r => { if (r.status === API_SUCCESS && r.data) done(r.data); }, error: () => { /* the picker stays empty */ } });
  }

  private pickersFor(kind: SourceKind): void {
    if (kind === 'FILE' || kind === 'BUCKET') this.once('buckets', () => this.api.buckets(), d => this.buckets.set(d));
    if (kind === 'DATABASE') this.once('connections', () => this.api.connections(), d => this.connections.set(d));
    if (kind === 'API') this.once('collections', () => this.collectionsApi.list('', 1, 100), d => this.collections.set(d));
  }

  /** A collection's APIs, versions and environments; `pick` also pins its current version and default environment. */
  private readCollection(collectionId: number, pick: boolean): void {
    this.collectionsApi.get(collectionId).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) { if (pick) this.error.set(r.message); return; }
        const d = r.data;
        this.requests.set(d.requests ?? []);
        const versions = (d.versions ?? []).map(v => v.version).sort((a, b) => b - a);
        this.versions.set(versions);
        this.environments.set(d.environments ?? []);
        if (pick) {
          const env = (d.environments ?? []).find(x => x.isDefault) ?? null;
          this.patch({ version: d.collection?.currentVersion ?? versions[0] ?? null, environmentId: env?.environmentId ?? null });
        }
      },
      error: err => { if (pick) this.error.set(err?.error?.message || 'Could not read the collection.'); },
    });
  }

  patch(change: Partial<SourceEdit>): void {
    this.edit.update(e => e ? { ...e, ...change } : e);
    this.error.set('');
  }

  setKind(kind: SourceKind): void {
    this.patch({ kind });
    this.pickersFor(kind);
  }

  pickCollection(collectionId: number | null): void {
    this.patch({ collectionId, requestId: null, version: null, environmentId: null });
    this.requests.set([]);
    this.versions.set([]);
    this.environments.set([]);
    if (collectionId) this.readCollection(collectionId, true);
  }

  formatText(format: string): string { return formatLabel(format); }
  idOf(event: Event): number | null { const v = (event.target as HTMLSelectElement).value; return v ? +v : null; }

  newConnection(): void {
    const data: ConnectionDialogData = { connection: null, tenants: this.data.tenants, tenantId: this.tenantId() };
    this.dialog.open<ConnectionRow | null>(ConnectionDialog, { data }).closed.subscribe(saved => {
      if (!saved) return;
      this.read.delete('connections');
      this.pickersFor('DATABASE');
      this.patch({ connectionId: saved.id });
    });
  }

  save(then?: (sourceId: number) => void): void {
    const e = this.edit();
    if (!e || !this.data.canManage) return;
    const out = sourceSaveOf(e);
    if ('error' in out) { this.error.set(out.error); return; }
    this.error.set('');
    this.saving.set(true);
    this.api.save(out.body).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message); return; }
        this.changed = true;
        this.take({ ...e, sourceId: r.data.id });
        if (then) then(r.data.id); else this.toast.success(r.message);
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'The source could not be saved.'); },
    });
  }

  /** Runs an action on the saved source; unsaved changes are saved first. */
  private withSaved(run: (sourceId: number) => void): void {
    const e = this.edit();
    if (!this.data.canManage || !e) return;
    if (!e.sourceId || this.dirty()) { this.save(run); return; }
    run(e.sourceId);
  }

  test(): void {
    this.withSaved(id => {
      this.running.set('test');
      this.error.set('');
      this.api.test(id).subscribe({
        next: r => {
          this.running.set('');
          this.changed = true;
          if (r.status !== API_SUCCESS || !r.data) { this.testResult.set(null); this.error.set(r.message); return; }
          this.testResult.set(r.data);
          this.testMessage.set(r.data.message || r.message);
        },
        error: err => { this.running.set(''); this.error.set(err?.error?.message || 'The test could not run.'); },
      });
    });
  }

  preview(): void {
    this.withSaved(id => {
      this.running.set('preview');
      this.error.set('');
      this.resultTab.set('preview');
      this.api.preview(id).subscribe({
        next: r => {
          this.running.set('');
          if (r.status !== API_SUCCESS || !r.data) { this.previewResult.set(null); this.previewNote.set(r.message); return; }
          this.previewNote.set(r.data.message || '');
          this.previewResult.set(r.data);
          this.reveal();
        },
        error: err => { this.running.set(''); this.error.set(err?.error?.message || 'The preview could not run.'); },
      });
    });
  }

  inferSchema(): void {
    this.withSaved(id => {
      this.running.set('schema');
      this.error.set('');
      this.resultTab.set('schema');
      this.api.schema(id).subscribe({
        next: r => {
          this.running.set('');
          if (r.status !== API_SUCCESS || !r.data) { this.previewNote.set(r.message); this.resultTab.set('preview'); return; }
          this.changed = true;
          this.inferred.set(r.data);
          if (!this.previewResult()) this.previewResult.set(r.data);
          this.reveal();
        },
        error: err => { this.running.set(''); this.error.set(err?.error?.message || 'The schema could not be inferred.'); },
      });
    });
  }

  /** A preview or a schema lands below the fields: bring it into view once it is drawn. */
  private reveal(): void {
    afterNextRender(() => this.results()?.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), { injector: this.injector });
  }

  close(): void { this.ref.close(this.changed); }
}

import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { Icon } from '../../shared/ui/icon';
import { RsTimePipe } from './rs-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { WorkspaceSelect } from '../../shared/ui/workspace-select';
import { BucketSummary, StorageService } from '../objects/storage.service';
import { GeneratedService } from '../documents/generated/generated.service';
import { API_SUCCESS } from '../../core/api/api.config';
import { ReportStudioApi, studioError } from './report-studio.api';
import { DataSourceRow, InspectResult, SourceRef, TemplateContract, TreeNode, size } from './report-studio.model';
import { ReportSourcePicker, SourceMode } from './source-picker';
import { collections, firstRecord, itemFields, sampleText, valueAt } from './designer/designer-model';
import { RsTabCounts } from './rs-tab-counts';

/** The three kinds of source across the top (Figma frame 7). */
type Kind = 'run' | 'bucket' | 'upload';

/** What a template needs that this data lacks: the template, and the missing required paths. */
export interface SchemaNote { name: string; templateId: string; missing: string[]; }

/**
 * See results › Reports › Data (MIG-403, MIG-404; the owner-approved screen 7, Figma frame 7; page report-data): the data a
 * report can read -- a pipeline run's output, a JSON or CSV file in one of the workspace's buckets, a file uploaded here --
 * each read as the reader, so the data's owner decides. Three kinds across the top, the sources on the left, and the one
 * picked beside them: where its report data starts in the JSON (a tree), its schema, its first rows as a table (at most
 * 100), which templates can read it, and a schema note when a template needs a field it does not have. No connection
 * settings or passwords are asked for or shown.
 */
@Component({
  selector: 'app-report-data',
  imports: [PageHeader, WorkspaceSelect, RefreshButton, Icon, RsTimePipe, FormsModule, ReportSourcePicker, RouterLink, NgTemplateOutlet],
  templateUrl: './data.html',
  styleUrl: './data.css',
})
export class ReportData implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly storage = inject(StorageService);
  private readonly generated = inject(GeneratedService);
  private readonly auth = inject(AuthService);
  private readonly tabCounts = inject(RsTabCounts);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly workspaces = inject(WorkspaceDirectory);
  private readonly picker = viewChild(ReportSourcePicker);
  /** A platform administrator's pick (the one workspace selector, owner #5); null is every workspace. Members: their own. */
  readonly tenantId = signal<number | null>(this.workspaces.remembered());

  readonly sources = signal<DataSourceRow[]>([]);
  readonly buckets = signal<BucketSummary[]>([]);
  /** The schedules the reader may open: a platform administrator's are every workspace's, so they are counted for the one shown. */
  private readonly allSchedules = signal<{ tenantId?: number | null }[]>([]);
  readonly schedules = computed(() => {
    const scope = this.isPlatformAdmin() ? this.tenantId() : null;
    return this.allSchedules().filter(j => !scope || j.tenantId == null || j.tenantId === scope).length;
  });
  readonly contracts = signal<TemplateContract[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly kind = signal<Kind>('run');
  readonly pickMode = signal<SourceMode>('run');
  readonly picked = signal<SourceRef | null>(null);
  readonly search = signal('');
  readonly rootPath = signal('$');
  readonly result = signal<InspectResult | null>(null);
  readonly busy = signal(false);
  readonly inspectError = signal('');
  readonly saveName = signal('');
  readonly selected = signal<string>('');
  /** Where the source shown came from (a run's schedule, to open the pipeline). */
  readonly origin = signal<{ jobId: number | null; jobQueueId: number | null } | null>(null);
  readonly size = size;

  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  readonly isAdmin = computed(() => this.auth.role() === 'TENANT_ADMIN');
  readonly canUpload = computed(() => this.auth.canOpen('report-data') && !this.auth.isPlatformAdmin());
  /** The workspace shown: a platform administrator's chosen one by its name, else the reader's own. */
  readonly workspaceName = computed(() => (this.isPlatformAdmin() && this.tenantId() ? this.workspaces.nameOf(this.tenantId()) : this.auth.user()?.tenantName)
    || 'this workspace');
  readonly uploads = computed(() => this.filter(this.sources().filter(s => s.connector === 'UPLOAD')));
  readonly runSources = computed(() => this.filter(this.sources().filter(s => s.connector === 'RUN_OUTPUT')));
  readonly bucketSources = computed(() => this.filter(this.sources().filter(s => s.connector === 'BUCKET_OBJECT')));
  readonly shownCount = computed(() => this.uploads().length + this.runSources().length + this.bucketSources().length);
  readonly flatTree = computed(() => {
    const out: { node: TreeNode; depth: number }[] = [];
    const walk = (n: TreeNode | undefined, depth: number) => {
      if (!n || out.length > 200) return;
      out.push({ node: n, depth });
      n.children?.forEach(c => walk(c, depth + 1));
      if (n.item) walk(n.item, depth + 1);
    };
    walk(this.result()?.tree, 0);
    return out;
  });
  /** The sample as a table: the data's own rows when it is a list, else its first list (Figma's "Sample rows"). */
  readonly sampleTable = computed(() => {
    const r = this.result();
    if (!r) return null;
    if (r.shape === 'list' && Array.isArray(r.sample)) {
      const rows = (r.sample as unknown[]).slice(0, 100);
      const cols = r.schema.filter(f => !f.path.includes('.') && !f.path.includes('[]') && f.path !== '$' && !/object|list|array/i.test(f.type))
        .slice(0, 8).map(f => f.path);
      return { path: '', total: r.records, cols, rows: rows.map(x => cols.map(c => sampleText(valueAt(x, c)))) };
    }
    const list = collections(r.schema)[0];
    if (!list) return null;
    const items = valueAt(firstRecord(r), list.path);
    if (!Array.isArray(items)) return null;
    const cols = itemFields(r.schema, list.path).filter(f => !/object|list|array/i.test(f.type)).slice(0, 8).map(f => f.path);
    return { path: list.path, total: items.length, cols, rows: items.slice(0, 100).map(x => cols.map(c => sampleText(valueAt(x, c)))) };
  });
  /** The templates that can read this data (each required field of their contract is in it), and what the others lack. */
  readonly fits = computed(() => {
    const r = this.result();
    if (!r) return { fits: [] as string[], notes: [] as SchemaNote[] };
    const have = new Set(r.schema.map(f => f.path));
    const fits: string[] = [];
    const notes: SchemaNote[] = [];
    for (const t of this.contracts()) {
      const required = t.fields.filter(f => f.required).map(f => f.path);
      if (!required.length) continue;
      const missing = required.filter(p => !have.has(p));
      if (!missing.length) fits.push(t.name);
      else if (missing.length < required.length) notes.push({ name: t.name, templateId: t.templateId, missing });
    }
    return { fits, notes };
  });

  ngOnInit(): void {
    this.load();
    this.storage.buckets().subscribe({
      next: r => this.buckets.set(r.status === API_SUCCESS ? (r.data ?? []) : []),
      error: () => this.buckets.set([]),
    });
    this.generated.schedules().subscribe({ next: all => this.allSchedules.set(all.map(j => ({ tenantId: (j as { tenantId?: number | null }).tenantId }))), error: () => this.allSchedules.set([]) });
  }

  private filter(list: DataSourceRow[]): DataSourceRow[] {
    const q = this.search().trim().toLowerCase();
    return q ? list.filter(s => s.name.toLowerCase().includes(q) || (s.key ?? '').toLowerCase().includes(q)) : list;
  }

  isNumber(v: unknown): boolean { return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const scope = this.isPlatformAdmin() ? this.tenantId() : null;
    this.tabCounts.refresh(scope);
    this.api.sources(scope).subscribe({
      next: s => { this.sources.set(s); this.loading.set(false); },
      error: e => { this.error.set(studioError(e, 'The sources could not be read.').message); this.loading.set(false); },
    });
    this.api.contracts(scope).subscribe({ next: c => this.contracts.set(c), error: () => this.contracts.set([]) });
  }

  pickKind(kind: Kind): void {
    this.kind.set(kind);
    this.pickMode.set(kind === 'bucket' ? 'bucket' : kind === 'upload' ? 'saved' : 'run');
  }

  inspect(source: SourceRef | null, label = ''): void {
    if (!source) return;
    this.busy.set(true);
    this.inspectError.set('');
    this.selected.set(label);
    this.lastSource = source;
    this.api.inspect(source, this.rootPath().trim() || '$').subscribe({
      next: r => { this.busy.set(false); this.result.set(r); this.saveName.set(r.label); },
      error: e => { this.busy.set(false); this.result.set(null); this.inspectError.set(studioError(e, 'The data could not be read.').message); },
    });
  }

  inspectSaved(s: DataSourceRow): void {
    this.origin.set(s.connector === 'RUN_OUTPUT' ? { jobId: null, jobQueueId: s.jobQueueId ?? null } : null);
    this.inspect({ connector: 'SOURCE', sourceId: s.sourceId }, s.sourceId);
  }

  inspectPicked(): void {
    const p = this.picked();
    if (!p) return;
    const picker = this.picker();
    this.origin.set(p.connector === 'RUN_OUTPUT' ? { jobId: picker?.jobId() ?? null, jobQueueId: p.jobQueueId } : null);
    this.inspect(p, 'picked');
  }

  /** The root path changed: read the same data again from the new starting point. */
  reroot(path: string): void {
    this.rootPath.set(path);
    if (this.lastSource) this.inspect(this.lastSource, this.selected());
  }

  private lastSource: SourceRef | null = null;

  /** Upload a file (the header's button): JSON or CSV, kept for reports. */
  upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.busy.set(true);
    this.api.upload(file, '').subscribe({
      next: s => {
        this.busy.set(false);
        this.toast.success(`${s.name} uploaded: ${s.records ?? '?'} record(s).`);
        this.load();
        this.inspectSaved(s);
      },
      error: e => { this.busy.set(false); this.toast.error(studioError(e, 'The file could not be uploaded.').message); },
    });
  }

  /** Keeps the picked run output or bucket file as a named source, for the next report. */
  keep(): void {
    const s = this.lastSource;
    if (!s || (s.connector !== 'RUN_OUTPUT' && s.connector !== 'BUCKET_OBJECT')) return;
    this.api.saveSource(this.saveName().trim(), s, this.rootPath().trim() || '$').subscribe({
      next: () => { this.toast.success('Source saved.'); this.load(); },
      error: e => this.toast.error(studioError(e).message),
    });
  }

  canKeep(): boolean {
    const s = this.lastSource;
    return !!s && (s.connector === 'RUN_OUTPUT' || s.connector === 'BUCKET_OBJECT') && !!this.result();
  }

  archive(s: DataSourceRow): void {
    void confirmWith(this.dialog, { title: `Remove ${s.name}?`, body: 'Reports already made from it keep their own frozen copy of the data.',
      confirmLabel: 'Remove', danger: true }).then(ok => {
      if (!ok) return;
      this.api.archiveSource(s.sourceId).subscribe({ next: () => this.load(), error: e => this.toast.error(studioError(e).message) });
    });
  }

  kindWord(r: InspectResult): string {
    switch (r.connector) {
      case 'RUN_OUTPUT': return 'Output of a pipeline run';
      case 'BUCKET_OBJECT': return 'A file in a bucket';
      case 'UPLOAD': return 'Uploaded here';
      default: return 'Data';
    }
  }
}

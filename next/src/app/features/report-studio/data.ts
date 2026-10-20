import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { Icon } from '../../shared/ui/icon';
import { FileDropzone } from '../../shared/ui/file-dropzone';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { confirmWith } from '../../shared/ui/confirm';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { WorkspaceSelect } from '../../shared/ui/workspace-select';
import { BucketSummary, StorageService } from '../objects/storage.service';
import { API_SUCCESS } from '../../core/api/api.config';
import { ReportStudioApi, studioError } from './report-studio.api';
import { DataSourceRow, InspectResult, SourceRef, TreeNode, size } from './report-studio.model';
import { ReportSourcePicker } from './source-picker';

/**
 * See results › Reports › Data (MIG-403, Figma frame 7; page report-data): the data a report can read -- a pipeline
 * run's output, a JSON or CSV file in one of the workspace's buckets, a file uploaded here -- each read as the reader,
 * so the data's owner decides. Inspect shows the schema (every path and its type), at most 100 records, the shape for
 * picking where the report's data starts, and warnings. No connection settings or passwords are asked for or shown.
 */
@Component({
  selector: 'app-report-data',
  imports: [PageHeader, WorkspaceSelect, RefreshButton, Icon, FileDropzone, ServerTimePipe, FormsModule, ReportSourcePicker],
  templateUrl: './data.html',
})
export class ReportData implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly storage = inject(StorageService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly workspaces = inject(WorkspaceDirectory);
  /** A platform administrator's pick (the one workspace selector, owner #5); null is every workspace. Members: their own. */
  readonly tenantId = signal<number | null>(this.workspaces.remembered());

  readonly sources = signal<DataSourceRow[]>([]);
  readonly buckets = signal<BucketSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly picked = signal<SourceRef | null>(null);
  readonly bucket = signal('');
  readonly key = signal('');
  readonly rootPath = signal('$');
  readonly result = signal<InspectResult | null>(null);
  readonly busy = signal(false);
  readonly inspectError = signal('');
  readonly uploadName = signal('');
  readonly saveName = signal('');
  readonly selected = signal<string>('');
  readonly size = size;

  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  readonly workspaceName = computed(() => this.auth.user()?.tenantName || 'this workspace');
  readonly uploads = computed(() => this.sources().filter(s => s.connector === 'UPLOAD'));
  readonly pointers = computed(() => this.sources().filter(s => s.connector !== 'UPLOAD'));
  readonly sampleText = computed(() => JSON.stringify(this.result()?.sample ?? [], null, 2));
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

  ngOnInit(): void {
    this.load();
    this.storage.buckets().subscribe({
      next: r => this.buckets.set(r.status === API_SUCCESS ? (r.data ?? []) : []),
      error: () => this.buckets.set([]),
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.sources(this.isPlatformAdmin() ? this.tenantId() : null).subscribe({
      next: s => { this.sources.set(s); this.loading.set(false); },
      error: e => { this.error.set(studioError(e, 'The sources could not be read.').message); this.loading.set(false); },
    });
  }

  inspect(source: SourceRef | null, label = ''): void {
    if (!source) return;
    this.busy.set(true);
    this.inspectError.set('');
    this.selected.set(label);
    this.api.inspect(source, this.rootPath().trim() || '$').subscribe({
      next: r => { this.busy.set(false); this.result.set(r); this.saveName.set(r.label); },
      error: e => { this.busy.set(false); this.result.set(null); this.inspectError.set(studioError(e, 'The data could not be read.').message); },
    });
  }

  inspectSaved(s: DataSourceRow): void {
    this.lastSource = { connector: 'SOURCE', sourceId: s.sourceId };
    this.inspect(this.lastSource, s.sourceId);
  }

  inspectPicked(): void {
    this.lastSource = this.picked();
    this.inspect(this.lastSource, 'picked');
  }

  inspectBucket(): void {
    if (!this.bucket() || !this.key().trim()) return;
    this.lastSource = { connector: 'BUCKET_OBJECT', bucket: this.bucket(), key: this.key().trim() };
    this.inspect(this.lastSource, 'bucket');
  }

  /** The root path changed: read the same data again from the new starting point. */
  reroot(path: string): void {
    this.rootPath.set(path);
    if (this.lastSource) this.inspect(this.lastSource, this.selected());
  }

  private lastSource: SourceRef | null = null;

  upload(files: File[]): void {
    const file = files[0];
    if (!file) return;
    this.busy.set(true);
    this.api.upload(file, this.uploadName()).subscribe({
      next: s => {
        this.busy.set(false);
        this.toast.success(`${s.name} uploaded: ${s.records ?? '?'} record(s).`);
        this.uploadName.set('');
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
}

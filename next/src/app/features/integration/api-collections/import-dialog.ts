import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Field } from '../../../shared/ui/field';
import { Icon } from '../../../shared/ui/icon';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { DataText } from '../../../shared/ui/data-text';
import { StatStrip, StatStripItem } from '../../../shared/ui/stat-strip';
import { Combobox, ComboboxOption } from '../../../shared/ui/combobox';
import { formatSize } from '../../../shared/ui/format-size';
import { ImportResult, brunoFiles, reportRows } from './api-collections.model';
import { ApiCollectionsApi, BrunoImport, PostmanImport } from './api-collections.service';

export interface ImportDialogData {
  /** A platform administrator's workspaces: an import names the one it is for. */
  tenants?: ComboboxOption[];
}

type Format = 'POSTMAN' | 'BRUNO';

/**
 * Import a Postman v2.1 or Bruno collection (MIG-228). The files are read here, in the browser, and their text
 * sent; the service converts them into a new collection -- secrets moved into secret variables, scripts turned into
 * rules where it can -- runs nothing, and answers a report, which this dialog then shows. Closes with the new
 * collection's id and whether to open it.
 */
@Component({
  selector: 'app-import-dialog',
  imports: [FormDialog, Field, Icon, Segmented, DataText, StatStrip, Combobox],
  template: `
    <app-form-dialog [heading]="result() ? 'Import report' : 'Import a collection'"
                     [subtitle]="result() ? resultLine() : 'Postman v2.1 or Bruno. The files are read in your browser; nothing in them is run.'"
                     [confirmLabel]="confirmLabel()" busyLabel="Importing…" [saving]="importing()" [cancelLabel]="result() ? 'Close' : 'Cancel'"
                     size="wide" (confirmed)="confirm()" (cancelled)="cancel()">
      @if (result(); as done) {
        <div class="form-stack">
          <app-stat-strip [items]="counts()" [cols]="2" [smCols]="4" label="What the import did" />
          @if (rows().length) {
            <div class="overflow-x-auto">
            <table class="table-modern min-w-[36rem]">
              <thead><tr><th>What</th><th>Item</th><th>Note</th></tr></thead>
              <tbody>
                @for (row of rows(); track $index) {
                  <tr>
                    <td class="whitespace-nowrap">
                      <span class="pill" [class.pill-warn]="row.kind === 'Review'" [class.pill-crit]="row.kind === 'Skipped'"
                            [class.pill-ok]="row.kind === 'Imported'" [class.pill-neutral]="row.kind === 'Converted'">{{ row.kind }}</span>
                    </td>
                    <td class="max-w-64"><app-data-text [value]="row.item" label="Item" /></td>
                    <td class="max-w-96"><app-data-text [value]="row.note" [lines]="2" label="Note" /></td>
                  </tr>
                }
              </tbody>
            </table></div>
          } @else {
            <p class="text-sm text-[color:var(--text-muted)]">The report lists nothing.</p>
          }
        </div>
      } @else {
        <div class="form-stack">
          <app-segmented [(value)]="format" [options]="formats" ariaLabel="Import from" />
          @if (data.tenants) {
            <app-field label="Workspace" for="impTenant" [required]="true">
              <app-combobox id="impTenant" [selected]="tenantId()" (selectedChange)="tenantId.set($event || null)" [options]="data.tenants" [allowClear]="false" placeholder="Search workspaces…" />
            </app-field>
          }
          @if (format() === 'POSTMAN') {
            <app-field label="Collection file" for="impCollection" [required]="true" hint="Exported from Postman as Collection v2.1 (.json).">
              <div class="flex flex-wrap items-center gap-2">
                <label class="btn btn-default btn-sm cursor-pointer">
                  <app-icon name="file" />Choose file
                  <input id="impCollection" type="file" class="sr-only" accept=".json,application/json" (change)="pickPostman($event)" />
                </label>
                @if (postmanFile(); as f) { <span class="text-sm truncate">{{ f.name }} · {{ size(f.size) }}</span> }
              </div>
            </app-field>
            <app-field label="Environment files" for="impEnvironments" hint="Optional: each becomes an environment of the collection; its secret values are sealed on arrival.">
              <div class="flex flex-wrap items-center gap-2">
                <label class="btn btn-default btn-sm cursor-pointer">
                  <app-icon name="file" />Choose files
                  <input id="impEnvironments" type="file" class="sr-only" multiple accept=".json,application/json" (change)="pickEnvironments($event)" />
                </label>
                @for (f of environmentFiles(); track $index) { <span class="pill pill-neutral mono">{{ f.name }}</span> }
              </div>
            </app-field>
          } @else {
            <app-field label="Bruno collection" for="impBrunoFolder" [required]="true" hint="The collection's folder, or its .bru files. Files other than .bru and .json are left out.">
              <div class="flex flex-wrap items-center gap-2">
                <label class="btn btn-default btn-sm cursor-pointer">
                  <app-icon name="folder" />Choose folder
                  <input id="impBrunoFolder" type="file" class="sr-only" webkitdirectory multiple (change)="pickBruno($event)" />
                </label>
                <label class="btn btn-default btn-sm cursor-pointer">
                  <app-icon name="file" />Choose .bru files
                  <input id="impBrunoFiles" type="file" class="sr-only" multiple accept=".bru,.json" (change)="pickBruno($event)" />
                </label>
                @if (brunoPicked().length) { <span class="text-sm">{{ brunoPicked().length }} file{{ brunoPicked().length === 1 ? '' : 's' }} picked</span> }
              </div>
            </app-field>
          }
          <app-field label="Name" for="impName" hint="Optional: replaces the name the file gives the collection.">
            <input id="impName" class="input" [value]="name()" (input)="name.set($any($event.target).value)" placeholder="The file's own name" />
          </app-field>
          @if (error()) { <p class="text-sm text-crit-500" role="alert">{{ error() }}</p> }
        </div>
      }
    </app-form-dialog>
  `,
})
export class ImportDialog {
  readonly ref = inject<DialogRef<{ collectionId: number; open: boolean } | null>>(DialogRef);
  readonly data = inject<ImportDialogData>(DIALOG_DATA);
  private readonly api = inject(ApiCollectionsApi);
  private readonly toast = inject(ToastService);

  readonly formats: SegmentOption<Format>[] = [{ id: 'POSTMAN', label: 'Postman' }, { id: 'BRUNO', label: 'Bruno' }];
  readonly format = signal<Format>('POSTMAN');
  readonly postmanFile = signal<File | null>(null);
  readonly environmentFiles = signal<File[]>([]);
  readonly brunoPicked = signal<File[]>([]);
  readonly name = signal('');
  readonly tenantId = signal<string | null>(null);
  readonly importing = signal(false);
  readonly error = signal('');
  readonly result = signal<ImportResult | null>(null);

  readonly rows = computed(() => reportRows(this.result()?.report));
  readonly confirmLabel = computed(() => this.result() ? 'Open collection' : 'Import');
  readonly resultLine = computed(() => {
    const r = this.result();
    if (!r) return '';
    return r.status === 'IMPORTED' ? 'Imported as a new collection. Nothing needs a look.' : 'Imported as a new collection. Some items need a look before they are used.';
  });
  readonly counts = computed((): StatStripItem[] => {
    const c = this.result()?.report?.counts ?? {};
    return [
      { label: 'Imported', value: c.imported ?? 0, tone: 'ok' },
      { label: 'Converted', value: c.converted ?? 0, tone: 'info' },
      { label: 'Needs a look', value: c.review ?? 0, tone: c.review ? 'warn' : 'muted' },
      { label: 'Skipped', value: c.skipped ?? 0, tone: c.skipped ? 'crit' : 'muted' },
    ];
  });

  size(bytes: number): string { return formatSize(bytes); }

  pickPostman(event: Event): void { this.postmanFile.set(this.picked(event)[0] ?? null); }
  pickEnvironments(event: Event): void { this.environmentFiles.set(this.picked(event)); }
  pickBruno(event: Event): void { this.brunoPicked.set(this.picked(event)); }

  private picked(event: Event): File[] {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.error.set('');
    return files;
  }

  /** The request to send, or what to fix. */
  private async body(): Promise<PostmanImport | BrunoImport | { error: string }> {
    const extra: { name?: string; tenantId?: number } = {};
    if (this.name().trim()) extra.name = this.name().trim();
    if (this.data.tenants) {
      if (!this.tenantId()) return { error: 'Choose the workspace to import into.' };
      extra.tenantId = Number(this.tenantId());
    }
    if (this.format() === 'BRUNO') {
      const files = await brunoFiles(this.brunoPicked());
      if (!files.length) return { error: this.brunoPicked().length ? 'No .bru files in what was picked.' : 'Choose the Bruno folder or its .bru files.' };
      return { format: 'BRUNO', files, ...extra };
    }
    const file = this.postmanFile();
    if (!file) return { error: 'Choose the Postman collection file.' };
    const read = async (f: File): Promise<unknown> => { try { return JSON.parse(await f.text()); } catch { throw new Error(`${f.name} is not a JSON file.`); } };
    try {
      const collection = await read(file);
      const environments: unknown[] = [];
      for (const f of this.environmentFiles()) environments.push(await read(f));
      return { format: 'POSTMAN', collection, environments, ...extra };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  async run(): Promise<void> {
    this.error.set('');
    const body = await this.body();
    if ('error' in body) { this.error.set(body.error); return; }
    this.importing.set(true);
    try {
      const r = await firstValueFrom(this.api.import(body));
      if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message); return; }
      this.result.set(r.data);
      this.toast.success(r.message);
    } catch (err) {
      this.error.set((err as { error?: { message?: string } })?.error?.message || 'The import could not be sent.');
    } finally {
      this.importing.set(false);
    }
  }

  confirm(): void {
    const done = this.result();
    // Closed a moment later, not inside the confirm: app-form-dialog goes on to look for an invalid field once
    // its (confirmed) returns, and a dialog already destroyed by then throws NG0911.
    if (done) queueMicrotask(() => this.ref.close({ collectionId: done.collectionId, open: true }));
    else void this.run();
  }

  cancel(): void {
    const done = this.result();
    this.ref.close(done ? { collectionId: done.collectionId, open: false } : null);
  }
}

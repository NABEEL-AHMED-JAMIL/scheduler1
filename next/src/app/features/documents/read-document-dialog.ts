import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { API_SUCCESS } from '../../core/api/api.config';
import { FormDialog } from '../../shared/ui/form-dialog';
import { Field } from '../../shared/ui/field';
import { Icon } from '../../shared/ui/icon';
import { FileDropzone } from '../../shared/ui/file-dropzone';
import { SegmentOption, Segmented } from '../../shared/ui/segmented';
import { ObjectPicker, PickedObject, objectPickerConfig } from '../../shared/ui/object-picker';
import { BucketSummary, StorageService } from '../objects/storage.service';
import { DocumentType, Extraction, OCR_EXTENSIONS, OcrDocument, fileName, isWorking, refusalText, statusLabel } from './documents.model';
import { DocumentsApi } from './documents.service';

export interface ReadDocumentData {
  /** The types to extract as (the overview has them already). */
  types: DocumentType[];
  /** A read already done: only the extraction is left. */
  read?: OcrDocument | null;
  /** The type to start with (Extract again). */
  documentTypeId?: number | null;
}

/** What the overview does next: read its lists again, and open the review when asked. */
export interface ReadDocumentResult { changed: boolean; openExtractionId?: number | null; }

type Stage = 'form' | 'upload' | 'read' | 'extract' | 'done' | 'failed';
type Source = 'upload' | 'stored';

const STEPS: { id: Stage; label: string }[] = [
  { id: 'upload', label: 'Store the file' }, { id: 'read', label: 'Read its pages (OCR)' }, { id: 'extract', label: 'Extract the fields' },
];

/**
 * Reading a document into Document Intelligence (MIG-272): a file from one of the workspace's own storage connections
 * -- uploaded here, or one already stored -- is read by OCR (media's /documentOcr.json/request), then extracted as the
 * type picked, or classified first (ai's /documentExtraction.json/extract). The dialog waits on both, asking again
 * while they are Queued or Running, and ends on where the document landed: in review (with Open review), approved on
 * its own, or why not. The services' refusals -- a file OCR does not read, a busy service (429), no model connection
 * (422), a type that is gone (404) -- are shown as they say them.
 */
@Component({
  selector: 'app-read-document-dialog',
  imports: [FormDialog, Field, Icon, FileDropzone, Segmented],
  template: `
    <app-form-dialog [heading]="data.read ? 'Extract a document' : 'Read a document'"
                     [subtitle]="data.read ? readName() : 'From one of this workspace\\'s storage connections'"
                     [confirmLabel]="confirmLabel()" [busyLabel]="busyLabel()" [saving]="working()" [confirmDisabled]="!ready()"
                     [cancelLabel]="stage() === 'done' || stage() === 'failed' ? 'Close' : 'Cancel'"
                     (confirmed)="confirm()" (cancelled)="close()">
      <div class="form-stack">
        @if (!data.read) {
          <app-field label="Storage connection" for="docBucket" [required]="true">
            <select id="docBucket" class="input" [disabled]="locked()" [value]="bucket()" (change)="bucket.set($any($event.target).value); picked.set(null)">
              @if (!buckets().length) { <option value="">{{ bucketsLoading() ? 'Loading…' : 'No storage connection' }}</option> }
              @for (b of buckets(); track b.bucket) { <option [value]="b.bucket" [selected]="b.bucket === bucket()">{{ b.label || b.bucket }}</option> }
            </select>
          </app-field>
          @if (bucketsError()) { <p class="text-xs text-crit-500" role="alert">{{ bucketsError() }}</p> }

          <app-segmented [(value)]="source" [options]="sourceOptions()" ariaLabel="Which file" />

          @if (source() === 'upload') {
            <app-file-dropzone [(file)]="file" [accept]="accept" prompt="Drop a PDF or an image here" hint="PDF, PNG, JPEG, TIFF or BMP" />
            <app-field label="Folder" for="docFolder" hint="Where in the storage connection the file is kept.">
              <input id="docFolder" class="input mono" [disabled]="locked()" [value]="folder()" (input)="folder.set($any($event.target).value)" />
            </app-field>
          } @else {
            <div class="flex items-center gap-2 min-w-0">
              <button type="button" class="btn btn-default btn-sm" [disabled]="locked() || !bucket()" (click)="pickStored()"><app-icon name="folder" />Choose a file…</button>
              @if (picked(); as p) { <span class="mono text-xs [overflow-wrap:anywhere] min-w-0">{{ p.key }}</span> }
              @else { <span class="text-xs text-[color:var(--text-muted)]">No file chosen</span> }
            </div>
          }
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" class="checkbox" [disabled]="locked()" [checked]="force()" (change)="force.set($any($event.target).checked)" />
            Read it again even if this file was read before
          </label>
        }

        <app-field label="Document type" for="docType" hint="Pick one, or let the page decide: it is compared with every active type.">
          <select id="docType" class="input" [disabled]="locked()" [value]="typeId()" (change)="typeId.set($any($event.target).value)">
            <option value="">Work it out from the page</option>
            @for (t of activeTypes(); track t.documentTypeId) { <option [value]="t.documentTypeId" [selected]="t.documentTypeId + '' === typeId()">{{ t.name }}{{ t.builtIn ? '' : ' (this workspace)' }}</option> }
          </select>
        </app-field>

        @if (stage() !== 'form') {
          <ol class="flex flex-col gap-1.5 text-sm" aria-label="Progress" data-test="progress">
            @for (s of steps(); track s.id) {
              <li class="flex items-center gap-2">
                @switch (s.state) {
                  @case ('done') { <app-icon name="checkCircle" class="text-ok-500" /> }
                  @case ('now') { <app-icon name="refresh" class="spin text-[color:var(--intent-info)]" /> }
                  @case ('failed') { <app-icon name="xCircle" class="text-crit-500" /> }
                  @default { <app-icon name="clock" class="text-[color:var(--text-muted)]" /> }
                }
                <span [class.opacity-60]="s.state === 'todo'">{{ s.label }}</span>
              </li>
            }
          </ol>
          @if (note()) { <p class="text-sm" [class.text-crit-500]="stage() === 'failed'" [attr.role]="stage() === 'failed' ? 'alert' : 'status'">{{ note() }}</p> }
        }
      </div>
    </app-form-dialog>
  `,
})
export class ReadDocumentDialog implements OnInit {
  readonly ref = inject<DialogRef<ReadDocumentResult>>(DialogRef);
  readonly data = inject<ReadDocumentData>(DIALOG_DATA);
  private readonly api = inject(DocumentsApi);
  private readonly storage = inject(StorageService);
  private readonly dialog = inject(Dialog);

  /** How long to wait between two looks at a read or an extraction still in progress. */
  pollMs = 1500;
  /** How many looks before the dialog stops waiting (the work goes on; the overview shows it). */
  maxPolls = 200;

  readonly accept = OCR_EXTENSIONS.map(e => '.' + e).join(',');
  readonly buckets = signal<BucketSummary[]>([]);
  readonly bucketsLoading = signal(false);
  readonly bucketsError = signal('');
  readonly bucket = signal('');
  readonly source = signal<Source>('upload');
  readonly file = signal<File | null>(null);
  readonly folder = signal('document-intelligence/');
  readonly picked = signal<PickedObject | null>(null);
  readonly force = signal(false);
  readonly typeId = signal(this.data.documentTypeId ? String(this.data.documentTypeId) : '');

  readonly stage = signal<Stage>('form');
  readonly note = signal('');
  private readonly reached = signal<Stage[]>([]);
  readonly extraction = signal<Extraction | null>(null);
  private changed = false;
  private stopped = false;

  readonly sourceOptions = computed<SegmentOption<Source>[]>(() => [
    { id: 'upload', label: 'Upload a file', icon: 'upload', disabled: this.locked() },
    { id: 'stored', label: 'A stored file', icon: 'folder', disabled: this.locked() },
  ]);
  readonly activeTypes = computed(() => this.data.types.filter(t => t.status === 'Active'));
  readonly readName = computed(() => this.data.read ? `${fileName(this.data.read.sourceKey)} · OCR document ${this.data.read.ocrDocumentId}` : '');
  readonly working = computed(() => ['upload', 'read', 'extract'].includes(this.stage()));
  readonly locked = computed(() => this.stage() !== 'form' && this.stage() !== 'failed');
  readonly ready = computed(() => {
    if (this.stage() === 'done') return true;
    if (this.data.read) return true;
    if (!this.bucket()) return false;
    return this.source() === 'upload' ? !!this.file() : !!this.picked();
  });
  readonly confirmLabel = computed(() => {
    if (this.stage() === 'done') return this.extraction()?.status === 'Review' ? 'Open review' : 'Done';
    if (this.stage() === 'failed') return 'Try again';
    return this.data.read ? 'Extract' : 'Read and extract';
  });
  readonly busyLabel = computed(() => this.stage() === 'upload' ? 'Storing…' : this.stage() === 'read' ? 'Reading…' : 'Extracting…');
  readonly steps = computed(() => {
    const all = this.data.read ? STEPS.filter(s => s.id === 'extract')
      : this.source() === 'stored' ? STEPS.filter(s => s.id !== 'upload') : STEPS;
    const stage = this.stage();
    return all.map(s => ({
      ...s,
      state: stage === s.id ? 'now' : this.reached().includes(s.id) ? (stage === 'failed' && this.reached().at(-1) === s.id ? 'failed' : 'done') : 'todo',
    }));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.stopped = true; });
  }

  ngOnInit(): void {
    if (this.data.read) return;
    this.bucketsLoading.set(true);
    this.storage.buckets().subscribe({
      next: r => {
        this.bucketsLoading.set(false);
        if (r.status !== API_SUCCESS) { this.bucketsError.set(r.message); return; }
        this.buckets.set(r.data ?? []);
        if (r.data?.length) this.bucket.set(r.data[0].bucket);
        else this.bucketsError.set('This workspace has no storage connection yet. An administrator adds one under Integration › Storage Connections.');
      },
      error: err => { this.bucketsLoading.set(false); this.bucketsError.set(refusalText(err, 'The storage connections could not be listed.')); },
    });
  }

  async pickStored(): Promise<void> {
    const picked = await firstValueFrom(this.dialog.open<PickedObject | undefined>(ObjectPicker, objectPickerConfig({
      heading: 'A document to read', bucket: this.bucket(), extensions: OCR_EXTENSIONS,
    })).closed);
    if (picked) { this.picked.set(picked); if (picked.bucket) this.bucket.set(picked.bucket); }
  }

  close(): void {
    this.stopped = true;
    this.ref.close({ changed: this.changed });
  }

  confirm(): void {
    if (this.stage() === 'done') {
      const e = this.extraction();
      this.ref.close({ changed: true, openExtractionId: e?.status === 'Review' ? e.extractionId : null });
      return;
    }
    if (!this.ready() || this.working()) return;
    void this.run();
  }

  /** Store → read → extract, each waited on; the first refusal stops it and says why. */
  async run(): Promise<void> {
    this.reached.set([]);
    this.note.set('');
    try {
      let read = this.data.read ?? null;
      if (!read) {
        let key: string;
        if (this.source() === 'upload') {
          this.go('upload');
          const file = this.file()!;
          const prefix = this.folder().trim().replace(/^\/+/, '');
          const folder = prefix && !prefix.endsWith('/') ? prefix + '/' : prefix;
          const stored = await firstValueFrom(this.storage.upload(this.bucket(), folder, file));
          if (stored.status !== API_SUCCESS) return this.fail(stored.message || 'The file was not stored.');
          key = folder + file.name;
        } else {
          key = this.picked()!.key;
        }
        this.go('read');
        const asked = await firstValueFrom(this.api.requestRead(this.bucket(), key, this.force()));
        if (asked.status !== API_SUCCESS || !asked.data) return this.fail(asked.message || 'The file could not be read.');
        this.changed = true;
        this.note.set(asked.message);
        read = await this.until(asked.data, r => r.status === 'Queued' || r.status === 'Running',
          r => firstValueFrom(this.api.read(r.ocrDocumentId)).then(x => x.data ?? r));
        if (!read) return;
        if (read.status !== 'Done') return this.fail(`The pages could not be read${read.error ? ': ' + read.error : '.'}`);
      }
      this.go('extract');
      const typeId = this.typeId() ? Number(this.typeId()) : null;
      const queued = await firstValueFrom(this.api.extract(read.ocrDocumentId, typeId));
      if (queued.status !== API_SUCCESS || !queued.data) return this.fail(queued.message || 'The document could not be extracted.');
      this.changed = true;
      this.note.set('The model is reading the fields; this takes a few seconds.');
      const done = await this.until(queued.data, e => isWorking(e.status),
        e => firstValueFrom(this.api.extraction(e.extractionId)).then(x => x.data ?? e));
      if (!done) return;
      this.extraction.set(done);
      this.finish(done);
    } catch (err) {
      this.fail(refusalText(err, 'Something went wrong on the way; nothing more was done.'));
    }
  }

  private finish(e: Extraction): void {
    switch (e.status) {
      case 'Review':
        this.reached.update(r => [...r, 'extract']);
        this.stage.set('done');
        this.note.set(`In review: ${e.reviewCount ?? 0} of ${e.fieldCount ?? 0} values to check, as ${e.documentTypeName || e.documentTypeKey || 'its type'}.`);
        break;
      case 'Approved':
        this.reached.update(r => [...r, 'extract']);
        this.stage.set('done');
        this.note.set(`${statusLabel(e)}: every value was sure enough, and the document is in its type's dataset.`);
        break;
      case 'Unclassified':
        this.fail('The page did not look like any of this workspace\'s document types. Pick the type and extract it again.');
        break;
      default:
        this.fail(`The extraction ${e.status.toLowerCase()}${e.error ? ': ' + e.error : '.'}`);
    }
  }

  private go(stage: Stage): void {
    this.reached.update(r => [...r.filter(s => s !== stage), stage]);
    this.stage.set(stage);
  }

  private fail(message: string): void {
    this.stage.set('failed');
    this.note.set(message);
  }

  /** Asks again until the row is no longer in progress; null when the dialog closed or stopped waiting. */
  private async until<T>(row: T, working: (r: T) => boolean, again: (r: T) => Promise<T>): Promise<T | null> {
    let now = row;
    for (let n = 0; working(now); n++) {
      if (this.stopped) return null;
      if (n >= this.maxPolls) {
        this.stage.set('done');
        this.note.set('Still working. It will show on the overview when it is done.');
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, this.pollMs));
      if (this.stopped) return null;
      now = await again(now);
    }
    return now;
  }
}

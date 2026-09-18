import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../core/api/api.config';
import { BucketSummary, ObjectSummary, StorageService } from '../../features/objects/storage.service';
import { Combobox } from './combobox';
import { Icon } from './icon';
import { SidePanel, sidePanelConfig } from './side-panel';
import { formatSize } from './format-size';

export interface ObjectPickerOptions {
  /** What the pick is for -- shown as the panel's title. */
  heading?: string;
  /** Start here rather than at the bucket list. */
  bucket?: string;
  prefix?: string;
  /** Extensions to offer; everything else is listed greyed. Empty means every file. */
  extensions?: string[];
}

export interface PickedObject {
  bucket: string;
  key: string;
  name: string;
  size?: number;
  contentType?: string;
}

/**
 * One file, from any bucket the person can see.
 *
 * The converter, the transcript tool and the AI step drawer each grew their own way of naming
 * an object -- a combobox over one bucket's root, a typed key, a free-text folder. This is the
 * one picker: the buckets the storage browser lists, the folders under each, a filter, and a
 * row per file that says its size and type. Where a caller can only use some types it says
 * which, and still shows the rest so a person can see that the file exists and is the wrong
 * kind, rather than wondering where it went.
 */
@Component({
  selector: 'app-object-picker',
  imports: [SidePanel, Combobox, Icon],
  template: `
    <app-side-panel [heading]="data.heading || 'Pick a file'" [subtitle]="subtitle()">
      <div class="form-stack">
        <div>
          <label class="label" for="opBucket">Bucket</label>
          <app-combobox id="opBucket" [selected]="bucket()" (selectedChange)="openBucket($event)"
                        placeholder="Choose a bucket" [allowClear]="false" [options]="bucketOptions()" />
        </div>

        @if (bucket()) {
          <nav class="flex items-center gap-1 flex-wrap text-xs" aria-label="Folder path">
            <app-icon name="folder" size="0.9em" class="icon-muted" />
            <button type="button" class="link-inline mono" (click)="browse('')">{{ bucket() }}</button>
            @for (crumb of crumbs(); track crumb.prefix) {
              <span class="text-[color:var(--text-muted)]">/</span>
              <button type="button" class="link-inline mono" (click)="browse(crumb.prefix)">{{ crumb.name }}</button>
            }
          </nav>

          <div class="search-field">
            <app-icon name="search" size="0.95em" />
            <input class="input" placeholder="Filter this folder" [value]="filter()" (input)="filter.set($any($event.target).value)" aria-label="Filter this folder" />
          </div>

          @if (loading()) {
            <p class="text-sm text-[color:var(--text-muted)] px-1 py-4 text-center"><span class="spinner inline-block align-middle mr-2"></span>Reading the folder…</p>
          } @else if (!rows().length) {
            <p class="text-sm text-[color:var(--text-muted)] rounded-md px-3 py-4 bg-sunken text-center">
              {{ filter() ? 'Nothing here matches "' + filter() + '".' : 'Nothing in this folder.' }}
            </p>
          } @else {
            <ul class="object-picker-list" role="listbox" aria-label="Files">
              @for (row of rows(); track row.key) {
                <li>
                  @if (row.folder) {
                    <button type="button" class="object-picker-row" (click)="browse(row.key)">
                      <app-icon name="folder" size="1em" class="icon-info" />
                      <span class="truncate">{{ row.name }}</span>
                      <app-icon name="chevronRight" size="0.9em" class="icon-muted ml-auto" />
                    </button>
                  } @else {
                    <button type="button" class="object-picker-row" [class.is-off]="!offered(row)"
                            [disabled]="!offered(row)" [title]="offered(row) ? row.key : 'Not a ' + data.extensions?.join(', ') + ' file'"
                            (click)="pick(row)">
                      <app-icon name="file" size="1em" class="icon-muted" />
                      <span class="truncate">{{ row.name }}</span>
                      <span class="text-xs text-[color:var(--text-muted)] ml-auto whitespace-nowrap tabular">{{ sizeOf(row) }}</span>
                    </button>
                  }
                </li>
              }
            </ul>
            @if (nextToken()) {
              <button type="button" class="btn btn-ghost btn-sm" (click)="browse(prefix(), true)">This folder has more — load more</button>
            }
          }
        }
      </div>
      <ng-container foot>
        <span class="text-xs text-[color:var(--text-muted)] mr-auto">
          @if (data.extensions?.length) { Looking for {{ data.extensions!.join(', ') }} files. } @else { Any file type. }
        </span>
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Cancel</button>
      </ng-container>
    </app-side-panel>
  `,
})
export class ObjectPicker {
  readonly ref = inject<DialogRef<PickedObject | undefined>>(DialogRef);
  readonly data = inject<ObjectPickerOptions>(DIALOG_DATA);
  private readonly storage = inject(StorageService);

  readonly buckets = signal<BucketSummary[]>([]);
  readonly bucket = signal(this.data.bucket ?? '');
  readonly prefix = signal(this.data.prefix ?? '');
  readonly objects = signal<ObjectSummary[]>([]);
  readonly nextToken = signal<string | undefined>(undefined);
  readonly loading = signal(false);
  readonly filter = signal('');

  readonly bucketOptions = computed(() => this.buckets().map(b => ({ value: b.bucket, label: b.label || b.bucket, hint: b.provider })));
  readonly subtitle = computed(() => this.bucket() ? `${this.bucket()}/${this.prefix()}` : 'Any bucket you can see');
  readonly crumbs = computed(() => {
    const parts = this.prefix().split('/').filter(Boolean);
    return parts.map((name, i) => ({ name, prefix: parts.slice(0, i + 1).join('/') + '/' }));
  });
  /** Folders first, then files, both A-Z, narrowed by the filter. */
  readonly rows = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const all = this.objects().filter(o => !q || o.name.toLowerCase().includes(q));
    return [...all.filter(o => o.folder), ...all.filter(o => !o.folder)];
  });

  private ticket = 0;

  constructor() {
    this.storage.buckets().subscribe(r => {
      if (r.status === API_SUCCESS) this.buckets.set(r.data ?? []);
    });
    if (this.bucket()) this.browse(this.prefix());
  }

  openBucket(bucket: string): void {
    this.bucket.set(bucket);
    this.objects.set([]);
    if (bucket) this.browse('');
  }

  browse(prefix: string, append = false): void {
    this.prefix.set(prefix);
    if (!append) this.filter.set('');
    this.loading.set(!append);
    const ticket = ++this.ticket;
    this.storage.listObjects(this.bucket(), prefix, append ? this.nextToken() : undefined, 200).subscribe({
      next: r => {
        if (ticket !== this.ticket) return;
        this.loading.set(false);
        if (r.status !== API_SUCCESS) return;
        const page = r.data?.objects ?? [];
        this.objects.update(current => append ? [...current, ...page] : page);
        this.nextToken.set(r.data?.nextContinuationToken);
      },
      error: () => { if (ticket === this.ticket) this.loading.set(false); },
    });
  }

  offered(row: ObjectSummary): boolean {
    const wanted = this.data.extensions;
    if (!wanted?.length) return true;
    const name = row.name.toLowerCase();
    return wanted.some(ext => name.endsWith('.' + ext.toLowerCase()));
  }

  sizeOf(row: ObjectSummary): string { return row.size == null ? '' : formatSize(row.size); }

  pick(row: ObjectSummary): void {
    this.ref.close({ bucket: this.bucket(), key: row.key, name: row.name, size: row.size, contentType: row.contentType });
  }
}

/** Opens the picker as a side panel; resolves with the file or undefined when dismissed. */
export function objectPickerConfig(options: ObjectPickerOptions) {
  return sidePanelConfig<ObjectPickerOptions>(options);
}

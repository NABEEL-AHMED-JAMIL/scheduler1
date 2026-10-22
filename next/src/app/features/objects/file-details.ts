import { Component, OnInit, inject, signal } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { SidePanel } from '../../shared/ui/side-panel';
import { Icon } from '../../shared/ui/icon';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { formatSize } from '../../shared/ui/format-size';
import { ObjectSummary, StorageService } from './storage.service';
import { GeneratedService } from '../documents/generated/generated.service';
import { GeneratedReport, findRunOf } from '../documents/generated/generated.model';

export interface FileDetailsData { bucket: string; key: string; name: string; size?: number; lastModified?: string; contentType?: string; }

/**
 * MIG-253: Storage's file panel -- everything knowable about one object.
 *
 * The object's own metadata comes from storage (/storage.json/objectMetadata). Which run and
 * pipeline wrote it is Core's answer (sourceJob.json/objectWriter, 2026-10-20): the newest upload of
 * the object in a run the reader may read. Only when Core cannot be asked are the recent runs'
 * outputs (the Reports fan-out, shared and cached) searched, and the panel says how far. Storage
 * keeps no uploader. Data policy and expiry wait for MIG-243, so every file shows "No policy".
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-file-details',
  imports: [SidePanel, Icon, ServerTimePipe, RouterLink],
  templateUrl: './file-details.html',
})
export class FileDetails implements OnInit {
  readonly data = inject<FileDetailsData>(DIALOG_DATA);
  private readonly storage = inject(StorageService);
  private readonly generated = inject(GeneratedService);

  readonly meta = signal<Partial<ObjectSummary>>({
    size: this.data.size, lastModified: this.data.lastModified, contentType: this.data.contentType,
  });
  readonly metaError = signal('');
  readonly run = signal<GeneratedReport | null>(null);
  /** How many runs were searched; null while searching, -1 when they could not be read. */
  readonly runsSearched = signal<number | null>(null);
  /** Core answered which run wrote it (or that none of the reader's did): exact, not a search of recent runs. */
  readonly lookedUp = signal(false);

  ngOnInit(): void {
    this.storage.objectMetadata(this.data.bucket, this.data.key).subscribe({
      next: r => {
        if (r.status === 'SUCCESS' && r.data) this.meta.update(m => ({ ...m, ...r.data }));
        else this.metaError.set(r.message || 'Could not read this file\'s metadata.');
      },
      error: e => this.metaError.set(e?.error?.message || 'Could not read this file\'s metadata.'),
    });
    this.generated.objectWriter(this.data.bucket, this.data.key).subscribe({
      next: writer => {
        this.run.set(writer);
        this.lookedUp.set(true);
        this.runsSearched.set(0);
      },
      error: () => this.searchRecentRuns(),
    });
  }

  /** Core could not say: the recent runs' outputs are searched instead, and the panel says how far. */
  private searchRecentRuns(): void {
    this.generated.recentOutputs().subscribe({
      next: recent => {
        this.run.set(findRunOf(recent.reports, this.data.bucket, this.data.key) ?? null);
        this.runsSearched.set(recent.runsRead);
      },
      error: () => this.runsSearched.set(-1),
    });
  }

  /** The ETag without the quotes S3 wraps it in. */
  checksum(): string {
    return (this.meta().etag ?? '').replace(/"/g, '') || '—';
  }

  /** The folder the file is in, for the path line. */
  folder(): string {
    const key = this.data.key;
    return key.slice(0, key.lastIndexOf('/') + 1) || '/';
  }

  size = formatSize;
}

import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { formatSize } from '../../../shared/ui/format-size';
import { ImageApi } from './image.api';
import { BodyPart, ImageLimits, PhotoDetail, PhotoDetails, SITE_WORDS, fileProblem } from './image.model';
import { messageOf } from './image-actions';

export interface UploadSheetData {
  limits: ImageLimits;
  files?: File[];
  /** A photo picked in a bucket, or in Documents, instead of files. */
  bucket?: { bucket: string; key: string; name: string; size?: number };
  document?: { ocrDocumentId: number; name: string; size?: number | null };
}

interface Item {
  name: string;
  size: number | null;
  file: File | null;
  problem: string | null;
  state: 'waiting' | 'sending' | 'done' | 'failed';
  note: string;
}

/** "2026-11-03T10:12": the reader's wall clock now, as a datetime-local input wants it. */
export function localNow(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * Upload photos (design image-a): the photos -- dropped, chosen, or one from a bucket or from Documents -- and what they show:
 * the patient, the wound and where it is, and when it was taken (the camera's own date-time is removed on upload, so the
 * person says it). Each photo is sent by itself; a photo too large or not a photo is said here and kept as a line in the list.
 * Location and camera details are removed on upload. Closes with what was taken.
 */
@Component({
  selector: 'app-image-upload-sheet',
  imports: [SidePanel, Icon],
  styles: `
    .us-files { display: flex; flex-direction: column; gap: 0.375rem; margin: 0 0 1rem; padding: 0; list-style: none; }
    .us-files li { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; padding: 0.4375rem 0.625rem; border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md); }
    .us-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .us-size { color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .us-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem 1rem; }
    .us-wide { grid-column: 1 / -1; }
    .us-note { margin: 0.75rem 0 0; font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 0.375rem; align-items: flex-start; }
  `,
  template: `
    <app-side-panel heading="Upload photos" [subtitle]="subtitle()">
      <ul class="us-files" data-test="upload-files">
        @for (i of items(); track $index) {
          <li [attr.data-state]="i.state">
            <app-icon [name]="i.problem || i.state === 'failed' ? 'alert' : i.state === 'done' ? 'check' : 'image'"
                      [class.icon-crit]="!!i.problem || i.state === 'failed'" />
            <span class="us-name" [title]="i.name">{{ i.name }}</span>
            @if (i.size != null) { <span class="us-size">{{ size(i.size) }}</span> }
            @if (i.problem) { <span class="text-xs text-[color:var(--crit-text)]">{{ i.problem }}</span> }
            @else if (i.state === 'sending') { <app-icon name="refresh" [busy]="true" size="0.9em" /> }
            @else if (i.note) { <span class="text-xs text-[color:var(--text-secondary)]">{{ i.note }}</span> }
          </li>
        }
      </ul>
      @if (tooMany()) {
        <p class="text-sm text-[color:var(--warn-text)] mt-0" role="alert">Up to {{ data.limits.maxAtOnce }} photos go at once; the first {{ data.limits.maxAtOnce }} are sent.</p>
      }
      <div class="us-grid">
        <div class="field">
          <label class="label" for="us-patient">Patient</label>
          <input id="us-patient" class="input" placeholder="SV-000117" [value]="patient()" (input)="patient.set($any($event.target).value)" data-test="upload-patient" />
        </div>
        <div class="field">
          <label class="label" for="us-wound">Wound</label>
          <input id="us-wound" class="input" placeholder="W1" [value]="wound()" (input)="wound.set($any($event.target).value)" data-test="upload-wound" />
        </div>
        <div class="field">
          <label class="label" for="us-site">Body site</label>
          <select id="us-site" class="input" (change)="site.set($any($event.target).value)" data-test="upload-site">
            @for (b of bodyParts(); track b) { <option [value]="b" [selected]="site() === b">{{ siteWords[b] }}</option> }
          </select>
        </div>
        <div class="field">
          <label class="label" for="us-taken">Taken</label>
          <input id="us-taken" class="input" type="datetime-local" [value]="taken()" [max]="now" (input)="taken.set($any($event.target).value)" data-test="upload-taken" />
        </div>
        <div class="field us-wide">
          <label class="label" for="us-where">Where exactly</label>
          <input id="us-where" class="input" placeholder="left foot, plantar" [value]="where()" (input)="where.set($any($event.target).value)" data-test="upload-where" />
        </div>
      </div>
      <p class="us-note"><app-icon name="shield" class="shrink-0" />Location, date-time original and camera details are removed on upload and
        never stored. Photos of the same patient and wound are compared over time; the size comes only from the ruler in each photo.</p>
      <ng-container foot>
        <span class="text-xs text-[color:var(--text-muted)] mr-auto">{{ footText() }}</span>
        <button type="button" class="btn btn-default btn-sm" (click)="close()" [disabled]="sending()">{{ made().length ? 'Close' : 'Cancel' }}</button>
        <button type="button" class="btn btn-primary btn-sm" (click)="send()" [disabled]="sending() || !sendable().length || finished()" data-test="upload-send">
          <app-icon name="upload" />{{ sendable().length === 1 ? 'Upload photo' : 'Upload ' + sendable().length + ' photos' }}</button>
      </ng-container>
    </app-side-panel>
  `,
})
export class UploadSheet {
  readonly ref = inject<DialogRef<PhotoDetail[] | undefined>>(DialogRef);
  readonly data = inject<UploadSheetData>(DIALOG_DATA);
  private readonly api = inject(ImageApi);

  readonly siteWords = SITE_WORDS;
  readonly bodyParts = computed(() => this.data.limits.bodyParts?.length ? this.data.limits.bodyParts : (Object.keys(SITE_WORDS) as BodyPart[]));
  readonly now = localNow();
  readonly patient = signal('');
  readonly wound = signal('W1');
  readonly site = signal<BodyPart>('foot');
  readonly where = signal('');
  readonly taken = signal(localNow());
  readonly sending = signal(false);
  readonly finished = signal(false);
  readonly made = signal<PhotoDetail[]>([]);
  readonly items = signal<Item[]>(this.initial());
  readonly tooMany = computed(() => (this.data.files?.length ?? 0) > this.data.limits.maxAtOnce);
  readonly sendable = computed(() => this.items().filter(i => i.state === 'waiting'));
  readonly subtitle = computed(() => `JPG, PNG or HEIC · up to ${this.data.limits.maxAtOnce} at once, ${this.data.limits.maxMb} MB each`);
  readonly footText = computed(() => this.made().length ? `${this.made().length} taken; measuring in code against each ruler.`
    : 'A description is drafted for a nurse to confirm. It does not diagnose.');

  size(n: number): string {
    return formatSize(n);
  }

  private initial(): Item[] {
    const max = this.data.limits.maxAtOnce;
    if (this.data.bucket) {
      return [{ name: this.data.bucket.name, size: this.data.bucket.size ?? null, file: null, problem: null, state: 'waiting', note: 'from a bucket' }];
    }
    if (this.data.document) {
      return [{ name: this.data.document.name, size: this.data.document.size ?? null, file: null, problem: null, state: 'waiting', note: 'from Documents' }];
    }
    return (this.data.files ?? []).slice(0, max).map(file => ({ name: file.name, size: file.size, file, problem: null, state: 'waiting' as const,
      note: fileProblem(file, this.data.limits) ? 'is kept as a line saying why' : '' }));
  }

  private details(): PhotoDetails {
    const taken = this.taken().trim();
    return { patientRef: this.patient().trim(), woundLabel: this.wound().trim(), bodyPart: this.site(), siteDetail: this.where().trim(),
      takenAt: taken || undefined };
  }

  async send(): Promise<void> {
    this.sending.set(true);
    const details = this.details();
    const list = this.items();
    for (let k = 0; k < list.length; k++) {
      if (list[k].state !== 'waiting') continue;
      this.patch(k, { state: 'sending' });
      try {
        let photos: PhotoDetail[] = [];
        if (this.data.bucket) {
          const r = await firstValueFrom(this.api.fromBucket(this.data.bucket.bucket, this.data.bucket.key, details));
          if (r.status !== API_SUCCESS || !r.data) throw { error: { message: r.message } };
          photos = [r.data];
        } else if (this.data.document) {
          const r = await firstValueFrom(this.api.fromDocuments(this.data.document.ocrDocumentId, details));
          if (r.status !== API_SUCCESS || !r.data) throw { error: { message: r.message } };
          photos = [r.data];
        } else if (list[k].file) {
          const r = await firstValueFrom(this.api.upload(list[k].file!, details));
          if (r.status !== API_SUCCESS || !r.data) throw { error: { message: r.message } };
          photos = r.data.photos ?? [];
        }
        const one = photos[0];
        this.made.update(m => [...m, ...photos]);
        this.patch(k, { state: one && one.status === 'REFUSED' ? 'failed' : 'done',
          note: one ? (one.status === 'REFUSED' ? (one.refusalCode === 'TOO_LARGE' ? 'Too large' : 'Not a photo') : one.status === 'NO_RULER'
            ? 'No ruler: no size' : one.areaCm2 != null ? `${one.areaCm2.toFixed(1)} cm²` : 'Taken') : '' });
      } catch (err) {
        this.patch(k, { state: 'failed', note: messageOf(err) || 'Not sent' });
      }
    }
    this.sending.set(false);
    this.finished.set(true);
    if (this.made().length && this.items().every(i => i.state === 'done')) this.ref.close(this.made());
  }

  close(): void {
    this.ref.close(this.made().length ? this.made() : undefined);
  }

  private patch(k: number, change: Partial<Item>): void {
    this.items.update(list => list.map((i, n) => n === k ? { ...i, ...change } : i));
  }
}

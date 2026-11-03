import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { formatSize } from '../../../shared/ui/format-size';
import { ImageApi } from './image.api';
import {
  BodyPart, ImageLimits, OfferedType, PhotoDetail, PhotoDetails, SITE_WORDS, describedOnlyNote, fileProblem, looksLike, stateAdvice, typeName,
} from './image.model';
import { messageOf } from './image-actions';
import { TakenField } from './taken-field';

export interface UploadSheetData {
  limits: ImageLimits;
  /** The types offered for the picker (limits.types). */
  types?: OfferedType[];
  /** Types switched off in this workspace, by name: shown as not offered. */
  notOffered?: string[];
  /** The strip's Type, for every image; none: the AI suggests one at upload. */
  imageType?: string;
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
  /** The type chosen; '' lets the AI suggest one at upload. */
  type: string;
  /** The image as taken, once uploaded. */
  photo?: PhotoDetail | null;
  /** After upload: the AI suggested the type (a draft), or had no suggestion, so the person chooses. */
  suggestion?: 'suggested' | 'none' | null;
  /** The note is a refusal or a state that needs doing (too dark): said in red. */
  crit?: boolean;
}

/** What an uploaded image says on its line: a refusal's own message, too dark, no ruler, its area, or description only. */
export function takenNote(one: PhotoDetail | undefined): { note: string; crit: boolean } {
  if (!one) return { note: '', crit: false };
  if (one.status === 'REFUSED') return { note: one.refusalMessage || stateAdvice(one)?.lead || 'Not uploaded', crit: true };
  if (one.status === 'TOO_DARK') return { note: 'Too dark to read: retake it with the room light on or the flash', crit: true };
  if (one.status === 'NOT_READ') return { note: one.refusalMessage || 'Could not be read', crit: true };
  if (one.status === 'NO_RULER') return { note: 'No ruler: no size', crit: false };
  if (one.status === 'UNMEASURED' || one.measuredType === false) return { note: 'Description only', crit: false };
  if (one.areaCm2 != null) return { note: `${one.areaCm2.toFixed(1)} cm²`, crit: false };
  return { note: 'Taken', crit: false };
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
 * Location and camera details are removed on upload. Closes with what was taken. Each image has its Type (design
 * types-states, 1): chosen here, or left to the AI, whose suggestion comes back as a draft ("Looks like an X-ray",
 * suggested) that the person's choice always replaces; with no suggestion the line asks for one. A type switched off in
 * the workspace is listed as not offered.
 */
@Component({
  selector: 'app-image-upload-sheet',
  imports: [SidePanel, Icon, TakenField],
  styles: `
    .us-pick { display: flex; align-items: center; gap: 0.625rem; margin: 0 0 0.75rem; padding: 0.875rem 1rem; border: 1.5px dashed var(--border-strong);
      border-radius: var(--radius-lg); background: var(--surface-inset); font-size: 0.8125rem; cursor: pointer; }
    .us-pick b { font-weight: 600; }
    .us-files { display: flex; flex-direction: column; gap: 0.375rem; margin: 0 0 1rem; padding: 0; list-style: none; }
    .us-files li { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; padding: 0.4375rem 0.625rem; border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md); }
    .us-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .us-size { color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .us-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem 1rem; }
    .us-wide { grid-column: 1 / -1; }
    .us-note { margin: 0.75rem 0 0; font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 0.375rem; align-items: flex-start; }
    .us-files li { flex-wrap: wrap; }
    .us-main { flex: 1 1 14rem; min-width: 0; }
    .us-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.375rem; margin-top: 0.125rem; font-size: 0.75rem; color: var(--text-secondary); }
    .us-sub .pill { height: 1.125rem; }
    .us-type { flex: 0 0 12.5rem; }
    .us-type.us-need { border-color: var(--warn-text); }
    .us-crit { color: var(--crit-text); }
  `,
  template: `
    <app-side-panel heading="Upload images" [subtitle]="subtitle()">
      @if (!data.bucket && !data.document) {
        <label class="us-pick" (dragover)="$event.preventDefault()" (drop)="dropped($event)" data-test="upload-pick">
          <app-icon name="upload" /><span><b>Choose images</b> or drop them here</span>
          <input type="file" class="sr-only" multiple accept=".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic" (change)="picked($event)" />
        </label>
      }
      <ul class="us-files" data-test="upload-files">
        @for (i of items(); track $index) {
          @let k = $index;
          <li [attr.data-state]="i.state" [attr.data-upload-item]="i.name">
            <app-icon [name]="i.crit || i.state === 'failed' || (i.problem && i.state === 'waiting') ? 'alert' : i.state === 'done' ? 'check' : 'image'"
                      [class.icon-crit]="i.crit || i.state === 'failed' || (!!i.problem && i.state === 'waiting')" />
            <div class="us-main">
              <div class="flex items-center gap-2 min-w-0"><span class="us-name" [title]="i.name">{{ i.name }}</span>
                @if (i.size != null) { <span class="us-size">{{ size(i.size) }}</span> }
                @if (i.state === 'sending') { <app-icon name="refresh" [busy]="true" size="0.9em" /> }</div>
              @if (i.state === 'waiting' && i.problem) {
                <div class="us-sub us-crit" role="alert" data-test="upload-problem">{{ i.problem }}</div>
              } @else if (i.note) {
                <div class="us-sub" [class.us-crit]="i.crit || i.state === 'failed'" [attr.role]="i.crit || i.state === 'failed' ? 'alert' : null" data-test="upload-note">{{ i.note }}</div>
              }
              @if (i.suggestion === 'suggested' && i.photo) {
                <div class="us-sub" data-test="upload-suggested"><app-icon name="sparkle" size="0.9em" />{{ looksLike(typeName(i.photo)) }}
                  <span class="pill pill-warn">suggested</span><span class="text-[color:var(--text-muted)]">a draft; your choice wins</span></div>
              } @else if (i.suggestion === 'none') {
                <div class="us-sub text-[color:var(--text-muted)]" data-test="upload-no-suggestion">No suggestion: please choose</div>
              }
            </div>
            @if (i.state !== 'failed' && !(i.state === 'waiting' && i.problem)) {
              <select class="input input-sm us-type" [class.us-need]="needsType(i)" [attr.aria-label]="'Image type of ' + i.name"
                      [disabled]="i.state === 'sending' || sending()" (change)="choose(k, $any($event.target).value)" data-test="upload-type">
                @if (i.state === 'waiting') { <option value="" [selected]="!i.type">{{ suggestOn() ? 'Let AI suggest' : 'Choose a type' }}</option> }
                @else if (!i.type) { <option value="" selected>Choose a type</option> }
                @for (t of types(); track t.key) { <option [value]="t.key" [selected]="i.type === t.key">{{ t.name }}</option> }
                @for (n of notOffered(); track n) { <option disabled>{{ n }} · not offered in this workspace</option> }
              </select>
            }
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
          <app-taken-field inputId="us-taken" [value]="taken()" [max]="now" (valueChange)="taken.set($event)" data-test="upload-taken" />
        </div>
        <div class="field us-wide">
          <label class="label" for="us-where">Where exactly</label>
          <input id="us-where" class="input" placeholder="left foot, plantar" [value]="where()" (input)="where.set($any($event.target).value)" data-test="upload-where" />
        </div>
      </div>
      @if (onlyNote()) { <p class="us-note" data-test="upload-described-only"><app-icon name="info" class="shrink-0" />{{ onlyNote() }}</p> }
      @if (notOffered().length) {
        <p class="us-note" data-test="upload-not-offered"><app-icon name="info" class="shrink-0" />{{ notOffered().join(', ') }} {{ notOffered().length === 1 ? 'is' : 'are' }} not offered in this
          workspace: an administrator switched {{ notOffered().length === 1 ? 'it' : 'them' }} off in AI settings. Earlier images keep their type and description.</p>
      }
      <p class="us-note"><app-icon name="shield" class="shrink-0" />Location, date-time original and camera details are removed on upload and
        never stored. Photos of the same patient and wound are compared over time; the size comes only from the ruler in each photo.</p>
      <ng-container foot>
        <span class="text-xs text-[color:var(--text-muted)] mr-auto">{{ footText() }}</span>
        <button type="button" class="btn btn-default btn-sm" (click)="close()" [disabled]="sending()">{{ made().length ? 'Close' : 'Cancel' }}</button>
        @if (finished() && !sendable().length) {
          <button type="button" class="btn btn-primary btn-sm" (click)="close()" [disabled]="busyType()" data-test="upload-done"><app-icon name="check" />Done</button>
        } @else {
          <button type="button" class="btn btn-primary btn-sm" (click)="send()" [disabled]="sending() || !sendable().length || mustChoose() > 0" data-test="upload-send">
            <app-icon name="upload" />{{ sendLabel() }}</button>
        }
      </ng-container>
    </app-side-panel>
  `,
})
export class UploadSheet {
  readonly ref = inject<DialogRef<PhotoDetail[] | undefined>>(DialogRef);
  readonly data = inject<UploadSheetData>(DIALOG_DATA);
  private readonly api = inject(ImageApi);

  readonly siteWords = SITE_WORDS;
  readonly looksLike = looksLike;
  readonly typeName = typeName;
  readonly types = computed(() => this.data.types ?? this.data.limits.types ?? []);
  readonly notOffered = computed(() => this.data.notOffered ?? []);
  readonly suggestOn = computed(() => this.data.limits.suggestOn ?? true);
  readonly onlyNote = computed(() => describedOnlyNote(this.types()));
  readonly busyType = signal(false);
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
  /** Images still waiting with no type, when the AI does not suggest one. */
  readonly mustChoose = computed(() => this.suggestOn() ? 0 : this.sendable().filter(i => !i.type).length);
  readonly sendLabel = computed(() => {
    const n = this.sendable().length;
    const base = n <= 1 ? 'Upload image' : `Upload ${n}`;
    return this.mustChoose() ? `${n <= 1 ? 'Upload' : base} (choose a type for ${this.mustChoose()})` : base;
  });
  readonly subtitle = computed(() => `JPG, PNG or HEIC · up to ${this.data.limits.maxAtOnce} at once, ${this.data.limits.maxMb} MB each`);
  readonly footText = computed(() => {
    if (this.made().length) {
      const need = this.items().filter(i => this.needsType(i)).length;
      return need ? `${this.made().length} taken; choose a type for ${need}.` : `${this.made().length} taken; a measured type is measured in code against its ruler.`;
    }
    return 'A description is drafted for a clinician to confirm. It never diagnoses.';
  });

  size(n: number): string {
    return formatSize(n);
  }

  picked(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.add([...(input.files ?? [])]);
    input.value = '';
  }

  dropped(event: DragEvent): void {
    event.preventDefault();
    this.add([...(event.dataTransfer?.files ?? [])]);
  }

  /** More photos, up to the limit at once. */
  add(files: File[]): void {
    const room = this.data.limits.maxAtOnce - this.items().filter(i => i.state === 'waiting').length;
    const more = files.slice(0, Math.max(0, room)).map(file => this.fileItem(file));
    this.finished.set(false);
    this.items.update(list => [...list, ...more]);
  }

  private initial(): Item[] {
    const max = this.data.limits.maxAtOnce;
    const type = this.startType();
    if (this.data.bucket) {
      return [{ name: this.data.bucket.name, size: this.data.bucket.size ?? null, file: null, problem: null, state: 'waiting', note: 'from a bucket', type }];
    }
    if (this.data.document) {
      return [{ name: this.data.document.name, size: this.data.document.size ?? null, file: null, problem: null, state: 'waiting', note: 'from Documents', type }];
    }
    return (this.data.files ?? []).slice(0, max).map(file => this.fileItem(file));
  }

  /** A file offered: what is wrong with it is said at once (too large, not a photo); it is still sent, and kept as a line saying why. */
  private fileItem(file: File): Item {
    const problem = fileProblem(file, this.data.limits);
    return { name: file.name, size: file.size, file, problem: problem ? `${problem} · it is kept as a line saying why` : null, state: 'waiting', note: '',
      type: this.startType() };
  }

  /** The strip's type, when it is still offered. */
  private startType(): string {
    const t = this.data.imageType ?? '';
    return t && (this.data.types ?? this.data.limits.types ?? []).some(o => o.key === t) ? t : '';
  }

  needsType(i: Item): boolean {
    return (i.state === 'waiting' && !this.suggestOn() && !i.type) || (i.state === 'done' && i.suggestion === 'none' && !i.type);
  }

  /** A type chosen: before upload it goes with the image; after, it is saved at once and replaces the suggestion. */
  async choose(k: number, key: string): Promise<void> {
    const item = this.items()[k];
    if (!item) return;
    if (item.state === 'waiting' || !item.photo) { this.patch(k, { type: key }); return; }
    if (!key || key === item.photo.imageType && !item.photo.typeSuggested) { this.patch(k, { type: key }); return; }
    this.busyType.set(true);
    try {
      const r = await firstValueFrom(this.api.edit(item.photo.photoId, { imageType: key }));
      if (r.status !== API_SUCCESS || !r.data) throw { error: { message: r.message } };
      const photo = r.data;
      this.made.update(m => m.map(p => p.photoId === photo.photoId ? photo : p));
      this.patch(k, { type: key, photo, suggestion: null, ...takenNote(photo) });
    } catch (err) {
      this.patch(k, { note: messageOf(err) || 'The type could not be saved.', crit: true });
    } finally {
      this.busyType.set(false);
    }
  }

  private details(type: string): PhotoDetails {
    const taken = this.taken().trim();
    return { patientRef: this.patient().trim(), woundLabel: this.wound().trim(), bodyPart: this.site(), siteDetail: this.where().trim(),
      takenAt: taken || undefined, imageType: type || undefined };
  }

  async send(): Promise<void> {
    this.sending.set(true);
    const list = this.items();
    for (let k = 0; k < list.length; k++) {
      if (list[k].state !== 'waiting') continue;
      const details = this.details(list[k].type);
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
        const refused = !!one && one.status === 'REFUSED';
        // No type chosen: the AI's suggestion (a draft) or none, said on the line, with the type to choose.
        const suggestion = !one || refused || list[k].type ? null : one.typeSuggested && one.imageType ? 'suggested' as const : !one.imageType ? 'none' as const : null;
        this.patch(k, { state: refused ? 'failed' : 'done', photo: one ?? null, problem: null, suggestion,
          type: list[k].type || (one?.imageType ?? ''), ...takenNote(one) });
      } catch (err) {
        this.patch(k, { state: 'failed', note: messageOf(err) || 'Not sent' });
      }
    }
    this.sending.set(false);
    this.finished.set(true);
    // Closes by itself only when every image is taken and needs nothing more: no refusal, nothing too dark, no type to choose.
    if (this.made().length && this.items().every(i => i.state === 'done' && !i.crit && !i.suggestion)) this.ref.close(this.made());
  }

  close(): void {
    this.ref.close(this.made().length ? this.made() : undefined);
  }

  private patch(k: number, change: Partial<Item>): void {
    this.items.update(list => list.map((i, n) => n === k ? { ...i, ...change } : i));
  }
}

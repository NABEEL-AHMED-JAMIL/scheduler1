import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ImageActions } from './image-actions';
import { ImageType, neverText } from './image-ai';
import {
  CompareRow, DRAFT_LABEL, Description, DescriptionField, NOT_SURE, PhotoDetail, fieldLabel, fieldValue, photoFields, stateAdvice, typeName,
} from './image.model';

/**
 * The description, everywhere it shows (design image-a-detail, image-states): always "Draft · not a diagnosis" until a nurse
 * confirms it; a field the model was unsure of reads "Not sure: please fill in". Confirm, Edit (the fields, then Confirm) or
 * Discard. Describing… while the local model reads the photo; off or failed said in a line, with Describe again. The fields
 * are the photo's type's (design image-tool-types: a lesion's colour, border, shape and surface; an X-ray's body part, view,
 * image quality and markers), labelled from their keys; the type's warning (X-ray: local models are weak) is said above the
 * actions, and the byline says which type, prompt version and model wrote it.
 */
@Component({
  selector: 'app-description-card',
  imports: [Icon, ServerTimePipe],
  host: { class: 'card dc', '[attr.data-test]': "'description-card'" },
  styles: `
    :host { display: block; padding: 0; }
    .dc-h { display: flex; align-items: center; gap: 0.625rem; padding: 0.875rem 1rem; border-bottom: 1px solid var(--border-subtle); }
    .dc-h h3 { margin: 0; font-size: 0.9375rem; font-weight: 600; }
    .dc-b { padding: 1rem; }
    .fld { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr); gap: 0.5rem 0.75rem; margin: 0; font-size: 0.8125rem; }
    :host(.dc-compact) .fld { grid-template-columns: 5.75rem minmax(0, 1fr); }
    .fld dt { color: var(--text-muted); }
    .fld dd { margin: 0; overflow-wrap: anywhere; }
    .fld dd.ns { color: var(--text-muted); }
    .fld input { width: 100%; }
    .dc-acts { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }
    .dc-note { margin: 0.75rem 0 0; font-size: 0.75rem; color: var(--text-muted); }
    .dc-warn { display: flex; gap: 0.5rem; align-items: flex-start; margin-top: 0.75rem; padding: 0.5rem 0.75rem; border-radius: var(--radius-lg);
      background: var(--pill-warn-bg); color: var(--text-primary); font-size: 0.75rem; line-height: 1.45; }
    .dc-warn app-icon { flex: none; margin-top: 0.0625rem; color: var(--warn-text); }
    .dc-by { margin: 0.5rem 0 0; font-size: 0.75rem; color: var(--text-muted); }
  `,
  template: `
    @let d = photo();
    @if (!bare()) {
      <div class="dc-h"><h3>Description</h3>
        @if (d.descriptionStatus === 'CONFIRMED') { <span class="pill pill-ok"><app-icon name="check" size="0.85em" />Confirmed · not a diagnosis</span> }
        @else if (d.descriptionStatus === 'DRAFT') { <span class="pill pill-warn" data-test="draft-pill">{{ unsure().length ? 'Draft · unsure' : draftLabel }}</span> }
        @else if (d.descriptionStatus === 'PENDING') { <span class="pill pill-info">Describing…</span> }
      </div>
    }
    <div class="dc-b">
      @switch (d.descriptionStatus) {
        @case ('PENDING') {
          <p class="text-sm m-0" data-test="describing"><app-icon name="refresh" [busy]="true" size="0.9em" /> A local vision model is reading the photo. The size above is from the ruler and does not wait for it.</p>
        }
        @case ('OFF') {
          <p class="text-sm m-0">No draft description: {{ d.descriptionMessage || 'descriptions are off here.' }}</p>
          <div class="dc-acts"><button type="button" class="btn btn-default btn-sm" (click)="edit()"><app-icon name="edit" />Write one</button></div>
        }
        @case ('FAILED') {
          <p class="text-sm m-0">The description could not be drafted{{ d.descriptionMessage ? ': ' + d.descriptionMessage : '.' }}</p>
          <div class="dc-acts"><button type="button" class="btn btn-default btn-sm" (click)="again()" data-test="describe-again"><app-icon name="refresh" />Describe again</button>
            <button type="button" class="btn btn-default btn-sm" (click)="edit()">Write one</button></div>
        }
        @case ('DISCARDED') {
          <p class="text-sm m-0 text-[color:var(--text-secondary)]">The draft was discarded. The size stays.</p>
          <div class="dc-acts"><button type="button" class="btn btn-default btn-sm" (click)="again()"><app-icon name="refresh" />Describe again</button>
            <button type="button" class="btn btn-default btn-sm" (click)="edit()">Write one</button></div>
        }
        @case ('NONE') {
          @if (!editing()) { <p class="text-sm m-0 text-[color:var(--text-secondary)]">No description for this photo.</p> }
        }
      }
      @if (showFields()) {
        <dl class="fld">
          @for (f of fields(); track f) {
            <dt>{{ label(f) }}</dt>
            @if (editing()) {
              <dd><input class="input input-sm" [value]="draft()[f] ?? ''" [placeholder]="notSure" [attr.aria-label]="label(f)"
                         (input)="set(f, $any($event.target).value)" [attr.data-field]="f" /></dd>
            } @else if (value(f); as v) { <dd [attr.data-field]="f">{{ v }}</dd> }
            @else { <dd class="ns" [attr.data-field]="f">{{ notSure }}</dd> }
          }
        </dl>
        @if (d.descriptionStatus === 'CONFIRMED' && !editing()) {
          <p class="dc-note">Confirmed by {{ d.confirmedByName || 'a nurse' }}{{ d.confirmedAt ? ', ' + (d.confirmedAt | serverTime: 'recent') : '' }}. It goes into a visit note or a report as written here.</p>
        } @else if (unsure().length && !editing()) {
          <p class="dc-note">The vision model was unsure about {{ unsure().length }} of {{ fields().length }} fields, so it left them empty rather than guess. It is a draft and not a diagnosis; a clinician confirms it.{{ compact() || !sized() ? '' : ' The size above is from the ruler and is not affected.' }}</p>
        } @else if (!editing() && never()) {
          <p class="dc-note" data-test="description-never">Describes what is visible. It never says {{ never() }}; a clinician decides.</p>
        } @else if (!editing()) {
          <p class="dc-note">Written by a local vision model from the photo only. A clinician confirms or edits it before it goes into a note or a report.</p>
        }
        @if (type()?.note; as note) {
          <div class="dc-warn" data-test="type-note"><app-icon name="alert" size="0.95em" /><span>{{ note }}</span></div>
        }
        <div class="dc-acts">
          @if (editing()) {
            <button type="button" class="btn btn-primary btn-sm" (click)="save()" [disabled]="busy()" data-test="description-save"><app-icon name="check" />Confirm</button>
            <button type="button" class="btn btn-ghost btn-sm" (click)="editing.set(false)">Cancel</button>
          } @else if (d.descriptionStatus === 'DRAFT') {
            @if (unsure().length) {
              <button type="button" class="btn btn-primary btn-sm" (click)="edit()" data-test="description-fill"><app-icon name="edit" />Fill in and confirm</button>
              <button type="button" class="btn btn-default btn-intent-crit btn-sm" (click)="discard()" data-test="description-discard">Discard draft</button>
            } @else {
              <button type="button" class="btn btn-primary btn-sm" (click)="confirm()" [disabled]="busy()" data-test="description-confirm"><app-icon name="check" />Confirm</button>
              <button type="button" class="btn btn-default btn-sm" (click)="edit()" data-test="description-edit"><app-icon name="edit" />Edit</button>
              <button type="button" class="btn btn-default btn-intent-crit btn-sm" (click)="discard()" data-test="description-discard">Discard</button>
            }
          } @else if (d.descriptionStatus === 'CONFIRMED') {
            <button type="button" class="btn btn-default btn-sm" (click)="edit()" data-test="description-edit"><app-icon name="edit" />Edit</button>
          }
        </div>
        @if (byline()) { <p class="dc-by" data-test="description-byline">{{ byline() }}</p> }
      }
    </div>
  `,
})
export class DescriptionCard {
  private readonly actions = inject(ImageActions);
  readonly photo = input.required<PhotoDetail>();
  /** Without its own heading (the panel's tab, the states page's card). */
  readonly bare = input(false);
  readonly compact = input(false);
  /** The photo's type, for its warning, what it never says, and the byline. */
  readonly type = input<ImageType | null>(null);
  readonly changed = output<PhotoDetail>();

  readonly fields = computed(() => photoFields(this.photo()));
  readonly label = fieldLabel;
  readonly notSure = NOT_SURE;
  readonly draftLabel = DRAFT_LABEL;
  readonly editing = signal(false);
  readonly busy = signal(false);
  readonly draft = signal<Description>({});
  readonly shown = computed(() => this.photo().description ?? this.photo().descriptionDraft ?? null);
  readonly unsure = computed(() => this.fields().filter(f => !fieldValue(this.shown(), f)));
  readonly sized = computed(() => this.photo().areaCm2 != null);
  readonly never = computed(() => { const t = this.type(); return t && (t.baseKey ?? t.key) !== 'wound' ? neverText(t.never) : ''; });
  /** "Skin lesion · Skin lesion description (built in) v1 on qwen3.5:9b". */
  readonly byline = computed(() => {
    const d = this.photo();
    if (!d.descriptionModel && !d.descriptionPromptName) return '';
    const name = typeName(d) || this.type()?.name || '';
    const prompt = d.descriptionPromptName ? `${d.descriptionPromptName}${d.descriptionPromptVersion != null ? ' v' + d.descriptionPromptVersion : ''}` : '';
    const how = [prompt, d.descriptionModel ? `on ${d.descriptionModel}` : ''].filter(Boolean).join(' ');
    return [name, how].filter(Boolean).join(' · ');
  });
  readonly showFields = computed(() => this.editing() || ((this.photo().descriptionStatus === 'DRAFT' || this.photo().descriptionStatus === 'CONFIRMED') && !!this.shown()));

  value(f: DescriptionField): string | null {
    return fieldValue(this.shown(), f);
  }

  set(f: DescriptionField, v: string): void {
    this.draft.update(d => ({ ...d, [f]: v }));
  }

  edit(): void {
    const s = this.shown() ?? {};
    this.draft.set(Object.fromEntries(this.fields().map(f => [f, s[f] ?? ''])));
    this.editing.set(true);
  }

  async confirm(): Promise<void> {
    this.busy.set(true);
    const done = await this.actions.confirm(this.photo());
    this.busy.set(false);
    if (done) this.changed.emit(done);
  }

  async save(): Promise<void> {
    this.busy.set(true);
    const done = await this.actions.confirm(this.photo(), this.draft());
    this.busy.set(false);
    if (done) { this.editing.set(false); this.changed.emit(done); }
  }

  async discard(): Promise<void> {
    const done = await this.actions.discard(this.photo());
    if (done) this.changed.emit(done);
  }

  async again(): Promise<void> {
    const done = await this.actions.describeAgain(this.photo());
    if (done) this.changed.emit(done);
  }
}

/** A photo that could not be measured or taken, in plain words with what to do next (design image-states). */
@Component({
  selector: 'app-photo-state',
  imports: [Icon],
  host: { '[attr.data-state]': 'advice()?.key' },
  styles: `
    :host { display: block; }
    p { margin: 0; font-size: 0.875rem; }
    p + p { margin-top: 0.5rem; color: var(--text-secondary); }
    .ps-acts { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }
  `,
  template: `
    @if (advice(); as a) {
      <p><b>{{ a.lead }}</b>@if (a.key === 'no-ruler') { We only measure against a ruler in the photo; we never estimate a size. }</p>
      <p>{{ a.key === 'no-ruler' ? 'Take another photo with the paper ruler flat beside the wound. The outline is kept, and you can still compare its shape.' : a.text }}</p>
      <div class="ps-acts">
        @switch (a.key) {
          @case ('no-ruler') {
            <button type="button" class="btn btn-primary btn-sm" (click)="upload.emit()" data-test="state-upload"><app-icon name="upload" />Upload a photo with a ruler</button>
            <button type="button" class="btn btn-default btn-sm" (click)="keep.emit()" data-test="state-keep">Keep without size</button>
          }
          @case ('too-dark') {
            <button type="button" class="btn btn-primary btn-sm" (click)="upload.emit()" data-test="state-upload"><app-icon name="upload" />Upload another photo</button>
            <button type="button" class="btn btn-default btn-intent-crit btn-sm" (click)="remove.emit()" data-test="state-remove">Remove</button>
          }
          @case ('too-large') {
            <button type="button" class="btn btn-default btn-sm" (click)="bucket.emit()" data-test="state-bucket"><app-icon name="folder" />Pick from a bucket</button>
            <button type="button" class="btn btn-default btn-intent-crit btn-sm" (click)="remove.emit()" data-test="state-remove">Remove</button>
          }
          @case ('upload-failed') {
            <button type="button" class="btn btn-default btn-sm" (click)="converter()" data-test="state-converter"><app-icon name="file" />Open Document Converter</button>
            <button type="button" class="btn btn-default btn-intent-crit btn-sm" (click)="remove.emit()" data-test="state-remove">Remove</button>
          }
          @default {
            <button type="button" class="btn btn-primary btn-sm" (click)="upload.emit()"><app-icon name="upload" />Upload another photo</button>
            <button type="button" class="btn btn-default btn-intent-crit btn-sm" (click)="remove.emit()">Remove</button>
          }
        }
      </div>
    }
  `,
})
export class PhotoState {
  private readonly router = inject(Router, { optional: true });
  readonly photo = input.required<PhotoDetail>();
  readonly upload = output<void>();
  readonly keep = output<void>();
  readonly remove = output<void>();
  readonly bucket = output<void>();
  readonly advice = computed(() => stateAdvice(this.photo()));

  converter(): void {
    void this.router?.navigate(['/tools/converter']);
  }
}

/**
 * The area over time (design image-a-detail's card line, image-a-compare's chart): only photos with a size are on it, each
 * point its date and cm². "spark" is the small line under the size; "full" the Compare card's chart with its 0-10 grid.
 */
@Component({
  selector: 'app-area-chart',
  imports: [ServerTimePipe],
  styles: `:host { display: block; } svg { width: 100%; display: block; overflow: visible; } .ac-spark { height: 60px; } .ac-full { height: 170px; }`,
  template: `
    @if (points().length) {
      @if (kind() === 'spark') {
        <svg class="ac-spark" viewBox="0 0 300 60" role="img" [attr.aria-label]="label()">
          <polyline [attr.points]="line()" fill="none" stroke="var(--ok-text)" stroke-width="2.5" />
          @for (p of points(); track p.id) {
            <circle [attr.cx]="p.x" [attr.cy]="p.y" r="4" fill="var(--ok-text)" />
            <text [attr.x]="p.tx" y="58" font-size="11" fill="var(--text-muted)" [attr.text-anchor]="p.anchor">{{ p.at | serverTime: 'day' }} · {{ p.area.toFixed(1) }}</text>
          }
        </svg>
      } @else {
        <svg class="ac-full" viewBox="0 0 360 150" role="img" [attr.aria-label]="label()">
          <g stroke="var(--border-subtle)">@for (g of grid(); track g.v) { <line x1="30" x2="350" [attr.y1]="g.y" [attr.y2]="g.y" /> }</g>
          <g font-size="11" fill="var(--text-muted)">
            @for (g of grid(); track g.v) { <text [attr.x]="g.v >= 10 ? 4 : 8" [attr.y]="g.y + 4">{{ g.v }}</text> }
            @for (p of points(); track p.id) { <text [attr.x]="p.x" y="134" text-anchor="middle">{{ p.at | serverTime: 'day' }}</text> }
          </g>
          <polyline [attr.points]="line()" fill="none" stroke="var(--ok-text)" stroke-width="2.5" />
          <g fill="var(--surface-raised)" stroke="var(--ok-text)" stroke-width="2.5">
            @for (p of points(); track p.id) { <circle [attr.cx]="p.x" [attr.cy]="p.y" r="5" /> }
          </g>
          <g font-size="11" fill="var(--text-primary)" font-weight="600">
            @for (p of points(); track p.id; let last = $last) { <text [attr.x]="p.x + (last ? -12 : 6)" [attr.y]="p.y - 6">{{ p.area.toFixed(1) }}{{ last ? ' cm²' : '' }}</text> }
          </g>
        </svg>
      }
    }
  `,
})
export class AreaChart {
  readonly rows = input.required<readonly CompareRow[]>();
  readonly kind = input<'spark' | 'full'>('full');

  readonly sized = computed(() => this.rows().filter(r => r.sized && r.areaCm2 != null));
  readonly top = computed(() => {
    const max = Math.max(...this.sized().map(r => r.areaCm2 ?? 0), 1);
    return Math.max(10, Math.ceil(max / 5) * 5);
  });
  readonly grid = computed(() => {
    const top = this.top();
    return [top, top / 2, 0].map(v => ({ v, y: 110 - v / top * 90 }));
  });
  readonly points = computed(() => {
    const rows = this.sized();
    const n = rows.length;
    const spark = this.kind() === 'spark';
    const maxA = Math.max(...rows.map(r => r.areaCm2 ?? 0), 0.0001);
    const minA = Math.min(...rows.map(r => r.areaCm2 ?? 0));
    return rows.map((r, i) => {
      const x = spark ? (n === 1 ? 150 : 10 + i * 280 / (n - 1)) : (n === 1 ? 190 : 50 + i * 280 / (n - 1));
      const y = spark ? (maxA === minA ? 30 : 10 + (maxA - (r.areaCm2 ?? 0)) / (maxA - minA) * 38) : 110 - (r.areaCm2 ?? 0) / this.top() * 90;
      return { id: r.photoId, x, y, area: r.areaCm2 ?? 0, at: r.takenAt ?? null,
        tx: x, anchor: i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle' };
    });
  });
  readonly line = computed(() => this.points().map(p => `${p.x},${p.y}`).join(' '));
  readonly label = computed(() => `Area over time: ${this.sized().map(r => `${(r.areaCm2 ?? 0).toFixed(1)} cm²`).join(', ')}`);
}

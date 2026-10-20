import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { ReportStudioApi, studioError } from '../report-studio.api';
import { AssetDetail, AssetKind, KIND_WORDS, Person } from '../assets.model';

export interface UploadData {
  /** A new version of this asset; null: a new asset. */
  assetId?: string | null;
  assetName?: string;
  kind?: AssetKind;
  /** Whether this person may upload signatures and stamps (report-asset-custodian). */
  custodian: boolean;
  /** Whether this person may upload logos and images (report-assets). */
  library: boolean;
}

/** The longest side an SVG is drawn at before it is uploaded as a PNG (the server keeps at most 4,096 px). */
const SVG_SIDE = 2048;

/**
 * Upload an asset or a new version of one (MIG-406, approved screen 8's "Upload asset" and screen 10's "Upload new
 * version"). The server checks the file by its content and re-encodes it; an SVG is drawn here into a PNG first (SVG is
 * markup and is never stored as it is). A signature names the person it belongs to; a signature or a stamp waits for an
 * approver.
 */
@Component({
  selector: 'app-rs-upload-panel',
  imports: [SidePanel, Icon, FormsModule],
  template: `
    <app-side-panel [heading]="data.assetId ? 'Upload a new version: ' + data.assetName : 'Upload an asset'"
                    [subtitle]="data.assetId ? 'Old reports keep the version they used.' : 'SVG, PNG or JPG, up to 10 MB.'">
      <div class="form-stack">
        @if (!data.assetId) {
          <label class="field"><span class="label">Kind</span>
            <select class="input" [ngModel]="kind()" (ngModelChange)="kind.set($event)" aria-label="Kind">
              @for (k of kinds(); track k) { <option [value]="k">{{ words[k] }}</option> }
            </select></label>
          <label class="field"><span class="label">Name</span>
            <input class="input" maxlength="160" [ngModel]="name()" (ngModelChange)="name.set($event)" aria-label="Name"
                   [placeholder]="kind() === 'SIGNATURE' ? 'Dr. Asha Patel · signature' : 'Riverside Health logo'" /></label>
          @if (kind() === 'SIGNATURE') {
            <label class="field"><span class="label">Belongs to</span>
              <select class="input" [ngModel]="owner()" (ngModelChange)="owner.set($event)" aria-label="Belongs to">
                <option [ngValue]="null">Choose the person</option>
                @for (p of people(); track p.userId) { <option [ngValue]="p.userId">{{ p.name }}</option> }
              </select>
              <span class="field-note">Only this person — or someone they grant it to — places the signature on a template. When they
                approve a report, its PDF is digitally signed in their name.</span></label>
            <label class="field"><span class="label">Title · optional</span>
              <input class="input" maxlength="120" [ngModel]="title()" (ngModelChange)="title.set($event)" aria-label="Title" placeholder="Quality lead" /></label>
          }
          <label class="field"><span class="label">Description · optional</span>
            <input class="input" maxlength="1000" [ngModel]="description()" (ngModelChange)="description.set($event)" aria-label="Description" /></label>
          <label class="field"><span class="label">Category · optional</span>
            <input class="input" maxlength="80" [ngModel]="category()" (ngModelChange)="category.set($event)" aria-label="Category" placeholder="Brand" /></label>
        }
        <label class="field"><span class="label">File</span>
          <input type="file" class="input" accept=".png,.jpg,.jpeg,.gif,.svg,image/png,image/jpeg,image/gif,image/svg+xml" (change)="pick($event)" aria-label="File" />
          @if (note()) { <span class="field-note">{{ note() }}</span> }</label>
        @if (restricted()) {
          <p class="text-xs text-[color:var(--text-muted)]"><app-icon name="lock" /> It waits for an approver, who is never the person who uploads it.
            Until then {{ data.assetId ? 'the version before stays in use' : 'it cannot be placed' }}.</p>
        }
        @if (error()) { <p class="field-note text-[color:var(--crit-text)]" role="alert">{{ error() }}</p> }
      </div>
      <div foot class="flex justify-end gap-2">
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" [disabled]="busy() || !file() || (!data.assetId && !name().trim())" (click)="upload()">
          <app-icon name="upload" />Upload</button>
      </div>
    </app-side-panel>
  `,
})
export class UploadPanel implements OnInit {
  readonly data = inject<UploadData>(DIALOG_DATA);
  readonly ref = inject<DialogRef<AssetDetail | undefined>>(DialogRef);
  private readonly api = inject(ReportStudioApi);
  readonly words = KIND_WORDS;
  readonly kind = signal<AssetKind>(this.data.kind ?? (this.data.library ? 'LOGO' : 'SIGNATURE'));
  readonly name = signal('');
  readonly description = signal('');
  readonly category = signal('');
  readonly owner = signal<number | null>(null);
  readonly title = signal('');
  readonly people = signal<Person[]>([]);
  readonly file = signal<Blob | null>(null);
  readonly fileName = signal('');
  readonly note = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly kinds = computed<AssetKind[]>(() => [...(this.data.library ? ['LOGO', 'IMAGE'] as AssetKind[] : []),
    ...(this.data.custodian ? ['SIGNATURE', 'STAMP'] as AssetKind[] : [])]);
  readonly restricted = computed(() => this.kind() === 'SIGNATURE' || this.kind() === 'STAMP');

  ngOnInit(): void {
    if (this.data.custodian && !this.data.assetId) this.api.people().subscribe({ next: p => this.people.set(p), error: () => { /* the select says so */ } });
  }

  pick(event: Event): void {
    const f = (event.target as HTMLInputElement).files?.[0];
    this.error.set('');
    this.note.set('');
    if (!f) { this.file.set(null); return; }
    if (f.size > 10 * 1024 * 1024) { this.error.set('That file is over 10 MB.'); this.file.set(null); return; }
    if (f.type === 'image/svg+xml' || /\.svg$/i.test(f.name)) {
      rasterise(f).then(png => {
        this.file.set(png);
        this.fileName.set(f.name.replace(/\.svg$/i, '') + '.png');
        this.note.set('An SVG is drawn into a PNG here before it is uploaded (SVG is never stored as it is).');
      }).catch(() => this.error.set('That SVG could not be drawn; save it as PNG and try again.'));
      return;
    }
    this.file.set(f);
    this.fileName.set(f.name);
  }

  upload(): void {
    const f = this.file();
    if (!f) return;
    this.busy.set(true);
    this.error.set('');
    const done = { next: (a: AssetDetail) => { this.busy.set(false); this.ref.close(a); },
      error: (e: unknown) => { this.busy.set(false); this.error.set(studioError(e, 'The file could not be uploaded.').message); } };
    if (this.data.assetId) {
      this.api.uploadAssetVersion(this.data.assetId, f, this.fileName(), this.data.kind === 'SIGNATURE' || this.data.kind === 'STAMP').subscribe(done);
      return;
    }
    if (this.kind() === 'SIGNATURE' && !this.owner()) { this.busy.set(false); this.error.set('Say whose signature it is.'); return; }
    this.api.uploadAsset(f, this.fileName(), { kind: this.kind(), name: this.name().trim(), description: this.description().trim(),
      category: this.category().trim(), ownerUserId: this.owner(), ownerTitle: this.title().trim() }, this.restricted()).subscribe(done);
  }
}

/** An SVG drawn into a PNG in the browser (its longest side {@link SVG_SIDE}), transparency kept. */
export function rasterise(file: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1024;
      const h = img.naturalHeight || 512;
      const scale = SVG_SIDE / Math.max(w, h);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const g = canvas.getContext('2d');
      if (!g) { URL.revokeObjectURL(url); reject(new Error('no canvas')); return; }
      g.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('no png'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

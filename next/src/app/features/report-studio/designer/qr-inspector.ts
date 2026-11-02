import { Component, computed, input, output } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';
import { Block } from './designer-model';
import { EcLevel, encodeQr } from './qr-encoder';
import { LEVEL_HINTS, QR_DEFAULTS, QR_MAX_MM, QR_MIN_MM, QrSource, qrAudience, qrSample, scanCheck } from './qr-check';
import type { PropChange } from './properties';

/** The four things a QR code may open, in the words a clinic reads. */
const SOURCES: { id: QrSource; label: string; hint: string }[] = [
  { id: 'verifyLink', label: 'Verify this report', hint: 'This version\'s page in the console: genuine, current, who approved it' },
  { id: 'reportId', label: 'Report number', hint: 'The number and version as text, for scanners at intake' },
  { id: 'binding', label: 'A value from the data', hint: 'For example a visit reference; pick the field under Data' },
  { id: 'text', label: 'Fixed text or link', hint: 'The same on every report; a link must be http or https' },
];

/** An SVG path of the dark modules, one rectangle a run, offset by the quiet zone. */
export function qrPath(dark: boolean[][], quiet: number): string {
  const out: string[] = [];
  dark.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      const start = x;
      while (x < row.length && row[x]) x++;
      out.push(`M${start + quiet} ${y + quiet}h${x - start}v1h${start - x}z`);
    }
  });
  return out.join('');
}

/**
 * The QR code's inspector (Reports redesign, Designer): what the code opens and who reads the answer, the code drawn at its
 * real size from the content the server would encode, its size and error correction, and a scan check -- the QR version
 * and modules for that content and level, the module's width at the chosen size, and whether it reads printed and faxed.
 */
@Component({
  selector: 'app-rs-qr-inspector',
  imports: [Icon],
  template: `
    <section class="rsd-props-group" aria-label="What it opens">
      <h3 class="rsd-eyebrow">What it opens</h3>
      <div class="qri-opts" role="radiogroup" aria-label="What the QR code opens">
        @for (s of sources; track s.id) {
          <button type="button" role="radio" class="qri-opt" [class.is-on]="source() === s.id" [attr.aria-checked]="source() === s.id"
                  [disabled]="readonly()" (click)="set('content', s.id)">
            <span class="qri-dot" aria-hidden="true"></span>
            <span class="min-w-0"><span class="block text-sm">{{ s.label }}</span><span class="block text-xs qri-muted">{{ s.hint }}</span></span>
          </button>
        }
      </div>
      <p class="text-xs qri-muted"><b class="font-semibold qri-strong">Who reads the answer.</b> {{ audience() }}</p>
    </section>

    <section class="rsd-props-group" aria-label="Preview at real size">
      <h3 class="rsd-eyebrow">Preview at {{ fitsPanel() ? 'real size' : 'reduced size' }}</h3>
      <div class="qri-prev">
        @if (code(); as c) {
          <svg class="qri-svg" role="img" [attr.aria-label]="'QR code preview, ' + size() + ' mm'" [attr.viewBox]="'0 0 ' + check().across + ' ' + check().across"
               [style.width]="size() + 'mm'" [style.height]="size() + 'mm'" shape-rendering="crispEdges">
            <rect [attr.width]="check().across" [attr.height]="check().across" fill="#FFFFFF" />
            <path [attr.d]="path()" fill="#000000" />
          </svg>
        }
        <div class="min-w-0 text-xs">
          <div class="mono qri-content" data-qr-content>{{ content().text || '—' }}</div>
          <p class="qri-muted mt-1">{{ content().note }}</p>
          @if (check().fit; as f) {
            <p class="qri-muted mt-1" data-qr-fit>{{ check().length }} characters · version {{ f.version }} at {{ level() }} · {{ f.modules }} × {{ f.modules }} modules</p>
          }
        </div>
      </div>
    </section>

    <section class="rsd-props-group" aria-label="Size and print">
      <h3 class="rsd-eyebrow">Size and print</h3>
      <label class="field"><span class="flex items-baseline justify-between"><span class="label">Size</span><span class="text-sm tabular-nums">{{ size() }} mm</span></span>
        <input type="range" class="qri-range" [min]="min" [max]="max" step="1" [value]="size()" [disabled]="readonly()" aria-label="Size in millimetres"
               (input)="setSize($any($event.target).value)" /></label>
      <div class="flex items-center justify-between gap-2">
        <span class="label m-0">Error correction</span>
        <div class="seg" role="group" aria-label="Error correction">
          @for (l of levels; track l) {
            <button type="button" class="seg-btn" [class.seg-on]="level() === l" [attr.aria-pressed]="level() === l" [disabled]="readonly()"
                    (click)="set('errorCorrection', l)">{{ l }}</button>
          }
        </div>
      </div>
      <p class="text-xs qri-muted">{{ levelHint() }}</p>
      <label class="field"><span class="label">Quiet zone</span>
        <select class="input" [disabled]="readonly()" aria-label="Quiet zone" (change)="set('quietZone', +$any($event.target).value)">
          @for (q of quietZones; track q) { <option [value]="q" [selected]="q === quiet()">{{ q }} module{{ q === 1 ? '' : 's' }}{{ q === 4 ? ' (standard)' : '' }}</option> }
        </select></label>
    </section>

    <section class="rsd-props-group" aria-label="Scan check">
      <h3 class="rsd-eyebrow">Scan check</h3>
      <ul class="qri-lines" data-scan-check>
        @for (l of check().lines; track l.text) {
          <li [class]="'qri-' + l.verdict"><app-icon [name]="l.verdict === 'ok' ? 'checkCircle' : 'alert'" class="shrink-0" /><span>{{ l.text }}</span></li>
        }
      </ul>
    </section>
  `,
  styles: `
    :host { display: block; }
    .qri-muted { color: var(--text-muted); }
    .qri-strong { color: var(--text-primary); }
    .qri-opts { display: flex; flex-direction: column; gap: 0.375rem; }
    .qri-opt { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.5rem 0.625rem; text-align: left; border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md); color: var(--text-primary); background: var(--surface-raised); }
    .qri-opt:hover:not(:disabled) { border-color: var(--border-strong); }
    .qri-opt.is-on { border-color: var(--accent-mark-strong); box-shadow: inset 0 0 0 1px var(--accent-mark-strong); }
    .qri-opt:disabled { cursor: default; }
    .qri-dot { flex: none; width: 0.875rem; height: 0.875rem; margin-top: 0.1875rem; border-radius: 50%; border: 1px solid var(--border-strong); }
    .is-on .qri-dot { border: 4px solid var(--accent-mark-strong); }
    .qri-prev { display: flex; align-items: flex-start; gap: 0.75rem; }
    .qri-svg { flex: none; max-width: 55%; height: auto; outline: 1px solid var(--border-subtle); }
    .qri-content { word-break: break-all; color: var(--text-secondary); }
    .qri-range { width: 100%; accent-color: var(--accent-mark-strong); }
    .qri-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.375rem; font-size: 0.8125rem; }
    .qri-lines li { display: flex; gap: 0.375rem; align-items: flex-start; }
    .qri-ok { color: var(--ok-text); }
    .qri-marginal { color: var(--warn-text); }
    .qri-poor { color: var(--crit-text); }
  `,
})
export class QrInspector {
  readonly block = input.required<Block>();
  readonly readonly = input(false);
  /** The test data's first record and the primary dataset's names, for a value from the data. */
  readonly sample = input<unknown>(undefined);
  readonly names = input<string[]>(['primary']);
  /** The template's blocks: a value inside a "Repeat for each" reads the repeated list's first item. */
  readonly blocks = input<Block[]>([]);
  /** The console's address the verify link starts with (media's report-studio.console-url is this console). */
  readonly origin = input<string>(typeof location !== 'undefined' ? location.origin : 'https://console.example');
  readonly changed = output<PropChange>();

  readonly sources = SOURCES;
  readonly levels: EcLevel[] = ['L', 'M', 'Q', 'H'];
  readonly quietZones = [0, 1, 2, 3, 4, 5, 6, 8, 10];
  readonly min = QR_MIN_MM;
  readonly max = QR_MAX_MM;

  readonly source = computed(() => (this.block()['content'] as QrSource | undefined) ?? QR_DEFAULTS.content);
  readonly size = computed(() => {
    const n = Number(this.block()['sizeMm'] ?? QR_DEFAULTS.sizeMm);
    return Number.isFinite(n) ? Math.max(QR_MIN_MM, Math.min(QR_MAX_MM, n)) : QR_DEFAULTS.sizeMm;
  });
  readonly level = computed(() => ((this.block()['errorCorrection'] as EcLevel | undefined) ?? QR_DEFAULTS.errorCorrection));
  readonly quiet = computed(() => {
    const n = Number(this.block()['quietZone'] ?? QR_DEFAULTS.quietZone);
    return Number.isInteger(n) && n >= 0 && n <= 10 ? n : QR_DEFAULTS.quietZone;
  });
  readonly audience = computed(() => qrAudience(this.source()));
  readonly levelHint = computed(() => LEVEL_HINTS[this.level()]);
  readonly content = computed(() => qrSample(this.block(), this.origin(), this.sample(), this.names(), this.blocks()));
  readonly check = computed(() => scanCheck(this.content().text, this.level(), this.size(), this.quiet()));
  readonly code = computed(() => (this.content().text ? encodeQr(this.content().text, this.level()) : null));
  readonly path = computed(() => qrPath(this.code()?.dark ?? [], this.quiet()));
  /** Up to 40 mm the preview fits beside its words at 96 dpi; above, it is scaled down to the panel, and says so. */
  readonly fitsPanel = computed(() => this.size() <= 40);

  set(key: string, value: unknown): void {
    if (this.readonly()) return;
    this.changed.emit({ key, value });
  }

  setSize(raw: string): void {
    const n = Math.round(Number(raw));
    if (Number.isFinite(n)) this.set('sizeMm', Math.max(QR_MIN_MM, Math.min(QR_MAX_MM, n)));
  }
}

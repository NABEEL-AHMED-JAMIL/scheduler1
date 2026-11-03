import { Component, computed, input, output } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';
import { BarcodeMeasure } from '../report-studio.model';
import { Block } from './designer-model';
import { FAX_OK_MM, PRINT_MIN_MM, PRINT_OK_MM, ScanLine, faxVerdict, printVerdict } from './qr-check';
import type { PropChange } from './properties';

export type Symbology = 'code128' | 'dataMatrix' | 'pdf417';
export type BarcodeSource = 'reportId' | 'verifyCode' | 'verifyLink' | 'binding' | 'text';

/** media-service's defaults (ComponentRegistry and charts/Barcode): Code 128 of the report number, 0.33 mm, 12 mm tall. */
export const BARCODE_DEFAULTS = { symbology: 'code128' as Symbology, content: 'reportId' as BarcodeSource, heightMm: 12 };
export const DEFAULT_MODULE: Record<Symbology, number> = { code128: 0.33, dataMatrix: 0.5, pdf417: 0.33 };
export const MODULES = [0.25, 0.3, 0.33, 0.4, 0.5, 0.6, 0.8, 1];

const SYMBOLOGIES: { id: Symbology; label: string; hint: string }[] = [
  { id: 'code128', label: 'Code 128', hint: 'A short code on one line: label printers, scanners at intake' },
  { id: 'dataMatrix', label: 'Data Matrix', hint: 'A small square for a longer value' },
  { id: 'pdf417', label: 'PDF417', hint: 'A wide stacked code that holds the most' },
];

const SOURCES: { id: BarcodeSource; label: string; hint: string }[] = [
  { id: 'reportId', label: 'Report number', hint: 'RPT-0042 v3, as each report prints it' },
  { id: 'verifyCode', label: 'Verify code', hint: 'Scanned back at intake, it finds this exact version' },
  { id: 'verifyLink', label: 'Verify this report', hint: 'The public verify page (Data Matrix or PDF417)' },
  { id: 'binding', label: 'A value from the data', hint: 'For example a specimen or visit reference' },
  { id: 'text', label: 'Fixed text', hint: 'The same on every report' },
];

/** A field's last name that is a person's own data (media's TemplateValidator.PERSONAL, the same words). */
const PERSONAL = /^(.*[_-])?(mrn|patient[_-]?(id|name|number|no)?|name|first[_-]?name|last[_-]?name|full[_-]?name|surname|dob|birth[_-]?date|date[_-]?of[_-]?birth|ssn|nhs[_-]?(no|number)?|medicare[_-]?(no|number|id)?|insurance[_-]?(id|no|number)|member[_-]?id|phone|mobile|email|address|zip|postcode|passport|national[_-]?id)$/i;

/** The field a binding names when it looks like a person's own data ("the field mrn"), else null. */
export function personalField(binding: string): string | null {
  if (!binding.trim()) return null;
  const parts = binding.replace(/\[[^\]]*\]/g, '').split('.');
  const last = parts[parts.length - 1];
  if (PERSONAL.test(last)) return `the field ${last}`;
  if (parts.length >= 2 && parts[parts.length - 2].toLowerCase().startsWith('patient') && /^(ref|id|number|no|identifier)$/i.test(last)) {
    return `the patient's ${last}`;
  }
  return null;
}

/** The scan check for a barcode as media drew it: its module printed and faxed, and its printed size. */
export function barcodeCheck(m: BarcodeMeasure | undefined, asked: number): ScanLine[] {
  if (!m) return [{ verdict: 'marginal', text: 'Not drawn yet: the scan check follows the next update of the page.' }];
  const mm = (n: number) => `${n.toFixed(2)} mm`;
  const lines: ScanLine[] = [];
  const print = printVerdict(m.moduleMm);
  const fax = faxVerdict(m.moduleMm);
  if (m.moduleMm < asked - 1e-6) {
    lines.push({ verdict: 'marginal', text: `Narrowed to ${m.moduleMm.toFixed(3)} mm a module to fit its place (${mm(asked)} asked): give it a wider column or shorter content` });
  }
  lines.push(print === 'ok' ? { verdict: 'ok', text: `Readable when printed: ${mm(m.moduleMm)} a module` }
    : print === 'marginal' ? { verdict: 'marginal', text: `Marginal when printed: ${mm(m.moduleMm)} a module (${PRINT_OK_MM} mm is safe)` }
    : { verdict: 'poor', text: `Too small to scan when printed: ${mm(m.moduleMm)} a module (at least ${PRINT_MIN_MM} mm)` });
  lines.push(fax === 'ok' ? { verdict: 'ok', text: `Readable as a fax: ${mm(m.moduleMm)} a module (a fax needs ${FAX_OK_MM} mm)` }
    : { verdict: 'poor', text: `Not readable as a fax: a fax needs ${FAX_OK_MM} mm a module` });
  if (m.symbology === 'code128' && m.heightMm < 0.15 * m.widthMm) {
    lines.push({ verdict: 'marginal', text: `Short bars: ${m.heightMm.toFixed(0)} mm for a ${m.widthMm.toFixed(0)} mm wide code; 15 % of its width (${Math.ceil(0.15 * m.widthMm)} mm) scans more surely` });
  }
  return lines;
}

/**
 * A barcode's inspector (reports redesign, feature 5): which symbology, what it holds and who reads it, the module (the
 * narrowest bar or one square) and Code 128's height, and a scan check from what the server drew -- the modules, the
 * printed size, and whether it reads printed and faxed. A value from the data that looks like a patient's own data is
 * warned about, as the QR inspector does.
 */
@Component({
  selector: 'app-rs-barcode-inspector',
  imports: [Icon],
  template: `
    <section class="rsd-props-group" aria-label="Barcode">
      <h3 class="rsd-eyebrow">Barcode</h3>
      <div class="seg" role="group" aria-label="Symbology">
        @for (s of symbologies; track s.id) {
          <button type="button" class="seg-btn" [class.seg-on]="symbology() === s.id" [attr.aria-pressed]="symbology() === s.id" [disabled]="readonly()"
                  [title]="s.hint" (click)="setSymbology(s.id)">{{ s.label }}</button>
        }
      </div>
      <p class="text-xs bci-muted">{{ symbologyHint() }}</p>
    </section>

    <section class="rsd-props-group" aria-label="What it holds">
      <h3 class="rsd-eyebrow">What it holds</h3>
      <div class="bci-opts" role="radiogroup" aria-label="What the barcode holds">
        @for (s of sources; track s.id) {
          <button type="button" role="radio" class="bci-opt" [class.is-on]="source() === s.id" [attr.aria-checked]="source() === s.id"
                  [disabled]="readonly() || (s.id === 'verifyLink' && symbology() === 'code128')" (click)="set('content', s.id)">
            <span class="bci-dot" aria-hidden="true"></span>
            <span class="min-w-0"><span class="block text-sm">{{ s.label }}</span><span class="block text-xs bci-muted">{{ s.hint }}</span></span>
          </button>
        }
      </div>
      <p class="text-xs bci-muted"><b class="font-semibold bci-strong">Who reads it.</b> Anyone who scans the printed page reads what it holds, without signing in.</p>
      @if (personal(); as p) {
        <p class="bci-warn text-xs" data-barcode-personal><app-icon name="alert" class="shrink-0" /><span>It holds {{ p }}, which looks like a patient's own data. Encode a reference instead (a visit or specimen number), or the verify code.</span></p>
      }
    </section>

    <section class="rsd-props-group" aria-label="Size and print">
      <h3 class="rsd-eyebrow">Size and print</h3>
      <label class="field"><span class="label">Module (narrowest bar)</span>
        <select class="input" [disabled]="readonly()" aria-label="Module" (change)="set('moduleMm', +$any($event.target).value)">
          @for (m of modules; track m) {
            <option [value]="m" [selected]="m === module()">{{ m.toFixed(2) }} mm{{ m === defaultModule() ? ' (default)' : '' }}{{ m >= 0.5 ? ' · fax' : '' }}</option>
          }
        </select></label>
      @if (symbology() === 'code128') {
        <label class="field"><span class="label">Bar height (mm)</span>
          <input class="input" type="number" min="5" max="50" step="1" [value]="height()" [disabled]="readonly()" aria-label="Bar height in millimetres"
                 (change)="setHeight($any($event.target).value)" /></label>
      }
      @if (measure(); as m) {
        <p class="text-xs bci-muted" data-barcode-size>{{ m.widthMm.toFixed(1) }} × {{ m.heightMm.toFixed(1) }} mm · {{ m.modulesAcross }} modules across{{ m.rows > 1 ? ' · ' + m.rows + ' rows' : '' }} · {{ m.length }} characters</p>
        <div class="mono text-xs bci-content" data-barcode-content>{{ m.text }}</div>
      }
    </section>

    <section class="rsd-props-group" aria-label="Scan check">
      <h3 class="rsd-eyebrow">Scan check</h3>
      <ul class="bci-lines" data-scan-check>
        @for (l of check(); track l.text) {
          <li [class]="'bci-' + l.verdict"><app-icon [name]="l.verdict === 'ok' ? 'checkCircle' : 'alert'" class="shrink-0" /><span>{{ l.text }}</span></li>
        }
      </ul>
    </section>
  `,
  styles: `
    :host { display: block; }
    .bci-muted { color: var(--text-muted); }
    .bci-strong { color: var(--text-primary); }
    .bci-opts { display: flex; flex-direction: column; gap: 0.375rem; }
    .bci-opt { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.5rem 0.625rem; text-align: left; border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md); color: var(--text-primary); background: var(--surface-raised); }
    .bci-opt:hover:not(:disabled) { border-color: var(--border-strong); }
    .bci-opt.is-on { border-color: var(--accent-mark-strong); box-shadow: inset 0 0 0 1px var(--accent-mark-strong); }
    .bci-opt:disabled { cursor: default; opacity: 0.6; }
    .bci-dot { flex: none; width: 0.875rem; height: 0.875rem; margin-top: 0.1875rem; border-radius: 50%; border: 1px solid var(--border-strong); }
    .is-on .bci-dot { border: 4px solid var(--accent-mark-strong); }
    .bci-content { word-break: break-all; color: var(--text-secondary); }
    .bci-warn { display: flex; gap: 0.375rem; align-items: flex-start; color: var(--warn-text); }
    .bci-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.375rem; font-size: 0.8125rem; }
    .bci-lines li { display: flex; gap: 0.375rem; align-items: flex-start; }
    .bci-ok { color: var(--ok-text); }
    .bci-marginal { color: var(--warn-text); }
    .bci-poor { color: var(--crit-text); }
  `,
})
export class BarcodeInspector {
  readonly block = input.required<Block>();
  readonly readonly = input(false);
  /** What the canvas drew for this barcode (media's measure), or undefined before it is drawn or when it was refused. */
  readonly measure = input<BarcodeMeasure | undefined>(undefined);
  readonly changed = output<PropChange>();

  readonly symbologies = SYMBOLOGIES;
  readonly sources = SOURCES;
  readonly modules = MODULES;

  readonly symbology = computed(() => (this.block()['symbology'] as Symbology | undefined) ?? BARCODE_DEFAULTS.symbology);
  readonly source = computed(() => (this.block()['content'] as BarcodeSource | undefined) ?? BARCODE_DEFAULTS.content);
  readonly defaultModule = computed(() => DEFAULT_MODULE[this.symbology()]);
  readonly module = computed(() => {
    const n = Number(this.block()['moduleMm'] ?? this.defaultModule());
    return Number.isFinite(n) ? n : this.defaultModule();
  });
  readonly height = computed(() => Number(this.block()['heightMm'] ?? BARCODE_DEFAULTS.heightMm));
  readonly symbologyHint = computed(() => SYMBOLOGIES.find(s => s.id === this.symbology())?.hint ?? '');
  readonly personal = computed(() => (this.source() === 'binding' && typeof this.block()['binding'] === 'string'
    ? personalField(this.block()['binding'] as string) : null));
  readonly check = computed(() => barcodeCheck(this.measure(), this.module()));

  set(key: string, value: unknown): void {
    if (this.readonly()) return;
    this.changed.emit({ key, value });
  }

  /** Code 128 holds no link: switching to it from the verify link holds the verify code, which finds the same version. */
  setSymbology(id: Symbology): void {
    this.set('symbology', id);
    if (id === 'code128' && this.source() === 'verifyLink') this.set('content', 'verifyCode');
  }

  setHeight(raw: string): void {
    const n = Math.round(Number(raw));
    if (Number.isFinite(n)) this.set('heightMm', Math.max(5, Math.min(50, n)));
  }
}

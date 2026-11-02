import { Component, model } from '@angular/core';

/** How the canvas shows the page: as the designer edits it, as it prints, or as a black-and-white fax receives it. */
export type ShowAs = 'screen' | 'print' | 'fax';

export const SHOW_AS: { id: ShowAs; label: string; hint: string }[] = [
  { id: 'screen', label: 'Screen', hint: 'The page as you edit it: hidden blocks faded, outlines on hover' },
  { id: 'print', label: 'Print', hint: 'The page as it prints: blocks hidden for this data left out, no outlines on hover' },
  { id: 'fax', label: 'Fax (black and white)', hint: 'As a fax prints it: black or white only, so colour-only meaning and light lines show up' },
];

/** The SVG filter that makes the page black and white (in the designer's own document, so the canvas can use it). */
export const FAX_FILTER_ID = 'rsd-fax-bw';
/**
 * A fax's curve: grey (by luminance) at or below 0.375 prints black, at or above 0.625 white, a steep ramp between --
 * a hard cut at mid grey would also break the screen's anti-aliased text, which a fax at 200 dpi does not.
 */
export const FAX_SLOPE = 4;
export const FAX_INTERCEPT = -1.5;
/** Rec. 709 luma weights, applied to the sRGB values as the filter does (color-interpolation-filters sRGB). */
const LUMA = [0.2126, 0.7152, 0.0722];

/** The grey (0 black to 1 white) a fax makes of a colour (#RRGGBB), as the canvas's filter draws it. */
export function faxTone(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return 0;
  const y = [m[1], m[2], m[3]].reduce((sum, c, i) => sum + LUMA[i] * (parseInt(c, 16) / 255), 0);
  return Math.max(0, Math.min(1, FAX_SLOPE * y + FAX_INTERCEPT));
}

/** Whether a colour prints black, white, or a grey a fax may lose. */
export function faxInk(hex: string): 'black' | 'grey' | 'white' {
  const t = faxTone(hex);
  return t <= 0 ? 'black' : t >= 1 ? 'white' : 'grey';
}

/** The CSS filter on the page for a mode (fax only), or null. */
export function paperFilter(mode: ShowAs): string | null {
  return mode === 'fax' ? `url(#${FAX_FILTER_ID})` : null;
}

/**
 * What a page frame adds to the report's stylesheet in a mode: printed and faxed, the blocks this data hides are left
 * out (as the PDF leaves them out) and a block shows no outline on hover.
 */
export function frameCss(mode: ShowAs): string {
  if (mode === 'screen') return '';
  return `.rs-canvas-hidden { display: none !important; }
[class*="rs-id--"]:hover:not(.rsd-selected):not(.rsd-flagged):not(.rsd-ai-added):not(.rsd-drop-into) { outline: none !important; }`;
}

/** The note over the canvas in a mode, or null on screen. */
export function showAsNote(mode: ShowAs): string | null {
  if (mode === 'print') return 'Shown as printed: blocks this data hides are left out, and blocks are not outlined on hover.';
  if (mode === 'fax') {
    return 'Shown as a black-and-white fax: light colours print white and dark ones black. Meaning carried by colour alone, light text '
      + 'and thin light lines disappear here.';
  }
  return null;
}

/**
 * The toolbar's "Show as" switch: Screen, Print, or Fax (black and white). It also carries the fax's filter -- grey by
 * luminance, then the fax's steep curve to black and white -- which the canvas's pages use in fax mode.
 */
@Component({
  selector: 'app-rs-show-as',
  template: `
    <span class="text-xs text-[color:var(--text-secondary)] whitespace-nowrap">Show as</span>
    <div class="seg" role="group" aria-label="Show as">
      @for (m of modes; track m.id) {
        <button type="button" class="seg-btn" [class.seg-on]="mode() === m.id" [attr.aria-pressed]="mode() === m.id" [title]="m.hint"
                (click)="mode.set(m.id)">{{ m.label }}</button>
      }
    </div>
    <svg class="sa-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <filter [attr.id]="filterId" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" [attr.values]="matrix" />
        <feComponentTransfer>
          <feFuncR type="linear" [attr.slope]="slope" [attr.intercept]="intercept" />
          <feFuncG type="linear" [attr.slope]="slope" [attr.intercept]="intercept" />
          <feFuncB type="linear" [attr.slope]="slope" [attr.intercept]="intercept" />
        </feComponentTransfer>
      </filter>
    </svg>
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 0.375rem; flex-shrink: 0; }
    .sa-defs { position: absolute; width: 0; height: 0; overflow: hidden; }
  `,
})
export class ShowAsSwitch {
  readonly mode = model<ShowAs>('screen');
  readonly modes = SHOW_AS;
  readonly filterId = FAX_FILTER_ID;
  readonly slope = FAX_SLOPE;
  readonly intercept = FAX_INTERCEPT;
  readonly matrix = [0, 1, 2].map(() => `${LUMA.join(' ')} 0 0`).join(' ') + ' 0 0 0 1 0';
}

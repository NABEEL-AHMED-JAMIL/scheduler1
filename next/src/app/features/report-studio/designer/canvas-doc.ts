/**
 * The designer's canvas document (MIG-404): the server's compiled HTML for the template being edited -- the same compiler
 * and stylesheet as a report's HTML output, so what the canvas shows is what a report prints -- cut into the pages its
 * page breaks make, each page with the header at its top and the footer at its foot, as the PDF repeats them.
 *
 * The HTML comes from media-service's compiler, whose values are DOM text and whose markup is its own closed set; it is
 * put through this cleaner as well before it is drawn, so nothing that runs or reaches out can get onto the console's
 * page: no script, frame, object, embed, link, base, form or meta; no event attribute; no javascript: address. A figure
 * (chart, KPI tile, QR code; report phase 4) is the server's inline SVG, a closed set of shapes: only those elements are
 * kept inside an svg, with no link, no style attribute and no url() reference.
 */

/** A canvas page: the sheet's inner HTML (header, the page's blocks, footer). */
export interface CanvasDoc { css: string; pages: string[]; }

/** The class that names a component's element on the canvas (media's Compiler.CANVAS_ID). */
export const CANVAS_ID = 'rs-id--';

const DROP_TAGS = 'script, iframe, frame, frameset, object, embed, link, base, form, meta, noscript, template, math';

/** What media's SvgWriter draws a figure with: anything else inside an svg is dropped. */
const SVG_TAGS = new Set(['svg', 'title', 'desc', 'g', 'rect', 'line', 'circle', 'path', 'text', 'tspan']);

/** Removes everything that could run or load, from a parsed document, in place. */
export function clean(root: ParentNode): void {
  root.querySelectorAll(DROP_TAGS).forEach(e => e.remove());
  root.querySelectorAll('svg svg').forEach(e => e.remove());
  root.querySelectorAll('svg *').forEach(e => {
    if (!SVG_TAGS.has(e.localName) || e.localName === 'svg') e.remove();
  });
  root.querySelectorAll('svg, svg *').forEach(e => {
    for (const a of Array.from(e.attributes)) {
      const name = a.name.toLowerCase();
      if (name === 'style' || name.includes('href') || a.value.toLowerCase().includes('url(')) e.removeAttribute(a.name);
    }
  });
  root.querySelectorAll('*').forEach(e => {
    for (const a of Array.from(e.attributes)) {
      const name = a.name.toLowerCase();
      const value = a.value.trim().toLowerCase();
      if (name.startsWith('on') || ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action')
        && !value.startsWith('data:image/') && value !== '') || value.startsWith('javascript:')) {
        e.removeAttribute(a.name);
      }
    }
  });
}

/** The component id an element names on the canvas, or null. */
export function idOf(e: Element | null | undefined): string | null {
  if (!e) return null;
  for (const c of Array.from(e.classList)) {
    if (c.startsWith(CANVAS_ID)) return c.slice(CANVAS_ID.length);
  }
  return null;
}

/** The compiled HTML as pages: the styles, and one sheet per page break, header and footer on each. */
export function splitCanvas(html: string): CanvasDoc {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const css = Array.from(doc.querySelectorAll('style')).map(s => s.textContent ?? '').join('\n');
  clean(doc);
  const sheet = doc.querySelector('.rs-sheet');
  if (!sheet) return { css, pages: [''] };
  const own = (selector: string) => Array.from(sheet.children).find(c => c.matches(selector)) ?? null;
  // A watermark on the first page only (rs-watermark--first) stays off the later pages.
  const mark = own('.rs-watermark');
  const watermark = mark?.outerHTML ?? '';
  const firstOnly = mark?.classList.contains('rs-watermark--first') ?? false;
  const header = own('.rs-header')?.outerHTML ?? '';
  const footer = own('.rs-footer')?.outerHTML ?? '';
  const body = own('.rs-body');
  const chunks: string[][] = [[]];
  for (const e of Array.from(body?.children ?? [])) {
    if (e.classList.contains('rs-pagebreak')) {
      chunks.push([]);
    } else {
      chunks[chunks.length - 1].push(e.outerHTML);
    }
  }
  const pages = chunks.map((c, i) => `${firstOnly && i > 0 ? '' : watermark}${header}<div class="rs-doc rs-body">${c.join('')}</div>${footer}`);
  return { css, pages };
}

/**
 * What the canvas adds to the report's own stylesheet, inside each page's shadow root: the sheet fills its page (the
 * HTML output's grey margin and shadow are the console's frame here), the footer sits at the page's foot, a page number
 * reads as it will in the PDF, and the selected and hidden blocks are marked. The paper is the report's own (light in
 * every console theme), so its marks use the palette's fixed dark steps rather than the theme's accent.
 */
export function canvasCss(page: number, pages: number, heightMm: number): string {
  return `:host { display: block; }
.rs-sheet { margin: 0 !important; box-shadow: none !important; max-width: none !important; width: 100%; min-height: ${heightMm}mm;
  box-sizing: border-box; display: flex; flex-direction: column; }
.rs-sheet > .rs-body { flex: 1 0 auto; }
.rs-sheet > .rs-footer { margin-top: auto; }
.rs-pn { display: block !important; }
.rs-pn::after { content: "Page ${page} of ${pages}"; }
[class*="${CANVAS_ID}"] { cursor: default; }
[class*="${CANVAS_ID}"]:hover { outline: 1px dashed var(--color-ink-400); outline-offset: 1px; }
.rsd-selected, .rsd-selected:hover { outline: 2px solid var(--color-brand-600) !important; outline-offset: 2px; }
.rs-canvas-hidden { opacity: 0.35; }
.rsd-drop-into { outline: 2px dashed var(--color-brand-500) !important; outline-offset: 2px; }
.rsd-ai-added { outline: 2px dashed var(--color-brand-500) !important; outline-offset: 2px; background: color-mix(in oklab, var(--color-brand-500) 7%, transparent); }`;
}

/**
 * ZT-U2 (2026-10-26, after ZT-U1's button restyle): the viewers' toolbars looked mixed -- in the PDF viewer, the file
 * preview and the Report Studio designer the page arrows and the zoom value or Fit were bordered, while the zoom − and +
 * stayed ghost icons beside them. Each toolbar's related controls are now one bordered segmented group (.seg, the style of
 * "Design here / Use a saved template"): pages, zoom, undo/redo. A scan of the three templates: every one of those controls
 * is a .seg-btn (never btn-ghost) inside a .seg group that also holds its value, and keeps its aria-label.
 */
interface Fs { readFileSync(path: string, encoding: 'utf8'): string }

async function source(path: string): Promise<string> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as Fs;
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${root}/${path}`, 'utf8');
}

/** The groups of a template: the markup inside each element whose class list has `seg`, with its aria-label. */
export function segGroups(text: string): { label: string; inner: string }[] {
  const groups: { label: string; inner: string }[] = [];
  for (const m of text.matchAll(/<div\b[^>]*\sclass="(?:[^"]*\s)?seg(?:\s[^"]*)?"[^>]*>/g)) {
    const label = /aria-label="([^"]*)"/.exec(m[0])?.[1] ?? '';
    let depth = 1;
    const at = m.index + m[0].length;
    const tags = /<div\b|<\/div>/g;
    tags.lastIndex = at;
    for (let t = tags.exec(text); t; t = tags.exec(text)) {
      depth += t[0] === '</div>' ? -1 : 1;
      if (depth === 0) { groups.push({ label, inner: text.slice(at, t.index) }); break; }
    }
  }
  return groups;
}

/** The opening tag of the button whose aria-label is `name`, or '' (a '>' inside a quoted attribute does not end it). */
function buttonNamed(text: string, name: string): string {
  const at = text.indexOf(`aria-label="${name}"`);
  const start = at < 0 ? -1 : text.lastIndexOf('<button', at);
  if (start < 0) return '';
  let quote = '';
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i > at ? text.slice(start, i + 1) : '';
  }
  return '';
}

const VIEWERS: { path: string; groups: Record<string, { buttons: string[]; value: RegExp }> }[] = [
  { path: 'src/app/features/objects/preview/pdf-viewer.ts', groups: {
    Pages: { buttons: ['Previous page', 'Next page'], value: /\{\{ page\(\) \}\}/ },
    Zoom: { buttons: ['Zoom out', 'Zoom in'], value: /\{\{ zoomLabel\(\) \}\}/ },
  } },
  { path: 'src/app/features/objects/preview/preview-dialog.html', groups: {
    Zoom: { buttons: ['Zoom out', 'Zoom in'], value: /\{\{ zoomLabel\(\) \}\}/ },
  } },
  { path: 'src/app/features/report-studio/designer/designer.html', groups: {
    History: { buttons: ['Undo (Ctrl+Z)', 'Redo (Ctrl+Y)'], value: /./ },
    Zoom: { buttons: ['Zoom out', 'Zoom in'], value: /aria-label="Zoom level"[\s\S]*>Fit</ },
  } },
];

describe('viewer toolbars (ZT-U2)', () => {
  for (const viewer of VIEWERS) {
    for (const [label, want] of Object.entries(viewer.groups)) {
      it(`${viewer.path}: ${label} is one bordered group with its value, no ghost`, async () => {
        const text = await source(viewer.path);
        const group = segGroups(text).find(g => g.label === label);
        expect(group, `${label} is a .seg group`).toBeTruthy();
        expect(group!.inner).toMatch(want.value);
        expect(group!.inner).not.toMatch(/btn-ghost/);
        for (const name of want.buttons) {
          const tag = buttonNamed(group!.inner, name);
          expect(tag, `${name} is in the ${label} group, with its aria-label`).not.toBe('');
          expect(tag).toMatch(/\bseg-btn\b/);
        }
      });
    }
  }

  it('finds a group and its end', () => {
    const groups = segGroups('<div class="seg x" role="group" aria-label="Zoom"><button>−</button><div>v</div><button>+</button></div><div>after</div>');
    expect(groups).toEqual([{ label: 'Zoom', inner: '<button>−</button><div>v</div><button>+</button>' }]);
  });
});

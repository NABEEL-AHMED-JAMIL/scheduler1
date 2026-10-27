/**
 * Every button has a name a screen reader can say (WCAG 4.1.2, axe's button-name rule), as a scan of the sources like
 * code-standard.spec.ts, so a new icon-only button is caught at its first commit rather than on the screen.
 *
 * A button is named when it carries aria-label or aria-labelledby (plain or bound), or when something other than an
 * icon is inside it: text, an interpolation, or a component that may print one. An icon names it only with its own
 * `label` (app-icon then renders role="img" with that aria-label). A `title` alone is not enough: it is a tooltip,
 * read late or not at all, and absent on touch screens.
 *
 * Scanned: every .html template and every inline `template:` under src/app. Each finding names the file and line.
 */
interface Fs {
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(path: string, encoding: 'utf8'): string;
}

interface Template { path: string; text: string; firstLine: number }

/** The templates under src/app: whole .html files, and the inline `template:` literals of .ts files. */
async function templates(): Promise<Template[]> {
  // Loaded at run time: the specs run under Node, but the browser build has no fs to bundle.
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as Fs;
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  const found: Template[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { walk(path); continue; }
      const rel = path.slice(root.length + 1);
      if (entry.name.endsWith('.html')) found.push({ path: rel, text: fs.readFileSync(path, 'utf8'), firstLine: 1 });
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
        const text = fs.readFileSync(path, 'utf8');
        for (const m of text.matchAll(/\btemplate:\s*`([\s\S]*?)(?<!\\)`/g)) {
          const start = m.index + m[0].indexOf('`') + 1;
          found.push({ path: rel, text: m[1], firstLine: text.slice(0, start).split('\n').length });
        }
      }
    }
  };
  walk(`${root}/src/app`);
  return found;
}

const NAMED_BY_ATTRIBUTE = /\s(aria-label|aria-labelledby|\[aria-label\]|\[aria-labelledby\]|\[attr\.aria-label\]|\[attr\.aria-labelledby\])\s*=/;

/** An icon that says nothing: app-icon without a label, or an inline svg. */
const SILENT_ICON = /<app-icon\b(?![^>]*(\s|\[)label\]?=)[^>]*?(\/>|>[\s\S]*?<\/app-icon>)|<svg\b[\s\S]*?<\/svg>/g;

/** Whether what is inside a button gives it a name: anything left once silent icons, tags and control flow go. */
export function contentNames(inner: string): boolean {
  const left = inner
    .replace(SILENT_ICON, '')
    // A component inside (app-avatar, app-status-pill...) may print text: give it the benefit of the doubt.
    .replace(/<(app-[\w-]+|ng-content)\b[^>]*>/g, ' x ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/@(if|else if|else|for|switch|case|default|let)\b[^{;]*[{;]|\}/g, ' ');
  return left.trim() !== '';
}

/** The buttons of one template that have no name, as "path:line". */
export function namelessButtons(template: Template): string[] {
  const text = template.text.replace(/<!--[\s\S]*?-->/g, c => c.replace(/[^\n]/g, ' '));
  const off: string[] = [];
  for (const m of text.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    if (NAMED_BY_ATTRIBUTE.test(` ${m[1]}`) || contentNames(m[2])) continue;
    off.push(`${template.path}:${template.firstLine + text.slice(0, m.index).split('\n').length - 1}`);
  }
  return off;
}

describe('button names', () => {
  const at = (text: string) => namelessButtons({ path: 't.html', text, firstLine: 1 });

  it('flags an icon-only button, and one named only by its title', () => {
    expect(at('<button type="button"><app-icon name="x" /></button>')).toEqual(['t.html:1']);
    expect(at('\n<button type="button" title="Close">\n  <app-icon name="x" size="1em"></app-icon>\n</button>')).toEqual(['t.html:2']);
    expect(at('<button><svg viewBox="0 0 1 1"><path d="M0 0"/></svg></button>')).toEqual(['t.html:1']);
    expect(at('<button (click)="go()"></button>')).toEqual(['t.html:1']);
    expect(at('<button>@if (busy()) { <app-icon name="spinner" /> }</button>')).toEqual(['t.html:1']);
  });

  it('accepts aria-label, aria-labelledby, text, an interpolation, a labelled icon or a component inside', () => {
    expect(at('<button aria-label="Close"><app-icon name="x" /></button>')).toEqual([]);
    expect(at('<button [attr.aria-label]="name()"><app-icon name="x" /></button>')).toEqual([]);
    expect(at('<button aria-labelledby="h1"><app-icon name="x" /></button>')).toEqual([]);
    expect(at('<button><app-icon name="save" />Save</button>')).toEqual([]);
    expect(at('<button>{{ label() }}</button>')).toEqual([]);
    expect(at('<button><app-icon name="x" [label]="\'Close\'" /></button>')).toEqual([]);
    expect(at('<button><app-icon name="x" label="Close" /></button>')).toEqual([]);
    expect(at('<button><app-avatar [name]="n" /></button>')).toEqual([]);
    // A button inside a comment is not on the screen (built in parts: code-standard.spec.ts reads this file too).
    expect(at(['<!', '-- <button><app-icon name="x" /></button> --', '>'].join(''))).toEqual([]);
  });

  it('every button in the console has a name a screen reader can say', async () => {
    const off = (await templates()).flatMap(namelessButtons);
    expect(off, 'give these buttons aria-label or visible text').toEqual([]);
  });
});

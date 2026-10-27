/**
 * ZT-U (owner 2026-10-26, "buttons need colour so we can tell a button from a chip"): btn-ghost is for dismissal and
 * dense icons only, as the house rule in styles.css says (btn-ghost: Cancel, Close, Clear, Reset, and icon-only
 * controls in dense rows and toolbars). The rule was not enforced, and 242 real actions -- Void on a report, Try
 * again, Back to list, Refresh, Download, the pagination -- sat as plain text beside the status pills.
 *
 * A scan of the sources like button-names.spec.ts: every .html template and every inline `template:` under src/app.
 * A ghost button or link fails when it shows a text label other than Cancel, Close, Clear or Reset (a label that
 * starts with one of them, such as "Clear filters" or "Reset to defaults", is the same control), unless it is a
 * `btn-icon` with an aria-label (an icon in a toolbar whose tiny text is a value: "1:1", "2x", an unread count).
 * A ghost with no text at all is an icon: button-names.spec.ts makes sure it has a name.
 *
 * A real action is `btn-default`; a destructive trigger is `btn-default btn-intent-crit`; the final confirm is
 * `btn-danger`. The few justified exceptions are in ALLOWED below, each with its reason.
 */
interface Fs {
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(path: string, encoding: 'utf8'): string;
}

interface Template { path: string; text: string; firstLine: number }

/** A ghost's label may be only one of these words, or start with one ("Clear filters", "Reset to defaults"). */
const DISMISSAL = /^(Cancel|Close|Clear|Reset)\b/;

/**
 * Justified exceptions, by file and label. Keep this short: a new entry needs a reason a reviewer would accept.
 * An entry that no longer matches a ghost fails the scan too, so the list cannot rot.
 */
const ALLOWED: { path: string; label: string; reason: string }[] = [
  { path: 'src/app/features/dev/gallery.html', label: 'Ghost',
    reason: 'the design gallery\'s sample of the ghost variant itself' },
  { path: 'src/app/features/analytics/dataset-registry.ts', label: '{{ item.datasetName }}',
    reason: 'a list row whose whole width is the control (like .object-picker-row); a border per row is noise' },
  { path: 'src/app/features/integration/api-collections/request-panel.html', label: "{{ data.canManage && dirty() ? 'Discard' : 'Close' }}",
    reason: 'the panel footer\'s dismiss button: Close, worded Discard only while closing would drop unsaved edits' },
  { path: 'src/app/features/integration/sources/source-panel.html', label: "{{ data.canManage && dirty() ? 'Discard' : 'Close' }}",
    reason: 'the panel footer\'s dismiss button, as in the request panel' },
  { path: 'src/app/features/report-studio/designer/ai-panel.html', label: "{{ p.patch.length ? 'Dismiss' : 'Close' }}",
    reason: 'dismisses the AI proposal card: Close, or Dismiss while it still offers a change' },
];

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

/** Where an opening tag that starts at `from` ends: the first '>' outside a quoted attribute value. */
function tagEnd(text: string, from: number): number {
  let quote = '';
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote) quote = ''; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i;
  }
  return -1;
}

const GHOST = /(?:\sclass\s*=\s*"[^"]*(?<![\w-])btn-ghost(?![\w-])|\[class\.btn-ghost\]\s*=|\[(?:class|ngClass)\]\s*=\s*"[^"]*btn-ghost)/;
const ICON = /\sclass\s*=\s*"[^"]*(?<![\w-])btn-icon(?![\w-])/;
const ARIA_LABEL = /\s(aria-label|aria-labelledby|\[aria-label\]|\[attr\.aria-label\]|\[attr\.aria-labelledby\])\s*=/;

/** The visible label of a button's content: tags, icons and control flow gone, interpolations kept as written. */
export function labelOf(inner: string): string {
  // Interpolations aside first, so the control-flow braces can go without taking their }} with them.
  const kept: string[] = [];
  const text = inner
    .replace(/\{\{[\s\S]*?\}\}/g, m => `\u0000${kept.push(m.replace(/\s+/g, ' ')) - 1}\u0000`)
    .replace(/<app-icon\b[^>]*?(\/>|>[\s\S]*?<\/app-icon>)|<svg\b[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/@(if|else if|else|for|switch|case|default|let)\b[^{;]*[{;]|\}/g, ' ');
  return text.replace(/\u0000(\d+)\u0000/g, (_, i: string) => kept[Number(i)]).replace(/\s+/g, ' ').trim();
}

/**
 * Whether a label is dismissal only: its own words, and every string an interpolation can print, are Cancel, Close,
 * Clear or Reset. An interpolation that prints no literal (a computed label) cannot be known to be one.
 */
export function isDismissal(label: string): boolean {
  const parts: string[] = [];
  const plain = label.replace(/\{\{([\s\S]*?)\}\}/g, (_, expr: string) => {
    const literals = [...expr.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(l => l[1].trim()).filter(Boolean);
    parts.push(...(literals.length ? literals : ['{{computed}}']));
    return ' ';
  }).trim();
  if (plain) parts.unshift(plain);
  return parts.length > 0 && parts.every(p => DISMISSAL.test(p));
}

export interface GhostFinding { at: string; path: string; label: string }

/** The ghost buttons and links of one template whose label is not dismissal. */
export function ghostActions(template: Template): GhostFinding[] {
  const text = template.text.replace(/<!--[\s\S]*?-->/g, c => c.replace(/[^\n]/g, ' '));
  const found: GhostFinding[] = [];
  for (const m of text.matchAll(/<(button|a)\b/g)) {
    const end = tagEnd(text, m.index);
    if (end < 0) continue;
    const open = text.slice(m.index, end + 1);
    if (!GHOST.test(open)) continue;
    const close = text.indexOf(`</${m[1]}>`, end);
    const label = labelOf(close < 0 ? '' : text.slice(end + 1, close));
    if (!label) continue;                                         // an icon: button-names.spec.ts checks its name
    if (ICON.test(open) && ARIA_LABEL.test(` ${open.slice(m[0].length)}`)) continue;
    if (isDismissal(label)) continue;
    const line = template.firstLine + text.slice(0, m.index).split('\n').length - 1;
    found.push({ at: `${template.path}:${line}`, path: template.path, label });
  }
  return found;
}

describe('ghost buttons', () => {
  const at = (text: string) => ghostActions({ path: 't.html', text, firstLine: 1 }).map(f => f.at + ' ' + f.label);

  it('flags a ghost with an action label, a computed label, or a link styled as one', () => {
    expect(at('<button type="button" class="btn btn-ghost btn-xs" (click)="voidIt(v)">Void</button>')).toEqual(['t.html:1 Void']);
    expect(at('\n<button class="btn btn-ghost btn-sm"><app-icon name="refresh" />Refresh</button>')).toEqual(['t.html:2 Refresh']);
    expect(at('<a class="btn btn-ghost btn-sm" routerLink="/x">Back to list</a>')).toEqual(['t.html:1 Back to list']);
    expect(at('<button class="btn btn-ghost" (click)="z()">{{ zoomLabel() }}</button>')).toEqual(['t.html:1 {{ zoomLabel() }}']);
    expect(at("<button class=\"btn btn-ghost\">{{ c ? 'Copied' : 'Copy' }}</button>")).toEqual(["t.html:1 {{ c ? 'Copied' : 'Copy' }}"]);
    // A '>' inside an attribute value does not end the tag early.
    expect(at('<button class="btn btn-ghost" [disabled]="page() >= last()">Next</button>')).toEqual(['t.html:1 Next']);
    expect(at('<button [class.btn-ghost]="quiet()" class="btn">Open</button>')).toEqual(['t.html:1 Open']);
    // A text label on a btn-icon still needs its aria-label to pass.
    expect(at('<button class="btn btn-ghost btn-icon">Mark read</button>')).toEqual(['t.html:1 Mark read']);
  });

  it('accepts dismissal labels, labelled icons, and anything that is not a ghost', () => {
    expect(at('<button class="btn btn-ghost btn-sm" (click)="close()">Cancel</button>')).toEqual([]);
    expect(at('<button class="btn btn-ghost btn-sm">Clear filters</button>')).toEqual([]);
    expect(at('<button class="btn btn-ghost btn-sm"><app-icon name="x" />Reset to defaults</button>')).toEqual([]);
    expect(at("<button class=\"btn btn-ghost\">{{ readOnly ? 'Close' : 'Cancel' }}</button>")).toEqual([]);
    expect(at('<button class="btn btn-ghost btn-icon" aria-label="Close"><app-icon name="x" /></button>')).toEqual([]);
    expect(at('<button class="btn btn-ghost" [attr.aria-label]="\'Remove \' + f.name"><app-icon name="trash" /></button>')).toEqual([]);
    expect(at('<button class="btn btn-ghost btn-icon" aria-label="Reset zoom to 100%">1:1</button>')).toEqual([]);
    expect(at('<button class="btn btn-default btn-sm">Refresh</button>')).toEqual([]);
    expect(at('<span class="btn-ghost-note">Refresh</span>')).toEqual([]);
    expect(at(['<!', '-- <button class="btn btn-ghost">Void</button> --', '>'].join(''))).toEqual([]);
  });

  it('every ghost in the console is a dismissal or an icon (or on the short allow-list)', async () => {
    const all = (await templates()).flatMap(ghostActions);
    const allowed = (f: GhostFinding) => ALLOWED.some(a => a.path === f.path && a.label === f.label);
    const off = all.filter(f => !allowed(f)).map(f => `${f.at} "${f.label}"`);
    expect(off, 'a real action is btn-default; a destructive trigger btn-default btn-intent-crit').toEqual([]);
    const stale = ALLOWED.filter(a => !all.some(f => f.path === a.path && f.label === a.label)).map(a => `${a.path} "${a.label}"`);
    expect(stale, 'these allow-list entries match no ghost any more: remove them').toEqual([]);
    expect(ALLOWED.length).toBeLessThanOrEqual(6);
  });
});

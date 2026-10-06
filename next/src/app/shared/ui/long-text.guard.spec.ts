/**
 * Owner, 2026-09-28: "if text is big in some csv the statistics or text not wrapping, so need a way
 * we handle this". The way is app-data-text for a value of the customer's file (shared/ui/data-text.ts)
 * and shortLabel for a chart's category (shared/charts/short-label.ts). These scans hold the Analytics
 * screens and the category charts to it, so a template that prints a raw value again fails here
 * before a 20,000-character note makes a table 5,000px wide on somebody's screen.
 *
 * WHAT A SOURCE SCAN CAN AND CANNOT SEE. It reads templates, not data flow: it knows the NAMES the
 * Analytics templates give a customer's value -- a result cell, a sample, a column's first and last,
 * a most-common value, a bar's label, a pivot header, a chip -- and fails when one of those names is
 * interpolated or put in a tooltip bare. A value given a new name (`{{ note }}`) is not recognised;
 * a column NAME printed under a loop variable called `column` is deliberately allowed, because the
 * same word names headers everywhere. So a new kind of value needs its name added to RAW_VALUE,
 * and the behaviour itself is pinned by data-text.spec.ts, long-values.spec.ts and
 * long-labels.spec.ts, which render 20,000-character values through the real components. The Data
 * grid (data-grid.ts) is outside the scan: its columns have fixed widths, it has had its own "Wrap
 * text" since 2026-09-24, and its tooltip is capped in place.
 */
interface Fs {
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: 'utf8'): string;
}

async function read(dir: string, keep: (name: string) => boolean): Promise<{ path: string; code: string }[]> {
  // Loaded at run time: the specs run under Node, but the browser build has no fs to bundle.
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as Fs;
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readdirSync(`${root}/src/app/${dir}`).filter(keep).map(name => ({
    path: `${dir}/${name}`,
    code: withoutComments(fs.readFileSync(`${root}/src/app/${dir}/${name}`, 'utf8')),
  }));
}

/** Comments blanked, line breaks kept: a comment may quote the markup it replaced. */
function withoutComments(text: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/<!--[\s\S]*?-->/g, blank).replace(/(^|[ \t])\/\/[^\n]*/gm, blank);
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

/**
 * The expressions the Analytics templates hold a customer's value in. Whole expressions, so
 * `row.label` matches and `row.labelled` does not.
 */
const RAW_VALUE = new RegExp('^(?:' + [
  'cell', 'cell\\.text', 'cell\\.raw', 'readable\\(cell[^)]*\\)',
  'row\\.sample', 'row\\.metricValue', 'row\\.metricName \\+ \': \' \\+ row\\.metricValue',
  'row\\.sample \\|\\| row\\.sampleKind',
  'column\\(\\)\\.(?:min|max)Label', 'column\\(\\)\\.(?:min|max) \\?\\? \'null\'',
  '(?:measured|d)\\.mostCommon',
  'bar\\.label', 'row\\.label', 'row\\.label \\|\\| \'\\(null\\)\'', 'row\\.key',
  'column \\|\\| \'\\(null\\)\'', 'cell \\?\\? \'null\'',
  'chip\\.label', 'crumb\\.label',
].join('|') + ')$');

/** Every `{{ expression }}` and `[title]="expression"` whose expression is a raw customer value. */
export function rawValues(path: string, code: string): string[] {
  const found: string[] = [];
  const check = (expression: string, index: number, how: string) => {
    const bare = expression.replace(/\s+/g, ' ').trim();
    if (RAW_VALUE.test(bare)) found.push(`${path}:${lineOf(code, index)} ${how} ${bare}`);
  };
  for (const m of code.matchAll(/\{\{([\s\S]*?)\}\}/g)) check(m[1], m.index!, 'prints');
  for (const m of code.matchAll(/\[(?:title|attr\.title)\]="([^"]*)"/g)) check(m[1], m.index!, 'tooltip');
  return found;
}

/**
 * A category chart's labels: a `.name` or `.label` interpolated -- in text or in an SVG <title> --
 * or used as a tooltip bare. They are
 * drawn through shortLabel and titled through capTitle instead.
 */
export function rawLabels(path: string, code: string): string[] {
  const found: string[] = [];
  for (const m of code.matchAll(/\{\{\s*(\w+\.(?:name|label))(?:\.\w+\(\))?\s*\}\}/g)) {
    found.push(`${path}:${lineOf(code, m.index!)} prints ${m[1]}`);
  }
  for (const m of code.matchAll(/\[(?:title|attr\.title)\]="(\w+\.(?:name|label))(?:\s*\+[^"]*)?"/g)) {
    found.push(`${path}:${lineOf(code, m.index!)} tooltip ${m[1]}`);
  }
  return found;
}

describe('long values from a customer\'s file', () => {
  it('catches the markup that made the Compact table 5,043px wide', () => {
    // The column card and the SQL result as they were on 2026-09-28, so the scan is known to see them.
    const before = `
      <dd class="mono truncate" [title]="column().min ?? 'null'">
        @if (column().min === null) { null } @else { {{ column().minLabel }} }
      </dd>
      <span class="truncate">most common: {{ measured.mostCommon }}</span>
      <td class="mono text-xs whitespace-nowrap max-w-64 truncate" [title]="cell ?? 'null'">{{ cell }}</td>`;
    expect(rawValues('before.html', before).length).toBe(5);
    expect(rawLabels('before.ts', `<span class="whitespace-nowrap">{{ bar.name }}</span>
      <button [title]="row.name + ': ' + row.value"></button><title>{{ segment.name }}</title>`).length).toBe(3);
  });

  it('lets a value through app-data-text, and a column name printed as a header', () => {
    const after = `
      <app-data-text [value]="column().minLabel" [lines]="3" />
      @for (column of result()?.columns ?? []; track column) { <th>{{ column }}</th> }
      <span [title]="cap(chip.label)">{{ chipText(chip.label) }}</span>`;
    expect(rawValues('after.html', after)).toEqual([]);
  });

  it('prints no raw customer value in the Analytics templates', async () => {
    const files = await read('features/analytics', name =>
      /\.(ts|html)$/.test(name) && !name.endsWith('.spec.ts') && name !== 'data-grid.ts');
    expect(files.length).toBeGreaterThan(5);
    expect(files.flatMap(file => rawValues(file.path, file.code))).toEqual([]);
  });

  it('draws every category label short, and titles it capped, in the category charts', async () => {
    const charts = ['bar-chart.ts', 'ranked-bar.ts', 'donut.ts', 'grouped-bar.ts', 'line-chart.ts'];
    const files = await read('shared/charts', name => charts.includes(name));
    expect(files.length).toBe(charts.length);
    expect(files.flatMap(file => rawLabels(file.path, file.code))).toEqual([]);
  });
});

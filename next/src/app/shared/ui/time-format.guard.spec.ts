import { TIME_FORMATS } from './time-format';

/**
 * Folders exempt from the rules below. Empty since MIG-295's three parallel changes merged; a
 * folder added here needs a reason beside it.
 */
const MIGRATING: string[] = [];

/**
 * MIG-295: one way to write a date, a time and an hour across the console (owner decision
 * 2026-09-28: a 24-hour clock, days as "24 Sep 2026"). Screens had grown sixteen format strings,
 * a 12-hour "10p" and Angular's US "Sep 24, 2026" before the formats were named in time-format.ts.
 * These are scans of the sources, so a new screen cannot spell out a pattern of its own, reach for
 * the plain date pipe or bring a 12-hour clock back.
 */
interface Fs {
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(path: string, encoding: 'utf8'): string;
  existsSync(path: string): boolean;
}

interface Source { path: string; code: string; }

async function fileSystem(): Promise<{ fs: Fs; app: string }> {
  // Loaded at run time: the specs run under Node, but the browser build has no fs to bundle.
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as Fs;
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return { fs, app: `${root}/src/app` };
}

/**
 * Comments blanked out, with their line breaks kept so line numbers still point at the source:
 * a comment may say what the code used to write ("10:06 PM") without tripping the rules. A line
 * comment starts at // after a space or a line start, which leaves "https://" in a string alone.
 */
function withoutComments(text: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/(^|[ \t])\/\/[^\n]*/gm, blank);
}

async function sources(): Promise<Source[]> {
  const { fs, app } = await fileSystem();
  const files: Source[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      const relative = path.slice(app.length + 1);
      if (entry.isDirectory()) {
        if (!MIGRATING.includes(relative)) walk(path);
      } else if (/\.(ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
        files.push({ path: relative, code: withoutComments(fs.readFileSync(path, 'utf8')) });
      }
    }
  };
  walk(app);
  return files;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

/** Template text: an .html file whole, or a component's inline `template:` blocks, else nothing. */
function templates(source: Source): { text: string; offset: number }[] {
  if (source.path.endsWith('.html')) return [{ text: source.code, offset: 0 }];
  const blocks: { text: string; offset: number }[] = [];
  const opener = /template\s*:\s*`/g;
  for (let m = opener.exec(source.code); m; m = opener.exec(source.code)) {
    const start = m.index + m[0].length;
    const end = source.code.indexOf('`', start);
    if (end > start) blocks.push({ text: source.code.slice(start, end), offset: start });
  }
  return blocks;
}

const NAMES = new Set(Object.keys(TIME_FORMATS));

/** Each format a template or a pipe instance hands the serverTime pipe as a quoted literal. */
function formatArguments(code: string): { format: string; index: number }[] {
  const found: { format: string; index: number }[] = [];
  const inTemplate = /serverTime\s*:\s*(['"])([^'"]*)\1/g;
  for (let m = inTemplate.exec(code); m; m = inTemplate.exec(code)) found.push({ format: m[2], index: m.index });
  // new ServerTimePipe(...) kept on a field -- `clock` or `serverTime` by this codebase's habit.
  const inCode = /\b(?:clock|serverTime)\.transform\((?:[^,()]|\([^()]*\))*,\s*(['"])([^'"]*)\1/g;
  for (let m = inCode.exec(code); m; m = inCode.exec(code)) found.push({ format: m[2], index: m.index });
  return found;
}

/** Where a template uses Angular's plain date pipe, which reads server time as the reader's own. */
function plainDatePipes(template: string): number[] {
  const at: number[] = [];
  const pipe = /(^|[^|])\|\s*date\b(?![\w-])/g;
  for (let m = pipe.exec(template); m; m = pipe.exec(template)) at.push(m.index + m[1].length);
  return at;
}

/**
 * Why a quoted string in the source writes a 12-hour or US date, or '' when it does not: Angular's
 * 'shortTime' ("10:06 PM") and 'mediumDate' ("Sep 24, 2026") presets, a pattern with h/hh for the
 * hour, or one ending in the AM/PM marker ' a'. Only strings that look like a time pattern (hours
 * and minutes) are read for the last two, so "Pick a date" is not a clock.
 */
function twelveHour(literal: string): string {
  if (literal === 'shortTime' || literal === 'mediumDate') return `Angular's US preset '${literal}'`;
  if (!/[Hh]{1,2}:mm/.test(literal)) return '';
  if (/(^|[^Hh])h{1,2}:mm/.test(literal)) return `12-hour hour 'h' in '${literal}'`;
  if (/\sa{1,5}$/.test(literal)) return `AM/PM marker in '${literal}'`;
  return '';
}

function quotedStrings(code: string): { literal: string; index: number }[] {
  const found: { literal: string; index: number }[] = [];
  const quoted = /(['"])((?:(?!\1)[^\\\n]|\\.)*)\1/g;
  for (let m = quoted.exec(code); m; m = quoted.exec(code)) found.push({ literal: m[2], index: m.index });
  return found;
}

describe('time format guard', () => {
  it('skips only folders that exist, so the exemption list cannot outlive the migration unnoticed', async () => {
    const { fs, app } = await fileSystem();
    expect(MIGRATING.filter(folder => !fs.existsSync(`${app}/${folder}`))).toEqual([]);
  });

  /**
   * A format is a name from TIME_FORMATS ('date', 'recent', ...), not a spelled-out pattern. The
   * console had sixteen patterns between its screens, so the same run read three ways.
   */
  it('passes the serverTime pipe a format name, never a pattern of its own', async () => {
    const off: string[] = [];
    for (const f of await sources()) {
      for (const { format, index } of formatArguments(f.code)) {
        if (!NAMES.has(format)) off.push(`${f.path}:${lineOf(f.code, index)} '${format}'`);
      }
    }
    expect(off).toEqual([]);
  });

  /**
   * The plain date pipe reads the API's offset-less timestamps as the reader's own time, hours
   * off outside Chicago, and without a format writes Angular's US "Sep 24, 2026".
   */
  it('formats dates in templates with serverTime, never the plain date pipe', async () => {
    const off: string[] = [];
    for (const f of await sources()) {
      for (const block of templates(f)) {
        for (const index of plainDatePipes(block.text)) off.push(`${f.path}:${lineOf(f.code, block.offset + index)}`);
      }
      if (/import\s*\{[^}]*\bDatePipe\b[^}]*\}\s*from\s*'@angular\/common'/.test(f.code)
          && f.path !== 'shared/ui/server-time.pipe.ts') {
        off.push(`${f.path} imports DatePipe`);
      }
    }
    expect(off).toEqual([]);
  });

  /** Owner decision 2026-09-28: a 24-hour clock everywhere. */
  it('never writes a 12-hour clock or a US-order date', async () => {
    const off: string[] = [];
    for (const f of await sources()) {
      for (const { literal, index } of quotedStrings(f.code)) {
        const why = twelveHour(literal);
        if (why) off.push(`${f.path}:${lineOf(f.code, index)} ${why}`);
      }
      // The browser's own date writing follows its language: "9/24/2026, 10:06 PM" in the US.
      const local = /\.toLocale(Date|Time)String\(/g;
      for (let m = local.exec(f.code); m; m = local.exec(f.code)) {
        off.push(`${f.path}:${lineOf(f.code, m.index)} toLocale${m[1]}String`);
      }
      if (/hour12\s*:\s*true/.test(f.code)) off.push(`${f.path} hour12: true`);
    }
    expect(off).toEqual([]);
  });

  // The detectors on known inputs, so a rule that silently stops matching fails here.
  it('recognises each thing it guards against', () => {
    expect(formatArguments(`{{ a | serverTime:'d MMM, HH:mm' }} {{ b | serverTime: "recent" }}`).map(a => a.format))
      .toEqual(['d MMM, HH:mm', 'recent']);
    expect(formatArguments(`this.clock.transform(fn(x), 'HH:mm')`).map(a => a.format)).toEqual(['HH:mm']);
    expect(plainDatePipes(`{{ at | date:'shortTime' }} {{ a || b }} {{ x | date }}`)).toHaveLength(2);
    expect(plainDatePipes(`{{ at | serverTime:'date' }} {{ n | number }}`)).toEqual([]);
    expect(twelveHour('shortTime')).not.toBe('');
    expect(twelveHour('mediumDate')).not.toBe('');
    expect(twelveHour('h:mm a')).not.toBe('');
    expect(twelveHour('d MMM, hh:mm')).not.toBe('');
    expect(twelveHour('HH:mm a')).not.toBe('');
    expect(twelveHour('d MMM, HH:mm')).toBe('');
    expect(twelveHour('Pick a date')).toBe('');
    const blanked = withoutComments('a // "10:06 PM" h:mm a\n/* hh:mm */ "https://x" <!-- \'h:mm a\' -->');
    expect(blanked).not.toMatch(/PM|h:mm/);
    expect(blanked).toContain('"https://x"');
    expect(blanked.split('\n')).toHaveLength(2);
  });
});

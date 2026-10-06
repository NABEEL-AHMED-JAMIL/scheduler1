/**
 * MIG-213: the console's code standard, as scans of the sources like design-system.spec.ts and
 * layout-rules.spec.ts, so a new file is held to it from its first commit. The compiler half of the
 * standard is in tsconfig.json (strict, noUnusedLocals, noUnusedParameters, noImplicitOverride,
 * noImplicitReturns, noFallthroughCasesInSwitch, strictTemplates); these are the rules it cannot see.
 * QUALITY.md says what the build enforces and what was left out. Each rule names the file and line
 * that breaks it.
 *
 *   console     no console calls: a stray log is noise in every customer's devtools. The few that
 *               are the right channel are listed in CONSOLE_ALLOWED with their reason.
 *   debugger    no debugger statement.
 *   todo        a TODO, FIXME or HACK names its board card -- TODO(MIG-249) -- so it has an owner
 *               and is found when the card is picked up, rather than living on in the code.
 *   dead code   no commented-out code: version control keeps what was deleted.
 *   blank lines never two blank lines in a row: one blank line between members.
 *
 * Specs are held to the same rules. Not scanned: this file, whose rules spell out what they look
 * for, and characterisation/pinned/, which scripts/characterisation/record.mjs writes and nobody
 * edits by hand.
 */
interface Fs {
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(path: string, encoding: 'utf8'): string;
}

interface Source { path: string; text: string }

const NOT_SCANNED = /^src\/app\/(code-standard\.spec\.ts$|characterisation\/pinned\/)/;

async function standardSources(): Promise<Source[]> {
  // Loaded at run time: the specs run under Node, but the browser build has no fs to bundle.
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as Fs;
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  const files: Source[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|html)$/.test(entry.name)) {
        const rel = path.slice(root.length + 1);
        if (!NOT_SCANNED.test(rel)) files.push({ path: rel, text: fs.readFileSync(path, 'utf8') });
      }
    }
  };
  walk(`${root}/src/app`);
  return files;
}

/** Whether a line is (the rest of) a comment rather than code: prose may name what code may not do. */
const isCommentLine = (line: string) => /^\s*(\/\/|\/\*|\*|<!--)/.test(line);

/**
 * The console calls that are the right channel, each with its reason. A new one belongs here only
 * with a reason as good; everything else is a leftover.
 */
const CONSOLE_ALLOWED: { path: string; call: string; reason: string }[] = [
  {
    path: 'src/app/features/analytics/dashboard.ts', call: 'console.error',
    reason: 'a widget that throws while it is prepared: the tile shows a sentence a person can act on, '
      + 'and the exception -- minified, useless on the tile -- goes where a developer will look',
  },
  {
    path: 'src/app/shared/charts/echart/echart.ts', call: 'console.error',
    reason: 'an ECharts option that throws while it is drawn: the tile says in words that the chart could not be '
      + 'drawn, and the exception goes where a developer will look',
  },
  {
    path: 'src/app/shared/ui/icon.ts', call: 'console.error',
    reason: 'an unknown glyph name, in dev mode only: the icon renders nothing, so a typo is otherwise silent',
  },
  {
    path: 'src/app/characterisation/harness.ts', call: 'console.log',
    reason: 'CHAR_RECORD=1 only: the @@CHAR@@ lines are how scripts/characterisation/record.mjs reads the '
      + 'surfaces it pins, test tooling rather than console code',
  },
];

/**
 * Whether a line comment's text is code that was commented out rather than prose. Prose ends in a
 * semicolon too ("... as Run now, Skip and Duplicate already were;"), so ending in ; { or } is not
 * enough: the text must also be shaped like a statement -- open with a keyword or `this.`, be an
 * assignment or a call, or close a call.
 */
function looksLikeCode(comment: string): boolean {
  const text = comment.trim();
  if (!/[;{}]$/.test(text)) return false;
  return /^(?:(?:const|let|var|return|if|else|for|while|switch|case|import|export|await|throw|function|class|new|private|protected|public|readonly)\b|this\.|[{}])/.test(text)
    || /\)\s*[;{]$/.test(text)
    || /^[\w$.[\]]+\s*[+\-*/]?=[^=]/.test(text);
}

/** An HTML comment whose body is markup or template syntax rather than prose. */
function looksLikeMarkup(body: string): boolean {
  return /^\s*(<[a-zA-Z/]|@(if|for|switch|else|defer)\b|\{\{)/.test(body);
}

describe('code standard', () => {
  describe('the commented-out code heuristic', () => {
    it('flags code', () => {
      for (const code of ['const x = this.y();', 'this.toast.error(message);', 'return null;', 'if (open) {', '}',
        'items.push(row);', 'count += 1;', 'await fixture.whenStable();']) {
        expect(looksLikeCode(code), code).toBe(true);
      }
      for (const markup of ['<div class="card">', '</section>', '@if (open) {', '{{ row.name }}']) {
        expect(looksLikeMarkup(markup), markup).toBe(true);
      }
    });

    it('leaves prose alone, including the sentences in the console that end in a semicolon', () => {
      for (const prose of [
        'The row is locked while its request is out, as Run now, Skip and Duplicate already were;',
        'A bin\'s middle is only roughly where its runs sit, so "near 6s" rather than "near 5.8s";',
        'MIG-254: a staff member\'s managed session belongs to no workspace\'s people, so appUser.json/me refuses it;',
        'Workspace alone used to hit the early return and leave the table entirely unfiltered;',
        'count(DISTINCT ...); the Profile tab reads SUMMARIZE\'s approx_unique, a HyperLogLog sketch',
      ]) {
        expect(looksLikeCode(prose), prose).toBe(false);
      }
      expect(looksLikeMarkup(' In a <form> so Enter still sends: the shell\'s buttons are type="button". ')).toBe(false);
    });
  });

  it('calls the console only where CONSOLE_ALLOWED says why', async () => {
    const off: string[] = [];
    const used = new Set<(typeof CONSOLE_ALLOWED)[number]>();
    for (const f of await standardSources()) {
      f.text.split('\n').forEach((line, i) => {
        if (isCommentLine(line)) return;
        for (const m of line.matchAll(/\bconsole\s*\.\s*(log|debug|info|warn|error|trace|table|dir|assert|count|time\w*|group\w*)\s*\(/g)) {
          const call = `console.${m[1]}`;
          const allowed = CONSOLE_ALLOWED.find(a => a.path === f.path && a.call === call);
          if (allowed) used.add(allowed);
          else off.push(`${f.path}:${i + 1}: ${line.trim().slice(0, 90)}`);
        }
      });
    }
    expect(off).toEqual([]);
    // An allowance whose call has gone is removed with it, so the list stays the truth.
    expect(CONSOLE_ALLOWED.filter(a => !used.has(a)).map(a => `${a.path} ${a.call}`)).toEqual([]);
  });

  it('leaves no debugger statement', async () => {
    const off: string[] = [];
    for (const f of await standardSources()) {
      f.text.split('\n').forEach((line, i) => {
        if (!isCommentLine(line) && /(^\s*|[;{}]\s*)debugger\s*(;|$)/.test(line)) off.push(`${f.path}:${i + 1}`);
      });
    }
    expect(off).toEqual([]);
  });

  it('names the board card on every TODO, FIXME and HACK', async () => {
    const off: string[] = [];
    for (const f of await standardSources()) {
      f.text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/\b(TODO|FIXME|HACK)\b(\(MIG-\d+\))?/g)) {
          if (!m[2]) off.push(`${f.path}:${i + 1}: ${line.trim().slice(0, 90)}`);
        }
      });
    }
    expect(off).toEqual([]);
  });

  it('keeps no commented-out code', async () => {
    const off: string[] = [];
    for (const f of await standardSources()) {
      const lines = f.text.split('\n');
      lines.forEach((line, i) => {
        const comment = /^\s*\/\/(.*)$/.exec(line);
        if (comment && looksLikeCode(comment[1])) off.push(`${f.path}:${i + 1}: ${line.trim().slice(0, 90)}`);
      });
      for (const m of f.text.matchAll(/<!--([\s\S]*?)-->/g)) {
        if (looksLikeMarkup(m[1])) off.push(`${f.path}:${f.text.slice(0, m.index).split('\n').length}: <!--${m[1].trim().slice(0, 80)}`);
      }
    }
    expect(off).toEqual([]);
  });

  it('never leaves two blank lines in a row', async () => {
    const off: string[] = [];
    for (const f of await standardSources()) {
      const lines = f.text.split('\n');
      lines.forEach((line, i) => {
        if (i > 0 && !line.trim() && !lines[i - 1].trim() && i < lines.length - 1) off.push(`${f.path}:${i + 1}`);
      });
    }
    expect(off).toEqual([]);
  });
});

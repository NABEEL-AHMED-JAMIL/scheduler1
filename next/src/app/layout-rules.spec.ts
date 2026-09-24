/**
 * MIG-212: the rules that keep the console's screens looking like one product. Each came from a
 * bug a person saw: a gap above a rail's search box, a number running out of its tile, chips
 * written half in lower case, cards padded four different ways. These are scans of the sources,
 * so a new screen is held to them from its first commit.
 */
interface Fs {
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(path: string, encoding: 'utf8'): string;
}

async function sources(): Promise<{ root: string; files: { path: string; text: string }[]; css: string }> {
  // Loaded at run time: the specs run under Node, but the browser build has no fs to bundle.
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as Fs;
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  const files: { path: string; text: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|html)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
        files.push({ path: path.slice(root.length + 1), text: fs.readFileSync(path, 'utf8') });
      }
    }
  };
  walk(`${root}/src/app`);
  return { root, files, css: fs.readFileSync(`${root}/src/styles.css`, 'utf8') };
}

/** The declarations of a selector's first plain rule in the stylesheet. */
function rule(css: string, selector: string): string {
  const at = css.search(new RegExp(`(^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`));
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

/** The lines (0-based, exclusive) of a component's inline `template:`, or null when it has none. */
function inlineTemplate(text: string): [number, number] | null {
  const start = text.indexOf('template: `');
  if (start < 0) return null;
  const end = text.indexOf('`', start + 'template: `'.length);
  return [lineOf(text, start) - 1, lineOf(text, end) - 1];
}

describe('layout rules', () => {
  /**
   * A sticky rail inside an overflow: hidden card sticks to the card, not the page: its top
   * offset (the header's height) became a 57px gap above "Find a dashboard" on every
   * master-detail screen. overflow: clip still clips the rounded corners without that.
   */
  it('never clips a master-detail card with overflow: hidden, which pins its sticky rail inside it', async () => {
    const { css } = await sources();
    const split = rule(css, '.lookup-split');
    expect(split).toContain('display: grid');
    expect(split).not.toMatch(/overflow\s*:\s*hidden/);
    expect(split).toMatch(/overflow\s*:\s*clip/);
  });

  /**
   * A list's row styles belong to its own rows. `.side-panel-list li` also laid out every list
   * inside a row -- an AI step's markdown answer -- as a two-column grid, one letter per line.
   */
  it('styles a side-panel list\'s own rows, not the lists inside them', async () => {
    const { css } = await sources();
    expect(css).not.toMatch(/\.side-panel-list li\s*\{/);
    expect(rule(css, '.side-panel-list > li')).toContain('grid-template-columns');
    expect(css).toMatch(/@media \(max-width: 640px\) \{ \.side-panel-list > li \{ grid-template-columns: minmax\(0, 1fr\); \} \}/);
  });

  /** A long figure has no place to break, so at a phone's width it ran out of its tile. */
  it('sizes a tile\'s number to its tile and lets it wrap before it spills', async () => {
    const { css } = await sources();
    for (const selector of ['.stat-value', '.kpi-value', '.kpi-figure']) {
      const declarations = rule(css, selector);
      expect(declarations, selector).toMatch(/font-size\s*:\s*clamp\([^)]*cqi/);
      expect(declarations, selector).toMatch(/overflow-wrap\s*:\s*anywhere/);
    }
    for (const selector of ['.stat-tile', '.kpi-tile', '.kpi-card']) {
      expect(css, selector).toMatch(new RegExp(`${selector.replace('.', '\\.')}[^{]*\\{[^}]*container-type\\s*:\\s*inline-size`));
    }
  });

  /**
   * One scale for a card's padding: 16px for content (p-4), a one-line bar (px-4 py-2.5), a
   * list of rows (py-1), an empty or error state (p-8 and up), or none when the card is built
   * from its own sections. Cards inset inside a dialog, toasts, popovers, chips and the landing
   * page keep their own scale.
   */
  it('pads every page card on the one scale', async () => {
    const { files } = await sources();
    const allowed = [/^p-4$/, /^p-0$/, /^py-1$/, /^p-(8|10|12)$/, /^px-4 py-2\.5$/];
    const exempt = /(-dialog\.ts|-section\.ts|toast-host\.ts|status-filter-chip\.ts|data-grid\.ts|combobox\.ts|landing\.ts)$/;
    const off: string[] = [];
    for (const f of files.filter(f => !exempt.test(f.path))) {
      for (const m of f.text.matchAll(/class="card((?: [^"]*)?)"/g)) {
        const pads = (m[1].match(/\b(p|px|py)-[0-9.]+\b/g) ?? []).join(' ');
        if (pads && !allowed.some(a => a.test(pads))) off.push(`${f.path}:${lineOf(f.text, m.index!)} ${pads}`);
      }
    }
    expect(off).toEqual([]);
  });

  /**
   * Chips read in sentence case, like the status chips: "Every job", not "every job". An
   * identifier set in monospace -- a version, a table name -- keeps its own spelling.
   */
  it('writes every chip in sentence case', async () => {
    const { files } = await sources();
    const off: string[] = [];
    for (const f of files) {
      for (const m of f.text.matchAll(/<span class="(pill[^"]*)"[^>]*>([\s\S]*?)<\/span>/g)) {
        if (/\bmono\b/.test(m[1])) continue;
        // What a person reads first: leading icons and tags aside, either text or an expression.
        const first = m[2].replace(/^(\s*<[^>]*>(\s*<\/[^>]*>)?)*\s*/, '');
        const literal = first.startsWith('{{') ? '' : first.replace(/\{\{[\s\S]*$/, '').replace(/@if[\s\S]*$/, '').replace(/<[\s\S]*$/, '').trim();
        const lead = first.startsWith('{{') ? first.slice(2, first.indexOf('}}')) : '';
        // A ternary's branches are what shows; the literal it compares against is a value.
        const quoted = /\?/.test(lead) ? [...lead.slice(lead.indexOf('?')).matchAll(/'([^']*)'/g)].map(q => q[1]).filter(q => /^[a-z]/.test(q)) : [];
        if (/^[a-z]/.test(literal) || quoted.length) off.push(`${f.path}:${lineOf(f.text, m.index!)} ${literal || quoted.join(' / ')}`);
      }
    }
    expect(off).toEqual([]);
  });

  /** Two hyphens were a typewriter's dash; the console writes an em dash. Comments may keep theirs. */
  it('shows an em dash, never "--", in text a person reads', async () => {
    const { files } = await sources();
    const off: string[] = [];
    for (const f of files) {
      // Comments may keep their dashes: blank them out, keeping the line count for the report.
      const blank = (c: string) => c.replace(/[^\n]/g, ' ');
      const text = f.text.replace(/<!--[\s\S]*?-->/g, blank).replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^\s*\/\/.*$/gm, blank);
      const template = inlineTemplate(text);
      text.split('\n').forEach((line, i) => {
        // Visible text: between tags or in an attribute of a template, or in a quoted string in code.
        const inTemplate = (f.path.endsWith('.html') || (!!template && i > template[0] && i < template[1])) && /[A-Za-z,)] -- [A-Za-z(]/.test(line);
        const inString = /(['`])[^'`]*[A-Za-z,)] -- [A-Za-z(][^'`]*\1/.test(line);
        if (inTemplate || inString) off.push(`${f.path}:${i + 1}: ${line.trim().slice(0, 90)}`);
      });
    }
    expect(off).toEqual([]);
  });
});

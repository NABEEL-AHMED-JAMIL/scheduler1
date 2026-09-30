/**
 * MIG-257: the rules that keep every colour, size, corner and inline style on the design system.
 *
 * These are scans of the sources, like layout-rules.spec.ts, so a new screen is held to them from
 * its first commit. Each rule names the file and line that breaks it, so the failure says where to
 * look rather than only that something is wrong.
 *
 *   colour   no hex, rgb()/hsl() or raw Tailwind palette class in feature code: every colour is a
 *            token from styles.css (ink, brand, ok/warn/crit, info, chart-*, series-*).
 *   type     no text below 11px.
 *   corners  one radius scale: sm (inline marks), md (controls), lg (menus, panels), card, full.
 *   styles   an inline style binding only for what is truly dynamic -- geometry, or a colour that
 *            comes from the data (a chart series) -- never a fixed value or a status lookup.
 */
interface Fs {
  readdirSync(path: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(path: string, encoding: 'utf8'): string;
}

interface Source { path: string; text: string }

/**
 * Directories under src/app that are not feature code. The characterisation specs' fixtures and
 * pinned DOM text quote what a screen printed ("Job #28351"), which is data, not styling.
 */
const NOT_FEATURE_CODE = /^src\/app\/characterisation\//;

async function designSources(): Promise<{ files: Source[]; css: string }> {
  // Loaded at run time: the specs run under Node, but the browser build has no fs to bundle.
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as Fs;
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  const files: Source[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|html|css)$/.test(entry.name) && !entry.name.endsWith('.spec.ts')) {
        const rel = path.slice(root.length + 1);
        if (!NOT_FEATURE_CODE.test(rel)) files.push({ path: rel, text: fs.readFileSync(path, 'utf8') });
      }
    }
  };
  walk(`${root}/src/app`);
  return { files, css: fs.readFileSync(`${root}/src/styles.css`, 'utf8') };
}

/** Comments blanked out, keeping every newline so a reported line number is still right. */
function code(f: Source): string {
  const blank = (c: string) => c.replace(/[^\n]/g, ' ');
  let text = f.text.replace(/<!--[\s\S]*?-->/g, blank).replace(/\/\*[\s\S]*?\*\//g, blank);
  // A line comment, but not the // inside a URL ("https://...").
  if (f.path.endsWith('.ts')) text = text.replace(/(^|[^:'"`\w])\/\/.*$/gm, (m, lead: string) => lead + blank(m.slice(lead.length)));
  return text;
}

const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length;

/**
 * Token definition files under src/app: the only places, besides src/styles.css, where a literal
 * colour may be written -- and there only as the value of a custom property.
 */
const TOKEN_FILES = [
  // The landing hero and its console preview are one deep surface in both themes, so their
  // palette cannot come from the theme tokens, which flip. Loaded by the landing page alone.
  /^src\/app\/features\/landing\/landing\.tokens\.css$/,
];

/** A token file with its custom-property declarations blanked out: whatever is left is a rule. */
function withoutTokenDefinitions(f: Source): Source {
  if (!TOKEN_FILES.some(p => p.test(f.path))) return f;
  return { path: f.path, text: f.text.replace(/--[\w-]+\s*:[^;]*;/g, m => m.replace(/[^\n]/g, ' ')) };
}

function offenders(files: Source[], pattern: RegExp, keep: (match: RegExpMatchArray, f: Source) => boolean = () => true): string[] {
  const off: string[] = [];
  for (const f of files) {
    const text = code(f);
    for (const m of text.matchAll(pattern)) {
      if (keep(m, f)) off.push(`${f.path}:${lineAt(text, m.index!)} ${m[0].trim()}`);
    }
  }
  return off;
}

/** A hex colour: 3, 4, 6 or 8 digits, standing alone -- not a template ref such as #row. */
const HEX = /(?<![\w&$-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
/** A colour function with literal channels. color-mix() over tokens is fine and is not matched. */
const COLOUR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.]/g;
const PALETTE = 'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone';
/** A Tailwind colour utility on the default palette, or white/black, with any variant prefix. */
const TAILWIND_PALETTE = new RegExp(
  `(?<![\\w-])(?:[a-z0-9-]+:)*(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|divide|decoration|accent|caret|placeholder|shadow)-` +
  `(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:\\/\\d+)?(?![\\w-])`, 'g');
/** A named CSS colour used as a value. */
const NAMED = /(?:^|[\s;{"'])(?:color|background(?:-color)?|border(?:-[a-z]+)?-color|fill|stroke|outline-color)\s*:\s*(?:white|black|red|green|blue|gray|grey|orange|yellow|purple|pink)\b/g;

describe('design system', () => {
  describe('colour comes from a token', () => {
    it('has no hex colour in feature code', async () => {
      const { files } = await designSources();
      expect(offenders(files.map(withoutTokenDefinitions), HEX)).toEqual([]);
    });

    it('has no rgb(), hsl() or other literal colour function in feature code', async () => {
      const { files } = await designSources();
      expect(offenders(files.map(withoutTokenDefinitions), COLOUR_FN)).toEqual([]);
    });

    it('has no raw Tailwind palette colour (red-500, gray-200, white, black) in feature code', async () => {
      const { files } = await designSources();
      expect(offenders(files, TAILWIND_PALETTE)).toEqual([]);
    });

    it('has no named CSS colour in feature code', async () => {
      const { files } = await designSources();
      expect(offenders(files, NAMED)).toEqual([]);
    });

    /**
     * styles.css is the one token definition file, so it is where literal colours live -- but
     * only as the value of a custom property, never written straight into a component rule. A
     * literal in a rule is a colour that ignores the theme, which is how dark mode drifted.
     */
    it('writes a literal colour in styles.css only as a token definition', async () => {
      const { css } = await designSources();
      const text = code({ path: 'src/styles.css', text: css });
      const off: string[] = [];
      text.split('\n').forEach((line, i) => {
        const declarations = line.split(';');
        for (const d of declarations) {
          if (/^\s*(?:[^{]*\{)?\s*--[\w-]+\s*:/.test(d)) continue;
          if (d.match(HEX) || d.match(COLOUR_FN) || d.match(TAILWIND_PALETTE)) off.push(`styles.css:${i + 1} ${d.trim().slice(0, 90)}`);
        }
      });
      expect(off).toEqual([]);
    });

    it('defines an info token, so a blue action is not a raw palette step', async () => {
      const { css } = await designSources();
      for (const token of ['--color-info-100', '--color-info-500', '--color-info-400', '--info-text']) {
        expect(css, token).toMatch(new RegExp(`${token}\\s*:`));
      }
      expect(css).toMatch(/\.btn-circle-info\s*\{[^}]*var\(--info-text\)/);
    });

    /** A var() that names no token paints nothing, and fails silently. */
    it('only reads tokens that styles.css defines', async () => {
      const { files, css } = await designSources();
      const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
      // Set by a component on its own element, not by the stylesheet.
      for (const local of ['--data-text-lines', '--spinner-size']) defined.add(local);
      for (const f of files) for (const m of code(f).matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
      const off = offenders(files, /var\((--[a-z][\w-]*[a-z0-9])\)/g, m => !defined.has(m[1]) && !/^--chart-$/.test(m[1]));
      expect(off).toEqual([]);
    });
  });

  describe('type scale', () => {
    it('sets no text below 11px', async () => {
      const { files, css } = await designSources();
      const tooSmall = (value: string, unit: string) =>
        unit === 'px' ? Number(value) < 11 : unit === 'rem' ? Number(value) < 0.6875 : false;
      // A unitless font-size is an SVG attribute, in px; a unitless text-[...] is not a size.
      const pattern = /(?:text-\[|font-size\s*[:=]\s*"?)([\d.]+)(px|rem|em)?/g;
      const off = offenders([...files, { path: 'src/styles.css', text: css }], pattern,
        m => m[0].startsWith('text-[') && !m[2] ? false : tooSmall(m[1], m[2] ?? 'px'));
      expect(off).toEqual([]);
    });
  });

  describe('radius scale', () => {
    /**
     * sm 4px for an inline mark (code, a highlighted word, a thin bar), md 6px for a control,
     * lg 8px for a menu, popover or panel, card 10px for a card, full for a pill or a dot.
     */
    it('rounds corners only on the scale', async () => {
      const { files, css } = await designSources();
      const utility = /(?<![\w-])rounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br|ss|se|es|ee))?(?:-(xs|xl|2xl|3xl|4xl|\[[^\]]+\]))?(?![\w-])/g;
      const utilities = offenders([...files, { path: 'src/styles.css', text: css }], utility, m => m[1] !== undefined);
      const property = /border(?:-[a-z-]+)?-radius\s*:\s*([^;}]+)/g;
      const onScale = /^(?:0|50%|999px|9999px|var\(--radius-(?:sm|md|lg|card|full)\))(?:\s+(?:0|var\(--radius-(?:sm|md|lg|card|full)\)))*$/;
      const properties = offenders([...files, { path: 'src/styles.css', text: css }], property, m => !onScale.test(m[1].trim()));
      expect([...utilities, ...properties]).toEqual([]);
    });
  });

  describe('inline styles', () => {
    /**
     * Geometry that depends on the data or the viewport -- a bar's width, a box's position, a
     * zoom -- has no class to come from. A colour is allowed only where it IS data: a chart
     * series, whose colour is chosen per category by the caller.
     */
    const GEOMETRY = /^(?:width|height|min-width|minWidth|max-width|maxWidth|max-height|maxHeight|min-height|left|top|right|bottom|transform|font-size)(?:\.(?:px|rem|%))?$/;
    const DATA_COLOUR = /^background$/;
    /** Files whose colour bindings are a series colour passed in with the data. */
    const SERIES_COLOUR_FILES = [
      /^src\/app\/shared\/charts\//,              // every chart draws the caller's series colour
      /^src\/app\/features\/reports\/report-pivot\.html$/, // a pivot's legend and stacked bars
      /^src\/app\/features\/billing\/billing\.html$/,       // a bill's cost split, one colour per meter
      /^src\/app\/features\/dashboard\/dashboard\.html$/,   // outcome segments, from statusColor()
    ];

    it('binds no fixed style in a template', async () => {
      const { files } = await designSources();
      expect(offenders(files, /\sstyle="[^"]*"/g)).toEqual([]);
    });

    it('binds a style only for geometry, or for a series colour in a chart', async () => {
      const { files } = await designSources();
      const off = offenders(files, /\[style\.([\w.%-]+)\]="([^"]*)"/g, (m, f) => {
        if (GEOMETRY.test(m[1])) return /^\s*'[^']*'\s*$|^\s*[\d.]+\s*$/.test(m[2]); // a constant is not dynamic
        if (DATA_COLOUR.test(m[1]) && SERIES_COLOUR_FILES.some(p => p.test(f.path))) return /^\s*'[^']*'\s*$/.test(m[2]);
        return true;
      });
      expect(off).toEqual([]);
    });

    it('never binds a whole style object', async () => {
      const { files } = await designSources();
      expect(offenders(files, /\[(?:ngStyle|style|attr\.style)\]=/g)).toEqual([]);
    });
  });
});

// A module, so its helpers do not collide with the other source-scanning specs.
export {};

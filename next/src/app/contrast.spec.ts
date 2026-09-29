/**
 * MIG-257: WCAG 2 contrast, measured from the tokens themselves.
 *
 * Every ratio quoted in styles.css's comments was measured by hand once, and a later change to a
 * token could quietly undo it. This reads the token values out of styles.css for each theme --
 * @theme, then :root for light, then html.dark on top for dark -- resolves var() chains and
 * color-mix(), and measures each pair a person actually reads: body text on every surface, the
 * buttons, every pill, the semantic text colours, and the chart colours that label a series.
 *
 *   4.5:1  text (WCAG 1.4.3 AA) -- body text, pills, a series colour used as a legend's text
 *   3:1    a mark that carries meaning without text (WCAG 1.4.11) -- a chart fill, a focus ring
 */
interface Fs { readFileSync(path: string, encoding: 'utf8'): string }

type Rgba = [number, number, number, number];
type Tokens = Map<string, string>;

async function stylesheet(): Promise<string> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as Fs;
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${root}/src/styles.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The bodies of every block whose selector is exactly `selector`, in source order. */
function blocks(css: string, selector: string): string[] {
  const out: string[] = [];
  const pattern = new RegExp(`(^|[\\s}])${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'g');
  for (const m of css.matchAll(pattern)) {
    let depth = 0;
    const open = m.index! + m[0].length - 1;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) { out.push(css.slice(open + 1, i)); break; }
    }
  }
  return out;
}

function declarations(body: string, into: Tokens): void {
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) into.set(m[1], m[2].trim());
}

function theme(css: string, dark: boolean): Tokens {
  const tokens: Tokens = new Map();
  for (const b of blocks(css, '@theme')) declarations(b, tokens);
  for (const b of blocks(css, ':root')) declarations(b, tokens);
  if (dark) for (const b of blocks(css, 'html.dark')) declarations(b, tokens);
  return tokens;
}

// ---- colour maths -----------------------------------------------------------------------------

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toOklab([r, g, b]: Rgba): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, A, B]: [number, number, number], alpha: number): Rgba {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(c => Math.min(1, Math.max(0, toGamma(c))));
  return [rgb[0], rgb[1], rgb[2], alpha];
}

function hex(value: string): Rgba {
  let h = value.slice(1);
  if (h.length <= 4) h = [...h].map(c => c + c).join('');
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
}

/** Splits a function's arguments on the commas at its own depth. */
function args(inner: string): string[] {
  const out: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '(') depth++;
    else if (inner[i] === ')') depth--;
    else if (inner[i] === ',' && depth === 0) { out.push(inner.slice(start, i).trim()); start = i + 1; }
  }
  out.push(inner.slice(start).trim());
  return out;
}

function resolve(value: string, tokens: Tokens, seen = 0): Rgba {
  if (seen > 20) throw new Error(`var() cycle at ${value}`);
  const v = value.trim();
  if (v.startsWith('#')) return hex(v);
  if (v === 'transparent') return [0, 0, 0, 0];
  if (v === 'white') return [1, 1, 1, 1];
  if (v === 'black') return [0, 0, 0, 1];
  const fn = /^([\w-]+)\(([\s\S]*)\)$/.exec(v);
  if (fn && fn[1] === 'var') {
    const [name, fallback] = args(fn[2]);
    const next = tokens.get(name) ?? fallback;
    if (next === undefined) throw new Error(`${name} is not defined`);
    return resolve(next, tokens, seen + 1);
  }
  if (fn && fn[1] === 'color-mix') {
    const [space, a, b] = args(fn[2]);
    const part = (s: string) => {
      const m = /^([\s\S]*?)\s+([\d.]+)%$/.exec(s);
      return m ? { colour: resolve(m[1], tokens, seen + 1), pct: Number(m[2]) / 100 } : { colour: resolve(s, tokens, seen + 1), pct: NaN };
    };
    const pa = part(a), pb = part(b);
    const wa = !isNaN(pa.pct) ? pa.pct : 1 - pb.pct;
    const wb = !isNaN(pb.pct) ? pb.pct : 1 - wa;
    return mix(space.replace(/^in\s+/, ''), pa.colour, wa / (wa + wb), pb.colour);
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : Number(rgb[4]);
    return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255, alpha];
  }
  throw new Error(`cannot resolve colour "${v}"`);
}

/** CSS color-mix(): premultiplied interpolation, so mixing with transparent keeps the hue. */
function mix(space: string, a: Rgba, wa: number, b: Rgba): Rgba {
  const alpha = a[3] * wa + b[3] * (1 - wa);
  if (alpha === 0) return [0, 0, 0, 0];
  const conv = space === 'oklab' ? toOklab : (c: Rgba) => [c[0], c[1], c[2]] as [number, number, number];
  const ca = conv(a), cb = conv(b);
  const mixed = [0, 1, 2].map(i => (ca[i] * a[3] * wa + cb[i] * b[3] * (1 - wa)) / alpha) as [number, number, number];
  return space === 'oklab' ? fromOklab(mixed, alpha) : [mixed[0], mixed[1], mixed[2], alpha];
}

/** A translucent colour as it lands on an opaque ground. */
const over = (top: Rgba, ground: Rgba): Rgba =>
  [0, 1, 2].map(i => top[i] * top[3] + ground[i] * (1 - top[3])).concat(1) as Rgba;

const luminance = ([r, g, b]: Rgba) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

function ratio(fg: Rgba, bg: Rgba): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---- the pairs ------------------------------------------------------------------------------

const SURFACES = ['--surface-page', '--surface-raised', '--surface-sunken', '--surface-inset'];
const TEXT = ['--text-primary', '--text-secondary', '--text-muted', '--accent-text',
  '--ok-text', '--warn-text', '--crit-text', '--info-text'];
const PILLS = ['neutral', 'brand', 'ok', 'warn', 'crit', 'info'];
const SOLID_PILLS = ['brand', 'ok', 'warn', 'crit', 'neutral'];

function measure(tokens: Tokens, fg: string, bg: string, ground = '--surface-raised'): number {
  const base = resolve(`var(${ground})`, tokens);
  const back = over(resolve(`var(${bg})`, tokens), base);
  const front = over(resolve(`var(${fg})`, tokens), back);
  return Math.round(ratio(front, back) * 100) / 100;
}

describe('WCAG AA contrast, from the tokens in styles.css', () => {
  it('reads the colour maths right (white on black is 21:1, #767676 on white is 4.54:1)', () => {
    expect(ratio(hex('#ffffff'), hex('#000000'))).toBeCloseTo(21, 5);
    expect(ratio(hex('#767676'), hex('#ffffff'))).toBeCloseTo(4.54, 2);
    // Mixing with transparent keeps the colour and takes the alpha.
    expect(mix('oklab', hex('#bb2d48'), 0.22, [0, 0, 0, 0]).map(c => Math.round(c * 255)))
      .toEqual([0xbb, 0x2d, 0x48, Math.round(0.22 * 255)]);
  });

  for (const dark of [false, true]) {
    const name = dark ? 'dark' : 'light';
    describe(`${name} theme`, () => {
      let tokens: Tokens;
      beforeAll(async () => { tokens = theme(await stylesheet(), dark); });

      it('text on every surface clears 4.5:1', () => {
        const off: string[] = [];
        for (const fg of TEXT) for (const bg of SURFACES) {
          const r = measure(tokens, fg, bg);
          if (r < 4.5) off.push(`${fg} on ${bg}: ${r}`);
        }
        expect(off).toEqual([]);
      });

      it('button labels clear 4.5:1 on their fill', () => {
        expect(measure(tokens, '--btn-primary-fg', '--btn-primary-bg')).toBeGreaterThanOrEqual(4.5);
        expect(measure(tokens, '--btn-primary-fg', '--btn-primary-hover')).toBeGreaterThanOrEqual(4.5);
        expect(measure(tokens, '--btn-danger-fg', '--btn-danger-bg')).toBeGreaterThanOrEqual(4.5);
      });

      it('every pill clears 4.5:1, on a card and on a hovered row', () => {
        const off: string[] = [];
        for (const ground of ['--surface-raised', '--surface-sunken']) {
          for (const tone of PILLS) {
            const r = measure(tokens, `--pill-${tone}-fg`, `--pill-${tone}-bg`, ground);
            if (r < 4.5) off.push(`pill-${tone} on ${ground}: ${r}`);
          }
          for (const tone of SOLID_PILLS) {
            const r = measure(tokens, `--pill-solid-${tone}-fg`, `--pill-solid-${tone}-bg`, ground);
            if (r < 4.5) off.push(`pill-solid-${tone} on ${ground}: ${r}`);
          }
        }
        expect(off).toEqual([]);
      });

      /** A solid pill must stand apart from its soft partner, or two statuses read as one. */
      it('keeps each solid pill distinct from its soft partner', () => {
        for (const tone of ['brand', 'ok', 'warn', 'crit']) {
          const soft = over(resolve(`var(--pill-${tone}-bg)`, tokens), resolve('var(--surface-raised)', tokens));
          const solid = resolve(`var(--pill-solid-${tone}-bg)`, tokens);
          expect(ratio(soft, solid), tone).toBeGreaterThanOrEqual(1.8);
        }
      });

      /** A chart legend names each series in its own colour, so the categorical slots are text. */
      it('every categorical chart colour clears 4.5:1 on a card', () => {
        const off: string[] = [];
        for (let i = 0; i < 8; i++) {
          const r = measure(tokens, `--chart-${i}`, '--surface-raised');
          if (r < 4.5) off.push(`--chart-${i}: ${r}`);
        }
        expect(off).toEqual([]);
      });

      it('every status series fill clears 3:1 on a card (non-text)', () => {
        const off: string[] = [];
        for (const family of ['brand', 'ok', 'warn', 'crit']) for (const step of ['', '-soft']) {
          const token = `--series-${family}${step}`;
          const r = measure(tokens, token, '--surface-raised');
          if (r < 3) off.push(`${token}: ${r}`);
        }
        expect(measure(tokens, '--series-muted', '--surface-raised')).toBeGreaterThanOrEqual(3);
        expect(off).toEqual([]);
      });

      it('the focus ring and brand marks clear 3:1 on the page and on a card', () => {
        for (const mark of ['--focus-ring', '--accent-mark', '--accent-mark-strong', '--info-mark']) {
          for (const bg of ['--surface-page', '--surface-raised']) {
            expect(measure(tokens, mark, bg), `${mark} on ${bg}`).toBeGreaterThanOrEqual(3);
          }
        }
      });
    });
  }
});

// A module, so its helpers do not collide with the other source-scanning specs.
export {};

/**
 * A small QR code encoder (ISO/IEC 18004) for the designer's QR inspector: the version a content needs at an error-
 * correction level, chosen exactly as media-service's encoder (zxing 3.5.3, charts/QrCode.java) chooses it -- numeric,
 * alphanumeric or byte mode, UTF-8 with its ECI marker when the text is not ASCII -- and the modules, so the inspector can
 * draw the code at its real size and say whether it will scan. The console draws a preview only; the report's code is
 * always the server's.
 */

export type EcLevel = 'L' | 'M' | 'Q' | 'H';
export type QrMode = 'numeric' | 'alphanumeric' | 'byte';

/** What a content needs: its version (1-40), modules across (21 for version 1, four more a version), mode and bits. */
export interface QrFit { version: number; modules: number; mode: QrMode; bits: number; eci: boolean; }

export interface QrMatrix extends QrFit { level: EcLevel; mask: number; dark: boolean[][]; }

const LEVELS: EcLevel[] = ['L', 'M', 'Q', 'H'];
/** The format information's two bits for each level (L 01, M 00, Q 11, H 10). */
const FORMAT_BITS: Record<EcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** Error-correction codewords in each block, by level then version (index 0 unused). */
const ECC_PER_BLOCK: number[][] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
/** Error-correction blocks, by level then version (index 0 unused). */
const BLOCKS: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/** The modules that carry data (and error correction) in a version, after the function patterns. */
function rawDataModules(version: number): number {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}

/** The data codewords (bytes) a version holds at a level, error correction taken out. */
export function dataCodewords(version: number, level: EcLevel): number {
  const e = LEVELS.indexOf(level);
  return Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[e][version] * BLOCKS[e][version];
}

/** The mode zxing picks: digits only numeric, the 45 QR characters alphanumeric, anything else bytes. */
export function qrMode(text: string): QrMode {
  if (!text) return 'byte';
  let alnum = false;
  for (const c of text) {
    if (c >= '0' && c <= '9') continue;
    if (ALPHANUMERIC.includes(c)) { alnum = true; continue; }
    return 'byte';
  }
  return alnum ? 'alphanumeric' : 'numeric';
}

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** Text beyond ASCII goes as UTF-8 with its ECI marker (as media-service does); ASCII as plain bytes. */
function isAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) > 0x7f) return false;
  return true;
}

function countBits(mode: QrMode, version: number): number {
  const i = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  return { numeric: [10, 12, 14], alphanumeric: [9, 11, 13], byte: [8, 16, 16] }[mode][i];
}

function dataBitLength(mode: QrMode, text: string): number {
  if (mode === 'numeric') return 10 * Math.floor(text.length / 3) + [0, 4, 7][text.length % 3];
  if (mode === 'alphanumeric') return 11 * Math.floor(text.length / 2) + 6 * (text.length % 2);
  return 8 * utf8(text).length;
}

function fits(bits: number, version: number, level: EcLevel): boolean {
  return dataCodewords(version, level) >= Math.ceil(bits / 8);
}

function chooseVersion(bits: number, level: EcLevel): number | null {
  for (let v = 1; v <= 40; v++) if (fits(bits, v, level)) return v;
  return null;
}

/**
 * The version a text needs at a level, as zxing's Encoder.recommendVersion works it out (a provisional version from the
 * version-1 count field, then again with that version's), or null when it does not fit in a QR code at all.
 */
export function qrFit(text: string, level: EcLevel): QrFit | null {
  const mode = qrMode(text);
  const eci = mode === 'byte' && !isAscii(text);
  const head = 4 + (eci ? 12 : 0);
  const data = dataBitLength(mode, text);
  const provisional = chooseVersion(head + countBits(mode, 1) + data, level);
  if (provisional === null) return null;
  const bits = head + countBits(mode, provisional) + data;
  const version = chooseVersion(bits, level);
  return version === null ? null : { version, modules: 17 + 4 * version, mode, bits, eci };
}

// ------------------------------------------------------------------------------------------------ the codewords

class Bits {
  readonly bits: number[] = [];
  put(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const out = new Array<number>(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < out.length; j++) {
      out[j] = gfMul(out[j], root);
      if (j + 1 < out.length) out[j] ^= out[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return out;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const out = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (out.shift() as number);
    out.push(0);
    divisor.forEach((coef, i) => { out[i] ^= gfMul(coef, factor); });
  }
  return out;
}

function codewords(text: string, fit: QrFit, level: EcLevel): number[] {
  const bb = new Bits();
  if (fit.eci) { bb.put(0b0111, 4); bb.put(26, 8); }
  if (fit.mode === 'numeric') {
    bb.put(0b0001, 4);
    bb.put(text.length, countBits('numeric', fit.version));
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.slice(i, i + 3);
      bb.put(Number(chunk), chunk.length * 3 + 1);
    }
  } else if (fit.mode === 'alphanumeric') {
    bb.put(0b0010, 4);
    bb.put(text.length, countBits('alphanumeric', fit.version));
    for (let i = 0; i < text.length; i += 2) {
      const a = ALPHANUMERIC.indexOf(text[i]);
      if (i + 1 < text.length) bb.put(a * 45 + ALPHANUMERIC.indexOf(text[i + 1]), 11); else bb.put(a, 6);
    }
  } else {
    const bytes = utf8(text);
    bb.put(0b0100, 4);
    bb.put(bytes.length, countBits('byte', fit.version));
    bytes.forEach(b => bb.put(b, 8));
  }
  const capacity = dataCodewords(fit.version, level) * 8;
  bb.put(0, Math.min(4, capacity - bb.bits.length));
  bb.put(0, (8 - (bb.bits.length % 8)) % 8);
  for (let pad = 0xec; bb.bits.length < capacity; pad ^= 0xec ^ 0x11) bb.put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bb.bits.length; i += 8) data.push(bb.bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // Split into blocks, add each block's error correction, and interleave.
  const e = LEVELS.indexOf(level);
  const blocks = BLOCKS[e][fit.version];
  const eccLen = ECC_PER_BLOCK[e][fit.version];
  const raw = Math.floor(rawDataModules(fit.version) / 8);
  const short = blocks - (raw % blocks);
  const shortLen = Math.floor(raw / blocks);
  const divisor = rsDivisor(eccLen);
  const all: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < short ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < short) dat.push(0);
    all.push(dat.concat(ecc));
  }
  const out: number[] = [];
  for (let i = 0; i < all[0].length; i++) {
    all.forEach((block, j) => { if (i !== shortLen - eccLen || j >= short) out.push(block[i]); });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the matrix

function alignmentPositions(version: number, size: number): number[] {
  if (version === 1) return [];
  const n = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

class Grid {
  readonly dark: boolean[][];
  readonly fixed: boolean[][];
  constructor(readonly size: number) {
    this.dark = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }
  set(x: number, y: number, dark: boolean): void {
    this.dark[y][x] = dark;
    this.fixed[y][x] = true;
  }
}

function drawFinder(g: Grid, cx: number, cy: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= g.size || y >= g.size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      g.set(x, y, d !== 2 && d !== 4);
    }
  }
}

function drawFormat(g: Grid, level: EcLevel, mask: number): void {
  const data = (FORMAT_BITS[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) !== 0;
  const n = g.size;
  for (let i = 0; i <= 5; i++) g.set(8, i, bit(i));
  g.set(8, 7, bit(6));
  g.set(8, 8, bit(7));
  g.set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) g.set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) g.set(n - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) g.set(8, n - 15 + i, bit(i));
  g.set(8, n - 8, true);
}

function drawVersion(g: Grid, version: number): void {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) !== 0;
    const a = g.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    g.set(a, b, dark);
    g.set(b, a, dark);
  }
}

function penalty(dark: boolean[][]): number {
  const n = dark.length;
  let score = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && get(i) === get(i - 1)) { run++; continue; }
      if (run >= 5) score += 3 + (run - 5);
      run = 1;
    }
    for (let i = 0; i + 7 <= n; i++) {
      // 1:1:3:1:1 (a finder's look) with four light modules on either side.
      if (get(i) && !get(i + 1) && get(i + 2) && get(i + 3) && get(i + 4) && !get(i + 5) && get(i + 6)) {
        const lightBefore = i >= 4 && [1, 2, 3, 4].every(k => !get(i - k));
        const lightAfter = i + 11 <= n && [7, 8, 9, 10].every(k => !get(i + k));
        if (lightBefore || lightAfter) score += 40;
      }
    }
  };
  for (let y = 0; y < n; y++) line(i => dark[y][i]);
  for (let x = 0; x < n; x++) line(i => dark[i][x]);
  let count = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (dark[y][x]) count++;
      if (x + 1 < n && y + 1 < n && dark[y][x] === dark[y][x + 1] && dark[y][x] === dark[y + 1][x] && dark[y][x] === dark[y + 1][x + 1]) score += 3;
    }
  }
  const total = n * n;
  score += (Math.ceil(Math.abs(count * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/** The QR code for a text at a level, or null when it does not fit in version 40. */
export function encodeQr(text: string, level: EcLevel): QrMatrix | null {
  const fit = qrFit(text, level);
  if (!fit) return null;
  const words = codewords(text, fit, level);
  const g = new Grid(fit.modules);
  const n = g.size;
  for (let i = 0; i < n; i++) {
    g.set(6, i, i % 2 === 0);
    g.set(i, 6, i % 2 === 0);
  }
  drawFinder(g, 3, 3);
  drawFinder(g, n - 4, 3);
  drawFinder(g, 3, n - 4);
  const align = alignmentPositions(fit.version, n);
  const last = align.length - 1;
  align.forEach((ay, i) => align.forEach((ax, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) g.set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  drawFormat(g, level, 0);
  drawVersion(g, fit.version);

  // The codewords, two columns at a time from the right, up and down in turn, skipping the timing column.
  let k = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? n - 1 - vert : vert;
        if (!g.fixed[y][x] && k < words.length * 8) {
          g.dark[y][x] = ((words[k >>> 3] >>> (7 - (k & 7))) & 1) !== 0;
          k++;
        }
      }
    }
  }

  const applyMask = (m: number) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!g.fixed[y][x] && MASKS[m](x, y)) g.dark[y][x] = !g.dark[y][x];
  };
  let best = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormat(g, level, m);
    const s = penalty(g.dark);
    if (s < bestScore) { best = m; bestScore = s; }
    applyMask(m);
  }
  applyMask(best);
  drawFormat(g, level, best);
  return { ...fit, level, mask: best, dark: g.dark };
}

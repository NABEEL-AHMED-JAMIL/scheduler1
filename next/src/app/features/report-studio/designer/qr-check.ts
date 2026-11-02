import { Block, find, innerPath, valueAt } from './designer-model';
import { EcLevel, QrFit, qrFit } from './qr-encoder';

/** What a QR code may open (the qrCode component's content, media's QrContent.Mode). */
export type QrSource = 'verifyLink' | 'reportId' | 'binding' | 'text';

/** media-service's defaults (ComponentRegistry and Advanced.qrCode): verify link, 25 mm, level M, a 4-module quiet zone. */
export const QR_DEFAULTS = { content: 'verifyLink' as QrSource, sizeMm: 25, errorCorrection: 'M' as EcLevel, quietZone: 4 };
export const QR_MIN_MM = 10;
export const QR_MAX_MM = 100;

/** A module this wide or more prints and scans reliably; down to PRINT_MIN_MM it is marginal; below, it is too small. */
export const PRINT_OK_MM = 0.33;
export const PRINT_MIN_MM = 0.25;
/** A fax (black and white, about 200 dpi in fine mode) loses modules under half a millimetre. */
export const FAX_OK_MM = 0.5;

/** A synthetic report id of a real one's length (media's report ids are 26-character ULIDs). */
const SAMPLE_REPORT_ID = '01JBQ7RZ4K8M2N6P9T3V5W7X9Y';
/** A report number as media writes it into a QR code (Views.reportLabel + " · v" + version). */
export const SAMPLE_REPORT_LABEL = 'RPT-0001 · v1';

/**
 * The verify link a report's QR code carries, of the length the server makes it: media's QrContent.verifyLink,
 * {@code <console>/reports/library/<reportId>?version=<n>&verify=1}. The one place its shape is written: when the link
 * becomes a short public code, change this function and every length, version and verdict follows.
 */
export function verifyLinkSample(consoleOrigin: string): string {
  return `${consoleOrigin.replace(/\/+$/, '')}/reports/library/${SAMPLE_REPORT_ID}?version=1&verify=1`;
}

/**
 * A binding's value in the test data's first record: inside a "Repeat for each", a name its item is bound by
 * (v.visitRef) reads the repeated list's first item, as the canvas draws the first repetition.
 */
export function sampleValue(binding: string, blockId: string, blocks: Block[], sample: unknown, names: string[]): unknown {
  const head = binding.split(/[.[]/)[0];
  for (let at = find(blocks, blockId); at?.parent; at = find(blocks, at.parent.id)) {
    const p = at.parent;
    if (p.type === 'repeat' && String(p['as'] ?? 'item') === head && typeof p['dataset'] === 'string') {
      const list = sampleValue(p['dataset'], p.id, blocks, sample, names);
      const first = Array.isArray(list) ? list[0] : undefined;
      const rest = binding.slice(head.length).replace(/^\./, '');
      return rest ? valueAt(first, rest) : first;
    }
  }
  const inner = innerPath(binding, names);
  return inner === null ? undefined : valueAt(sample, inner);
}

/** The content the inspector measures and draws, and what to say about it. */
export interface QrSample { text: string; note: string; }

/** The text the server would encode for a QR block, with this console's address and the test data's first record. */
export function qrSample(block: Block, origin: string, sample: unknown, names: string[], blocks: Block[] = []): QrSample {
  const source = (block['content'] as QrSource | undefined) ?? QR_DEFAULTS.content;
  switch (source) {
    case 'reportId':
      return { text: SAMPLE_REPORT_LABEL, note: 'The report number and version, as each report prints it.' };
    case 'binding': {
      const binding = typeof block['binding'] === 'string' ? block['binding'] : '';
      const v = binding ? sampleValue(binding, block.id, blocks, sample, names) : undefined;
      if (typeof v === 'string' && v.trim()) return { text: v.trim(), note: 'The test data\'s first value; each report encodes its own.' };
      if (typeof v === 'number' || typeof v === 'boolean') return { text: String(v), note: 'The test data\'s first value; each report encodes its own.' };
      return { text: 'preview', note: binding ? 'No value in the test data: measured with the word "preview".' : 'Pick the field under Data, below.' };
    }
    case 'text': {
      const text = typeof block['text'] === 'string' ? block['text'].trim() : '';
      if (!text) return { text: '', note: 'Write the text under Content, below.' };
      return { text, note: text.includes('{{') ? 'Data in {{ }} is filled in when the report is made, so the length can change.' : 'The same on every report.' };
    }
    default:
      return { text: verifyLinkSample(origin), note: 'Made when each report is generated: this version\'s own page.' };
  }
}

/** Who reads what a scan opens. */
export function qrAudience(source: QrSource): string {
  switch (source) {
    case 'verifyLink':
      return 'Signed-in members of this workspace only. The link opens the console\'s sign-in, then this version\'s page; it carries no token or secret.';
    case 'binding':
      return 'Anyone who scans reads the value itself, without signing in. Never encode a patient\'s name or identifier.';
    default:
      return 'Anyone who scans reads the text itself, without signing in.';
  }
}

export type Verdict = 'ok' | 'marginal' | 'poor';
export interface ScanLine { verdict: Verdict; text: string; }

/** The scan check for a content at a level, a size (quiet zone included, as media draws it) and a quiet zone. */
export interface ScanCheck {
  fit: QrFit | null;
  /** Characters of the content. */
  length: number;
  /** Modules across the drawn square: the code and its quiet zone on both sides. */
  across: number;
  moduleMm: number;
  print: Verdict;
  fax: Verdict;
  lines: ScanLine[];
}

const mm = (n: number) => `${n.toFixed(2)} mm`;

/** The smallest whole size (mm) that gives a module of at least {@code target} mm, or null past the largest size. */
export function sizeFor(target: number, across: number): number | null {
  const need = Math.max(QR_MIN_MM, Math.ceil(target * across - 1e-9));
  return need <= QR_MAX_MM ? need : null;
}

/** How a module of this width prints. */
export function printVerdict(moduleMm: number): Verdict {
  return moduleMm >= PRINT_OK_MM - 1e-9 ? 'ok' : moduleMm >= PRINT_MIN_MM - 1e-9 ? 'marginal' : 'poor';
}

/** How a module of this width comes through a fax. */
export function faxVerdict(moduleMm: number): Verdict {
  return moduleMm >= FAX_OK_MM - 1e-9 ? 'ok' : 'poor';
}

export function scanCheck(content: string, level: EcLevel, sizeMm: number, quietZone: number): ScanCheck {
  const length = Array.from(content).length;
  const fit = content ? qrFit(content, level) : null;
  if (!fit) {
    const why = content ? `${length} characters do not fit in a QR code at level ${level}: shorten the content or lower the error correction.`
      : 'Nothing to encode yet.';
    return { fit, length, across: 0, moduleMm: 0, print: 'poor', fax: 'poor', lines: [{ verdict: 'poor', text: why }] };
  }
  const across = fit.modules + 2 * quietZone;
  const moduleMm = sizeMm / across;
  const print = printVerdict(moduleMm);
  const fax = faxVerdict(moduleMm);
  const lines: ScanLine[] = [];
  const grow = (target: number) => {
    const s = sizeFor(target, across);
    return s === null ? 'even 100 mm is not enough: shorten the content or lower the error correction' : `make it ${s} mm or more`;
  };
  lines.push(print === 'ok' ? { verdict: 'ok', text: `Readable when printed: ${mm(moduleMm)} a module` }
    : print === 'marginal' ? { verdict: 'marginal', text: `Marginal when printed: ${mm(moduleMm)} a module (${PRINT_OK_MM} mm is safe); ${grow(PRINT_OK_MM)}` }
    : { verdict: 'poor', text: `Too small to scan when printed: ${mm(moduleMm)} a module; ${grow(PRINT_OK_MM)}` });
  lines.push(fax === 'ok' ? { verdict: 'ok', text: `Readable as a fax: ${mm(moduleMm)} a module (a fax needs ${FAX_OK_MM} mm)` }
    : { verdict: 'poor', text: `Not readable as a fax (needs ${FAX_OK_MM} mm a module); ${grow(FAX_OK_MM)}` });
  if (quietZone < 2) {
    lines.push({ verdict: 'marginal', text: `A quiet zone of ${quietZone} module${quietZone === 1 ? '' : 's'}: scanners need 4 (2 reads with most)` });
  }
  return { fit, length, across, moduleMm, print, fax, lines };
}

/** The words for an error-correction level: how much of the code may be damaged and still read. */
export const LEVEL_HINTS: Record<EcLevel, string> = {
  L: 'L reads when up to 7% is damaged: the smallest code, for clean screens and paper.',
  M: 'M reads when up to 15% is damaged: the usual choice for printed reports.',
  Q: 'Q reads when up to 25% is damaged: for paper that is handled a lot.',
  H: 'H reads when up to 30% is damaged: creased paper, a stamp over it, a fax.',
};

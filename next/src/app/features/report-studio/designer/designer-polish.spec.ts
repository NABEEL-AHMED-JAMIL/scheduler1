import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Problem } from '../report-studio.model';
import { Block, PaletteEntry, blockLabel } from './designer-model';
import { dataCodewords, encodeQr, qrFit, qrMode } from './qr-encoder';
import {
  FAX_OK_MM, PRINT_MIN_MM, PRINT_OK_MM, SAMPLE_REPORT_LABEL, faxVerdict, printVerdict, qrAudience, qrSample, scanCheck, sizeFor, verifyLinkSample,
} from './qr-check';
import { QrInspector, qrPath } from './qr-inspector';
import { PALETTE_GROUPS, groupPalette } from './palette';
import { DataProblems, dataProblems, isDataProblem } from './data-problems';
import { FAX_FILTER_ID, ShowAsSwitch, faxInk, faxTone, frameCss, paperFilter, showAsNote } from './show-as';
import { PropertiesPanel, qrFieldShown } from './properties';

/** Reports redesign, Designer: the compact palette, the data problems over the canvas, the QR inspector and Show as. */

const ORIGIN = 'https://console.riverside-health.example';
/** A short public code of the length the redesign proposes (44 characters). */
const SHORT = 'https://r.riverside-health.example/7KQ2-M9XD';

describe('the QR scan check: version and modules for a content and level', () => {
  it('picks the mode media-service (zxing) picks', () => {
    expect(qrMode('0123456789')).toBe('numeric');
    expect(qrMode('RPT-0001 V1')).toBe('alphanumeric');
    expect(qrMode('https://r.example/x')).toBe('byte');           // lower case is not alphanumeric
    expect(qrMode(SAMPLE_REPORT_LABEL)).toBe('byte');               // the middle dot is beyond ASCII
  });

  it('finds the version as the standard capacities say', () => {
    // Byte mode: version 1 holds 17 bytes at L and 7 at H; version 10 holds 119 at H, version 9 98.
    expect(qrFit('a'.repeat(17), 'L')?.version).toBe(1);
    expect(qrFit('a'.repeat(18), 'L')?.version).toBe(2);
    expect(qrFit('a'.repeat(7), 'H')?.version).toBe(1);
    expect(qrFit('a'.repeat(8), 'H')?.version).toBe(2);
    expect(qrFit('a'.repeat(98), 'H')?.version).toBe(9);
    expect(qrFit('a'.repeat(99), 'H')?.version).toBe(10);
    expect(qrFit('a'.repeat(119), 'H')?.version).toBe(10);
    // Numeric and alphanumeric pack more: 41 digits or 25 QR characters in version 1 at L.
    expect(qrFit('1'.repeat(41), 'L')?.version).toBe(1);
    expect(qrFit('1'.repeat(42), 'L')?.version).toBe(2);
    expect(qrFit('A'.repeat(25), 'L')?.version).toBe(1);
    expect(qrFit('A'.repeat(26), 'L')?.version).toBe(2);
    expect(dataCodewords(40, 'L')).toBe(2956);
    expect(qrFit('a'.repeat(3000), 'L')).toBeNull();
  });

  it('measures today\'s verify link and a short public code as the redesign notes say', () => {
    const link = verifyLinkSample(ORIGIN);
    expect(link).toBe(`${ORIGIN}/reports/library/01JBQ7RZ4K8M2N6P9T3V5W7X9Y?version=1&verify=1`);
    expect(link.length).toBe(102);
    const today = qrFit(link, 'H')!;
    expect([today.version, today.modules]).toEqual([10, 57]);
    expect(SHORT.length).toBe(44);
    const short = qrFit(SHORT, 'H')!;
    expect([short.version, short.modules]).toEqual([5, 37]);
    // A report number with its middle dot goes as UTF-8 with its ECI marker: 12 bits more.
    const label = qrFit(SAMPLE_REPORT_LABEL, 'M')!;
    expect(label.eci).toBe(true);
    expect(label.bits).toBe(4 + 12 + 8 + 8 * 14);
  });

  it('draws a code with its finder patterns, timing and size', () => {
    const q = encodeQr(SHORT, 'H')!;
    expect(q.dark.length).toBe(37);
    const finder = (x0: number, y0: number) => [0, 1, 2, 3, 4, 5, 6].map(y => [0, 1, 2, 3, 4, 5, 6]
      .map(x => (q.dark[y0 + y][x0 + x] ? '1' : '0')).join(''));
    const expected = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
    expect(finder(0, 0)).toEqual(expected);
    expect(finder(30, 0)).toEqual(expected);
    expect(finder(0, 30)).toEqual(expected);
    expect(q.dark[6].slice(8, 29).map(d => (d ? 1 : 0)).join('')).toBe('101010101010101010101');
    expect(q.dark[29][8]).toBe(true);                                   // the dark module
    expect(qrPath([[true, true, false, true]], 4)).toBe('M4 4h2v1h-2zM7 4h1v1h-1z');
  });

  it('works out the module size at the chosen size, quiet zone included, as media draws it', () => {
    const short = scanCheck(SHORT, 'H', 18, 4);
    expect(short.across).toBe(45);                                      // 37 modules and 4 a side
    expect(short.moduleMm).toBeCloseTo(0.4, 5);
    expect(short.print).toBe('ok');
    expect(short.fax).toBe('poor');
    expect(short.lines.map(l => l.text)).toEqual([
      'Readable when printed: 0.40 mm a module',
      'Not readable as a fax (needs 0.5 mm a module); make it 23 mm or more',
    ]);
    const today = scanCheck(verifyLinkSample(ORIGIN), 'H', 18, 4);
    expect(today.across).toBe(65);
    expect(today.print).toBe('marginal');
    expect(today.lines[0].text).toBe('Marginal when printed: 0.28 mm a module (0.33 mm is safe); make it 22 mm or more');
    const big = scanCheck(verifyLinkSample(ORIGIN), 'H', 40, 4);
    expect([big.print, big.fax]).toEqual(['ok', 'ok']);
    expect(big.lines[1].text).toBe('Readable as a fax: 0.62 mm a module (a fax needs 0.5 mm)');
  });

  it('says marginal from 0.25 mm, too small below it, and fax only from 0.5 mm', () => {
    expect(printVerdict(PRINT_OK_MM)).toBe('ok');
    expect(printVerdict(0.329)).toBe('marginal');
    expect(printVerdict(PRINT_MIN_MM)).toBe('marginal');
    expect(printVerdict(0.249)).toBe('poor');
    expect(faxVerdict(FAX_OK_MM)).toBe('ok');
    expect(faxVerdict(0.499)).toBe('poor');
    expect(sizeFor(0.5, 45)).toBe(23);
    expect(sizeFor(0.33, 20)).toBe(10);                                 // never under the smallest size
    expect(sizeFor(0.5, 230)).toBeNull();                               // past 100 mm
    const tiny = scanCheck('a'.repeat(400), 'H', 10, 4);
    expect(tiny.print).toBe('poor');
    expect(tiny.lines[0].text).toMatch(/^Too small to scan when printed: 0\.\d\d mm a module; make it \d+ mm or more$/);
  });

  it('warns about a thin quiet zone and a content that does not fit', () => {
    expect(scanCheck('RPT-0001', 'M', 25, 1).lines.at(-1)?.text).toBe('A quiet zone of 1 module: scanners need 4 (2 reads with most)');
    expect(scanCheck('RPT-0001', 'M', 25, 2).lines.length).toBe(2);
    const long = scanCheck('a'.repeat(3000), 'H', 25, 4);
    expect(long.fit).toBeNull();
    expect(long.lines[0].text).toBe('3000 characters do not fit in a QR code at level H: shorten the content or lower the error correction.');
    expect(scanCheck('', 'M', 25, 4).lines[0].text).toBe('Nothing to encode yet.');
  });

  it('measures the content the server would encode for each source', () => {
    const qr = (extra: Record<string, unknown>): Block => ({ id: 'qr', type: 'qrCode', ...extra });
    expect(qrSample(qr({}), ORIGIN, undefined, ['primary']).text).toBe(verifyLinkSample(ORIGIN));
    expect(qrSample(qr({ content: 'reportId' }), ORIGIN, undefined, ['primary']).text).toBe('RPT-0001 · v1');
    const visit = { visit: { reference: 'V-2026-0915-0042' } };
    expect(qrSample(qr({ content: 'binding', binding: 'primary.visit.reference' }), ORIGIN, visit, ['primary']).text).toBe('V-2026-0915-0042');
    expect(qrSample(qr({ content: 'binding', binding: 'primary.visit.missing' }), ORIGIN, visit, ['primary']).text).toBe('preview');
    // Inside "Repeat for each", the item's name reads the repeated list's first item, as the canvas draws it.
    const each: Block = { id: 'each-code', type: 'qrCode', content: 'binding', binding: 'v.visitRef' };
    const tree: Block[] = [{ id: 'visits', type: 'repeat', dataset: 'primary.visits', as: 'v', children: [{ id: 'row', type: 'section', children: [each] }] }];
    const visits = { visits: [{ visitRef: 'VIS-2026-10-101' }, { visitRef: 'VIS-2026-10-102' }] };
    expect(qrSample(each, ORIGIN, visits, ['primary'], tree).text).toBe('VIS-2026-10-101');
    expect(qrSample(each, ORIGIN, visits, ['primary']).text).toBe('preview');
    const text = qrSample(qr({ content: 'text', text: 'Ward {{primary.ward}}' }), ORIGIN, undefined, ['primary']);
    expect(text.text).toBe('Ward {{primary.ward}}');
    expect(text.note).toContain('the length can change');
    expect(qrSample(qr({ content: 'text' }), ORIGIN, undefined, ['primary']).text).toBe('');
    // A QR block is named by its caption, never by what it opens ("binding", "verifyLink").
    expect(blockLabel(qr({ content: 'binding', caption: 'Visit {{v.visitRef}}' }))).toBe('Visit {{v.visitRef}}');
    expect(blockLabel(qr({ content: 'verifyLink' }))).toBe('QR code');
    expect(qrAudience('verifyLink')).toContain('Signed-in members');
    expect(qrAudience('binding')).toContain('Never encode a patient');
  });
});

describe('the QR inspector', () => {
  function inspector(block: Block, readonly = false) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [QrInspector] });
    const fixture = TestBed.createComponent(QrInspector);
    fixture.componentRef.setInput('block', block);
    fixture.componentRef.setInput('readonly', readonly);
    fixture.componentRef.setInput('origin', ORIGIN);
    const changes: { key: string; value: unknown }[] = [];
    fixture.componentInstance.changed.subscribe(c => changes.push(c));
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, changes };
  }

  it('draws the code at its real size with its version, and the scan check', () => {
    const { el } = inspector({ id: 'qr', type: 'qrCode', content: 'verifyLink', sizeMm: 18, errorCorrection: 'H' });
    const svg = el.querySelector('svg.qri-svg') as SVGElement;
    expect(svg.style.width).toBe('18mm');
    expect(svg.getAttribute('viewBox')).toBe('0 0 65 65');
    expect(el.querySelector('[data-qr-fit]')?.textContent?.trim()).toBe('102 characters · version 10 at H · 57 × 57 modules');
    const lines = Array.from(el.querySelectorAll('[data-scan-check] li')).map(l => l.textContent?.trim());
    expect(lines[0]).toContain('Marginal when printed');
    expect(el.textContent).toContain('Signed-in members of this workspace only');
  });

  it('sets what it opens, the level and the size; read only, it changes nothing', () => {
    const { el, changes } = inspector({ id: 'qr', type: 'qrCode' });
    (Array.from(el.querySelectorAll('[role="radio"]')).find(b => b.textContent?.includes('Report number')) as HTMLButtonElement).click();
    (Array.from(el.querySelectorAll('.seg-btn')).find(b => b.textContent?.trim() === 'H') as HTMLButtonElement).click();
    const range = el.querySelector('input[type="range"]') as HTMLInputElement;
    range.value = '30';
    range.dispatchEvent(new Event('input'));
    expect(changes).toEqual([{ key: 'content', value: 'reportId' }, { key: 'errorCorrection', value: 'H' }, { key: 'sizeMm', value: 30 }]);
    const ro = inspector({ id: 'qr', type: 'qrCode' }, true);
    expect((ro.el.querySelector('[role="radio"]') as HTMLButtonElement).disabled).toBe(true);
    ro.fixture.componentInstance.set('content', 'text');
    expect(ro.changes).toEqual([]);
  });

  it('leaves the source, size and level to the inspector in the properties panel', () => {
    const verify: Block = { id: 'qr', type: 'qrCode', content: 'verifyLink' };
    expect(['content', 'sizeMm', 'errorCorrection', 'quietZone', 'text', 'binding'].filter(k => qrFieldShown(k, verify))).toEqual([]);
    expect(qrFieldShown('caption', verify)).toBe(true);
    expect(qrFieldShown('text', { ...verify, content: 'text' })).toBe(true);
    expect(qrFieldShown('binding', { ...verify, content: 'binding' })).toBe(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [PropertiesPanel] });
    const fixture = TestBed.createComponent(PropertiesPanel);
    fixture.componentRef.setInput('definitions', { qrCodeComponent: { properties: { id: {}, type: {}, content: { enum: ['verifyLink', 'reportId', 'binding', 'text'] },
      sizeMm: { type: 'number', minimum: 10, maximum: 100 }, errorCorrection: { enum: ['L', 'M', 'Q', 'H'] }, caption: { type: 'string', maxLength: 80 } } } });
    fixture.componentRef.setInput('block', verify);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-rs-qr-inspector')).not.toBeNull();
    expect(el.querySelector('select[aria-label="Error correction"]')).toBeNull();
    expect(el.querySelector('[aria-label="Caption"]')).not.toBeNull();
  });
});

describe('the compact palette', () => {
  const entry = (type: string, group: string, label: string, description = ''): PaletteEntry => ({ type, group, label, description, defaults: {} });
  const registry = [
    entry('heading', 'Text', 'Heading'), entry('text', 'Text', 'Text'), entry('table', 'Data', 'Table', 'Rows of a list'),
    entry('qrCode', 'Metadata', 'QR code'), entry('confidentiality', 'Metadata', 'Confidentiality'), entry('stamp', 'Approval', 'Stamp'),
    entry('approverSignature', 'Approval', "Approver's signature"), entry('signature', 'Approval', 'Signature (fixed person)'),
    entry('section', 'Layout', 'Section'), entry('column', 'Layout', 'Column'), entry('pageBreak', 'Page', 'Page break'),
    entry('image', 'Media', 'Image or logo'), entry('image', 'Media', 'Image from data'), entry('pageNumber', 'Metadata', 'Page number'),
    entry('timeline', 'Charts', 'Timeline'),
  ];

  it('puts the signatures, QR code, confidentiality and stamp first, in "Clinical & compliance"', () => {
    const groups = groupPalette(registry, '');
    expect(groups.map(g => g.group)).toEqual(['Clinical & compliance', 'Text', 'Data', 'Layout', 'Images and page facts', 'Charts']);
    expect(groups[0].entries.map(e => e.label)).toEqual(["Approver's signature", 'Signature (fixed person)', 'QR code', 'Confidentiality', 'Stamp']);
    expect(groups[4].entries.map(e => e.label)).toEqual(['Image or logo', 'Image from data', 'Page number']);
    // The page parts and a row's column are added elsewhere.
    expect(groups.flatMap(g => g.entries).some(e => e.type === 'pageBreak' || e.type === 'column')).toBe(false);
    expect(PALETTE_GROUPS[0].group).toBe('Clinical & compliance');
  });

  it('finds by name or description and drops empty groups', () => {
    expect(groupPalette(registry, 'rows').map(g => g.group)).toEqual(['Data']);
    expect(groupPalette(registry, '  QR ').flatMap(g => g.entries.map(e => e.label))).toEqual(['QR code']);
    expect(groupPalette(registry, 'nothing like it')).toEqual([]);
  });
});

describe('the data problems over the canvas', () => {
  const blocks: Block[] = [{ id: 'gallery', type: 'imageGrid', name: 'Wound photographs' }, { id: 'visits', type: 'table', dataset: 'primary.visits' }];
  const problems: Problem[] = [
    { severity: 'WARNING', stage: 'BINDINGS', code: 'EMPTY_TABLE', message: 'The table has no rows in this data; it shows its empty text.', componentId: 'visits', path: 'primary.visits' },
    { severity: 'ERROR', stage: 'BINDINGS', code: 'BINDING_NOT_RESOLVED', message: "'primary.gallery' is not in this data.", componentId: 'gallery', path: 'primary.gallery' },
    { severity: 'WARNING', stage: 'LAYOUT', code: 'FONT_SUBSTITUTED', message: 'A font was replaced.' },
    { severity: 'ERROR', stage: 'DATA_CONTRACT', code: 'REQUIRED_FIELD_MISSING', message: "'visit_date' is required.", path: 'visit_date' },
  ];

  it('lists what, which field, which block and what to do, blocking ones first', () => {
    expect(problems.map(isDataProblem)).toEqual([true, true, false, true]);
    const rows = dataProblems(problems, blocks);
    expect(rows.map(r => r.title)).toEqual(['A field is not in the data', 'Required field missing', 'A table has no rows']);
    expect(rows[0]).toMatchObject({ field: 'primary.gallery', componentId: 'gallery', component: 'Wound photographs · Image grid' });
    expect(rows[0].todo).toContain('Pick a field the test data has');
    expect(rows[1]).toMatchObject({ componentId: null, component: null, field: 'visit_date' });
    expect(rows[1].todo).toContain('data contract');
  });

  it('selects the block when its row is clicked, and folds away', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [DataProblems] });
    const fixture = TestBed.createComponent(DataProblems);
    fixture.componentRef.setInput('problems', problems);
    fixture.componentRef.setInput('blocks', blocks);
    const picked: string[] = [];
    fixture.componentInstance.selected.subscribe(id => picked.push(id));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent?.trim()).toBe('3 problems with the test data: a report cannot be made with it');
    (el.querySelector('button.dpr-row') as HTMLButtonElement).click();
    expect(picked).toEqual(['gallery']);
    expect(el.querySelectorAll('button.dpr-row').length).toBe(2);       // the contract's field has no block to select
    (Array.from(el.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Hide') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.dpr-row').length).toBe(0);
  });
});

describe('Show as Screen, Print or Fax', () => {
  it('prints a colour black, white or a grey by its luminance, as the fax filter does', () => {
    expect(faxInk('#000000')).toBe('black');
    expect(faxInk('#FFFFFF')).toBe('white');
    expect(faxInk('#DC2626')).toBe('black');     // a red flag survives
    expect(faxInk('#F59E0B')).toBe('white');     // an amber one vanishes: colour alone carried it
    expect(faxInk('#D1D5DB')).toBe('white');     // a light grey rule vanishes
    expect(faxInk('#9CA3AF')).toBe('white');     // and light grey text
    expect(faxInk('#6B7280')).toBe('grey');      // a mid grey is at risk
    expect(faxTone('#6B7280')).toBeCloseTo(0.28, 2);
    expect(faxInk('#374151')).toBe('black');
  });

  it('filters the page only in fax mode, and leaves out what the data hides when printed or faxed', () => {
    expect(paperFilter('screen')).toBeNull();
    expect(paperFilter('print')).toBeNull();
    expect(paperFilter('fax')).toBe(`url(#${FAX_FILTER_ID})`);
    expect(frameCss('screen')).toBe('');
    expect(frameCss('print')).toContain('.rs-canvas-hidden { display: none !important; }');
    expect(frameCss('fax')).toBe(frameCss('print'));
    expect(showAsNote('screen')).toBeNull();
    expect(showAsNote('fax')).toContain('light colours print white and dark ones black');
  });

  it('switches the mode and carries the black-and-white filter', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ShowAsSwitch] });
    const fixture = TestBed.createComponent(ShowAsSwitch);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    (Array.from(el.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Fax (black and white)') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.mode()).toBe('fax');
    expect(el.querySelector('[aria-pressed="true"]')?.textContent?.trim()).toBe('Fax (black and white)');
    const filter = el.querySelector(`filter#${FAX_FILTER_ID}`)!;
    expect(filter.getAttribute('color-interpolation-filters')).toBe('sRGB');
    expect(filter.querySelector('feColorMatrix')?.getAttribute('values')?.split(' ').length).toBe(20);
    expect(Array.from(filter.querySelectorAll('feFuncR, feFuncG, feFuncB')).map(f => [f.getAttribute('type'), f.getAttribute('slope'), f.getAttribute('intercept')]))
      .toEqual([['linear', '4', '-1.5'], ['linear', '4', '-1.5'], ['linear', '4', '-1.5']]);
  });
});

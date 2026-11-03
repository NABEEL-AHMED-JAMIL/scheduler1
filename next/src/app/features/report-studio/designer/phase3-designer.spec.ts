import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BarcodeMeasure } from '../report-studio.model';
import { BarcodeInspector, barcodeCheck, personalField } from './barcode-inspector';
import { Block } from './designer-model';
import { pageLabels } from './outline-panel';
import { PALETTE_GROUPS } from './palette';
import { barcodeFieldShown } from './properties';

/**
 * Reports redesign, phase 3 in the designer: the barcode inspector's scan check from what the server drew and its warning
 * for a patient's own data, the Outline's pages, and where the new components sit in the palette.
 */

const drawn: BarcodeMeasure = { symbology: 'code128', length: 15, modulesAcross: 198, rows: 1, moduleMm: 0.33, widthMm: 65.34, heightMm: 12, quietZone: 10,
  text: 'ACC-2026-104417' };

describe('barcode inspector', () => {
  it('warns about a field that looks like a patient\'s own data, and not about a reference', () => {
    expect(personalField('primary.patient.mrn')).toBe('the field mrn');
    expect(personalField('item.date_of_birth')).toBe('the field date_of_birth');
    expect(personalField('primary.patient.ref')).toBe('the patient\'s ref');
    expect(personalField('primary.visit.accession')).toBeNull();
    expect(personalField('primary.specimen')).toBeNull();
  });

  it('checks the module as drawn: printed, faxed, narrowed to fit, short bars', () => {
    expect(barcodeCheck(drawn, 0.33).map(l => l.verdict)).toEqual(['ok', 'poor']);
    expect(barcodeCheck({ ...drawn, heightMm: 8 }, 0.33)[2].text).toContain('Short bars: 8 mm for a 65 mm wide code');
    expect(barcodeCheck({ ...drawn, moduleMm: 0.5, widthMm: 99, heightMm: 15 }, 0.5).map(l => l.verdict)).toEqual(['ok', 'ok']);
    const narrowed = barcodeCheck({ ...drawn, moduleMm: 0.269 }, 0.33);
    expect(narrowed[0].text).toContain('Narrowed to 0.269 mm');
    expect(narrowed[1].verdict).toBe('marginal');
    expect(barcodeCheck(undefined, 0.33)[0].text).toContain('Not drawn yet');
  });

  it('draws the scan check and the warning, and Code 128 offers no link', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(BarcodeInspector);
    fixture.componentRef.setInput('block', { id: 'b', type: 'barcode', symbology: 'code128', content: 'binding', binding: 'primary.patient.mrn' } as Block);
    fixture.componentRef.setInput('measure', drawn);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-barcode-personal]')?.textContent).toContain('the field mrn');
    expect(el.querySelector('[data-barcode-size]')?.textContent).toContain('65.3 × 12.0 mm · 198 modules across');
    expect(el.querySelector('[data-scan-check]')?.textContent).toContain('Readable when printed: 0.33 mm a module');
    const link = Array.from(el.querySelectorAll<HTMLButtonElement>('[role=radio]')).find(b => b.textContent?.includes('Verify this report'));
    expect(link?.disabled).toBe(true);
    const changes: unknown[] = [];
    fixture.componentInstance.changed.subscribe(c => changes.push(c));
    fixture.componentRef.setInput('block', { id: 'b', type: 'barcode', symbology: 'dataMatrix', content: 'verifyLink' } as Block);
    fixture.componentInstance.setSymbology('code128');
    expect(changes).toEqual([{ key: 'symbology', value: 'code128' }, { key: 'content', value: 'verifyCode' }]);
  });

  it('leaves to the inspector what it draws, and shows the text and the field only for their source', () => {
    const b = { id: 'b', type: 'barcode', content: 'binding' } as Block;
    expect(['symbology', 'content', 'moduleMm', 'heightMm'].some(k => barcodeFieldShown(k, b))).toBe(false);
    expect(barcodeFieldShown('binding', b)).toBe(true);
    expect(barcodeFieldShown('text', b)).toBe(false);
    expect(barcodeFieldShown('showText', { ...b, symbology: 'pdf417' })).toBe(false);
    expect(barcodeFieldShown('caption', b)).toBe(true);
  });
});

describe('outline', () => {
  const blocks: Block[] = [
    { id: 'hdr', type: 'section', role: 'header', children: [{ id: 'logo', type: 'image' }] },
    { id: 'title', type: 'heading', level: 1, content: 'Wound assessment report' },
    { id: 'toc', type: 'contents' },
    { id: 'row', type: 'row', children: [{ id: 'c1', type: 'column', children: [{ id: 'chart', type: 'chart', title: 'Area over six visits' }] }] },
    { id: 'old', type: 'table', title: 'Old visits', hidden: true },
    { id: 'gone', type: 'table', title: 'Infection flags' },
  ];

  it('says the page each block starts on, the header and footer on every page', () => {
    const at = pageLabels(blocks, { title: 1, toc: 1, row: 2, c1: 2, chart: 2 })!;
    expect(at).toEqual({ hdr: 'every page', logo: 'every page', title: 'p. 1', toc: 'p. 1', row: 'p. 2', c1: 'p. 2', chart: 'p. 2', old: 'hidden',
      gone: 'not shown' });
  });

  it('says nothing about pages before they are counted', () => {
    expect(pageLabels(blocks, null)).toBeNull();
  });
});

describe('palette', () => {
  it('puts Barcode and Contents with the clinical blocks, the range bar with the data', () => {
    expect(PALETTE_GROUPS[0].types).toEqual(expect.arrayContaining(['barcode', 'contents', 'qrCode']));
    expect(PALETTE_GROUPS.find(g => g.group === 'Data')?.types).toContain('rangeBar');
  });
});

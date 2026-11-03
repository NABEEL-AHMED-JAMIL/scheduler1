import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from '../../core/api/api.config';
import { ReportLibraryApi, stateChip, stateTone } from './report-library.api';
import { reportStages, findQr, daysAgo } from './report-stages';
import { nextZoom, pagesWith } from './report-viewer';
import { crc32, uniqueName, zipStore } from './zip-store';
import { bars } from './library-explorer';
import { lastDays, sparkPoints, topCategories, trendWords } from './overview';
import { ReportVersionRow } from './report-studio.model';

/**
 * Reports redesign (owner 2026-11-02, "build all"; designs in .claude-tools/out/designs/reports): the report page's life
 * cycle, viewer and QR, the library's explorer (its bars, chips and calls) and ZIP, and the overview's figures.
 */
const version = (over: Partial<ReportVersionRow> = {}): ReportVersionRow => ({
  versionId: 'V2', reportId: 'R1', version: 2, templateVersion: 2, snapshotId: 'S', jobId: 'J', outputs: [{ format: 'PDF' }], diagnostics: [],
  createdAt: '2026-10-24T19:02:00Z', pages: 3, jobMs: 2100, ...over,
} as ReportVersionRow);
const now = Date.parse('2026-11-02T18:00:00Z');

describe('the report page -- life cycle', () => {
  it('a version nobody asked about: generated, checked, approval not asked, no delivery', () => {
    const s = reportStages(version(), ms => `${ms / 1000} s`, now);
    expect(s.map(x => [x.key, x.state])).toEqual([['generated', 'done'], ['checked', 'done'], ['approval', 'todo'], ['delivered', 'todo']]);
    expect(s[0].detail).toContain('2.1 s');
    expect(s[0].detail).toContain('3 pages');
    expect(s[1].detail).toBe('no problems');
  });

  it('two approvals: the first done with who, the second now, waiting since it was asked', () => {
    const s = reportStages(version({ review: { state: 'OPEN', needsSecond: true, requestedAt: '2026-10-24T19:40:00Z',
      firstApproval: { by: 7, byName: 'Alex Morgan, RN', at: '2026-10-24T19:40:00Z' } } as never }), String, now);
    expect(s.map(x => [x.key, x.state])).toEqual([['generated', 'done'], ['checked', 'done'], ['first', 'done'], ['second', 'now'], ['delivered', 'todo']]);
    expect(s[2].detail).toContain('Alex Morgan, RN');
    expect(s[3].detail).toBe('waiting · asked 8 days ago');
  });

  it('warnings and a void version say so', () => {
    const s = reportStages(version({ diagnostics: [{}, {}] as never, void: { reason: 'wrong measurement', by: 'Alex Morgan' } }), String, now);
    expect(s[1]).toEqual(expect.objectContaining({ state: 'warn', detail: '2 warnings when it was made' }));
    expect(s[2]).toEqual(expect.objectContaining({ label: 'Void', detail: 'Alex Morgan: wrong measurement' }));
  });

  it('an approval signed: one step with the approver', () => {
    const s = reportStages(version({ approval: { signed: true, approverName: 'Priya Raman, MD', approvedAt: '2026-10-25T10:00:00Z' } as never }), String, now);
    expect(s[2]).toEqual(expect.objectContaining({ key: 'approval', label: 'Approved and signed', state: 'done' }));
  });

  it('days ago in words', () => {
    expect(daysAgo('2026-11-02T10:00:00Z', now)).toBe('today');
    expect(daysAgo('2026-11-01T10:00:00Z', now)).toBe('1 day ago');
    expect(daysAgo(null, now)).toBe('');
  });

  it('finds the QR code a template prints, in the footer too', () => {
    expect(findQr({ pages: [{ footer: [{ type: 'text' }, { type: 'qrCode', content: 'verifyLink', sizeMm: 18 }] }] }))
      .toEqual({ content: 'verifyLink', sizeMm: 18 });
    expect(findQr({ body: [{ type: 'table' }] })).toBeNull();
  });
});

describe('the report viewer', () => {
  it('zooms in steps and stops at the ends', () => {
    expect(nextZoom(1, 1)).toBe(1.1);
    expect(nextZoom(1, -1)).toBe(0.9);
    expect(nextZoom(0.87, 1)).toBe(0.9);
    expect(nextZoom(3, 1)).toBe(3);
    expect(nextZoom(0.5, -1)).toBe(0.5);
  });

  it('finds the pages holding the words, case-blind, spaces folded', () => {
    const pages = ['Wound assessment report', 'P-1077  Right plantar forefoot', 'Approval: Alex Morgan'];
    expect(pagesWith(pages, 'plantar   FOREFOOT')).toEqual([2]);
    expect(pagesWith(pages, 'a')).toEqual([1, 2, 3]);
    expect(pagesWith(pages, '  ')).toEqual([]);
  });
});

describe('the library -- ZIP, bars and chips', () => {
  it('CRC-32 is the standard one', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
  });

  it('names are unique and safe in the archive', () => {
    const taken = new Set<string>();
    expect(uniqueName('RPT-0002 Wound/report.pdf', taken)).toBe('RPT-0002 Wound_report.pdf');
    expect(uniqueName('RPT-0002 Wound/report.pdf', taken)).toBe('RPT-0002 Wound_report (2).pdf');
  });

  it('a stored ZIP holds each file byte for byte', async () => {
    const a = new TextEncoder().encode('%PDF-1.7 a');
    const blob = zipStore([{ name: 'a.pdf', bytes: a }, { name: 'a.pdf', bytes: a }], new Date(2026, 10, 2, 14, 0, 0));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(14, true)).toBe(crc32(a));
    expect(new TextDecoder().decode(bytes.slice(30, 35))).toBe('a.pdf');
    expect(new TextDecoder().decode(bytes.slice(35, 35 + a.length))).toBe('%PDF-1.7 a');
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    expect(new TextDecoder().decode(bytes)).toContain('a (2).pdf');
  });

  it('one bar a day over the range, stacked in state order, empty days kept', () => {
    const b = bars([{ day: '2026-10-30', READY: 2, APPROVED: 1 }, { day: '2026-11-01', FAILED: 1 }], '2026-10-30', '2026-11-01');
    expect(b.map(x => [x.day, x.total])).toEqual([['2026-10-30', 3], ['2026-10-31', 0], ['2026-11-01', 1]]);
    expect(b[0].parts.map(p => p.state)).toEqual(['APPROVED', 'READY']);
  });

  it('a row\'s chip and tone say its state', () => {
    expect(stateChip({ state: 'WAITING', signed: false, needsSecond: true, firstApprovedBy: 7 })).toBe('2nd approval');
    expect(stateChip({ state: 'APPROVED', signed: true, needsSecond: false, firstApprovedBy: null })).toBe('Signed');
    expect(stateTone('FAILED')).toBe('crit');
    // A report with no version is never Ready: still being made, or its generation failed.
    expect(stateChip({ state: 'PENDING', signed: false, needsSecond: false, firstApprovedBy: null })).toBe('Generating');
  });

  it('browse sends each filter as a comma list, tests and the range only when set', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(ReportLibraryApi);
    const http = TestBed.inject(HttpTestingController);
    api.browse({ q: ' knee ', state: ['WAITING', 'READY'], approver: ['me'], tests: true, from: '2026-10-03', to: '2026-11-02', tz: 'America/Chicago',
      sort: 'madeAt', dir: 'desc', limit: 50, offset: 50 }, 1006).subscribe();
    const req = http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/browse`);
    const p = req.request.params;
    expect([p.get('q'), p.get('state'), p.get('approver'), p.get('tests'), p.get('from'), p.get('to'), p.get('sort'), p.get('dir'), p.get('offset'),
      p.get('tenantId'), p.get('templateId')]).toEqual(['knee', 'WAITING,READY', 'me', 'true', '2026-10-03', '2026-11-02', 'madeAt', 'desc', '50', '1006', null]);
    api.approveMany([{ reportId: 'R1', version: 2 }], 'RELEASE').subscribe();
    expect(http.expectOne(`${API_BASE}/reportApprove.json/approveMany`).request.body).toEqual({ items: [{ reportId: 'R1', version: 2 }], note: '', meaning: 'RELEASE' });
  });
});

describe('the overview -- figures', () => {
  it('30 days, oldest first, ending today', () => {
    const d = lastDays(30, new Date(2026, 10, 2));
    expect(d.length).toBe(30);
    expect(d[0]).toBe('2026-10-04');
    expect(d[29]).toBe('2026-11-02');
  });

  it('the sparkline spans the width, the highest day at the top', () => {
    expect(sparkPoints([0, 4, 2], 100, 10)).toBe('0.0,9.0 50.0,1.0 100.0,5.0');
    expect(sparkPoints([])).toBe('');
  });

  it('keeps the five biggest categories and folds the rest into Other', () => {
    const days = [{ day: 'd1', A: 9, B: 8, C: 7, D: 6, E: 5, F: 1, G: 1 }];
    expect(topCategories(days)).toEqual(['A', 'B', 'C', 'D', 'E', 'Other']);
    expect(topCategories([{ day: 'd', A: 1 }])).toEqual(['A']);
  });

  it('the trend against the 30 days before', () => {
    expect(trendWords(103, 87)).toBe('+18% on the 30 days before');
  });
});

describe('the public verify page (feature 1)', () => {
  it('says each state in words, never the report\'s contents', async () => {
    const { verdict, codeOf, shortPrint, sha256Hex } = await import('./verify/public-verify');
    expect(verdict({ state: 'GENUINE', issuer: 'Riverside Health', signed: true }).title).toBe('This report is genuine and current');
    expect(verdict({ state: 'REPLACED', newer: { version: 3, issuedAt: '26 Oct 2026, 10:00' } }).text).toContain('version 3 (26 Oct 2026, 10:00) replaces it');
    expect(verdict({ state: 'VOID', issuer: 'Riverside Health', voidedAt: '22 Oct 2026, 09:00' }).tone).toBe('crit');
    expect(verdict({ state: 'NOT_APPROVED' }).tone).toBe('warn');
    expect(verdict({ state: 'NOT_FOUND' }).title).toBe('Not found');
    expect(codeOf(' 7kq2m 9xd4p ')).toBe('7KQ2M-9XD4P');
    expect(codeOf('OIL00-00000')).toBe('01100-00000');
    expect(codeOf('UUUUU-UUUUU')).toBeNull();
    expect(shortPrint('7c419e0a52d3aaaa' + '0'.repeat(40) + '0b6fe1a2')).toBe('SHA-256 7c41 9e0a 52d3 aaaa … 0b6f e1a2');
    expect(await sha256Hex(new TextEncoder().encode('abc').buffer as ArrayBuffer))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('the report viewer\'s note (owner review 2026-11-03)', () => {
  it('never says signed before the approval', async () => {
    const { ReportPage } = await import('./report-page');
    const note = (v: Partial<ReportVersionRow>) => ReportPage.prototype.viewerNote.call(
      { hasPdf: () => true } as unknown as InstanceType<typeof ReportPage>, version(v));
    expect(note({})).toBe('will be signed when approved');
    expect(note({ approval: { signed: true, approvedAt: '2026-11-02T23:16:00Z' } as never })).toMatch(/^signed · \d{1,2} Nov 2026$/);
    expect(note({ approval: { signed: false } as never })).toBe('approved, not signed');
    expect(note({ void: { reason: 'x' } })).toBe('VOID copy');
  });
});

describe('the library after the owner\'s review (2026-11-03)', () => {
  it('does not repeat the template when the report\'s name already says it', async () => {
    const { namesTemplate } = await import('./library-explorer');
    expect(namesTemplate('Patient intake · S-1151', 'Patient intake summary')).toBe(true);
    expect(namesTemplate('MIG-326 load report 0412', 'MIG-326 load report')).toBe(true);
    expect(namesTemplate('Wound review · October 2026', 'Wound assessment report')).toBe(false);
    expect(namesTemplate('Pre-bill claims review · batch 7', 'Pre-bill claims review')).toBe(true);
  });

  it('dates the axis at about five evenly spaced days, first and last always', async () => {
    const { axisDays, dayWords } = await import('./library-histogram');
    const days = Array.from({ length: 30 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
    const ticks = axisDays(days);
    expect(ticks[0].day).toBe('2026-10-01');
    expect(ticks[ticks.length - 1].day).toBe('2026-10-30');
    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(dayWords('2026-10-21')).toBe('21 Oct');
  });

  it('says "All N on <day>" when every report falls on one day', async () => {
    const { LibraryHistogram } = await import('./library-histogram');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(LibraryHistogram);
    f.componentRef.setInput('bars', [
      { day: '2026-10-20', parts: [], total: 0 },
      { day: '2026-10-21', parts: [{ state: 'READY', n: 430 }, { state: 'FAILED', n: 3 }], total: 433 },
      { day: '2026-10-22', parts: [], total: 0 },
    ]);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-test=hist-one-day]')!.textContent!.replace(/\s+/g, ' ')).toContain('All 433 on 21 Oct');
    expect(el.querySelector('.lx-bars')).toBeNull();
    f.componentRef.setInput('bars', [
      { day: '2026-10-20', parts: [{ state: 'APPROVED', n: 2 }], total: 2 },
      { day: '2026-10-21', parts: [], total: 0 },
      { day: '2026-10-22', parts: [{ state: 'READY', n: 5 }], total: 5 },
    ]);
    f.detectChanges();
    expect(el.querySelector('.lx-top')!.textContent).toBe('5');
    expect(el.querySelectorAll('.lx-col.is-empty').length).toBe(1);
    expect([...el.querySelectorAll('.lx-legend .lx-leg')].map(x => x.textContent!.trim())).toEqual(['Approved and signed', 'Ready']);
  });
});

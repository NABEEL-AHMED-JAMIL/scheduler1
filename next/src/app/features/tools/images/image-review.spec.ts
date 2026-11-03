import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { ImageApi } from './image.api';
import { ImageAiApi } from './image-ai';
import { ImageList } from './image-list';
import { PhotoView } from './photo-view';
import { DEFAULT_IMAGE_LIMITS, PhotoSummary, fileProblem, listPill, pctText, sizeParts, stateAdvice, subLine, trendWords } from './image.model';

const ROW = (over: Partial<PhotoSummary> = {}): PhotoSummary => ({ photoId: 1002, title: 'SV-000117 · W1 left foot, plantar', fileName: 'wound-SV-000117-v3.jpg',
  status: 'MEASURED', descriptionStatus: 'DRAFT', patientRef: 'SV-000117', woundLabel: 'W1', bodyPart: 'foot', scaleFound: true, pxPerCm: 70,
  lengthCm: 3.0, widthCm: 1.9, areaCm2: 4.1, visit: 3, visits: 3, changePct: -37, sinceFirstPct: -56, hasPhoto: true, width: 1000, height: 760,
  takenAt: '2026-10-23T15:12:00Z', createdBy: 1015, ...over });

describe('Image review rules (owner-approved design 2026-11-03)', () => {
  it('says a size only with the ruler, never an estimate', () => {
    expect(sizeParts(ROW())).toEqual({ lw: '3.0 × 1.9 cm', area: '4.1 cm²' });
    expect(sizeParts(ROW({ status: 'NO_RULER', scaleFound: false, lengthCm: null, widthCm: null, areaCm2: null }))).toBeNull();
    expect(stateAdvice(ROW({ status: 'NO_RULER' }))!.lead).toBe('No ruler in this photo, so no size.');
    expect(listPill(ROW({ status: 'NO_RULER' }))).toEqual({ tone: 'warn', icon: 'alert', label: 'No size' });
  });

  it('names each state as the design does', () => {
    expect(listPill(ROW()).label).toBe('Confirm description');
    expect(listPill(ROW({ descriptionStatus: 'CONFIRMED' })).label).toBe('Confirmed');
    expect(listPill(ROW({ status: 'TOO_DARK' })).label).toBe('Too dark');
    expect(listPill(ROW({ status: 'REFUSED', refusalCode: 'TOO_LARGE' })).label).toBe('Too large');
    expect(listPill(ROW({ status: 'REFUSED', refusalCode: 'NOT_A_PHOTO' })).label).toBe('Upload failed');
    expect(stateAdvice(ROW({ status: 'REFUSED', refusalCode: 'NOT_A_PHOTO', fileName: 'wound_scan.pdf' }))!.text).toContain('Document Converter');
  });

  it('writes the change and the trend in plain words', () => {
    expect(pctText(-56)).toBe('−56%');
    expect(pctText(12)).toBe('+12%');
    expect(trendWords(-56)).toBe('area down 56%');
    expect(subLine(ROW())).toBe('visit 3 · wound-SV-000117-v3.jpg');
    expect(subLine(ROW({ visit: 2 }))).toBe('visit 2');
    expect(subLine(ROW({ status: 'REFUSED', fileSize: 31.8 * 1024 * 1024 }))).toBe('31.8 MB');
    expect(subLine(ROW({ status: 'REFUSED', fileSize: 50 }))).toBe('50 B');
    expect(subLine(ROW({ status: 'REFUSED', fileSize: 0 }))).toBe('');
  });

  it('holds the limits before a file is sent', () => {
    expect(fileProblem({ name: 'IMG_4471.heic', size: 31.8 * 1024 * 1024 }, DEFAULT_IMAGE_LIMITS)).toBe('31.8 MB; the limit is 25 MB');
    expect(fileProblem({ name: 'wound_scan.pdf', size: 1000 }, DEFAULT_IMAGE_LIMITS)).toContain('Not a photo');
    expect(fileProblem({ name: 'wound.JPG', size: 1000 }, DEFAULT_IMAGE_LIMITS)).toBeNull();
  });
});

function list(canChange = false) {
  TestBed.resetTestingModule();
  const api = {
    limits: () => of({ status: 'SUCCESS', data: { ...DEFAULT_IMAGE_LIMITS, types: [{ key: 'wound', name: 'Wound', measured: true }, { key: 'xray', name: 'X-ray', measured: false }] } }),
    list: vi.fn(() => of({ status: 'SUCCESS', data: { rows: [ROW({ imageType: 'wound', imageTypeName: 'Wound' }), ROW({ photoId: 1003, title: 'SV-000169 · W1 right heel', status: 'NO_RULER',
      scaleFound: false, lengthCm: null, widthCm: null, areaCm2: null, changePct: null, visit: 1, visits: 1 }),
      ROW({ photoId: 1004, title: 'P-1093 · left forearm', status: 'UNMEASURED', imageType: 'xray', imageTypeName: 'X-ray', typeSuggested: true, measuredType: false,
        lengthCm: null, widthCm: null, areaCm2: null, sinceFirstPct: null, changePct: null, visit: 1, visits: 1, patientRef: 'P-1093' })], total: 3, all: 3,
      facets: { type: { wound: 2, xray: 1 }, status: { measured: 1, unmeasured: 1, no_ruler: 1, to_confirm: 1, could_not_read: 0 }, site: { foot: 1, heel: 1 },
        patient: { 'SV-000117': 1, 'SV-000169': 1 }, by: { me: 2 } } } })),
    image: () => NEVER, one: () => NEVER, compare: () => NEVER,
  };
  TestBed.configureTestingModule({ providers: [
    provideRouter([]),
    { provide: ImageApi, useValue: api },
    { provide: ImageAiApi, useValue: { types: () => of({ status: 'SUCCESS', data: { types: [], canChange } }) } },
    { provide: Dialog, useValue: { open: vi.fn(() => ({ closed: of(undefined) })) } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } },
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
  ] });
  const fixture = TestBed.createComponent(ImageList);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, api, text: () => el.textContent!.replace(/\s+/g, ' ') };
}

describe('Image review list', () => {
  it('shows the size in code, the change and the facets with counts', () => {
    const { text, el } = list();
    expect(text()).toContain('3.0 × 1.9 cm · 4.1 cm²');
    expect(text()).toContain('−56%');
    expect(text()).not.toContain('−37%');
    expect(text()).toContain('No ruler: no size');
    expect(text()).toContain('location and camera details are removed on upload');
    expect(el.querySelector('[data-facet="status"]')!.textContent).toContain('Description to confirm');
    expect(el.querySelector('[data-facet="site"]')!.textContent).toContain('Heel');
    expect(el.querySelector('[data-facet="status"]')!.textContent).not.toContain('Could not read');
    expect(el.querySelector('[data-facet="by"]')!.textContent).not.toContain('Others');
  });

  it('shows the Image type facet and column, Description only, and the suggested badge', () => {
    const { el } = list();
    expect(el.querySelector('[data-facet="type"]')!.textContent).toContain('X-ray');
    const xray = el.querySelector('[data-photo-row="1004"]')!;
    expect(xray.querySelector('[data-test="row-type"]')!.textContent).toContain('X-ray');
    expect(xray.querySelector('[data-test="row-type"]')!.textContent).toContain('Suggested');
    expect(xray.textContent).toContain('Description only');
    expect(el.querySelector('[data-facet="status"]')!.textContent).toContain('Description only');
    expect([...el.querySelectorAll('[data-test="strip-type"] option')].map(o => o.textContent!.trim())).toEqual(['Choose, or let AI suggest', 'Wound', 'X-ray']);
    expect(el.querySelector('[data-test="open-types"]')).not.toBeNull();
  });

  it('shows AI settings only to someone who may change it', () => {
    expect(list(false).el.querySelector('[data-test="ai-settings"]')).toBeNull();
    expect(list(true).el.querySelector('[data-test="ai-settings"]')).not.toBeNull();
  });

  it('asks the server again with a facet picked', () => {
    const { el, api, fixture } = list();
    (el.querySelector('[data-facet="status"] [data-option="no_ruler"] input') as HTMLInputElement).dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: ['no_ruler'] }));
  });
});

describe('Photo view', () => {
  it('draws the outline, the ruler and the sizes in the photo\'s own pixels', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: ImageApi, useValue: { image: () => of(new Blob(['x'])) } }] });
    const fixture = TestBed.createComponent(PhotoView);
    fixture.componentRef.setInput('photoId', 7);
    fixture.componentRef.setInput('geometry', { width: 1000, height: 760, rulerBox: [64, 634, 796, 702], outline: [400, 300, 600, 300, 600, 340, 400, 340],
      lengthLine: [400, 320, 600, 320], widthLine: [500, 300, 500, 340] });
    fixture.componentRef.setInput('scaleFound', true);
    fixture.componentRef.setInput('pxPerCm', 70.2);
    fixture.componentRef.setInput('lengthCm', 3.0);
    fixture.componentRef.setInput('widthCm', 1.9);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 1000 760');
    expect(el.querySelector('path')!.getAttribute('d')).toBe('M400 300L600 300L600 340L400 340Z');
    expect(el.querySelector('[data-test="tag-ruler"]')!.textContent).toContain('Ruler found · 10 cm · 70.2 px/cm');
    expect(el.querySelector('[data-test="tag-length"]')!.textContent).toContain('L 3.0 cm');
    fixture.componentRef.setInput('scaleFound', false);
    fixture.componentRef.setInput('geometry', { width: 1000, height: 600, outline: [1, 1, 5, 1, 5, 5] });
    fixture.detectChanges();
    expect(el.querySelector('[data-test="tag-no-ruler"]')!.textContent).toContain('No ruler found: no size');
    expect(el.querySelector('[data-test="tag-length"]')).toBeNull();
  });
});

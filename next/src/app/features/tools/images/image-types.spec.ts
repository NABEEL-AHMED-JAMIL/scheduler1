import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { ImageApi } from './image.api';
import { AiPromptOption, ImageAiApi, ImageAiSettings, ImageType, measuredText } from './image-ai';
import { PhotoPage } from './photo-page';
import { DescriptionCard } from './photo-parts';
import { AskThread, askState, isWaiting } from './ask-thread';
import { AiSettingsSheet, modelLine, promptsForSide, promptsForType, typeChanges, typeSave } from './ai-settings-sheet';
import { ImageTypesPage } from './image-types-page';
import { UploadSheet, takenNote } from './upload-sheet';
import {
  AskRow, DEFAULT_IMAGE_LIMITS, PhotoDetail, describedOnlyNote, fieldLabel, isMeasuredPhoto, listPill, looksLike, photoFields, subLine,
} from './image.model';

const TOAST = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() };

const TYPES: ImageType[] = [
  { key: 'wound', name: 'Wound', builtIn: true, measured: true, target: 'red_region', targetLabel: 'red region', offered: true,
    never: 'diagnosis, stage, cause, treatment', fields: ['woundBed', 'moisture', 'edges', 'around'], promptId: 1, promptName: 'Wound photo description (built in)',
    promptVersion: 1, promptBuiltIn: true, model: 'gemma3:4b', sortOrder: 1 },
  { key: 'lesion', name: 'Skin lesion', builtIn: true, measured: true, target: 'contrast', targetLabel: 'dark region', offered: true,
    never: ['diagnosis', '“benign” or “suspicious”', 'any risk score'], fields: ['colour', 'border', 'shape', 'surface'], promptId: 2,
    promptName: 'Skin lesion description (built in)', promptVersion: 1, promptBuiltIn: true, model: null, sortOrder: 2 },
  { key: 'xray', name: 'X-ray', builtIn: true, measured: false, target: null, offered: true, never: 'fractures, findings, “normal” or “abnormal”',
    note: 'Local vision models are weak on X-rays. Check each field against the image.', noteWarning: true,
    measureNote: 'no paper ruler. Its scale is in DICOM pixel spacing, which is not read.',
    bannerText: 'An X-ray has no paper ruler, and this tool never reports fractures or findings. A radiologist reads the image.',
    fields: ['bodyPart', 'view', 'imageQuality', 'markers'],
    promptId: 4, promptName: 'X-ray image description (built in)', promptVersion: 1, promptBuiltIn: true, model: 'qwen3.5:9b', sortOrder: 4 },
  { key: 'slide', name: 'Tissue slide', builtIn: true, measured: false, target: null, offered: false, never: 'findings', fields: ['stainSeen'], sortOrder: 5,
    measureNote: 'microscope scale, not a paper ruler', note: 'Magnification only when it is printed on the image.', noteWarning: false },
];

const XRAY = (over: Partial<PhotoDetail> = {}): PhotoDetail => ({ photoId: 2001, title: 'P-1093 · left forearm', fileName: 'xray-XR42.jpg', status: 'UNMEASURED',
  descriptionStatus: 'DRAFT', imageType: 'xray', imageTypeName: 'X-ray', measuredType: false, hasPhoto: true, width: 900, height: 700,
  descriptionFields: ['bodyPart', 'view', 'imageQuality', 'markers'],
  descriptionDraft: { bodyPart: 'Forearm, both bones in view', view: 'Front (AP)', imageQuality: null, markers: '“L” side marker, top left' },
  descriptionModel: 'qwen3.5:9b', descriptionPromptName: 'X-ray image description (built in)', descriptionPromptVersion: 1, ...over });

const LESION = (over: Partial<PhotoDetail> = {}): PhotoDetail => ({ photoId: 2002, title: 'P-1135 · L1 left forearm', fileName: 'lesion-L1.jpg', status: 'MEASURED',
  descriptionStatus: 'DRAFT', imageType: 'lesion', imageTypeName: 'Skin lesion', measuredType: true, target: 'contrast', scaleFound: true, pxPerCm: 70,
  lengthCm: 2.1, widthCm: 1.6, areaCm2: 2.6, hasPhoto: true, width: 1000, height: 760, descriptionFields: ['colour', 'border', 'shape', 'surface'],
  descriptionDraft: { colour: 'Two browns', border: 'Uneven', shape: 'Oval', surface: 'Flat, matte' }, descriptionModel: 'qwen3.5:9b',
  descriptionPromptName: 'Skin lesion description (built in)', descriptionPromptVersion: 1, ...over });

const REFUSED_ASK: AskRow = { askId: 9, question: 'Is there a fracture?', status: 'refused', refusedBecause: 'fracture',
  answer: "I can't answer that. Whether there is a fracture is a diagnosis, and Image review only describes the image.", askedByName: 'Riverside admin',
  askedAt: '2026-11-03T10:22:00Z' };
const OK_ASK: AskRow = { askId: 8, question: 'Which view is this?', status: 'ok', answer: 'A front (AP) view.', model: 'qwen3.5:9b',
  promptName: 'Image question (Riverside)', promptVersion: 1, tookMs: 7800, askedAt: '2026-11-03T10:20:00Z' };

function aiApi(over: Partial<Record<keyof ImageAiApi, unknown>> = {}) {
  return { types: () => of({ status: 'SUCCESS', data: { types: TYPES, canChange: true } }), tryPhoto: () => NEVER, ...over };
}

describe('Image types rules (design image-tool-types, contract 2026-11-03)', () => {
  it('labels a type\'s fields from their keys', () => {
    expect(fieldLabel('woundBed')).toBe('Wound bed');
    expect(fieldLabel('around')).toBe('Around it');
    expect(fieldLabel('bodyPart')).toBe('Body part');
    expect(fieldLabel('imageQuality')).toBe('Image quality');
    expect(fieldLabel('coloursSeen')).toBe('Colours seen');
    expect(fieldLabel('summary')).toBe('Summary');
    expect(photoFields(XRAY())).toEqual(['bodyPart', 'view', 'imageQuality', 'markers']);
    expect(photoFields({ description: null, descriptionDraft: { colour: 'x', shape: 'y' } })).toEqual(['colour', 'shape']);
    expect(photoFields({})).toEqual(['woundBed', 'moisture', 'edges', 'around']);
  });

  it('says a type that is never measured as Description only, and a suggestion in plain words', () => {
    expect(isMeasuredPhoto(XRAY())).toBe(false);
    expect(isMeasuredPhoto(LESION())).toBe(true);
    expect(isMeasuredPhoto({ status: 'MEASURED' })).toBe(true);
    expect(listPill(XRAY({ descriptionStatus: 'NONE' }))).toEqual({ tone: 'neutral', label: 'Description only' });
    expect(listPill(XRAY()).label).toBe('Confirm description');
    expect(looksLike('X-ray')).toBe('Looks like an X-ray');
    expect(looksLike('Skin lesion')).toBe('Looks like a skin lesion');
    expect(looksLike('Burn')).toBe('Looks like a burn');
    expect(describedOnlyNote([{ name: 'Wound', measured: true }, { name: 'X-ray', measured: false }, { name: 'Other photo', measured: false }]))
      .toBe('X-ray and Other photo are described only, never measured.');
    expect(subLine(XRAY({ note: 'XR-0042 · front view' }))).toBe('XR-0042 · front view');
  });

  it('says a refused upload\'s own message on its line', () => {
    expect(takenNote(LESION({ status: 'REFUSED', refusalCode: 'TOO_LARGE', refusalMessage: 'IMG_4471.heic is 31.8 MB; the limit is 25 MB a photo.' })))
      .toEqual({ note: 'IMG_4471.heic is 31.8 MB; the limit is 25 MB a photo.', crit: true });
    expect(takenNote(LESION({ status: 'REFUSED', refusalCode: 'NOT_A_PHOTO', refusalMessage: null, fileName: 'wound_scan.pdf' })).note)
      .toBe('wound_scan.pdf could not be read as a photo.');
    expect(takenNote(LESION({ status: 'TOO_DARK', areaCm2: null })).crit).toBe(true);
    expect(takenNote(XRAY()).note).toBe('Description only');
    expect(takenNote(LESION()).note).toBe('2.6 cm²');
  });

  it('labels an answer: a draft, or not answered with a fixed reply and no model asked', () => {
    expect(askState(REFUSED_ASK)).toEqual(expect.objectContaining({ pill: 'Not answered', meta: 'fixed reply · no model was asked', refused: true }));
    expect(askState(OK_ASK).pill).toBe('Draft · not a diagnosis');
    // Asked, answered after the request (media-2.22): "Answering…" until the poll finds the answer.
    expect(askState({ ...OK_ASK, status: 'pending', answer: null }).pill).toBe('Answering…');
    expect(isWaiting({ ...OK_ASK, status: 'answering' })).toBe(true);
    expect(isWaiting(OK_ASK)).toBe(false);
    expect(askState(OK_ASK).meta).toBe('Image question (Riverside) v1 · qwen3.5:9b · 7.8 sec');
  });

  it('says a measurement with its note, and lists a type\'s prompts: its own built-in, the tagged ones, then others that fit', () => {
    expect(measuredText({ measured: true, target: 'red_region', measureNote: 'area only' })).toBe('Paper ruler · red region (area only)');
    expect(measuredText({ measured: false, measureNote: 'microscope scale, not a paper ruler' })).toBe('Never: microscope scale, not a paper ruler');
    expect(measuredText({ measured: false })).toBe('Never');
    const P = (o: Partial<AiPromptOption>): AiPromptOption => ({ promptId: 0, name: '', version: 1, builtIn: false, fields: [], fits: false, kind: 'describe', ...o });
    const prompts = [P({ promptId: 1, fits: true }), P({ promptId: 2, tags: 'Image review' }), P({ promptId: 3, builtIn: true, builtInKey: 'image-burn', fits: true }),
      P({ promptId: 4, builtIn: true, builtInKey: 'image-lesion', fits: true }), P({ promptId: 5 }), P({ promptId: 6, builtIn: true, builtInKey: 'image-ask', kind: 'ask', fits: true }),
      P({ promptId: 7, fitsAsk: true, kind: 'describe' }), P({ promptId: 8, builtIn: true, builtInKey: 'image-suggest', kind: 'suggest', fits: true })];
    expect(promptsForType(prompts, 'lesion').map(p => p.promptId)).toEqual([4, 2, 1]);
    expect(promptsForSide(prompts, 'ask').map(p => p.promptId)).toEqual([6, 7]);
    expect(promptsForSide(prompts, 'suggest').map(p => p.promptId)).toEqual([8]);
  });

  it('keeps a type\'s setting and says what changed', () => {
    const lesion = typeSave(TYPES[1]);
    expect(lesion).toEqual({ promptId: null, model: null, measured: true, target: 'contrast', offered: true, timeoutSeconds: null, answerTokens: null });
    expect(typeSave(TYPES[2]).measured).toBe(false);
    expect(typeSave({ ...TYPES[2], key: 'custom-3', baseKey: 'xray', measured: true, builtIn: false })).toEqual(expect.objectContaining({ measured: false }));
    expect(typeChanges(lesion, { ...lesion, model: 'qwen3.5:9b' }, () => 'built in v1', m => m ?? 'gemma3:4b (default)'))
      .toEqual(['model gemma3:4b (default) → qwen3.5:9b']);
    expect(modelLine({ model: 'qwen3:8b', active: true, readsPhotos: false, usable: false })).toBe('text only: cannot read photos');
    expect(modelLine({ model: 'qwen3.5:9b', active: true, readsPhotos: true, thinks: true, usable: true })).toBe('local · Active · reads photos · thinks');
  });
});

describe('Description card per type', () => {
  it('shows the photo\'s own fields, labelled from their keys, the type\'s warning and the byline', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ImageApi, useValue: {} }, { provide: Dialog, useValue: { open: vi.fn() } },
      { provide: ToastService, useValue: TOAST }] });
    const fixture = TestBed.createComponent(DescriptionCard);
    fixture.componentRef.setInput('photo', XRAY());
    fixture.componentRef.setInput('type', TYPES[2]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const labels = [...el.querySelectorAll('dt')].map(d => d.textContent!.trim());
    expect(labels).toEqual(['Body part', 'View', 'Image quality', 'Markers']);
    expect(el.querySelector('[data-field="imageQuality"]')!.textContent).toContain('Not sure: please fill in');
    expect(el.textContent).toContain('unsure about 1 of 4 fields');
    expect(el.querySelector('[data-test="type-note"]')!.textContent).toContain('weak on X-rays');
    expect(el.querySelector('[data-test="description-byline"]')!.textContent!.trim()).toBe('X-ray · X-ray image description (built in) v1 on qwen3.5:9b');
  });

  it('says what a lesion never says', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ImageApi, useValue: {} }, { provide: Dialog, useValue: { open: vi.fn() } },
      { provide: ToastService, useValue: TOAST }] });
    const fixture = TestBed.createComponent(DescriptionCard);
    fixture.componentRef.setInput('photo', LESION());
    fixture.componentRef.setInput('type', TYPES[1]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-test="description-never"]')!.textContent).toContain('It never says diagnosis, “benign” or “suspicious”, any risk score');
    expect(el.querySelector('[data-test="description-byline"]')!.textContent!.trim()).toBe('Skin lesion · Skin lesion description (built in) v1 on qwen3.5:9b');
  });
});

function page(photo: PhotoDetail, asks: AskRow[] = []) {
  TestBed.resetTestingModule();
  const api = {
    limits: () => of({ status: 'SUCCESS', data: { ...DEFAULT_IMAGE_LIMITS, askOn: true } }),
    one: vi.fn(() => of({ status: 'SUCCESS', data: photo })),
    compare: () => of({ status: 'SUCCESS', data: { photos: [], sizedCount: 0 } }),
    asks: vi.fn(() => of({ status: 'SUCCESS', data: asks })),
    ask: vi.fn(() => of({ status: 'SUCCESS', data: REFUSED_ASK })),
    image: () => NEVER,
  };
  TestBed.configureTestingModule({ providers: [
    provideRouter([]),
    { provide: ImageApi, useValue: api },
    { provide: ImageAiApi, useValue: aiApi() },
    { provide: Dialog, useValue: { open: vi.fn(() => ({ closed: of(undefined) })) } },
    { provide: ToastService, useValue: TOAST },
  ] });
  const fixture = TestBed.createComponent(PhotoPage);
  fixture.componentRef.setInput('id', photo.photoId);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, api, text: () => el.textContent!.replace(/\s+/g, ' ') };
}

describe('Photo page per type', () => {
  it('an X-ray has no Measurement tab and reads Description only · no size · not a diagnosis', () => {
    const { el, text } = page(XRAY());
    expect(el.querySelector('[data-tab="measurement"]')).toBeNull();
    expect(el.querySelector('[data-tab="description"]')!.classList).toContain('tab-active');
    expect(el.querySelector('[data-tab="ask"]')).not.toBeNull();
    expect(el.querySelector('[data-test="description-only"]')!.textContent).toContain('Description only · no size · not a diagnosis.');
    expect(el.querySelector('[data-test="description-only"]')!.textContent!.replace(/\s+/g, ' ').trim())
      .toBe('Description only · no size · not a diagnosis. An X-ray has no paper ruler, and this tool never reports fractures or findings. A radiologist reads the image.');
    expect(el.querySelector('[data-test="page-type"]')!.textContent).toContain('X-ray');
    expect(el.querySelector('[data-test="page-status"]')).toBeNull();
    expect(el.querySelector('[data-test="size-card"]')).toBeNull();
    expect(text()).toContain('Body part');
    expect(el.querySelector('[data-test="type-note"]')!.textContent).toContain('weak on X-rays');
  });

  it('a skin lesion keeps its Measurement tab, with the target dark region', () => {
    const { el } = page(LESION());
    expect(el.querySelector('[data-tab="measurement"]')!.classList).toContain('tab-active');
    expect(el.querySelector('[data-test="size-target"]')!.textContent).toContain('Target: dark region on skin');
    expect(el.querySelector('[data-test="description-only"]')).toBeNull();
    expect(el.querySelector('[data-test="page-status"]')!.textContent).toContain('Measured');
  });

  it('Ask shows a refused question with the fixed reply, and Details lists it', () => {
    const { el, fixture } = page(XRAY(), [OK_ASK, REFUSED_ASK]);
    expect(el.querySelector('[data-tab="ask"]')!.textContent).toContain('2');
    (el.querySelector('[data-tab="ask"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const refused = el.querySelector('[data-answer="9"]')!;
    expect(refused.getAttribute('data-status')).toBe('refused');
    expect(refused.querySelector('[data-test="ask-pill"]')!.textContent).toContain('Not answered');
    expect(refused.querySelector('[data-test="ask-meta"]')!.textContent).toContain('fixed reply · no model was asked');
    expect(refused.querySelector('[data-test="ask-answer"]')!.textContent).toContain('Whether there is a fracture is a diagnosis');
    expect(refused.querySelector('[data-test="ask-copy"]')).toBeNull();
    const ok = el.querySelector('[data-answer="8"]')!;
    expect(ok.querySelector('[data-test="ask-pill"]')!.textContent).toContain('Draft · not a diagnosis');
    expect(ok.querySelector('[data-test="ask-to-note"]')).not.toBeNull();
    expect(el.querySelector('[data-test="ask-foot"]')!.textContent).toContain('diagnosis, fracture, stage, depth, findings or treatment get a fixed reply');
    (el.querySelector('[data-tab="details"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-ask-row="9"]')!.textContent).toContain('Not answered · fixed reply · no model was asked');
  });
});

describe('Ask thread', () => {
  it('sends a question and shows the API\'s fixed reply', async () => {
    TestBed.resetTestingModule();
    const api = { asks: () => of({ status: 'SUCCESS', data: { rows: [] } }), ask: vi.fn(() => of({ status: 'SUCCESS', data: REFUSED_ASK })) };
    TestBed.configureTestingModule({ providers: [{ provide: ImageApi, useValue: api }, { provide: ToastService, useValue: TOAST }] });
    const fixture = TestBed.createComponent(AskThread);
    fixture.componentRef.setInput('photo', XRAY());
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('[data-test="ask-input"]') as HTMLInputElement;
    input.value = 'Is there a fracture?';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.componentInstance.send();
    fixture.detectChanges();
    expect(api.ask).toHaveBeenCalledWith(2001, 'Is there a fracture?');
    expect(el.querySelector('[data-test="ask-answer"]')!.textContent).toContain("I can't answer that.");
    expect(el.querySelector('[data-test="ask-meta"]')!.textContent).toContain('no model was asked');
  });

  it('says when Ask is off', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: ImageApi, useValue: { asks: () => of({ status: 'SUCCESS', data: [] }) } }, { provide: ToastService, useValue: TOAST }] });
    const fixture = TestBed.createComponent(AskThread);
    fixture.componentRef.setInput('photo', XRAY());
    fixture.componentRef.setInput('askOn', false);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-test="ask-input"]')).toBeNull();
    expect(el.querySelector('[data-test="ask-off"]')).not.toBeNull();
  });
});

const SETTINGS: ImageAiSettings = {
  types: TYPES, canChange: true, fallbackModel: 'gemma3:4b',
  suggest: { promptId: null, model: null, on: true }, ask: { promptId: null, model: null, on: true },
  prompts: [
    { promptId: 1, name: 'Wound photo description (built in)', version: 1, builtIn: true, builtInKey: 'image-wound', fields: ['woundBed', 'moisture', 'edges', 'around'], fits: true, kind: 'describe' },
    { promptId: 2, name: 'Skin lesion description (built in)', version: 1, builtIn: true, builtInKey: 'image-lesion', fields: ['colour', 'border', 'shape', 'surface'], fits: true, kind: 'describe' },
    { promptId: 4, name: 'X-ray image description (built in)', version: 1, builtIn: true, builtInKey: 'image-xray', fields: ['bodyPart'], fits: true, kind: 'describe' },
    { promptId: 11, name: 'Lesion one-liner', version: 1, builtIn: false, fields: [], fits: false, reason: "Doesn't fit: answers in text. Needs JSON output and a photo input.", kind: 'describe', tags: 'Image review' },
    { promptId: 12, name: 'AI eval · prompt · mobility', version: 14, builtIn: false, fields: [], fits: false, reason: "Doesn't fit: has no photo input.", kind: 'describe' },
    { promptId: 21, name: 'Image type suggestion (built in)', version: 1, builtIn: true, builtInKey: 'image-suggest', fields: [], fits: true, kind: 'suggest' },
    { promptId: 22, name: 'Image question (built in)', version: 1, builtIn: true, builtInKey: 'image-ask', fields: [], fits: true, kind: 'ask' },
  ],
  models: [
    { model: 'gemma3:4b', active: true, readsPhotos: true, usable: true },
    { model: 'qwen3.5:9b', active: true, readsPhotos: true, thinks: true, usable: true },
    { model: 'qwen3:8b', active: true, readsPhotos: false, usable: false },
  ],
  lastChange: { byName: 'Riverside Health admin', at: '2026-11-02T20:20:00Z' },
};

function sheet(settings: ImageAiSettings = SETTINGS) {
  TestBed.resetTestingModule();
  const api = { ...aiApi(), settings: () => of({ status: 'SUCCESS', data: settings }), saveType: vi.fn(() => of({ status: 'SUCCESS', data: TYPES[1] })),
    saveSettings: vi.fn(() => of({ status: 'SUCCESS', data: settings })) };
  const ref = { close: vi.fn() };
  TestBed.configureTestingModule({ providers: [
    provideRouter([]),
    { provide: ImageAiApi, useValue: api },
    { provide: DialogRef, useValue: ref },
    { provide: DIALOG_DATA, useValue: { focus: 'lesion' } },
    { provide: Dialog, useValue: { open: vi.fn(() => ({ closed: of(undefined) })) } },
    { provide: ToastService, useValue: TOAST },
  ] });
  const fixture = TestBed.createComponent(AiSettingsSheet);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, api, ref };
}

describe('AI settings sheet', () => {
  it('shows Offered as a switch with Yes or No on every row, never an empty cell', () => {
    const { el } = sheet();
    const cells = [...el.querySelectorAll('[data-test="as-offered"]')];
    expect(cells.length).toBe(TYPES.length);
    for (const c of cells) {
      expect(c.querySelector('input[role="switch"]')).not.toBeNull();
      expect(['Yes', 'No']).toContain(c.textContent!.trim());
    }
    expect(el.querySelector('[data-type-row="slide"]')!.textContent).toContain('not offered here');
    expect(el.querySelector('[data-type-row="xray"]')!.textContent).toContain('Never');
    expect(el.querySelector('[data-type-row="lesion"]')!.textContent).toContain('Ruler · dark region');
  });

  it('edits one type: its prompts (one does not fit, with why), models (one cannot read photos), measurement and target', () => {
    const { el } = sheet();
    const editor = el.querySelector('[data-test="as-editor"]')!;
    expect(editor.getAttribute('data-editing')).toBe('lesion');
    expect(editor.querySelector('[data-prompt="2"]')!.textContent).toContain('Platform');
    expect(editor.querySelector('[data-prompt="2"]')!.textContent).toContain('colour');
    expect(editor.querySelector('[data-prompt="1"]')).toBeNull();
    expect((editor.querySelector('[data-prompt="11"] input') as HTMLInputElement).disabled).toBe(true);
    expect(editor.querySelector('[data-prompt="11"]')!.textContent).toContain("Doesn't fit: answers in text.");
    expect(editor.querySelector('[data-prompt="11"]')!.textContent).not.toContain("Doesn't fit: Doesn't fit");
    expect(editor.querySelector('[data-prompt="12"]'), 'an untagged prompt that does not fit is not listed').toBeNull();
    expect(editor.querySelector('[data-prompt="21"]'), 'the suggestion\'s built-in is not a type\'s').toBeNull();
    expect([...editor.querySelectorAll('[data-prompt]')].map(e => e.getAttribute('data-prompt'))).toEqual(['2', '11']);
    expect(editor.querySelector('[data-model="qwen3:8b"]'), 'a model that cannot be used is not a choice').toBeNull();
    expect(editor.querySelector('[data-unusable="qwen3:8b"]')!.textContent).toContain('text only: cannot read photos');
    expect(editor.textContent).toContain('Dark region: a darker area on skin.');
    expect(el.querySelectorAll('[data-test="as-rules"] .as-rule').length).toBe(5);
    expect(el.querySelector('[data-test="as-audit"]')!.textContent).toContain('Last changed by Riverside Health admin');
  });

  it('an X-ray is never measured; a model change is unsaved until Save, which sends only that type', async () => {
    const { el, fixture, api, ref } = sheet();
    (el.querySelector('[data-type-row="xray"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-test="as-never-measured"]')).not.toBeNull();
    expect(el.querySelector('[data-test="as-measured"]')).toBeNull();
    (el.querySelector('[data-type-row="lesion"]') as HTMLElement).click();
    fixture.detectChanges();
    (el.querySelector('[data-model="qwen3.5:9b"] input') as HTMLInputElement).dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector('[data-test="as-unsaved"]')!.textContent).toContain('Unsaved: Skin lesion model gemma3:4b (default) → qwen3.5:9b');
    await fixture.componentInstance.save();
    expect(api.saveType).toHaveBeenCalledTimes(1);
    expect(api.saveType).toHaveBeenCalledWith('lesion', expect.objectContaining({ model: 'qwen3.5:9b', promptId: null, measured: true, target: 'contrast' }));
    expect(api.saveSettings).not.toHaveBeenCalled();
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('is read-only for someone who may not change it', () => {
    const { el } = sheet({ ...SETTINGS, canChange: false });
    expect(el.querySelector('[data-test="as-read-only"]')).not.toBeNull();
    expect(el.querySelector('[data-test="as-save"]')).toBeNull();
    expect(el.querySelector('[data-test="as-add"]')).toBeNull();
    expect((el.querySelector('[data-test="as-offered"] input') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('Image types catalog', () => {
  function catalog(canChange: boolean) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      { provide: ImageAiApi, useValue: aiApi({ types: () => of({ status: 'SUCCESS', data: { types: TYPES, canChange } }) }) },
      { provide: Dialog, useValue: { open: vi.fn(() => ({ closed: of(undefined) })) } },
      { provide: ToastService, useValue: TOAST },
    ] });
    const fixture = TestBed.createComponent(ImageTypesPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows each type\'s measurement, fields, what it never says and its prompt; read-only for a non-administrator', () => {
    const el = catalog(false);
    const xray = el.querySelector('[data-type="xray"]')!;
    expect(xray.textContent).toContain('Not measured');
    expect(xray.textContent).toContain('bodyPart');
    expect(xray.textContent).toContain('fractures, findings');
    expect(xray.querySelector('[data-test="type-prompt"]')!.textContent).toContain('X-ray image description (built in)');
    expect(xray.querySelector('[data-test="type-note"]')).not.toBeNull();
    expect(el.querySelector('[data-type="lesion"]')!.textContent).toContain('Paper ruler · dark region');
    expect(xray.querySelector('[data-test="type-measured"]')!.textContent).toBe('Never: no paper ruler. Its scale is in DICOM pixel spacing, which is not read.');
    expect(el.querySelector('[data-type="slide"] [data-test="type-note"]'), 'a plain note is not a warning').toBeNull();
    expect(el.querySelector('[data-type="slide"] [data-test="type-plain-note"]')!.textContent).toContain('Magnification only');
    expect(el.querySelector('[data-test="type-duplicate"]')).toBeNull();
    expect(el.querySelector('[data-test="types-ai-settings"]')).toBeNull();
    expect(el.querySelector('[data-test="types-read-only"]')).not.toBeNull();
  });

  it('gives an administrator AI settings, Add a type and Duplicate to edit', () => {
    const el = catalog(true);
    expect(el.querySelectorAll('[data-test="type-duplicate"]').length).toBe(TYPES.length);
    expect(el.querySelector('[data-test="types-ai-settings"]')).not.toBeNull();
    expect(el.querySelector('[data-test="types-add"]')).not.toBeNull();
  });
});

describe('Upload with a type', () => {
  function upload(photos: PhotoDetail[], data: Partial<Record<string, unknown>> = {}) {
    TestBed.resetTestingModule();
    let n = 0;
    const api = { upload: vi.fn(() => of({ status: 'SUCCESS', data: { photos: [photos[n++]] } })), edit: vi.fn(() => of({ status: 'SUCCESS', data: XRAY({ typeSuggested: false }) })) };
    const files = photos.map(p => new File(['x'], p.fileName, { type: 'image/jpeg' }));
    TestBed.configureTestingModule({ providers: [
      { provide: ImageApi, useValue: api },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { limits: DEFAULT_IMAGE_LIMITS, files, notOffered: ['Tissue slide'],
        types: [{ key: 'wound', name: 'Wound', measured: true }, { key: 'xray', name: 'X-ray', measured: false }, { key: 'other', name: 'Other photo', measured: false }], ...data } },
    ] });
    const fixture = TestBed.createComponent(UploadSheet);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, api };
  }

  it('offers the types, says which are described only and which are not offered, and sends the type chosen', async () => {
    const { el, fixture, api } = upload([LESION({ fileName: 'wound.jpg', status: 'MEASURED', imageType: 'wound', imageTypeName: 'Wound' })], { imageType: 'wound' });
    const options = [...el.querySelectorAll('[data-test="upload-type"] option')].map(o => o.textContent!.trim());
    expect(options).toEqual(['Let AI suggest', 'Wound', 'X-ray', 'Other photo', 'Tissue slide · not offered in this workspace']);
    expect(el.querySelector('[data-test="upload-described-only"]')!.textContent).toContain('X-ray and Other photo are described only, never measured.');
    expect(el.querySelector('[data-test="upload-not-offered"]')!.textContent).toContain('Tissue slide is not offered in this workspace');
    await fixture.componentInstance.send();
    expect(api.upload).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ imageType: 'wound' }));
  });

  it('shows the AI\'s suggestion as a draft, and asks for a type when there is none', async () => {
    const { el, fixture, api } = upload([
      XRAY({ fileName: 'xray-XR42.jpg', typeSuggested: true, typeSuggestion: 'xray' }),
      XRAY({ photoId: 2003, fileName: 'other-O1.jpg', imageType: null, imageTypeName: null, typeSuggested: false, typeSuggestion: null }),
    ]);
    await fixture.componentInstance.send();
    fixture.detectChanges();
    expect(api.upload).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ imageType: undefined }));
    const [first, second] = [...el.querySelectorAll('[data-upload-item]')];
    expect(first.querySelector('[data-test="upload-suggested"]')!.textContent).toContain('Looks like an X-ray');
    expect(first.querySelector('[data-test="upload-suggested"] .pill')!.textContent).toContain('Suggested');
    expect((first.querySelector('[data-test="upload-type"]') as HTMLSelectElement).value).toBe('xray');
    expect(second.querySelector('[data-test="upload-no-suggestion"]')!.textContent).toContain('No suggestion: please choose');
    expect(second.querySelector('[data-test="upload-type"]')!.classList).toContain('us-need');
    expect(el.textContent).toContain('choose a type for 1');
    await fixture.componentInstance.choose(1, 'other');
    expect(api.edit).toHaveBeenCalledWith(2003, { imageType: 'other' });
  });

  it('suggests a type before the upload, a draft the person can change, and asks for one when there is none', async () => {
    TestBed.resetTestingModule();
    const answers: Record<string, unknown> = {
      'xray-XR42.jpg': { status: 'ok', typeKey: 'xray', typeName: 'X-ray' },
      'other-O1.jpg': { status: 'ok', typeKey: null, typeName: null },
      'IMG_1.heic': { status: 'skipped' },
    };
    const api = { suggest: vi.fn((f: File) => of({ status: 'SUCCESS', data: answers[f.name] })), upload: vi.fn(() => of({ status: 'SUCCESS', data: { photos: [XRAY()] } })) };
    const files = Object.keys(answers).map(n => new File(['x'], n, { type: 'image/jpeg' }));
    TestBed.configureTestingModule({ providers: [
      { provide: ImageApi, useValue: api }, { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { limits: DEFAULT_IMAGE_LIMITS, files, types: [{ key: 'wound', name: 'Wound', measured: true }, { key: 'xray', name: 'X-ray', measured: false },
        { key: 'other', name: 'Other photo', measured: false }] } },
    ] });
    const fixture = TestBed.createComponent(UploadSheet);
    fixture.detectChanges();
    await new Promise(r => setTimeout(r)); // the sheet asks once it is open
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(api.suggest).toHaveBeenCalledTimes(3);
    const [xray, other, heic] = [...el.querySelectorAll('[data-upload-item]')];
    expect(xray.querySelector('[data-test="upload-suggested"]')!.textContent).toContain('Looks like an X-ray');
    expect((xray.querySelector('[data-test="upload-type"]') as HTMLSelectElement).value).toBe('xray');
    expect(other.querySelector('[data-test="upload-no-suggestion"]')!.textContent).toContain('No suggestion: please choose');
    expect(heic.querySelector('[data-test="upload-type"] option')!.textContent!.trim()).toBe('Let AI suggest');
    const send = el.querySelector('[data-test="upload-send"]') as HTMLButtonElement;
    expect(send.textContent).toContain('Upload 3 (choose a type for 1)');
    expect(send.disabled).toBe(true);
    await fixture.componentInstance.choose(1, 'other');
    await fixture.componentInstance.choose(0, 'wound');
    fixture.detectChanges();
    expect(send.disabled).toBe(false);
    expect(xray.querySelector('[data-test="upload-suggested"]'), 'the person\'s choice wins').toBeNull();
    await fixture.componentInstance.send();
    expect(api.upload).toHaveBeenNthCalledWith(1, expect.any(File), expect.objectContaining({ imageType: 'wound', suggestedType: 'xray' }));
    expect(api.upload).toHaveBeenNthCalledWith(2, expect.any(File), expect.objectContaining({ imageType: 'other', suggestedType: undefined }));
    expect(api.upload).toHaveBeenNthCalledWith(3, expect.any(File), expect.objectContaining({ imageType: undefined }));
  });

  it('falls back to the suggestion after the upload when the endpoint is missing', async () => {
    TestBed.resetTestingModule();
    const api = { suggest: vi.fn(() => throwError(() => ({ status: 404 }))) };
    const files = [new File(['x'], 'a.jpg'), new File(['x'], 'b.jpg')];
    TestBed.configureTestingModule({ providers: [
      { provide: ImageApi, useValue: api }, { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { limits: DEFAULT_IMAGE_LIMITS, files, types: [{ key: 'xray', name: 'X-ray', measured: false }] } },
    ] });
    const fixture = TestBed.createComponent(UploadSheet);
    fixture.detectChanges();
    await new Promise(r => setTimeout(r)); // the sheet asks once it is open
    fixture.detectChanges();
    expect(api.suggest).toHaveBeenCalledTimes(1);
    expect(((fixture.nativeElement as HTMLElement).querySelector('[data-test="upload-send"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('says a refused upload\'s message at upload', async () => {
    const { el, fixture } = upload([LESION({ fileName: 'big.heic', status: 'REFUSED', refusalCode: 'TOO_LARGE', refusalMessage: 'big.heic is 31.8 MB; the limit is 25 MB a photo.' })]);
    await fixture.componentInstance.send();
    fixture.detectChanges();
    const note = el.querySelector('[data-test="upload-note"]')!;
    expect(note.textContent).toContain('big.heic is 31.8 MB; the limit is 25 MB a photo.');
    expect(note.getAttribute('role')).toBe('alert');
  });

  it('says a file over the limit before it is sent', () => {
    TestBed.resetTestingModule();
    const big = new File(['x'], 'IMG_4471.heic');
    Object.defineProperty(big, 'size', { value: 31.8 * 1024 * 1024 });
    TestBed.configureTestingModule({ providers: [
      { provide: ImageApi, useValue: {} }, { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: DIALOG_DATA, useValue: { limits: DEFAULT_IMAGE_LIMITS, files: [big] } },
    ] });
    const fixture = TestBed.createComponent(UploadSheet);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-test="upload-problem"]')!.textContent).toContain('31.8 MB; the limit is 25 MB');
  });
});

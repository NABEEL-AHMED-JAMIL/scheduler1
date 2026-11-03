import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { NEVER_MEASURED, TYPE_WORDS } from './image.model';

const BASE = `${API_BASE}/imageReviewAi.json`;

/**
 * An image type (design image-tool-types, contract 2026-11-03): built in (wound, lesion, burn, xray, slide, other) or the
 * workspace's own (custom-<n>, copied from a built-in one, its baseKey). Its fields come from its prompt's output schema.
 */
export interface ImageType {
  key: string;
  name: string;
  builtIn: boolean;
  custom?: boolean;
  baseKey?: string | null;
  description?: string | null;
  measured: boolean;
  target?: 'red_region' | 'contrast' | null;
  targetLabel?: string | null;
  offered: boolean;
  /** What it never says ("diagnosis, stage, cause, treatment"). */
  never?: string | string[] | null;
  /** A line about the type: a warning (noteWarning, X-ray: local models are weak) or a plain note (slide: magnification only when printed). */
  note?: string | null;
  noteWarning?: boolean | null;
  /** The measurement's own words: measured, "area only"; never measured, why ("no paper ruler. Its scale is in DICOM…"). */
  measureNote?: string | null;
  /** The described-only banner's text after "Description only · no size · not a diagnosis." */
  bannerText?: string | null;
  fields: string[];
  promptId?: number | null;
  promptName?: string | null;
  promptVersion?: number | null;
  promptBuiltIn?: boolean;
  /** The model chosen for it; null: the platform's fallback model. */
  model?: string | null;
  sortOrder?: number;
  timeoutSeconds?: number | null;
  answerTokens?: number | null;
}

/** A prompt the settings sheet can choose, with whether it fits (JSON output and a photo input) and why not. */
export interface AiPromptOption {
  promptId: number;
  name: string;
  version: number;
  builtIn: boolean;
  builtInKey?: string | null;
  fields: string[];
  fits: boolean;
  /** Whether it fits the type suggestion (its answer is a type key) or Ask (a question and a photo, a text answer). */
  fitsSuggest?: boolean | null;
  fitsAsk?: boolean | null;
  reason?: string | null;
  kind: 'describe' | 'suggest' | 'ask';
  tags?: string | string[] | null;
}

/** A model on the platform's list, with what it can do (detected from Ollama) and whether it can be used here. */
export interface AiModelOption {
  model: string;
  displayName?: string | null;
  active: boolean;
  readsPhotos: boolean;
  thinks?: boolean;
  usesTools?: boolean;
  usable: boolean;
  reason?: string | null;
  callTimeoutSeconds?: number | null;
  answerTokens?: number | null;
  maxParallel?: number | null;
}

/** The suggestion's or Ask's own setting. */
export interface AiSide {
  promptId: number | null;
  promptName?: string | null;
  promptVersion?: number | null;
  model: string | null;
  on: boolean;
}

export interface TryPhoto { name: string; label?: string | null; typeKey?: string | null; }

export interface ImageAiSettings {
  types: ImageType[];
  suggest: AiSide;
  ask: AiSide;
  prompts: AiPromptOption[];
  models: AiModelOption[];
  fallbackModel?: string | null;
  rules?: string[];
  tryPhotos?: (string | TryPhoto)[];
  canChange: boolean;
  lastChange?: { byName?: string | null; at?: string | null } | null;
}

export interface TypeSave {
  promptId: number | null;
  model: string | null;
  measured: boolean;
  target: 'red_region' | 'contrast' | null;
  offered: boolean;
  timeoutSeconds: number | null;
  answerTokens: number | null;
}

/** What a description (or a try) answers. */
export interface DescribeResult {
  status: 'ok' | 'off' | 'failed' | 'held';
  fields?: Record<string, string | null>;
  fieldOrder?: string[];
  unsure?: string[];
  model?: string | null;
  message?: string | null;
  promptId?: number | null;
  promptName?: string | null;
  promptVersion?: number | null;
  tookMs?: number | null;
  heldText?: string | null;
}

/** The fixed rules, when the server does not send its own words (design types-settings). */
export const FIXED_RULES = [
  'No diagnosis, ever: no findings, fracture, stage, depth, degree, cause or treatment.',
  'No size from AI. Sizes come only from a paper ruler, measured in code.',
  'A field the model is unsure of stays empty.',
  'Always a draft, until a person confirms or edits it.',
  "Local models only: images never leave the platform's own machines.",
];

/** The synthetic test photos, by the type they show (GET /tryPhoto?name=). */
export const TRY_PHOTOS: Record<string, string> = { wound: 'v3', lesion: 'lesion', burn: 'burn', xray: 'xray', slide: 'slide', other: 'other' };

/** ai-service's Image review settings (/imageReviewAi.json): the types, their prompts and models, the suggestion and Ask. */
@Injectable({ providedIn: 'root' })
export class ImageAiApi {
  private readonly http = inject(HttpClient);

  types(): Observable<ApiResponse<{ types: ImageType[]; canChange: boolean }>> {
    return this.http.get<ApiResponse<{ types: ImageType[]; canChange: boolean }>>(`${BASE}/types`);
  }

  settings(): Observable<ApiResponse<ImageAiSettings>> {
    return this.http.get<ApiResponse<ImageAiSettings>>(`${BASE}/settings`);
  }

  saveType(key: string, body: TypeSave): Observable<ApiResponse<ImageType>> {
    return this.http.put<ApiResponse<ImageType>>(`${BASE}/types/${encodeURIComponent(key)}`, body);
  }

  addType(name: string, baseKey: string): Observable<ApiResponse<ImageType>> {
    return this.http.post<ApiResponse<ImageType>>(`${BASE}/types`, { name, baseKey });
  }

  removeType(key: string): Observable<ApiResponse> {
    return this.http.delete<ApiResponse>(`${BASE}/types/${encodeURIComponent(key)}`);
  }

  saveSettings(body: { suggest: Pick<AiSide, 'promptId' | 'model' | 'on'>; ask: Pick<AiSide, 'promptId' | 'model' | 'on'> }): Observable<ApiResponse<ImageAiSettings>> {
    return this.http.put<ApiResponse<ImageAiSettings>>(`${BASE}/settings`, body);
  }

  /** Try a prompt and model on a synthetic photo: recorded as a try, never saved to a photo. */
  tryIt(body: { typeKey: string; promptId: number | null; model: string | null; photo: string }): Observable<ApiResponse<DescribeResult>> {
    return this.http.post<ApiResponse<DescribeResult>>(`${BASE}/try`, body);
  }

  tryPhoto(name: string): Observable<Blob> {
    return this.http.get(`${BASE}/tryPhoto`, { params: { name }, responseType: 'blob' });
  }

  /** A built-in prompt copied into the workspace, to edit in Prompts. */
  duplicate(promptId: number): Observable<ApiResponse<{ promptId: number }>> {
    return this.http.post<ApiResponse<{ promptId: number }>>(`${BASE}/duplicate`, { promptId });
  }
}

/** The workspace's image types, read once and shared by the list, the photo page and the panel. */
@Injectable({ providedIn: 'root' })
export class ImageTypesStore {
  private readonly api = inject(ImageAiApi);
  readonly types = signal<ImageType[]>([]);
  readonly canChange = signal(false);
  readonly loaded = signal(false);
  private asked = false;

  readonly byKey = computed(() => new Map(this.types().map(t => [t.key, t])));

  load(again = false): void {
    if (this.asked && !again) return;
    this.asked = true;
    this.api.types().subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) return;
        this.types.set([...(r.data.types ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
        this.canChange.set(!!r.data.canChange);
        this.loaded.set(true);
      },
      error: () => { this.asked = false; },
    });
  }

  of(key: string | null | undefined): ImageType | null {
    return key ? this.byKey().get(key) ?? null : null;
  }
}

/** "diagnosis, stage, cause, treatment" whether the server sends a list or a line. */
export function neverText(never: string | string[] | null | undefined): string {
  return Array.isArray(never) ? never.join(', ') : never ?? '';
}

/** The type's measurement in words: "Paper ruler · red region (area only)", "Never: microscope scale, not a paper ruler", "Never". */
export function measuredText(t: Pick<ImageType, 'measured' | 'target' | 'targetLabel' | 'measureNote'>): string {
  const note = (t.measureNote ?? '').trim();
  if (!t.measured) return note ? `Never: ${note}` : 'Never';
  const label = t.targetLabel || (t.target === 'contrast' ? 'dark region' : t.target === 'red_region' ? 'red region' : '');
  return (label ? `Paper ruler · ${label}` : 'Paper ruler') + (note ? ` (${note})` : '');
}

/** A custom type copied from X-ray, a slide or Other photo is never measured, whatever its setting says. */
export function canMeasure(t: Pick<ImageType, 'key' | 'baseKey'>): boolean {
  return !NEVER_MEASURED.includes(t.baseKey ?? t.key);
}

/** The built-in type's name, for a key before the types are read. */
export function builtInName(key: string): string {
  return TYPE_WORDS[key] ?? key;
}

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';
import { AdvancedOption } from '../../../shared/ui/advanced-select';

/**
 * The platform's list of models (owner 2026-11-02): which models may be used at all. The platform's main administrator
 * keeps it (Platform › Models); everyone else picks from the models switched on -- a data policy's allowed models, a
 * connection's default model, a prompt's model. Choosing is not installing: the backend team installs a model; the list
 * only says which may be used, and ai-service refuses any other at call time.
 */
export interface CatalogModel {
  catalogId: number;
  /** The model as its provider names it (qwen3:8b). */
  modelName: string;
  displayName: string;
  /** The connection type it runs on: Ollama, or a hosted provider's key (OpenAI, Anthropic, ...). */
  provider: string;
  /** Runs on the platform's own machines (an Ollama model that is not a cloud model). */
  local: boolean;
  note: string | null;
  active: boolean;
  /** Detected from the provider (Ollama /api/show), read-only: it reads photos, it thinks, it calls tools. */
  readsPhotos?: boolean | null;
  thinks?: boolean | null;
  usesTools?: boolean | null;
  /** Limits the platform administrator sets; null: the platform's defaults. */
  callTimeoutSeconds?: number | null;
  answerTokens?: number | null;
  maxParallel?: number | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  dateCreated?: string | null;
  dateUpdated?: string | null;
}

export interface CatalogChange {
  catalogId: string;
  action: string;
  from: string | null;
  to: string | null;
  note: string | null;
  by: number | null;
  byName: string | null;
  byRole: string | null;
  at: string | null;
}

export interface CatalogSave {
  catalogId?: number | null;
  modelName: string;
  displayName: string;
  provider: string;
  local: boolean;
  note: string | null;
  active: boolean;
  callTimeoutSeconds?: number | null;
  answerTokens?: number | null;
  maxParallel?: number | null;
}

@Injectable({ providedIn: 'root' })
export class ModelCatalogApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/aiPrompt.json/modelCatalog`;

  /** A platform administrator's whole list; anyone else's, the models switched on. */
  list(): Observable<ApiResponse<CatalogModel[]>> {
    return this.http.get<ApiResponse<CatalogModel[]>>(this.base);
  }

  save(body: CatalogSave): Observable<ApiResponse<CatalogModel>> {
    return this.http.post<ApiResponse<CatalogModel>>(`${this.base}/save`, body);
  }

  setActive(catalogId: number, active: boolean): Observable<ApiResponse<CatalogModel>> {
    return this.http.put<ApiResponse<CatalogModel>>(`${this.base}/setActive`, null, { params: { catalogId, active } });
  }

  history(catalogId?: number | null): Observable<ApiResponse<CatalogChange[]>> {
    const params: Record<string, number> = catalogId == null ? {} : { catalogId };
    return this.http.get<ApiResponse<CatalogChange[]>>(`${this.base}/history`, { params });
  }
}

/** An Ollama cloud model (gpt-oss:120b-cloud): Ollama sends it to its own servers, so it is hosted. */
export function isCloudName(model: string | null | undefined): boolean {
  const m = (model ?? '').trim().toLowerCase();
  return m.endsWith('-cloud') || m.endsWith(':cloud');
}

/** Two names for one model, as Ollama reads them: an untagged name is its ":latest". */
export function sameModel(a: string | null | undefined, b: string | null | undefined): boolean {
  const tag = (n: string) => {
    const t = n.trim().toLowerCase();
    return t.slice(t.lastIndexOf('/') + 1).includes(':') ? t : `${t}:latest`;
  };
  return !!a && !!b && tag(a) === tag(b);
}

/** The listed models a connection of this provider may run, switched on, by display name. */
export function modelsFor(catalog: CatalogModel[], provider: string | null | undefined): CatalogModel[] {
  const p = (provider ?? '').trim().toLowerCase();
  return catalog.filter(m => m.active && m.provider.trim().toLowerCase() === p);
}

/** The list's entry for a model on a provider, switched on or not. */
export function catalogEntry(catalog: CatalogModel[], provider: string | null | undefined, model: string | null | undefined): CatalogModel | null {
  const p = (provider ?? '').trim().toLowerCase();
  return catalog.find(m => m.provider.trim().toLowerCase() === p && sameModel(m.modelName, model)) ?? null;
}

/** "Local" or "Hosted", as a pill says it. */
export const whereText = (m: Pick<CatalogModel, 'local'>) => (m.local ? 'Local' : 'Hosted');

/** A listed model as an advanced select offers it: its name, the model as the provider names it, local or hosted. */
export function catalogOption(m: CatalogModel): AdvancedOption {
  return {
    value: m.modelName, label: m.displayName, sample: m.modelName,
    description: [m.local ? 'Local — runs on your own machines' : 'Hosted', m.note].filter(Boolean).join(' · '),
    badge: whereText(m), badgeTone: m.local ? 'ok' : 'info', keywords: `${m.modelName} ${m.provider}`,
  };
}

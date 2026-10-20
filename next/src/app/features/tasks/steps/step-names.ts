import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { PipelineStepLike, StepNameLookup } from '../../../shared/flow-graph/flow-adapters';
import { StepsApi } from './steps.service';

/**
 * UX review 2026-10-12: the names behind a step's ids, for the flow's nodes -- a saved API request and its environment
 * (integration-service), a prompt, a webhook, a document type. A node read "reque… 1083" and "envir… 1072".
 *
 * Read on demand and once: `lookup` answers what is known (null for the rest, which the node shows as "#1083") and asks
 * for what is not; the answer lands in `names`, a signal, so the flow redraws with it. A refused or failed read is
 * remembered as unknown and not asked again -- a member without API Collections keeps the id.
 *
 * A platform administrator's API-library reads name the pipeline's workspace (`lookupIn`): integration-service refuses
 * his read that names none. Ids are the platform's own, so a name read once holds for every workspace.
 */
/** The query, with a platform administrator's workspace when one is named. */
function scoped(params: Record<string, number>, tenantId: number | null): Record<string, number> {
  return tenantId ? { ...params, tenantId } : params;
}

@Injectable({ providedIn: 'root' })
export class StepNames {
  private readonly http = inject(HttpClient);
  private readonly steps = inject(StepsApi);

  /** `${format}:${id}` -> name. */
  readonly names = signal<Record<string, string>>({});
  private readonly asked = new Set<string>();
  /** requestId -> its collection, for an environment the step names beside it. */
  private readonly collectionOf = new Map<number, number>();

  readonly lookup: StepNameLookup = this.lookupIn(null);

  /** The lookup for a pipeline of this workspace (null: the reader's own). */
  lookupIn(tenantId: number | null): StepNameLookup {
    return (format, value, step) => {
      const key = `${format}:${value}`;
      const known = this.names()[key];
      if (known !== undefined) return known;
      // Asked after the drawing that wanted it: a computed must not write the signal it reads.
      queueMicrotask(() => this.want(format, Number(value), step, tenantId));
      return null;
    };
  }

  private put(entries: Record<string, string>): void {
    if (Object.keys(entries).length) this.names.update(n => ({ ...n, ...entries }));
  }

  private want(format: string, id: number, step: PipelineStepLike, tenantId: number | null): void {
    if (!Number.isFinite(id)) return;
    switch (format) {
      case 'api-request': return this.request(id, tenantId);
      case 'api-environment': {
        const requestId = Number(step.config?.['requestId']);
        if (Number.isFinite(requestId)) this.request(requestId, tenantId);
        return;
      }
      case 'prompt': return this.once('prompt', () => this.steps.prompts().pipe(catchError(() => of([]))).subscribe(list =>
        this.put(Object.fromEntries(list.map(p => [`prompt:${p.id}`, p.label])))));
      case 'webhook': return this.once('webhook', () => this.steps.webhooks().pipe(catchError(() => of([]))).subscribe(list =>
        this.put(Object.fromEntries(list.map(w => [`webhook:${w.id}`, w.label.replace(/^#\d+\s+/, '')])))));
      case 'document-type': return this.once('document-type', () => this.steps.documentTypes().pipe(catchError(() => of([]))).subscribe(list =>
        this.put(Object.fromEntries(list.map(t => [`document-type:${t.id}`, t.label])))));
      default: return;
    }
  }

  private once(key: string, read: () => void): void {
    if (this.asked.has(key)) return;
    this.asked.add(key);
    read();
  }

  /** A request's name, then its collection's environments (whose names the step's environmentId may want). */
  private request(requestId: number, tenantId: number | null): void {
    this.once(`api-request:${requestId}`, () => this.http.get<ApiResponse<{ name?: string; collectionId?: number }>>(
      `${API_BASE}/apiCollection.json/request/get`, { params: scoped({ requestId }, tenantId) }).pipe(catchError(() => of(null))).subscribe(r => {
      if (!r || r.status !== API_SUCCESS || !r.data) return;
      if (r.data.name) this.put({ [`api-request:${requestId}`]: r.data.name });
      const collectionId = Number(r.data.collectionId);
      if (!Number.isFinite(collectionId)) return;
      this.collectionOf.set(requestId, collectionId);
      this.collection(collectionId, tenantId);
    }));
  }

  private collection(collectionId: number, tenantId: number | null): void {
    this.once(`collection:${collectionId}`, () => this.http.get<ApiResponse<{ environments?: { environmentId: number; name: string }[] }>>(
      `${API_BASE}/apiCollection.json/get`, { params: scoped({ collectionId }, tenantId) }).pipe(catchError(() => of(null))).subscribe(r => {
      if (!r || r.status !== API_SUCCESS) return;
      this.put(Object.fromEntries((r.data?.environments ?? []).map(e => [`api-environment:${e.environmentId}`, e.name])));
    }));
  }
}

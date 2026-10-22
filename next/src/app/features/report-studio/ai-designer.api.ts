import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_BASE, ApiResponse } from '../../core/api/api.config';
import { Problem } from './report-studio.model';

/** What the AI designer is asked for (ai-service's ai_report_proposal.kind). */
export type ProposalKind = 'DRAFT_TEMPLATE' | 'SUGGEST_MAPPINGS' | 'SUGGEST_CHARTS' | 'EXPLAIN_VALIDATION' | 'DRAFT_TEXT';
export type ProposalState = 'PROPOSED' | 'ACCEPTED' | 'DISMISSED' | 'INVALID';

/** One RFC 6902 operation (the AI designer uses add, remove, replace and test). */
export interface PatchOp { op: 'add' | 'remove' | 'replace' | 'test'; path: string; value?: unknown; }

export interface ChangedBlock { id: string; type: string; label?: string; keys?: string[]; }

/**
 * A proposal (Report Studio phase 6): a JSON Patch over the draft it was made on (baseVersion, baseRevision), what media's
 * check says it changes, and what to show with it. Never applied by itself: the person accepts it, then the designer applies
 * and saves it as one undo step.
 */
export interface Proposal {
  proposalId: number;
  templateId: string;
  kind: ProposalKind;
  state: ProposalState;
  baseVersion: number;
  baseRevision: number;
  model?: string | null;
  connection?: string | null;
  instruction?: string | null;
  createdAt?: string | null;
  decidedAt?: string | null;
  confidence?: number;
  patch: PatchOp[];
  summary?: string;
  question?: string;
  notes?: string[];
  dataSent?: string;
  changes?: { added?: ChangedBlock[]; removed?: ChangedBlock[]; changed?: ChangedBlock[]; template?: string[] };
  mappings?: { field: string; source: string; type?: string; confidence: number; reason?: string }[];
  explanations?: { code?: string; componentId?: string; explanation: string; fix?: string }[];
  validation?: { reason?: string; refusals?: string[]; newErrors?: Problem[]; problems?: Problem[] };
}

/** The test data as the AI may see it: the fields always, records only when the person ticks "include sample values". */
export interface AiDataContext {
  label?: string;
  shape?: string;
  fields: { path: string; type: string }[];
  records?: unknown[];
  includeValues?: boolean;
}

export interface AiRequest {
  templateId: string;
  version: number;
  revision: number;
  instruction?: string;
  data?: AiDataContext | null;
  problems?: Problem[];
  afterComponentId?: string | null;
}

export interface AiStatus { available: boolean; connection?: string; model?: string; local?: boolean; reason?: string; instructionMaxChars?: number; maxRecords?: number; }

/** The proposal a refusal carries (accepting a stale one answers 409 with it, INVALID now). */
export function refusedProposal(e: unknown): Proposal | null {
  const body = e instanceof HttpErrorResponse ? e.error : null;
  const data = body && typeof body === 'object' ? (body as { data?: unknown }).data : null;
  return data && typeof data === 'object' && 'proposalId' in (data as object) ? data as Proposal : null;
}

const PATHS: Record<ProposalKind, string> = {
  DRAFT_TEMPLATE: 'draftTemplate',
  SUGGEST_MAPPINGS: 'suggestMappings',
  SUGGEST_CHARTS: 'suggestCharts',
  EXPLAIN_VALIDATION: 'explainValidation',
  DRAFT_TEXT: 'draftText',
};

/** ai-service's /reportDesigner.json (page report-templates): proposals for the open draft. */
@Injectable({ providedIn: 'root' })
export class AiDesignerApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/reportDesigner.json`;

  status(): Observable<AiStatus> {
    return this.http.get<ApiResponse<AiStatus>>(`${this.base}/status`).pipe(map(r => r.data as AiStatus));
  }

  propose(kind: ProposalKind, body: AiRequest): Observable<Proposal> {
    return this.http.post<ApiResponse<Proposal>>(`${this.base}/${PATHS[kind]}`, body).pipe(map(r => r.data as Proposal));
  }

  accept(proposalId: number, version: number, revision: number): Observable<Proposal> {
    return this.http.post<ApiResponse<Proposal>>(`${this.base}/proposal/accept`, { proposalId, version, revision }).pipe(map(r => r.data as Proposal));
  }

  dismiss(proposalId: number): Observable<Proposal> {
    return this.http.post<ApiResponse<Proposal>>(`${this.base}/proposal/dismiss`, { proposalId }).pipe(map(r => r.data as Proposal));
  }

  proposals(templateId: string, limit = 10): Observable<Proposal[]> {
    return this.http.get<ApiResponse<{ proposals: Proposal[] }>>(`${this.base}/proposals`, { params: { templateId, limit: String(limit) } })
      .pipe(map(r => r.data?.proposals ?? []));
  }
}

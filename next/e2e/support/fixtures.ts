import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The rebuilt platform's people and rows, in one place (M19 of the 2026-10-07 console review).
 *
 * On 2026-10-06 the platform's data was wiped and rebuilt, and every id the suite knew (workspace 2924, its admin 4537,
 * the user "Alex", "UI-CHECK registry chain job 0929", the "UI-REVIEW LocalStack S3" connection...) went with it. The
 * rebuild writes what it made into etl-platform/.state/demo/rebuild.json; this module reads that file, so a spec names
 * a role ("Riverside's admin", "the readmission pipeline's job") and never an id. Another rebuild rewrites the file and
 * the suite follows it.
 *
 *   E2E_FIXTURES   the file to read (default: etl-platform/.state/demo/rebuild.json next to this repository, found the
 *                  way session.ts finds the mint script)
 *
 * The file is git-ignored and only on a machine that ran the rebuild. Without it the specs that need it skip, naming
 * the file: see NEEDS_FIXTURES. Everything here is READ: the rebuilt pipelines, schedules, prompts, collections and
 * dashboards are the demo's, and the suite never changes or deletes them. What a spec makes for itself is named "E2E ..."
 * and lives in Riverside (the default workspace of every role in session.ts).
 */
export const FIXTURES_PATH = process.env['E2E_FIXTURES']
  ?? resolve(__dirname, '../../../../etl-platform/.state/demo/rebuild.json');

export interface Workspace {
  name: string; mode: 'SELF' | 'MANAGED'; bucket: string; tenantId: number;
  admin: number; adminUsername: string; reviewer: number; reviewerUsername: string; viewer: number; viewerUsername: string;
  profiles: { reviewer: number; viewer: number; [name: string]: number };
  /** The workspace's object-storage connection (an S3 bucket in LocalStack) and its alias. */
  storageConnectionId: number; storageAlias: string;
  aiConnectionId: number; topicId: number;
}

export interface RebuiltRun { jobQueueId: number; status: string; message?: string; review?: string; files?: [string, number][] }

export interface RebuiltPipeline {
  workspace?: 'riverside' | 'meridian' | 'openData';
  pipelineId: string; pipelineKey: number; definitionVersion: number; taskId: number; jobId: number;
  promptId?: number; formId?: number;
  schedule?: { execution: string; schedule: { schedulerId: number; frequency: string } };
  run?: RebuiltRun;
}

export interface Rebuild {
  platformAdmin: { appUserId: number; username: string };
  workspaces: { riverside: Workspace; meridian: Workspace; openData: Workspace };
  pipelines: Record<string, RebuiltPipeline>;
  apis: { collectionId: number; environmentId: number; requests: Record<string, number> };
  dashboards: Record<string, { id: number; name: string; workspace?: string }>;
  billing?: { invoice?: { invoiceId: number; number: string; status: string } };
  apicheck?: { tenantUser: number };
  [key: string]: unknown;
}

let cached: Rebuild | null | undefined;

/** The rebuild's state, or null when the file is not on this machine (the specs that need it then skip). */
export function rebuild(): Rebuild | null {
  if (cached !== undefined) return cached;
  cached = existsSync(FIXTURES_PATH) ? JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')) as Rebuild : null;
  return cached;
}

export const hasFixtures = (): boolean => rebuild() !== null;

export const NEEDS_FIXTURES = `needs the rebuild's state file ${FIXTURES_PATH} (or E2E_FIXTURES): run the platform rebuild first`;

function need(): Rebuild {
  const r = rebuild();
  if (!r) throw new Error(NEEDS_FIXTURES);
  return r;
}

/** Riverside Health (SELF): the suite's own workspace. Its admin, reviewer and viewer are session.ts's admin and user. */
export const riverside = (): Workspace => need().workspaces.riverside;
/** Meridian Finance & Retail (SELF). */
export const meridian = (): Workspace => need().workspaces.meridian;
/** Open Data Lab (MANAGED). */
export const openData = (): Workspace => need().workspaces.openData;

/** The test platform administrator (never the owner's own account). */
export const platformAdminId = (): number => need().platformAdmin.appUserId;

/** A rebuilt pipeline by its key in rebuild.json (e.g. 'readmission', 'patient360'); fails naming it when absent. */
export function pipeline(name: string): RebuiltPipeline {
  const p = need().pipelines[name];
  if (!p) throw new Error(`${FIXTURES_PATH} has no pipeline "${name}"`);
  return p;
}

/** The rebuilt pipelines of one workspace (a pipeline without a workspace in the file is Riverside's). */
export function pipelinesOf(workspace: 'riverside' | 'meridian' | 'openData'): [string, RebuiltPipeline][] {
  return Object.entries(need().pipelines).filter(([, p]) => (p.workspace ?? 'riverside') === workspace);
}

/** A rebuilt dashboard by its key in rebuild.json (e.g. 'readmission'): read only. */
export function dashboard(name: string): { id: number; name: string } {
  const d = need().dashboards[name];
  if (!d) throw new Error(`${FIXTURES_PATH} has no dashboard "${name}"`);
  return d;
}

/** The rebuilt API collection (Riverside's FHIR/RxNorm/openFDA/ClinicalTrials requests): read only. */
export const apis = () => need().apis;

/** People the suite never acts as: the owner (before and after the wipe) and api-check's tenant user. */
export function forbiddenIds(): number[] {
  const r = rebuild();
  const owner = Number((r?.['owner'] as { appUserId?: number } | undefined)?.appUserId);
  return [1000, ...(owner ? [owner] : []), ...(r?.apicheck?.tenantUser ? [r.apicheck.tenantUser] : [])];
}

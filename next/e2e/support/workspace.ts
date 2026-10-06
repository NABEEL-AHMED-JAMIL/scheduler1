import { APIRequestContext, expect } from '@playwright/test';
import { api, authOf, Session } from './session';

/**
 * Finding a spec's live fixtures by a stable name instead of a pinned id (MIG-330).
 *
 * executions.spec pinned job 2849 and runs 7383 and 7405 and drifted twice: ids are whatever the database handed out,
 * and a kept file expires after its pipeline's retention. Names are what people gave these rows on purpose, so a spec
 * finds the row by its name, and where the row is something a spec can make (a run, a job), it makes it once and
 * reuses it afterwards. Every row made here is in the signed-in workspace and is named "E2E ..."; none is deleted.
 */

async function body(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<any> {
  return response.json().catch(() => ({}));
}

export async function getJson(request: APIRequestContext, s: Session, path: string): Promise<any> {
  return body(await request.get(`${api}${path}`, { headers: authOf(s) }));
}

export async function postJson(request: APIRequestContext, s: Session, path: string, data: unknown = {}): Promise<any> {
  return body(await request.post(`${api}${path}`, { headers: authOf(s), data }));
}

export interface Job { jobId: number; jobName: string; jobStatus: string; taskDetail?: { taskDetailId: number; taskName: string } }

export async function jobs(request: APIRequestContext, s: Session): Promise<Job[]> {
  return (await getJson(request, s, '/sourceJob.json/listSourceJob?page=1&limit=1000')).data ?? [];
}

/** The job with exactly this name; fails the test, naming it, when the workspace has none. */
export async function jobNamed(request: APIRequestContext, s: Session, name: string): Promise<Job> {
  const job = (await jobs(request, s)).find(j => j.jobName === name);
  expect(job, `workspace ${s.tenantId} has a job named "${name}"`).toBeTruthy();
  return job!;
}

export interface Run { jobQueueId: number; jobStatus: string }

export async function runsOf(request: APIRequestContext, s: Session, jobId: number): Promise<Run[]> {
  return (await getJson(request, s, `/sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=${jobId}`)).data?.jobQueues ?? [];
}

/** Run now, then wait for the new run to finish one way or the other. Answers the run. */
export async function runNow(request: APIRequestContext, s: Session, jobId: number, timeout = 180_000): Promise<Run> {
  const before = new Set((await runsOf(request, s, jobId)).map(r => r.jobQueueId));
  const ran = await postJson(request, s, '/sourceJob.json/runSourceJob', { jobId });
  expect(ran.status, `Run now on job ${jobId}: ${ran.message}`).toBe('SUCCESS');
  let run: Run | undefined;
  await expect.poll(async () => {
    run = (await runsOf(request, s, jobId)).find(r => !before.has(r.jobQueueId));
    return run?.jobStatus ?? 'none';
  }, { timeout, intervals: [2000, 3000, 5000], message: `job ${jobId}'s new run finishes` })
    .toMatch(/^(Completed|Failed|Stopped|Skipped|Interrupted)$/);
  return run!;
}

export interface Kept { run: number; dataset: number }

/**
 * A recent Completed run of the job that still keeps a file named `file` (a kept file expires after its pipeline's
 * datasetRetentionHours). When none does any more, the job is run once -- which is what the spec's own header used to
 * ask a person to do by hand -- and its run is used.
 */
export async function keptRun(request: APIRequestContext, s: Session, jobId: number, file: string): Promise<Kept> {
  const look = async (): Promise<Kept | null> => {
    for (const run of (await runsOf(request, s, jobId)).filter(r => r.jobStatus === 'Completed').slice(0, 3)) {
      const outputs = (await getJson(request, s, `/sourceJob.json/runOutputs?jobQueueId=${run.jobQueueId}`)).data?.outputs ?? [];
      const kept = outputs.find((o: { kind: string; name: string; expired?: boolean }) => o.kind === 'file' && o.name === file && !o.expired);
      if (kept) return { run: run.jobQueueId, dataset: kept.runDatasetId };
    }
    return null;
  };
  const found = await look();
  if (found) return found;
  const run = await runNow(request, s, jobId);
  expect(run.jobStatus, `job ${jobId}'s fresh run`).toBe('Completed');
  const fresh = await look();
  expect(fresh, `job ${jobId}'s fresh run ${run.jobQueueId} keeps ${file}`).toBeTruthy();
  return fresh!;
}

export interface Pipeline { pipelineKey: number; pipelineId: string; pipelineName: string; sourceTaskTypeId: number }

export async function pipelineById(request: APIRequestContext, s: Session, pipelineId: string): Promise<Pipeline> {
  const rows: Pipeline[] = (await getJson(request, s, `/pipeline.json/list?page=1&limit=1000&q=${encodeURIComponent(pipelineId)}`)).data?.rows ?? [];
  const found = rows.find(p => p.pipelineId === pipelineId);
  expect(found, `workspace ${s.tenantId} has the pipeline ${pipelineId}`).toBeTruthy();
  return found!;
}

export interface Task { taskDetailId: number; taskName: string; pipelineId?: string; taskStatus?: string }

export async function tasks(request: APIRequestContext, s: Session): Promise<Task[]> {
  return (await postJson(request, s, '/sourceTask.json/listSourceTask?page=1&limit=1000', {})).data ?? [];
}

export interface Form { formId: number; name: string; status: string }

export async function formNamed(request: APIRequestContext, s: Session, name: string): Promise<Form> {
  const forms: Form[] = (await getJson(request, s, '/form.json/list')).data ?? [];
  const found = forms.find(f => f.name === name);
  expect(found, `workspace ${s.tenantId} has a form named "${name}"`).toBeTruthy();
  return found!;
}

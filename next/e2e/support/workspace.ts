import { APIRequestContext, expect } from '@playwright/test';
import { api, authOf, Session } from './session';

/**
 * Finding a spec's live fixtures by a stable name instead of a pinned id (MIG-330).
 *
 * executions.spec pinned job 2849 and runs 7383 and 7405 and drifted twice: ids are whatever the database handed out,
 * and a kept file expires after its pipeline's retention. Names are what people gave these rows on purpose, so a spec
 * finds the row by its name, and where the row is something a spec can make (a run, a job), it makes it once and
 * reuses it afterwards. Every row made here is in the signed-in workspace and is named "E2E ..."; the shared input files
 * (ensureObject, under e2e/ in the workspace's bucket) are kept for the next run, and what a spec makes for one run it
 * removes again with bestEffort(...) in its afterAll.
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

/** A run's recorded outputs (kept files and bucket uploads). */
export interface Output { stepKey: string; kind: 'file' | 'bucket'; name: string; format?: string; runDatasetId?: number;
  bucket?: string; key?: string; expired?: boolean }

export async function outputsOf(request: APIRequestContext, s: Session, run: number): Promise<Output[]> {
  return (await getJson(request, s, `/sourceJob.json/runOutputs?jobQueueId=${run}`)).data?.outputs ?? [];
}

/** The job with this id (fails the test, naming it, when the workspace has none). */
export async function jobById(request: APIRequestContext, s: Session, jobId: number): Promise<Job> {
  const job = (await jobs(request, s)).find(j => j.jobId === jobId);
  expect(job, `workspace ${s.tenantId} has job ${jobId}`).toBeTruthy();
  return job!;
}

/**
 * Clean-up that never fails the test: a spec removes what it made, as far as the product lets it, and a refusal or a
 * container restarting under it is noted on the test rather than turning a passing test red.
 */
export async function bestEffort(what: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.log(`[e2e] clean-up skipped (${what}): ${(error as Error).message?.split('\n')[0]}`);
  }
}

/**
 * A file the suite reads, put in the workspace's bucket once and kept (a spec's shared input, under e2e/): uploaded
 * when missing or a different size.
 */
export async function ensureObject(request: APIRequestContext, s: Session, bucket: string, key: string, content: Buffer,
  mimeType = 'text/csv'): Promise<void> {
  const meta = await body(await request.get(`${api}/storage.json/objectMetadata`, { headers: authOf(s), params: { bucket, key } }));
  if (meta.status === 'SUCCESS' && Number(meta.data?.size) === content.length) return;
  const slash = key.lastIndexOf('/');
  const upload = await body(await request.post(`${api}/storage.json/uploadObject`, { headers: authOf(s), timeout: 120_000, multipart: {
    bucket, prefix: key.slice(0, slash + 1), file: { name: key.slice(slash + 1), mimeType, buffer: content } } }));
  expect(upload.status, `upload ${bucket}/${key}: ${upload.message}`).toBe('SUCCESS');
}

export async function deleteObject(request: APIRequestContext, s: Session, bucket: string, key: string): Promise<void> {
  await request.delete(`${api}/storage.json/deleteObject?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`,
    { headers: authOf(s) });
}

interface PersonAccess { appUserId: number; allowedExceptions: string[]; withheldExceptions: string[] }

/**
 * Lends a person pages on top of their profile, as their administrator ticking the boxes would, and answers how to put
 * them back: the exceptions they had before, exactly. For a spec whose steps need a page the rebuilt person's profile
 * does not hold (a reviewer filling in a form); the profile itself is never touched. The answer takes the request
 * context of wherever it is called (a beforeAll's cannot be used in afterAll).
 */
export async function lendPages(request: APIRequestContext, admin: Session, appUserId: number, pages: string[]):
  Promise<(request: APIRequestContext) => Promise<void>> {
  const headers = authOf(admin);
  const people = (await getJson(request, admin, '/pageAccess.json/listPeople')).data ?? [];
  const before: PersonAccess | undefined = people.find((p: PersonAccess) => p.appUserId === appUserId);
  expect(before, `${appUserId} is in workspace ${admin.tenantId}`).toBeTruthy();
  for (const pageKey of pages) {
    await request.put(`${api}/pageAccess.json/setPageAccess`, { headers, params: { appUserId, pageKey, allowed: true } });
  }
  return async (request: APIRequestContext) => {
    await request.delete(`${api}/pageAccess.json/clearPageAccess?appUserId=${appUserId}`, { headers });
    for (const pageKey of before!.allowedExceptions) {
      await request.put(`${api}/pageAccess.json/setPageAccess`, { headers, params: { appUserId, pageKey, allowed: true } });
    }
    for (const pageKey of before!.withheldExceptions) {
      await request.put(`${api}/pageAccess.json/setPageAccess`, { headers, params: { appUserId, pageKey, allowed: false } });
    }
  };
}

// ------------------------------------------------------------------------- a spec's own pipeline, task and job

/** A registry pipeline of the spec's own on the given topic, with one optional text field; answers its key. */
export async function makePipeline(request: APIRequestContext, s: Session, pipelineId: string, pipelineName: string,
  topicId: number): Promise<number> {
  const saved = await postJson(request, s, '/pipeline.json/save', {
    pipelineId, pipelineName, sourceTaskTypeId: topicId, status: 'Active',
    description: 'Made by the e2e suite for one run, and deleted by it.',
    fields: [{ tagKey: 'batch_note', label: 'Batch note', fieldType: 'text', required: false, position: 0 }],
  });
  expect(saved.status, `save pipeline ${pipelineId}: ${saved.message}`).toBe('SUCCESS');
  return (await pipelineById(request, s, pipelineId)).pipelineKey;
}

/** A task (a console "pipeline") on a registry pipeline; answers its id. */
export async function makeTask(request: APIRequestContext, s: Session, taskName: string, pipelineId: string,
  topicId: number): Promise<number> {
  const made = await postJson(request, s, '/sourceTask.json/addSourceTask', {
    taskName, sourceTaskType: { sourceTaskTypeId: topicId }, taskStatus: 'Active', pipelineId,
    taskPayload: '<data><batch_note>e2e</batch_note></data>',
    xmlTagsInfo: [{ tagKey: 'data', tagParent: 'data', tagValue: null }, { tagKey: 'batch_note', tagParent: 'data', tagValue: 'e2e' }],
  });
  expect(made.status, `add task ${taskName}: ${made.message}`).toBe('SUCCESS');
  const task = (await tasks(request, s)).find(t => t.taskName === taskName);
  expect(task, `the task ${taskName} is listed`).toBeTruthy();
  return task!.taskDetailId;
}

/** A manual (Only when started), Active job on a task; answers its id. */
export async function makeJob(request: APIRequestContext, s: Session, jobName: string, taskDetailId: number): Promise<number> {
  const made = await postJson(request, s, '/sourceJob.json/addSourceJob', {
    jobName, taskDetail: { taskDetailId }, execution: 'Manual', priority: 1, maxAttempts: 1, retryBackoffSeconds: 30,
    jobStatus: 'Active', completeJob: false, failJob: false, skipJob: false,
  });
  expect(made.status, `add job ${jobName}: ${made.message}`).toBe('SUCCESS');
  const job = (await jobs(request, s)).find(j => j.jobName === jobName);
  expect(job, `the job ${jobName} is listed`).toBeTruthy();
  return job!.jobId;
}

/** Removes what makePipeline/makeTask/makeJob made, job first; best effort, never failing the test. */
export async function removeMade(request: APIRequestContext, s: Session,
  made: { jobs?: number[]; tasks?: number[]; pipelines?: number[] }): Promise<void> {
  const headers = authOf(s);
  for (const jobId of made.jobs ?? []) {
    await bestEffort(`delete job ${jobId}`, () => request.put(`${api}/sourceJob.json/deleteSourceJob`, { headers, data: { jobId } }));
  }
  for (const taskDetailId of made.tasks ?? []) {
    await bestEffort(`delete task ${taskDetailId}`, () => request.put(`${api}/sourceTask.json/deleteSourceTask`,
      { headers, data: { taskDetailId, taskStatus: 'Delete' } }));
  }
  for (const pipelineKey of made.pipelines ?? []) {
    await bestEffort(`delete pipeline ${pipelineKey}`, () => request.delete(`${api}/pipeline.json/delete?pipelineKey=${pipelineKey}`, { headers }));
  }
}

/**
 * Deletes a topic the spec made, once nothing publishes on it any more: Core refuses while a pipeline still names it,
 * and a pipeline deleted a moment ago can still count, so the delete is asked again for a few seconds.
 */
export async function deleteTopic(request: APIRequestContext, s: Session, sourceTaskTypeId: number): Promise<void> {
  await bestEffort(`delete topic ${sourceTaskTypeId}`, async () => {
    let last = '';
    for (let i = 0; i < 10; i++) {
      const r = await body(await request.delete(`${api}/setting.json/deleteSourceTaskType?sourceTaskTypeId=${sourceTaskTypeId}`,
        { headers: authOf(s) }));
      if (r.status === 'SUCCESS') return;
      last = r.message;
      await new Promise(done => setTimeout(done, 1500));
    }
    throw new Error(last);
  });
}

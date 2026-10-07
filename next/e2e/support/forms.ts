import { APIRequestContext, expect } from '@playwright/test';
import { api, authOf, Session } from './session';
import { bestEffort, getJson, postJson } from './workspace';

/**
 * Forms and workflows a spec makes for itself (the rebuilt workspaces have one form and no form workflow): made through
 * the API the builder and the designer use, named "E2E ...", and put away again when the spec ends -- a form is
 * archived and a workflow switched to Inactive, the furthest either service goes (neither deletes).
 */

export interface FieldDraft { key: string; label: string; type: string; required: boolean; [more: string]: unknown }

/** An Active form; answers its id. */
export async function makeForm(request: APIRequestContext, s: Session, name: string, fields: FieldDraft[],
  workflowKey: string | null = null): Promise<number> {
  const saved = await postJson(request, s, '/form.json/save', {
    formId: null, name, description: 'Made by the e2e suite for one run; archived by it.', status: 'Active', jobId: null, fields, workflowKey,
  });
  expect(saved.status, `save form ${name}: ${saved.message}`).toBe('SUCCESS');
  return saved.data.formId;
}

/** A form's id by its name (the newest of that name), or 0. */
export async function formIdNamed(request: APIRequestContext, s: Session, name: string): Promise<number> {
  const forms: { formId: number; name: string }[] = (await getJson(request, s, '/form.json/list')).data ?? [];
  return forms.filter(f => f.name === name).map(f => f.formId).sort((a, b) => b - a)[0] ?? 0;
}

export async function submitForm(request: APIRequestContext, s: Session, formId: number, answers: Record<string, unknown>):
  Promise<{ submissionId: number }> {
  const sent = await postJson(request, s, '/form.json/submit', { formId, answers });
  expect(sent.status, `submit form ${formId}: ${sent.message} ${JSON.stringify(sent.data ?? '')}`).toBe('SUCCESS');
  return sent.data;
}

export async function archiveForm(request: APIRequestContext, s: Session, formId: number): Promise<void> {
  await bestEffort(`archive form ${formId}`, async () => {
    const r = await postJson(request, s, '/form.json/status', { formId, status: 'Archived' });
    if (r.status !== 'SUCCESS') throw new Error(r.message);
  });
}

/** A published workflow (version 1) on a subject type, with the given steps. */
export async function makeWorkflow(request: APIRequestContext, s: Session, key: string, name: string, subjectType: string,
  steps: Record<string, unknown>[]): Promise<void> {
  const made = await postJson(request, s, '/workflow.json/create', { key, name, description: 'Made by the e2e suite.', subjectType });
  expect(made.status, `create workflow ${key}: ${made.message}`).toBe('SUCCESS');
  const published = await postJson(request, s, '/workflow.json/publish', { key, steps: { steps }, note: 'e2e' });
  expect(published.status, `publish workflow ${key}: ${published.message} ${JSON.stringify(published.data?.problems ?? '')}`).toBe('SUCCESS');
}

export async function inactivateWorkflow(request: APIRequestContext, s: Session, key: string): Promise<void> {
  await bestEffort(`switch workflow ${key} off`, async () => {
    const r = await (await request.post(`${api}/workflow.json/status`, { headers: authOf(s), params: { key, status: 'Inactive' } })).json();
    if (r.status !== 'SUCCESS') throw new Error(r.message);
  });
}

/**
 * The person's open task on one of the spec's own workflows, waited for (the engine assigns it asynchronously). Matched
 * by the workflow's key only: the reviewer's inbox also holds the rebuild's tasks, which the suite never decides.
 */
export async function openTaskOf(request: APIRequestContext, s: Session, workflowKey: string): Promise<{ id: number }> {
  let task: { id: number } | undefined;
  await expect.poll(async () => {
    const mine: { id: number; workflow?: string; state: string }[] = (await getJson(request, s, '/taskInbox.json/mine?limit=50')).data ?? [];
    task = mine.find(t => t.state === 'Open' && t.workflow === workflowKey);
    return !!task;
  }, { timeout: 30_000, message: `an open task of workflow ${workflowKey}` }).toBe(true);
  return task!;
}

/** Cancels the requester's still-running requests of one of the spec's workflows (a test that stopped half-way). */
export async function cancelRunning(request: APIRequestContext, requester: Session, workflowKey: string): Promise<void> {
  const mine: { id: number; workflow: string; state: string }[] = (await getJson(request, requester, '/taskInbox.json/requests?limit=50')).data ?? [];
  for (const r of mine.filter(x => x.workflow === workflowKey && x.state === 'Running')) {
    await bestEffort(`cancel request ${r.id}`, () => request.post(`${api}/taskInbox.json/cancel`, {
      headers: { ...authOf(requester), 'Idempotency-Key': `e2e-cancel-${r.id}` }, params: { id: r.id, reason: 'e2e clean-up' } }));
  }
}

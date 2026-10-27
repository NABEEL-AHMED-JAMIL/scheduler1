import { HistoryEvent } from './workflows.api';

/**
 * A workflow request's subject in the shape task 2904 had (owner, 2026-10-27: Riverside's "New patient intake", the senior
 * nurse's approval), with synthetic values: a form's own fields, a Run pipeline step's outcome kept at "assessment" (the
 * run's envelope mixed with the pipeline's result fields, one of them masked), a second outcome without results, and two
 * kept approval decisions -- one naming its person, one whose name was not known when it was kept.
 */
export const SUMMARY = 'Jordan Example, a 76-year-old female, presents with chest tightness when walking uphill, which eases with rest, '
  + 'and more shortness of breath over the past month. She rates the pain 4/10 and takes amlodipine and aspirin.';

export const INTAKE_SUBJECT: Record<string, unknown> = {
  dob: '1950-03-02',
  form: 'New patient intake',
  first_name: 'Jordan',
  last_name: 'Example',
  nurse: { at: '2026-10-27T00:52:52.982112834-05:00', by: 4601, byName: 'Riverside Health reviewer', comment: 'Chest pain on exertion: ECG on arrival.',
    decision: 'approved' },
  senior: { at: '2026-10-27T05:52:53.002342626+00:00', by: 4602, byName: '', comment: '', decision: 'rejected' },
  assessment: {
    ok: true, age: 76, ended: true, jobId: 1479, runId: 2926, masked: ['patient_name'], status: 'Completed',
    message: '4 of 4 step(s) completed. Items: 1 of 1 done.', giveUpAt: '2026-10-27T02:47:13.849158761', rowCount: 1, intake_id: 'S-0001',
    truncated: false, ai_summary: SUMMARY, code_flags: 'symptom: Chest pain', flag_count: 3, resultsStep: 'assess', code_missing: null,
    patient_name: '•••', missing_count: 4, high_risk_meds: null, triage_priority: 'high', validation_line: null,
  },
  summary_report: { ok: true, ended: true, jobId: 1476, runId: 2953, status: 'Completed', message: '6 of 6 step(s) completed. Items: 1 of 1 done.',
    giveUpAt: '2026-10-27T02:52:53.017563584' },
  medications: '[{"dose":"5 mg","name":"Amlodipine"},{"dose":"81 mg","name":"Aspirin"}]',
  submitted_by: 'frontdesk@riverside.test',
};

/** The request's history: the engine names each step as it enters it, and says which run a Run pipeline step started. */
export const INTAKE_HISTORY: HistoryEvent[] = [
  { id: 1, type: 'Started', actor: 4600, at: '2026-10-27T05:47:13.828+00:00' },
  { id: 2, stepKey: 'assess', type: 'StepEntered', detail: '{"name": "Assess the intake: checks, rules and the AI summary", "type": "run_pipeline"}',
    at: '2026-10-27T05:47:13.828+00:00' },
  { id: 3, stepKey: 'assess', type: 'PipelineStarted', actor: 4600, detail: '{"jobId": 1479, "runId": 2926}', at: '2026-10-27T05:47:13.828+00:00' },
  { id: 4, stepKey: 'assess', type: 'PipelineEnded', detail: '{"ok": true, "runId": 2926, "saveAs": "assessment", "status": "Completed"}',
    at: '2026-10-27T05:47:27.421+00:00' },
  { id: 5, stepKey: 'assessed', type: 'StepEntered', detail: '{"name": "Assessed?", "type": "condition"}', at: '2026-10-27T05:47:27.421+00:00' },
  { id: 6, stepKey: 'assessed', type: 'ConditionTrue', detail: '{"next": "nurse"}', at: '2026-10-27T05:47:27.421+00:00' },
  { id: 7, stepKey: 'report', type: 'StepEntered', detail: '{"name": "The signed intake summary", "type": "run_pipeline"}',
    at: '2026-10-27T05:52:52.993+00:00' },
  { id: 8, stepKey: 'report', type: 'PipelineStarted', actor: 4602, detail: '{"jobId": 1476, "runId": 2953}', at: '2026-10-27T05:52:52.993+00:00' },
];

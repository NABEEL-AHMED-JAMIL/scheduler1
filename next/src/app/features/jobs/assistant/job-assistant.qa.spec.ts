import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { classify } from './job-assistant.intents';
import { JobFacts, JobRun, answerFor } from './job-assistant.answers';
import { JobAssistant } from './job-assistant';

/**
 * A QA pass over the job assistant, written against the question a person actually types.
 *
 * The suite that existed before this one proved the assistant cannot be talked into discussing
 * another job, and proved its arithmetic. What nothing covered was the middle: whether an
 * ordinary question reaches the answer that was already sitting in the job's record. It very
 * often did not. Fifty cases below, and the ones that matter are the plain ones --
 * "how long does it take", "list the runs", "what state is it in" -- each of which used to fall
 * through to `unknown`.
 *
 * Why `unknown` is the thing to test for: the component hands an unknown question to whichever
 * AI agent is configured. So a missed pattern does not degrade to a polite "I don't know" -- it
 * degrades to a model answering from a prompt, about a job whose exact figures were one match
 * away. Every `not.toBe('unknown')` here is that door being closed.
 *
 * @author Nabeel Ahmed
 */

const JOB = 2395;

const facts: JobFacts = {
  jobId: JOB, jobName: 'CSV to JSON demo job', jobStatus: 'Active', execution: 'Manual',
  priority: 1, lastJobRun: '2026-09-14T15:54:59.428325',
  assignedUsername: 'etl-demo-admin@demo.local',
  taskName: 'CSV to JSON demo', taskType: 'CSV_TO_JSON', bucket: 'etl-bucket',
  inputFolder: 'demo/in', outputFolder: 'demo/out', schedule: null,
};

const runs: JobRun[] = [
  { jobQueueId: 5530, jobStatus: 'Completed', startTime: '2026-09-14T15:54:59', endTime: '2026-09-14T15:55:08' },
  { jobQueueId: 5529, jobStatus: 'Completed', startTime: '2026-09-13T13:23:37', endTime: '2026-09-13T13:24:23' },
  { jobQueueId: 5527, jobStatus: 'Failed', startTime: '2026-09-11T19:21:04', endTime: '2026-09-11T19:21:30',
    jobStatusMessage: 'Could not hand this run to the worker queue: Failed to construct kafka producer' },
];

/** The ResponseDto envelope every endpoint answers with. */
const ok = (data: unknown): object => ({ status: 'SUCCESS', message: 'ok', data });

const textOf = (blocks: { kind: string }[]) =>
  blocks.map(b => (b as { text?: string }).text ?? '').join(' ');

// =============================================================================================
// 1. Scope: the promise that this assistant knows one job
// =============================================================================================
describe('QA — staying inside job #2395', () => {

  // 1-6. The hole this pass opened with. OTHER_JOB_ID demanded three digits, so every job with
  // a shorter id was invisible to the guard: "tell me about job 99" was answered with a summary
  // of #2395, and "what about job 12" was handed to the model with #2395's facts attached.
  it.each([
    ['what about job 12', 12],
    ['what about job 7', 7],
    ['tell me about job 99', 99],
    ['how does job 8 compare', 8],
    ['job 100 status', 100],
    ['is job #3 running', 3],
  ])('refuses a short job id: %s', (question, expected) => {
    const scoped = classify(question, JOB);
    expect(scoped.intent).toBe('out-of-scope');
    expect(scoped.mentionedJobId).toBe(expected);
  });

  // 7. The counterweight to the above: a bare hash keeps its three-digit floor, because "#1"
  // in prose is a rank, not an id.
  it('does not read "the #1 failure reason" as a job reference', () => {
    expect(classify('what is the #1 failure reason', JOB).intent).not.toBe('out-of-scope');
  });

  // 8. Its own id, in any of the forms the guard now accepts, is not a foreign job.
  it.each([`job ${JOB}`, `job #${JOB}`, `#${JOB}`, `job${JOB} summary`])(
    'does not refuse its own id written as %s', question => {
      expect(classify(question, JOB).intent).not.toBe('out-of-scope');
    });

  // 9. Plural "jobs" is a fleet question however it is phrased. "all/every/other" caught the
  // usual openers and let "how many jobs are there" through to be answered as statistics.
  it.each([
    'how many jobs are there',
    'which jobs failed today',
    'list the jobs',
  ])('refuses a fleet question without a fleet adjective: %s', question => {
    expect(classify(question, JOB).intent).toBe('out-of-scope');
  });

  // 10. A refusal must not confirm anything about the job it declines to discuss.
  it('refuses without leaking a figure about the other job', () => {
    const answer = answerFor('out-of-scope', facts, runs, 12);
    expect(answer.refused).toBe(true);
    expect(textOf(answer.blocks)).toContain('#12');
    expect(textOf(answer.blocks)).not.toMatch(/completed|failed|bucket/i);
  });
});

// =============================================================================================
// 2. Routing: does an ordinary question reach the answer the record already holds?
// =============================================================================================
describe('QA — the question reaches the right answer', () => {

  // 11-26. Sixteen phrasings, every one of which a person typed rather than clicked.
  it.each([
    // Timetable. "what time does it run" used to land on `task` -- the task's name and topic,
    // in answer to a question about the clock.
    ['what time does it run', 'schedule'],
    ['does it run every day', 'schedule'],
    ['when is the next execution', 'schedule'],
    ['has the schedule expired', 'schedule'],

    // Failure. `stats` owned "how many" and answered a question about failures with a tile of
    // counts; the reasons -- the only part anyone wants -- were never shown.
    ['how many runs failed?', 'failures'],
    ['what went wrong', 'failures'],
    ['any errors lately', 'failures'],

    // Figures. All three fell through to `unknown`, so a model was asked for an average the
    // component had already computed.
    ['what is the average duration', 'stats'],
    ['how long does it take', 'stats'],
    ['show a chart of outcomes', 'stats'],

    // Runs. "list the runs" and "show me the last 5 runs" were unknown; "show me the log file"
    // was answered with the bucket, because `target` owned the word "file" and ran first.
    ['list the runs', 'history'],
    ['show me the last 5 runs', 'history'],
    ['show me the log file', 'history'],
    ['what was the last run', 'history'],

    // The job's own state. `\bstat` matched "state" and "status", so both were answered with
    // run counts instead of "Active".
    ['what state is it in', 'summary'],
    ['what is the status', 'summary'],
  ])('%s -> %s', (question, expected) => {
    expect(classify(question, JOB).intent).toBe(expected);
  });

  // 27-31. Facts the record holds and the patterns could not find.
  it.each([
    ['who owns this job', 'summary'],
    ['who is it assigned to', 'summary'],
    ['what is the priority', 'summary'],
    ['is it healthy', 'summary'],
    ['is it working', 'summary'],
  ])('answers from the record rather than a model: %s', (question, expected) => {
    expect(classify(question, JOB).intent).toBe(expected);
  });

  // 32. The regression the bounded-stats fix could have caused, pinned so it cannot come back.
  it('still recognises the statistics words themselves', () => {
    for (const q of ['show the run statistics', 'give me the stats', 'what metrics do you have']) {
      expect(classify(q, JOB).intent).toBe('stats');
    }
  });

  // 33. And the one the summary boundary could have caused: "summarise" does not end at
  // "summar", so a trailing \b on that group silently matched nothing.
  it('still recognises a request for a summary', () => {
    for (const q of ['summarise this job', 'summarize it', 'give me an overview']) {
      expect(classify(q, JOB).intent).toBe('summary');
    }
  });

  // 34. Target keeps what is genuinely its own now that history reads first.
  it.each(['where does it write files', 'which bucket does it use', 'what folder does it save to'])(
    'leaves storage questions with target: %s', question => {
      expect(classify(question, JOB).intent).toBe('target');
    });
});

// =============================================================================================
// 3. The two kinds of question it should answer about ITSELF
// =============================================================================================
describe('QA — greetings and instructions to act', () => {

  // 35-38. A greeting spent a round-trip on a model to be told what the buttons already say.
  it.each(['hi', 'hello', 'help', 'what can you do?'])(
    'answers %s itself instead of paying a model to', question => {
      expect(classify(question, JOB).intent).toBe('capability');
    });

  // 39. Anchored, so a real question that opens with "help" is still that question.
  it('does not read "help me with the failures" as a greeting', () => {
    expect(classify('help me with the failures', JOB).intent).toBe('failures');
  });

  // 40-43. Asked to act, it must say it cannot. Handed to a model instead, the model has no way
  // to run anything and every incentive to reply as though it had.
  it.each(['run it now', 'trigger the job', 'delete this job', 'pause it'])(
    'declines to act on: %s', question => {
      expect(classify(question, JOB).intent).toBe('action');
    });

  it('the refusal to act says where those controls live', () => {
    const answer = answerFor('action', facts, runs);
    expect(answer.refused).toBe(true);
    expect(textOf(answer.blocks)).toMatch(/only read/i);
    expect(textOf(answer.blocks)).toMatch(/own page/i);
  });

  // 44. The verbs need an object, because they are ordinary words in a question about an ETL
  // pipeline. "does it delete old files" describes the task; it does not instruct the assistant.
  it.each([
    'does it delete old files',
    'what does it remove from the bucket',
  ])('does not read a description of the pipeline as an instruction: %s', question => {
    expect(classify(question, JOB).intent).not.toBe('action');
  });
});

// =============================================================================================
// 4. Answers that must not invent
// =============================================================================================
describe('QA — answer content', () => {

  // 45. Priority was collected into JobFacts and rendered nowhere, so the only way to learn it
  // was to ask a model that had never been told it.
  it('shows the priority it collects', () => {
    const rows = (answerFor('summary', facts, runs).blocks
      .find(b => b.kind === 'facts') as { rows: { label: string; value: string }[] }).rows;
    expect(rows.find(r => r.label === 'Priority')?.value).toBe('1');
  });

  // 46. A manual job with no schedule row must not be described as running to a timetable.
  it('describes this job as on demand, because it is', () => {
    expect(textOf(answerFor('schedule', facts, runs).blocks))
      .toMatch(/only when someone triggers it/i);
  });

  // 47. The failure answer leads with the reason, which is the part that is acted on.
  it('leads a failure answer with the message, counted', () => {
    const answer = answerFor('failures', facts, runs);
    expect(textOf(answer.blocks)).toMatch(/1 of 3 runs failed/);
    const rows = (answer.blocks.find(b => b.kind === 'facts') as
      { rows: { label: string; value: string }[] }).rows;
    expect(rows[0].label).toBe('1×');
    expect(rows[0].value).toContain('kafka producer');
  });

  // 48. Zero failures is a sentence, not an empty table.
  it('says plainly that nothing has failed', () => {
    const clean = runs.filter(r => r.jobStatus !== 'Failed');
    expect(textOf(answerFor('failures', facts, clean).blocks))
      .toMatch(/no run of this job has failed across 2 recorded runs/i);
  });

  // 49. Every intent the classifier can produce must have an answer. A new Intent added without
  // a case falls to the guide, which is survivable -- an intent that produced nothing is not.
  it('every intent produces at least one block', () => {
    const all = ['summary', 'stats', 'schedule', 'target', 'failures', 'history', 'task',
                 'capability', 'action', 'out-of-scope', 'unknown'] as const;
    for (const intent of all) {
      expect(answerFor(intent, facts, runs).blocks.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================================
// 5. The component: loading, and what a reader loses when it reloads
// =============================================================================================
describe('QA — the assistant component', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(), provideRouter([]),
        provideHttpClient(), provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  /** Builds the component and settles the job's two requests, leaving agents in flight. */
  function mount() {
    const fixture = TestBed.createComponent(JobAssistant);
    fixture.componentRef.setInput('jobId', String(JOB));
    fixture.detectChanges();
    http.expectOne(r => r.url.includes('fetchSourceJobDetailWithSourceJobId'))
      .flush(ok({ jobId: JOB, jobName: facts.jobName, jobStatus: 'Active', execution: 'Manual',
                  priority: 1, taskDetail: { taskName: facts.taskName, bucket: facts.bucket } }));
    http.expectOne(r => r.url.includes('fetchSourceJobQueueListWithJobId'))
      .flush(ok({ jobQueues: runs }));
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  /**
   * Lets the agent list land, which is what used to re-trigger the whole load.
   *
   * The change detection afterwards is load-bearing, not tidiness. A zoneless TestBed runs an
   * effect only when something pumps it, so flushing the response and asserting immediately
   * proves nothing -- the re-run this suite exists to rule out would not have happened yet
   * either. Without this line the fix passed its own test with the bug put back.
   */
  function landAgents(fixture: { detectChanges: () => void }) {
    http.expectOne(r => r.url.includes('fetchAllAgents'))
      .flush(ok([{ aiAgentId: 1022, agentName: 'Vision Assistant' }]));
    fixture.detectChanges();
  }

  // 50. The bug a reader sees as "it forgot what I asked". The reload effect read agents(), so
  // the agent response made it a dependency change: the job detail and the whole run history
  // were fetched a second time on every load, and the effect clears turns on the way through.
  it('reads the job once, not again when the agent list arrives', () => {
    const { fixture } = mount();
    landAgents(fixture);
    http.expectNone(r => r.url.includes('fetchSourceJobDetailWithSourceJobId'));
    http.expectNone(r => r.url.includes('fetchSourceJobQueueListWithJobId'));
  });

  // 51. The same defect, stated as what it cost: an answer already on screen was wiped, and so
  // was a half-typed question, at whatever moment the agent request happened to land.
  it('keeps an answer already on screen when the agent list arrives', () => {
    const { fixture, component } = mount();
    component.askPreset('summary', 'Summarise this job');
    component.question.set('half typed');
    landAgents(fixture);
    expect(component.turns().length).toBe(1);
    expect(component.question()).toBe('half typed');
  });

  // 52. Scope is enforced here, not in a prompt: a question naming another job is answered
  // locally with a refusal even when an agent is configured and waiting.
  it('never hands an out-of-scope question to the agent', () => {
    const { fixture, component } = mount();
    landAgents(fixture);
    component.ask('what about job 12');
    http.expectNone(r => r.url.includes('askAssistant'));
    expect(component.turns()[0].answer.refused).toBe(true);
  });

  // 53. Nor a greeting, which is the whole reason 'capability' is an intent rather than a
  // fall-through.
  it('never hands a greeting to the agent', () => {
    const { fixture, component } = mount();
    landAgents(fixture);
    component.ask('hello');
    http.expectNone(r => r.url.includes('askAssistant'));
    expect(component.turns().length).toBe(1);
  });

  // 54. What the agent is for: the questions the table genuinely does not recognise.
  it('hands a genuinely unrecognised question to the agent', () => {
    const { fixture, component } = mount();
    landAgents(fixture);
    component.ask('what is 2 plus 2');
    const call = http.expectOne(r => r.url.includes('askAssistant'));
    expect(call.request.body.jobId).toBe(JOB);
    expect(call.request.body.aiAgentId).toBe(1022);
    expect(component.turns()[0].answer.pending).toBe(true);
  });

  // 55. The Ask button disables itself while a question is in flight. Enter did not, so holding
  // the key queued requests behind a single shared `asking` flag that settles once.
  it('ignores a second question while one is in flight', () => {
    const { fixture, component } = mount();
    landAgents(fixture);
    component.ask('what is 2 plus 2');
    http.expectOne(r => r.url.includes('askAssistant'));
    component.ask('what is 3 plus 3');
    http.expectNone(r => r.url.includes('askAssistant'));
    expect(component.turns().length).toBe(1);
  });

  // 56. A success carrying no body is still nothing to show. It used to leave loading false,
  // error empty and facts null -- which renders neither the assistant nor an error, just a
  // blank page with no Try again on it.
  it('shows an error rather than a blank page when the detail comes back empty', () => {
    const fixture = TestBed.createComponent(JobAssistant);
    fixture.componentRef.setInput('jobId', String(JOB));
    fixture.detectChanges();
    http.expectOne(r => r.url.includes('fetchSourceJobDetailWithSourceJobId'))
      .flush({ status: 'SUCCESS', message: '', data: null });
    http.expectOne(r => r.url.includes('fetchSourceJobQueueListWithJobId'))
      .flush({ status: 'SUCCESS', message: 'ok', data: { jobQueues: [] } });
    fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.error()).toBeTruthy();
  });

  // 57. The conversation replayed to the agent has to alternate User/Assistant, and it was
  // filtered a line at a time: an answer with no prose lost its "Assistant: " line and left the
  // question standing, so the model read two User turns in a row and attributed the first
  // question's subject to the second.
  //
  // No answer `answerFor` builds today is prose-free -- every case leads with a text block -- so
  // this sets the turn up directly rather than pretending a preset produces one. AnswerBlock
  // permits a chart-or-table-only answer, which is the shape being pinned; the assertion is on
  // the invariant, not on a path that currently reaches it.
  it('sends the agent an alternating transcript', () => {
    const { fixture, component } = mount();
    landAgents(fixture);
    component.turns.set([
      { id: 2, question: 'Summarise this job', at: new Date(),
        answer: { blocks: [{ kind: 'text', text: 'It runs on demand.' }] } },
      { id: 1, question: 'Show the recent run history', at: new Date(),
        answer: { blocks: [{ kind: 'runs', runs }] } },
    ]);
    component.ask('what is 2 plus 2');
    const body = http.expectOne(r => r.url.includes('askAssistant')).request.body;
    const lines: string[] = body.history;
    expect(lines).toEqual(['User: Summarise this job', 'Assistant: It runs on demand.']);
  });

  // 58. Switching job is the panel's normal life, and answers about the old job must not sit
  // under the new job's name.
  it('clears the transcript when the job changes', () => {
    const { fixture, component } = mount();
    landAgents(fixture);
    component.askPreset('summary', 'Summarise this job');
    expect(component.turns().length).toBe(1);
    fixture.componentRef.setInput('jobId', '2396');
    fixture.detectChanges();
    expect(component.turns().length).toBe(0);
    http.expectOne(r => r.url.includes('fetchSourceJobDetailWithSourceJobId'));
    http.expectOne(r => r.url.includes('fetchSourceJobQueueListWithJobId'));
  });

  afterEach(() => {
    // The agent list is fetched once at construction and most cases never need it to land.
    // Settling it here keeps verify() honest about the requests a case actually caused --
    // including the second job load that used to follow it.
    http.match(r => r.url.includes('fetchAllAgents')).forEach(r => r.flush(ok([])));
    http.verify({ ignoreCancelled: true });
  });
});

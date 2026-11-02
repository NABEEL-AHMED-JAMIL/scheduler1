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
      .toMatch(/no run of this schedule has failed across 2 recorded runs/i);
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

  /**
   * Builds the component and settles the job's two requests and the embedded AI Assistant's two: the tools it names a card with, and
   * the person's newest conversation about this schedule (none, unless `existing` is given).
   */
  function mount(existing: { conversationId: number; title: string } | null = null) {
    const fixture = TestBed.createComponent(JobAssistant);
    fixture.componentRef.setInput('jobId', String(JOB));
    fixture.detectChanges();
    http.expectOne(r => r.url.includes('fetchSourceJobDetailWithSourceJobId'))
      .flush(ok({ jobId: JOB, jobName: facts.jobName, jobStatus: 'Active', execution: 'Manual',
                  priority: 1, taskDetail: { taskName: facts.taskName, bucket: facts.bucket } }));
    http.expectOne(r => r.url.includes('fetchSourceJobQueueListWithJobId'))
      .flush(ok({ jobQueues: runs }));
    fixture.detectChanges();
    settleThread(existing);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  function settleThread(existing: { conversationId: number; title: string } | null) {
    http.match(r => r.url.includes('/tools/list')).forEach(r => r.flush(ok([])));
    const list = http.expectOne(r => r.url.includes('/assistant/conversations'));
    expect(list.request.params.get('scopeJobId')).toBe(String(JOB));
    list.flush(ok(existing ? [{ ...existing, scopeJobId: JOB }] : []));
  }

  // Owner 2026-11-02: no prompt picker, no saved prompt -- nothing asks for the agent list or the old prompt endpoint any more.
  it('never reads saved prompts, and opens the person\'s newest conversation about this schedule', () => {
    const { el } = mount();
    http.expectNone(r => r.url.includes('fetchAllAgents'));
    expect(el.querySelector('[data-test="agent-picker"]')).toBeNull();
    expect(el.querySelector('[data-embedded="schedule"]')).not.toBeNull();
  });

  // A typed question is the AI Assistant's, about this schedule only: the scope rides with the new conversation and the server
  // holds every tool call to it.
  it('sends a typed question to the AI Assistant, scoped to this schedule', () => {
    const { fixture, component } = mount();
    component.ask('why did the last run fail?');
    fixture.detectChanges();
    const send = http.expectOne(r => r.url.includes('/assistant/send'));
    expect(send.request.body).toEqual({ message: 'why did the last run fail?', async: true, scopeJobId: JOB });
    http.expectNone(r => r.url.includes('askAssistant'));
    expect(component.turns().length).toBe(0);
    expect(component.question()).toBe('');
  });

  // The Ask button disables itself while a question is in flight; Enter did not, so holding the key queued requests.
  it('ignores a second question while one is in flight', () => {
    const { fixture, component } = mount();
    component.ask('why did the last run fail?');
    fixture.detectChanges();
    http.expectOne(r => r.url.includes('/assistant/send'));
    expect(component.asking()).toBe(true);
    component.ask('and the one before?');
    http.expectNone(r => r.url.includes('/assistant/send'));
  });

  // Kept in the person's history: the next visit opens the same conversation, and a question continues it (the server keeps its scope).
  it('reopens the newest conversation about this schedule and continues it', () => {
    const { fixture, component } = mount({ conversationId: 41, title: 'Why did the last run fail?' });
    http.expectOne(r => r.url.includes('/assistant/conversation') && r.params.get('conversationId') === '41')
      .flush(ok({ conversation: { conversationId: 41, title: 'Why did the last run fail?', scopeJobId: JOB }, messages: [
        { messageId: 1, conversationId: 41, seq: 1, role: 'user', content: 'Why did the last run fail?', links: [] },
        { messageId: 2, conversationId: 41, seq: 2, role: 'assistant', content: 'Run 5527 could not reach the worker queue.', runStatus: 'answered', links: [] }] }));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Run 5527 could not reach the worker queue.');
    const open = el.querySelector<HTMLAnchorElement>('[data-test="open-in-assistant"]')!;
    expect(open.getAttribute('href')).toBe('/ai/assistant?c=41');
    component.ask('how do I fix it?');
    fixture.detectChanges();
    const send = http.expectOne(r => r.url.includes('/assistant/send'));
    expect(send.request.body).toEqual({ message: 'how do I fix it?', async: true, conversationId: 41 });
  });

  // A success carrying no body is still nothing to show: an error with Try again, never a blank page.
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

  // Switching job is the panel's normal life: answers about the old job never sit under the new job's name, and the new job's
  // conversation is its own.
  it('clears the transcript and opens the new schedule\'s conversation when the job changes', () => {
    const { fixture, component } = mount();
    component.askPreset('summary', 'Summarise this job');
    expect(component.turns().length).toBe(1);
    fixture.componentRef.setInput('jobId', '2396');
    fixture.detectChanges();
    expect(component.turns().length).toBe(0);
    http.expectOne(r => r.url.includes('fetchSourceJobDetailWithSourceJobId'));
    http.expectOne(r => r.url.includes('fetchSourceJobQueueListWithJobId'));
  });

  afterEach(() => {
    http.match(r => r.url.includes('/assistant/conversations') || r.url.includes('/tools/list')).forEach(r => r.flush(ok([])));
    http.verify({ ignoreCancelled: true });
  });
});

// =============================================================================================
// 6. UX final SAS1: the shared composer, exports once there is an answer; owner 2026-11-02: no prompt picker
// =============================================================================================
describe('Schedule assistant layout (UX final SAS1)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  function mount() {
    const fixture = TestBed.createComponent(JobAssistant);
    fixture.componentRef.setInput('jobId', String(JOB));
    fixture.detectChanges();
    http.expectOne(r => r.url.includes('fetchSourceJobDetailWithSourceJobId'))
      .flush(ok({ jobId: JOB, jobName: facts.jobName, jobStatus: 'Active', execution: 'Manual',
                  priority: 1, taskDetail: { taskName: facts.taskName, bucket: facts.bucket } }));
    http.expectOne(r => r.url.includes('fetchSourceJobQueueListWithJobId')).flush(ok({ jobQueues: runs }));
    fixture.detectChanges();
    http.match(r => r.url.includes('/assistant/conversations') || r.url.includes('/tools/list')).forEach(r => r.flush(ok([])));
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('asks from the shared chat composer: Enter asks the AI Assistant, Shift+Enter does not', () => {
    const { fixture, component, el } = mount();
    const box = el.querySelector<HTMLTextAreaElement>('[data-test="chat-composer"] textarea')!;
    expect(box.getAttribute('aria-label')).toBe('Ask about this schedule');
    expect(el.querySelector('[data-test="chat-composer"] [data-test="chat-send"]')).not.toBeNull();
    component.question.set('when does it run next?');
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true }));
    http.expectNone(r => r.url.includes('/assistant/send'));
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    fixture.detectChanges();
    http.expectOne(r => r.url.includes('/assistant/send'));
    expect(component.turns().length).toBe(0);
  });

  it('shows CSV and Excel only once there is an answer', () => {
    const { fixture, component, el } = mount();
    expect(el.querySelector('[data-test="exports"]')).toBeNull();
    component.askPreset('summary', 'Summarise this schedule');
    fixture.detectChanges();
    const exports = el.querySelector('[data-test="exports"]')!;
    expect(exports.textContent).toContain('CSV');
    expect(exports.textContent).toContain('Excel');
  });

  it('says what the buttons and a typed question each do, with no prompt picker, and speaks of the schedule, not the job', () => {
    const { el } = mount();
    expect(el.querySelector('[data-test="agent-picker"]')).toBeNull();
    const help = el.querySelector('[data-test="ask-help"]')!.textContent!.replace(/\s+/g, ' ');
    expect(help).toContain("The buttons answer from this schedule's record and runs.");
    expect(help).toContain('A question you type goes to the AI Assistant, which reads this schedule only');
    expect(el.querySelector('[data-test="embedded-empty"]')).not.toBeNull();
    expect(el.textContent!.replace(/\s+/g, ' ')).toContain(`Pick a question above for an answer from schedule #${JOB}'s own record.`);
    // The schedule's own name may say 'job' (this one does); none of the page's own words do.
    expect(el.textContent!.split(facts.jobName).join('')).not.toMatch(/\bjob\b/i);
  });

  it('answers out of scope and refused actions about the schedule', () => {
    expect(answerFor('out-of-scope', facts, runs, 12).blocks[0]).toMatchObject({ text: `I only know about schedule #${JOB}. For schedule #12, open its own assistant.` });
    expect((answerFor('action', facts, runs).blocks[0] as { text: string }).text).toContain(`I can only read schedule #${JOB}.`);
    expect(classify('what about schedule 12?', JOB)).toEqual({ intent: 'out-of-scope', mentionedJobId: 12 });
    expect(classify('compare all schedules', JOB).intent).toBe('out-of-scope');
  });
});

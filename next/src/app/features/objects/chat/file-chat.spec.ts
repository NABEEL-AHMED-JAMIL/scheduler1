import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Observable, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { FileChat, agentAcceptsFile, canonicalType, fileExtension, targetFileTypesList, Agent } from './file-chat';

/**
 * The frontend half of "Target file types" enforcement -- shapes which agents the dropdown
 * offers for a given file. The backend (FileChatServiceImpl.acceptsFileType) is the actual
 * enforcement; this only has to agree with it closely enough that the agent auto-selected here
 * is one the backend will actually accept.
 */

function agent(targetFileTypes?: string): Agent {
  return { aiAgentId: 1, agentName: 'Test Agent', provider: 'Ollama', status: 'Active', targetFileTypes };
}

describe('fileExtension', () => {
  it('reads the extension after the last dot, lowercased', () => {
    expect(fileExtension('REPORT.PDF')).toBe('pdf');
    expect(fileExtension('archive.tar.gz')).toBe('gz');
  });

  it('is empty for a file with no extension, or a trailing dot', () => {
    expect(fileExtension('README')).toBe('');
    expect(fileExtension('trailing.')).toBe('');
  });
});

describe('targetFileTypesList', () => {
  it('splits, trims and lowercases', () => {
    expect(targetFileTypesList(' PDF , csv ,TXT')).toEqual(['pdf', 'csv', 'txt']);
  });

  it('is empty for blank or unset', () => {
    expect(targetFileTypesList('')).toEqual([]);
    expect(targetFileTypesList(undefined)).toEqual([]);
  });
});

describe('agentAcceptsFile', () => {
  it('accepts a file whose extension is in the list', () => {
    expect(agentAcceptsFile(agent('csv,pdf,txt'), 'report.pdf')).toBe(true);
  });

  it('rejects a file whose extension is not in the list', () => {
    expect(agentAcceptsFile(agent('csv,json'), 'report.pdf')).toBe(false);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(agentAcceptsFile(agent(' PDF , Csv '), 'REPORT.PDF')).toBe(true);
  });

  it('treats a blank targetFileTypes as unrestricted', () => {
    expect(agentAcceptsFile(agent(''), 'anything.xyz')).toBe(true);
    expect(agentAcceptsFile(agent(undefined), 'anything.xyz')).toBe(true);
  });

  it('rejects a file with no extension against a restricted agent', () => {
    expect(agentAcceptsFile(agent('csv,pdf'), 'README')).toBe(false);
  });
});

/**
 * What a follow-up question actually carries with it.
 *
 * "Expand on the second one" is meaningless without the turn that listed three of them, and this
 * panel is the only thing that can supply it -- nothing is stored server side. The shape of that
 * payload is therefore load-bearing, and every way of getting it wrong fails silently:
 * FileChatHistoryItemDto ignores unknown properties, so a mis-named field is dropped by Jackson
 * without an error and appendHistory quietly skips every turn whose text came back null, leaving
 * the model a "Recent conversation so far:" header with nothing beneath it. Nothing in the reply
 * says the history was lost; the model just asks what "the second one" refers to.
 *
 * The component is constructed but never rendered here. send() is the whole subject, and
 * ngOnInit's agent fetch and readiness call have nothing to do with what it puts in the body.
 */
function chatPanel(messages: { role: 'user' | 'assistant' | 'error'; text: string }[]) {
  const posts: { url: string; body: any }[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: HttpClient,
        useValue: {
          get: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] })),
          post: vi.fn((url: string, body: any) => {
            posts.push({ url, body });
            return of({ status: 'SUCCESS', message: '', data: 'an answer' });
          }),
        },
      },
      { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: AuthService, useValue: { user: () => null, displayName: () => 'Tester' } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(true) }) } },
    ],
  });

  const fixture = TestBed.createComponent(FileChat);
  fixture.componentRef.setInput('bucket', 'docs');
  fixture.componentRef.setInput('fileKey', 'contract.pdf');
  fixture.componentRef.setInput('fileName', 'contract.pdf');
  const chat = fixture.componentInstance;
  chat.agentId.set(7);
  chat.messages.set(messages.map(m => ({ ...m, at: Date.now() })));

  return {
    chat,
    sent: () => posts.find(p => p.url.includes('sendMessage'))?.body,
  };
}

describe('the history a follow-up question carries', () => {
  it('names each turn the way the backend DTO reads it', () => {
    const panel = chatPanel([
      { role: 'user', text: 'list the three main risks' },
      { role: 'assistant', text: '1. Funding. 2. Staffing. 3. Timeline.' },
    ]);

    panel.chat.send('expand on the second one');

    // The field is `text`. Sending `content` deserializes to a FileChatHistoryItemDto whose text
    // is null, and appendHistory skips every one of them.
    expect(panel.sent().history).toEqual([
      { role: 'user', text: 'list the three main risks' },
      { role: 'assistant', text: '1. Funding. 2. Staffing. 3. Timeline.' },
    ]);
  });

  it('leaves the question being asked out of its own history', () => {
    const panel = chatPanel([
      { role: 'user', text: 'list the three main risks' },
      { role: 'assistant', text: '1. Funding. 2. Staffing. 3. Timeline.' },
    ]);

    panel.chat.send('expand on the second one');

    // The question travels in `message`. Building the history after appending it to the
    // transcript sent it a second time, so the model was handed the same sentence twice -- once
    // as the question and once as the last thing the user had already said.
    const body = panel.sent();
    expect(body.message).toBe('expand on the second one');
    expect(body.history.map((turn: any) => turn.text)).not.toContain('expand on the second one');
  });

  it('never replays this panel own failure lines as things the user said', () => {
    const panel = chatPanel([
      { role: 'user', text: 'summarise section 14' },
      { role: 'error', text: 'The AI did not respond: read timed out' },
      { role: 'user', text: 'try that again' },
      { role: 'error', text: 'Stopped.' },
      { role: 'assistant', text: 'Section 14 covers termination.' },
    ]);

    panel.chat.send('and section 15?');

    // FileChatServiceImpl.appendHistory labels every non-assistant role "User", so an error
    // bubble written by this component comes back to the model as a sentence the person typed.
    const texts = panel.sent().history.map((turn: any) => turn.text);
    expect(texts).not.toContain('Stopped.');
    expect(texts).not.toContain('The AI did not respond: read timed out');
    expect(texts).toEqual([
      'summarise section 14',
      'try that again',
      'Section 14 covers termination.',
    ]);
  });

  it('keeps only the most recent turns, counted after the error lines are dropped', () => {
    const transcript: { role: 'user' | 'assistant' | 'error'; text: string }[] = [];
    for (let i = 1; i <= 6; i++) {
      transcript.push({ role: 'user', text: `question ${i}` });
      transcript.push({ role: 'assistant', text: `answer ${i}` });
    }
    const panel = chatPanel(transcript);

    panel.chat.send('one more');

    const texts = panel.sent().history.map((turn: any) => turn.text);
    expect(texts).toHaveLength(8);
    expect(texts[0]).toBe('question 3');
    expect(texts[7]).toBe('answer 6');
  });
});

describe('two spellings of one format', () => {

  it('accepts a .jpeg on an agent configured for jpg, and the other way round', () => {
    // The exact match refused this pair, and the refusal read "This agent only handles jpg files
    // -- pick a different agent for photo.jpeg", which a reader cannot act on: the agent they
    // have IS the right one.
    expect(agentAcceptsFile(agent('jpg'), 'photo.jpeg')).toBe(true);
    expect(agentAcceptsFile(agent('jpeg'), 'photo.jpg')).toBe(true);
  });

  it('folds the other pairs that are one format under two names', () => {
    expect(agentAcceptsFile(agent('tif'), 'scan.tiff')).toBe(true);
    expect(agentAcceptsFile(agent('html'), 'page.htm')).toBe(true);
    expect(agentAcceptsFile(agent('yaml'), 'config.yml')).toBe(true);
  });

  it('does not fold formats that merely look alike', () => {
    // The point is aliases, not leniency: a png agent must still refuse a jpeg.
    expect(agentAcceptsFile(agent('png'), 'photo.jpeg')).toBe(false);
    expect(agentAcceptsFile(agent('csv'), 'data.tsv')).toBe(false);
  });

  it('canonicalises a name however it is cased or spaced', () => {
    expect(canonicalType(' JPEG ')).toBe('jpg');
    expect(canonicalType('CSV')).toBe('csv');
    expect(canonicalType('')).toBe('');
  });
});

/* ------------------------------------------------------------------------------------------- *
 * The panel at its edges: what it deletes, what it disables, and what it lets go of.
 *
 * chatPanel() above never renders on purpose -- send()'s payload is all it is about. Everything
 * below needs the real thing: half of it lives in the template (a button that offers to delete a
 * question, a composer locked out of the recovery the code deliberately left open) and half in
 * the lifecycle, and neither shows up in a signal read from an unrendered component.
 * ------------------------------------------------------------------------------------------- */

const OK = <T>(data: T) => ({ status: 'SUCCESS' as const, message: '', data });
/** What prepareContext answers for a file the chosen agent can read. */
const READY = OK({ truncated: false, usingRetrieval: false, charsUsed: 120, totalChars: 120 });

const READER: Agent = {
  aiAgentId: 7, agentName: 'Reader', provider: 'Ollama', status: 'Active', apiKeyConfigured: true,
};

interface PanelOptions {
  /** What fetchAllAgents answers. An empty list is what leaves `agentId` null. */
  agents?: Agent[];
  /** fetchAllAgents answers with a refusal envelope instead of a list. */
  agentsRefused?: string;
  /** What prepareContext answers, keyed on the agent asked -- so "change agent and it works"
      can actually be driven rather than asserted about. */
  prepare?: (aiAgentId: number | null) => { status: 'SUCCESS' | 'ERROR'; message: string; data?: unknown };
  /** What sendMessage answers; a never-completing observable stands in for a reply in flight. */
  reply?: Observable<unknown>;
  /** The reader's answer to "Close this chat?". */
  confirms?: boolean;
  fileKey?: string;
}

function openPanel(options: PanelOptions = {}) {
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const posts: { url: string; body: any }[] = [];
  const prepare = options.prepare ?? (() => READY);
  const fileKey = options.fileKey ?? 'contract.pdf';

  const http = {
    get: vi.fn((url: string) =>
      of(url.includes('fetchAllAgents')
        ? (options.agentsRefused !== undefined ? { status: 'ERROR', message: options.agentsRefused } : OK(options.agents ?? [READER]))
        : OK(null))),
    post: vi.fn((url: string, body: any) => {
      posts.push({ url, body });
      if (url.includes('prepareContext')) return of(prepare(body?.aiAgentId ?? null));
      if (url.includes('sendMessage')) return options.reply ?? of(OK('an answer'));
      return of(OK(null));
    }),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: http },
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: { user: () => null, displayName: () => 'Tester' } },
      // confirmWith resolves as soon as the dialog "closes", so this is the reader answering
      // "Close this chat?" without an overlay ever being rendered.
      { provide: Dialog, useValue: { open: () => ({ closed: of(options.confirms ?? true) }) } },
    ],
  });

  // The transcript is persisted to sessionStorage by an effect and restored in ngOnInit, so one
  // rendered test would otherwise open holding the previous one's conversation.
  sessionStorage.clear();

  const fixture = TestBed.createComponent(FileChat);
  fixture.componentRef.setInput('bucket', 'docs');
  fixture.componentRef.setInput('fileKey', fileKey);
  fixture.componentRef.setInput('fileName', fileKey);

  return {
    fixture,
    chat: fixture.componentInstance,
    toast,
    posts,
    sends: () => posts.filter(p => p.url.includes('sendMessage')),
    html: () => fixture.nativeElement as HTMLElement,
    button: (label: string) =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
        .find(b => (b.textContent ?? '').includes(label)),
  };
}

/** A failed exchange: the question, and the panel's own report that it went nowhere. */
const FAILED_EXCHANGE = [
  { role: 'user' as const, text: 'summarise section 14', at: 1 },
  { role: 'error' as const, text: 'The agent did not respond.', at: 2 },
];

describe('retrying a question there is no agent to ask', () => {
  afterEach(() => sessionStorage.clear());

  it('keeps the question in the transcript when the retry cannot be sent', () => {
    // loadAgents leaves agentId null whenever nothing is usable -- every agent Inactive, or none
    // keyed and no local Ollama -- because the auto-select only runs over a non-empty list.
    const panel = openPanel({ agents: [] });
    panel.chat.messages.set(FAILED_EXCHANGE.map(m => ({ ...m })));

    panel.chat.retry();

    // The question is held nowhere else. Committing the shortened transcript before send()'s own
    // guards ran deleted it outright, and the reader had just asked for it to be asked AGAIN.
    expect(panel.chat.messages().map(m => m.text)).toEqual([
      'summarise section 14',
      'The agent did not respond.',
    ]);
    expect(panel.sends()).toHaveLength(0);
    expect(panel.toast.error).toHaveBeenCalledWith('Choose an agent first.');
  });

  it('still drops the failed exchange and asks again when an agent is there', () => {
    const panel = openPanel();
    panel.chat.agentId.set(READER.aiAgentId);
    panel.chat.messages.set(FAILED_EXCHANGE.map(m => ({ ...m })));

    panel.chat.retry();

    expect(panel.sends()[0].body.message).toBe('summarise section 14');
    // The failed reply is gone rather than handed back to the model as context, and the question
    // is the live turn again rather than a second copy of itself.
    expect(panel.chat.messages().map(m => m.role)).toEqual(['user', 'assistant']);
    expect(panel.chat.messages()[0].text).toBe('summarise section 14');
    expect(panel.sends()[0].body.history).toEqual([]);
  });

  it('disables Retry rather than offering to delete the question', () => {
    const panel = openPanel({ agents: [] });
    panel.fixture.detectChanges();
    panel.chat.messages.set(FAILED_EXCHANGE.map(m => ({ ...m })));
    panel.fixture.detectChanges();

    // sending() was the only thing that disabled it, so with no agent the control stayed live and
    // its whole visible effect was removing the question from the screen.
    expect(panel.button('Retry')?.disabled).toBe(true);
  });
});

/**
 * The mismatch the code walks into deliberately.
 *
 * agentAcceptsFile is not gzip-aware and the backend's acceptsFileType is, so "report.csv.gz"
 * matches no agent here, loadAgents falls back to offering every usable one, and the first is
 * auto-selected. prepareContext then answers ERROR for the agent that cannot read it -- while the
 * csv agent sitting in the same dropdown is one the backend WOULD have accepted, because it looks
 * inside the gzip. Locking the composer on that error removed the only reason to change agent.
 */
describe('a prepare that failed on the agent chosen for the reader', () => {
  afterEach(() => sessionStorage.clear());

  const JSON_ONLY: Agent = {
    aiAgentId: 1, agentName: 'Payload reader', provider: 'Ollama', status: 'Active',
    apiKeyConfigured: true, targetFileTypes: 'json',
  };
  const CSV_ONLY: Agent = {
    aiAgentId: 2, agentName: 'Sheet reader', provider: 'Ollama', status: 'Active',
    apiKeyConfigured: true, targetFileTypes: 'csv',
  };

  const refusesJson = (aiAgentId: number | null) =>
    aiAgentId === JSON_ONLY.aiAgentId
      ? { status: 'ERROR' as const, message: 'This agent only handles json files.' }
      : READY;

  function mismatched() {
    const panel = openPanel({
      agents: [JSON_ONLY, CSV_ONLY], prepare: refusesJson, fileKey: 'report.csv.gz',
    });
    panel.fixture.detectChanges();
    return panel;
  }

  it('leaves the composer and the picker usable so another agent can be chosen', () => {
    const panel = mismatched();

    // The error still has to be visible -- the reader needs to know why nothing was read.
    expect(panel.chat.prepareError()).toBe('This agent only handles json files.');
    expect(panel.html().textContent).toContain('This agent only handles json files.');

    const composer = panel.html().querySelector('textarea') as HTMLTextAreaElement;
    const picker = panel.html().querySelector('select') as HTMLSelectElement;
    expect(composer.disabled).toBe(false);
    expect(picker.disabled).toBe(false);
    // Both agents are offered, which is the whole point of the fallback.
    expect(panel.chat.agents().map(a => a.aiAgentId)).toEqual([1, 2]);
  });

  it('clears the error when the agent that can read the file is chosen', () => {
    const panel = mismatched();

    panel.chat.onAgentChange(CSV_ONLY.aiAgentId);
    panel.fixture.detectChanges();

    expect(panel.chat.prepareError()).toBe('');
    expect(panel.chat.coverage()).not.toBeNull();
    expect((panel.html().querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(false);
  });
});

/** The browser speech API as a test can watch it: each instance records what it was told to do. */
function fakeSpeechApi() {
  const created: FakeRecognition[] = [];

  class FakeRecognition {
    lang = '';
    continuous = false;
    interimResults = false;
    onstart?: () => void;
    onerror?: (event: unknown) => void;
    onend?: () => void;
    onresult?: (event: unknown) => void;
    started = false;
    stopped = false;
    aborted = false;
    constructor() { created.push(this); }
    start() { this.started = true; this.onstart?.(); }
    stop() { this.stopped = true; }
    abort() { this.aborted = true; }
  }

  const original = (window as any).SpeechRecognition;
  (window as any).SpeechRecognition = FakeRecognition;
  return { created, restore: () => { (window as any).SpeechRecognition = original; } };
}

/** A reply that never arrives, and a flag for whether the panel ever let go of it. */
function pendingReply() {
  let unsubscribed = false;
  return {
    observable: new Observable<unknown>(() => () => { unsubscribed = true; }),
    unsubscribed: () => unsubscribed,
  };
}

describe('what the panel releases on the way out', () => {
  let restoreSpeech: (() => void) | null = null;

  afterEach(() => {
    restoreSpeech?.();
    restoreSpeech = null;
    sessionStorage.clear();
  });

  it('stops dictation when the panel is destroyed without ever being closed', () => {
    const speech = fakeSpeechApi();
    restoreSpeech = speech.restore;
    const panel = openPanel();

    panel.chat.toggleMic();
    expect(panel.chat.listening()).toBe(true);

    // A route change, or the parent simply dropping the panel: close() never runs, and nothing
    // else turns the microphone off -- the browser's recording indicator stays lit over a panel
    // that is no longer on screen.
    panel.fixture.destroy();

    const recognition = speech.created[0];
    expect(recognition.aborted || recognition.stopped).toBe(true);
    expect(panel.chat.listening()).toBe(false);
  });

  it('abandons the reply in flight when the panel is destroyed', () => {
    const pending = pendingReply();
    const panel = openPanel({ reply: pending.observable });
    panel.chat.agentId.set(READER.aiAgentId);

    panel.chat.send('what does clause 9 say?');
    expect(panel.chat.sending()).toBe(true);

    panel.fixture.destroy();

    expect(pending.unsubscribed()).toBe(true);
    expect(panel.chat.sending()).toBe(false);
  });

  it('stops dictation and drops the reply in flight when the chat is closed', async () => {
    const speech = fakeSpeechApi();
    restoreSpeech = speech.restore;
    const pending = pendingReply();
    const panel = openPanel({ reply: pending.observable, confirms: true });
    panel.chat.agentId.set(READER.aiAgentId);

    panel.chat.toggleMic();
    panel.chat.send('what does clause 9 say?');

    await panel.chat.close();

    // endSession has just dropped the file's text on the server, so a reply still running lands
    // against a session that no longer exists -- and writes its answer into a transcript that has
    // been deleted.
    expect(panel.posts.some(p => p.url.includes('endSession'))).toBe(true);
    expect(pending.unsubscribed()).toBe(true);
    expect(panel.chat.sending()).toBe(false);
    const recognition = speech.created[0];
    expect(recognition.aborted || recognition.stopped).toBe(true);
    expect(panel.chat.listening()).toBe(false);
  });
});

/**
 * "Copied" has to be a statement about the clipboard, not about the click.
 *
 * The code-block copy inside a reply (Markdown.copyBlock) was fixed for exactly this; the button
 * that copies the whole answer was left showing its green tick whether or not anything was
 * written. An answer copied to be pasted into a ticket then arrived as whatever was on the
 * clipboard before, with nothing on screen having suggested a problem.
 */
function clipboardRefuses() {
  // An insecure origin, as the browser presents it: the async write rejects, and the legacy
  // execCommand fallback is refused too.
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: () => Promise.reject(new Error('Document is not focused')) },
    configurable: true,
  });
  const originalExec = (document as any).execCommand;
  (document as any).execCommand = () => false;
  return () => {
    (document as any).execCommand = originalExec;
    if (originalDescriptor) Object.defineProperty(navigator, 'clipboard', originalDescriptor);
    else delete (navigator as any).clipboard;
  };
}

/** A clipboard that takes the text, so the tick is telling the truth. */
function clipboardAccepts(written: string[]) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: (value: string) => { written.push(value); return Promise.resolve(); } },
    configurable: true,
  });
  return () => {
    if (originalDescriptor) Object.defineProperty(navigator, 'clipboard', originalDescriptor);
    else delete (navigator as any).clipboard;
  };
}

/** Lets the copy promise and the handler behind it settle, without running the 1.5s tick timer. */
function settleCopy(): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, 0));
}

describe('copying a whole answer', () => {
  const ANSWER = 'Section 14 covers termination.';
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
    sessionStorage.clear();
  });

  it('does not show the copied tick when the clipboard refused the answer', async () => {
    restore = clipboardRefuses();
    const panel = openPanel();

    panel.chat.copyMessage(0, ANSWER);
    await settleCopy();

    expect(panel.chat.copiedIndex()).toBeNull();
    expect(panel.toast.error).toHaveBeenCalledTimes(1);
  });

  it('shows the tick once the clipboard has actually taken the answer', async () => {
    const written: string[] = [];
    restore = clipboardAccepts(written);
    const panel = openPanel();

    panel.chat.copyMessage(2, ANSWER);
    await settleCopy();

    expect(written).toEqual([ANSWER]);
    expect(panel.chat.copiedIndex()).toBe(2);
    expect(panel.toast.error).not.toHaveBeenCalled();
  });
});

describe('a chat a reader does not have to be watching', () => {
  afterEach(() => sessionStorage.clear());

  it('announces an arriving answer in a polite live region', () => {
    const panel = openPanel();
    panel.fixture.detectChanges();
    const live = panel.html().querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live).toBeTruthy();

    // The reader's own question is not read back to them -- they just typed it.
    panel.chat.messages.set([{ role: 'user', text: 'what does clause 9 say?', at: 1 }]);
    panel.fixture.detectChanges();
    expect(live.textContent?.trim()).toBe('');

    panel.chat.messages.update(list =>
      [...list, { role: 'assistant' as const, text: 'Clause 9 is the indemnity.', at: 2 }]);
    panel.fixture.detectChanges();

    // Otherwise the reply is a bubble appearing at the foot of a scrolling list, and nothing says
    // the question was answered at all.
    expect(live.textContent).toContain('Clause 9 is the indemnity.');
  });

  it('returns focus to the message box after a send', () => {
    const panel = openPanel();
    panel.fixture.detectChanges();
    const composer = panel.html().querySelector('textarea') as HTMLTextAreaElement;

    // A send from a suggestion chip or the Send button leaves focus on a control that disables
    // itself the moment the draft is cleared, which drops focus to the document body.
    panel.button('View')?.focus();
    panel.chat.send('summarise this file');

    expect(document.activeElement).toBe(composer);
  });
});

/**
 * Emailing an answer out of the chat.
 *
 * The first version of this put the Email button on the attachment chip row, inside
 * `@if (message.files?.length)`. That row only exists when the model's reply happens to carry a
 * downloadable fence -- which most replies do not -- so the ordinary case, "send me what you just
 * told me", had no button anywhere on screen and nothing ever reached /emailExport. It was
 * reported as "for the chatbot its not send", and it was: there was nothing to press.
 *
 * These tests pin the button to the MESSAGE ACTIONS row, where every answer has one.
 */
describe('emailing an answer', () => {
  afterEach(() => sessionStorage.clear());

  it('offers Email on a plain answer that carries no downloadable file', async () => {
    const panel = openPanel();
    panel.fixture.detectChanges();
    panel.chat.messages.set([
      { role: 'user', text: 'what is this?', at: 1 },
      { role: 'assistant', text: 'A signed supply contract.', at: 2 },
    ]);
    panel.fixture.detectChanges();

    // No `files` on that message at all -- the exact shape the old placement could not reach.
    expect(panel.button('Email')).toBeDefined();
  });

  it('sends the answer text to emailExport as markdown, converted to pdf', () => {
    const panel = openPanel();
    panel.fixture.detectChanges();
    panel.chat.emailAnswer('## Findings\n\nThe contract renews in March.', 0);

    const call = panel.posts.find(p => p.url.includes('emailExport'));
    expect(call).toBeDefined();
    expect(call!.body.content).toContain('The contract renews in March.');
    expect(call!.body.sourceFormat).toBe('md');
    expect(call!.body.targetFormat).toBe('pdf');
    // The stub Dialog closes with `true`, so recipientEmail is whatever that yields -- what
    // matters here is that the request is made at all, which it previously never was.
    expect(call!.url).toContain('/fileChat.json/emailExport');
  });

  it('does not post an empty answer', () => {
    const panel = openPanel();
    panel.fixture.detectChanges();
    panel.chat.emailAnswer('   ', 0);
    expect(panel.posts.find(p => p.url.includes('emailExport'))).toBeUndefined();
  });

  it('refuses a second send while one is in flight', () => {
    const panel = openPanel();
    panel.fixture.detectChanges();
    panel.chat.emailing.set('answer-0');
    panel.chat.emailAnswer('anything', 1);
    expect(panel.posts.find(p => p.url.includes('emailExport'))).toBeUndefined();
  });
});

describe('opening the panel when the agent list is refused', () => {
  afterEach(() => sessionStorage.clear());

  /** "Reading the file..." stayed up for good and the composer stayed disabled, with no word why. */
  it('does not leave the panel reading forever, and says why there is no agent', () => {
    const panel = openPanel({ agentsRefused: 'You do not have access to AI agents.' });
    panel.fixture.detectChanges();

    expect(panel.chat.preparing()).toBe(false);
    expect(panel.toast.error).toHaveBeenCalledWith('You do not have access to AI agents.');
    expect(panel.posts.some(p => p.url.includes('prepareContext'))).toBe(true);
  });
});

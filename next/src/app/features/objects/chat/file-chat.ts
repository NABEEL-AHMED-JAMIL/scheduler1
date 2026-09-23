import { Component, OnDestroy, OnInit, computed, effect, inject, input, output, signal, viewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { DecimalPipe } from '@angular/common';
import { Icon } from '../../../shared/ui/icon';
import { Markdown } from '../../../shared/ui/markdown';
import { Avatar } from '../../../shared/ui/avatar';
import { AuthService } from '../../../core/auth/auth.service';
import { Dialog } from '@angular/cdk/dialog';
import { confirmWith } from '../../../shared/ui/confirm';
import { copyText } from '../../../shared/ui/clipboard.util';
import { ChatFile, parseDownloadableFiles, stripExportFences } from './chat-export';
import { ShareDialog, ShareResult } from '../dialogs/share-dialog';
import { Subscription } from 'rxjs';

interface ChatMessage {
  role: 'user' | 'assistant' | 'error';
  text: string;
  /** Files the reply carried, ready to save. */
  files?: ChatFile[];
  /** Epoch millis. Stored rather than formatted so a restored transcript keeps its real
      times, and so the display can follow the reader's locale rather than the writer's. */
  at?: number;
}
export interface Agent {
  aiAgentId: number; agentName: string; provider: string; status: string;
  apiKeyConfigured?: boolean; targetFileTypes?: string;
}

/** Lowercased, comma-split target file types (e.g. "PDF, csv" -> ['pdf', 'csv']). Blank/unset
    means unrestricted -- mirrors FileChatServiceImpl.acceptsFileType, the actual enforcement;
    this filter only shapes which agents are offered, it doesn't decide what's allowed. */
export function targetFileTypesList(targetFileTypes: string | undefined): string[] {
  return (targetFileTypes ?? '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
}

/**
 * Spellings of one format, folded to a single name.
 *
 * jpg and jpeg are the same picture, and an agent configured for one silently refused the other:
 * the check is an exact match on the extension, so a .jpeg with a "jpg" agent got "This agent
 * only handles jpg files". Handled as a table rather than as a special case for jpeg, because
 * every pair here has the same shape and the next one added should not need new code.
 *
 * The backend folds the same pairs in FileChatServiceImpl.acceptsFileType -- it is the side that
 * actually enforces this, so the two lists have to agree or the picker offers a file the server
 * then refuses.
 */
const SAME_FORMAT: Record<string, string> = {
  jpeg: 'jpg', tiff: 'tif', htm: 'html', yml: 'yaml', mpeg: 'mpg',
};

/** The name a format answers to, whichever of its spellings was used. */
export function canonicalType(type: string): string {
  const lower = (type ?? '').trim().toLowerCase();
  return SAME_FORMAT[lower] ?? lower;
}

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 || dot === fileName.length - 1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/** Not gzip-aware the way the backend check is (see ContentTypeUtil.innerExtensionOfGzip) --
    worst case a ".csv.gz" file hides an agent that would actually have been allowed, never the
    other way around, and the backend is what actually enforces this regardless. */
export function agentAcceptsFile(agent: Agent, fileName: string): boolean {
  const types = targetFileTypesList(agent.targetFileTypes).map(canonicalType);
  if (!types.length) return true;
  const ext = canonicalType(fileExtension(fileName));
  return !!ext && types.includes(ext);
}

@Component({
  selector: 'app-file-chat',
  imports: [Icon, Markdown, Avatar, DecimalPipe],
  templateUrl: './file-chat.html',
})
export class FileChat implements OnInit, OnDestroy {
  readonly bucket = input.required<string>();
  readonly fileKey = input.required<string>();
  readonly fileName = input.required<string>();
  readonly closed = output<void>();
  readonly viewRequested = output<void>();

  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  /** Whose picture sits beside their own messages. */
  readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);

  readonly agents = signal<Agent[]>([]);
  readonly agentId = signal<number | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly draft = signal('');
  readonly preparing = signal(true);
  readonly prepareError = signal('');
  /** How much of the file the chosen model will actually see. Null until prepared.
      Re-fetched after every message, not just once at panel-open -- resolveContext makes its
      own live per-message decision (RAG availability can flip mid-session, a retrieval can come
      back partial or fail over to truncation) that can genuinely differ from this one-shot
      snapshot, and a banner reflecting the state from minutes ago is worse than none. */
  readonly coverage = signal<{ truncated: boolean; usingRetrieval: boolean; charsUsed: number; totalChars: number } | null>(null);
  readonly sending = signal(false);
  readonly minimized = signal(false);
  readonly copiedIndex = signal<number | null>(null);
  readonly listening = signal(false);
  readonly converting = signal<string | null>(null);

  /**
   * What a screen reader is told when a reply lands.
   *
   * An answer arriving is a purely visual event otherwise: a bubble appears at the bottom of a
   * scrolling list that nothing directs the reader to, so somebody not watching the panel has no
   * way of knowing the question was answered at all. Polite rather than assertive -- an answer is
   * worth waiting a beat for, not worth cutting off whatever is being read.
   *
   * Only the panel's own turns are announced: the reader's own message was just typed by them,
   * and echoing it back is noise on every send.
   */
  readonly announcement = computed(() => {
    const list = this.messages();
    const last = list[list.length - 1];
    if (!last || last.role === 'user') return '';
    return last.role === 'error' ? `Error: ${last.text}` : last.text;
  });

  /**
   * How long an *unintentionally* abandoned conversation survives.
   *
   * Closing deliberately deletes it, so this window covers only the exits that never run
   * close(): a reload, navigating away, a crash. Half an hour is long enough to come back and
   * carry on, short enough that a shared machine is not holding somebody's questions about a
   * document for the rest of the day.
   *
   * Checked when the panel opens rather than by a timer, because a timer does not run while the
   * component is destroyed -- which is the entire window that needs to expire.
   *
   * Deliberately sessionStorage, not localStorage: it dies with the browser tab regardless of
   * the clock.
   */
  private static readonly HISTORY_TTL_MS = 30 * 60 * 1000;

  private historyKey(): string {
    return `fileChat:${this.bucket()}:${this.fileKey()}`;
  }

  /** Nothing is written for an empty conversation -- there is no transcript worth restoring. */
  private rememberHistory(): void {
    const messages = this.messages();
    if (!messages.length) {
      sessionStorage.removeItem(this.historyKey());
      return;
    }
    try {
      sessionStorage.setItem(this.historyKey(),
        JSON.stringify({ savedAt: Date.now(), messages }));
    } catch {
      // A full or blocked sessionStorage is not worth failing a chat over.
    }
  }

  /**
   * Saved whenever the transcript changes, not only on close.
   *
   * Closing the panel is the tidy exit; navigating away, reloading, or a crash are the common
   * ones, and none of them run close(). An effect covers all of them.
   */
  private readonly persist = effect(() => {
    this.messages();
    this.rememberHistory();
  });

  private restoreHistory(): void {
    try {
      const raw = sessionStorage.getItem(this.historyKey());
      if (!raw) return;
      const saved = JSON.parse(raw) as { savedAt: number; messages: ChatMessage[] };
      // Expiry is checked on read rather than by a timer: a timer does not run while the panel
      // is closed, which is exactly the window that needs to expire.
      if (Date.now() - saved.savedAt > FileChat.HISTORY_TTL_MS) {
        sessionStorage.removeItem(this.historyKey());
        return;
      }
      this.messages.set(saved.messages ?? []);
    } catch {
      sessionStorage.removeItem(this.historyKey());
    }
  }

  /**
   * Closing keeps the transcript here and drops the file's extracted text on the server.
   *
   * The extraction is the only trace a chat leaves server-side, and it is the whole readable
   * contents of the file. Fire-and-forget: the panel closes either way, and a failed eviction
   * simply means the entry ages out on its own.
   */
  /** True while a close is already being confirmed/actioned -- guards against a fast double-click
      opening two "Close this chat?" dialogs stacked, each independently able to run this body. */
  readonly closing = signal(false);

  async close(): Promise<void> {
    if (this.closing()) return;
    this.closing.set(true);
    try {
      // Nothing to lose, nothing to ask. Prompting on an empty chat is friction that teaches
      // people to click through the dialog without reading it, which is how a real warning gets
      // ignored later.
      if (this.messages().length) {
        const end = await confirmWith(this.dialog, {
          title: 'Close this chat?',
          body: 'The conversation is deleted, and the text read from this file is dropped from '
              + 'the server. Nothing is kept.',
          confirmLabel: 'Close and delete',
          danger: true,
        });
        if (!end) {
          return;
        }
      }
      // Closing the panel is not on its own enough to end what the panel started: the browser
      // keeps the recording indicator lit until the recognition is actually stopped, and a reply
      // still in flight lands against a session endSession is about to drop.
      this.release();
      // Order matters: stop the effect re-saving on the way out, then clear, then close. Clearing
      // first and letting the effect fire again would write the transcript straight back.
      this.persist.destroy();
      sessionStorage.removeItem(this.historyKey());
      this.messages.set([]);
      this.http.post(`${API_BASE}/fileChat.json/endSession`,
        { bucket: this.bucket(), key: this.fileKey() }).subscribe({ error: () => {} });
      this.closed.emit();
    } finally {
      this.closing.set(false);
    }
  }

  /**
   * Everything the panel is still holding, let go of.
   *
   * Both ways out run this. close() is the tidy exit, but a route change, the parent dropping the
   * panel or a reload never reach it -- and neither of the two things held here stops on its own:
   * the microphone stays open (with the browser's recording indicator lit, on a panel that is no
   * longer on screen) and the reply keeps running to completion against a session that has ended,
   * only to push an answer into a transcript nobody can see.
   */
  private release(): void {
    this.stopDictation();
    this.abandonInFlight();
  }

  ngOnDestroy(): void {
    this.release();
  }

  /**
   * Ends the reply in progress without writing anything to the transcript -- the difference from
   * stop(), which is the reader deliberately abandoning an answer and wants to see that it was.
   */
  private abandonInFlight(): void {
    this.inFlight?.unsubscribe();
    this.settle();
  }

  /** abort() rather than stop(): stop() delivers whatever was heard so far, firing onresult
      against a panel that is going away; abort() drops it. Both throw on a recognition that
      never actually started (permission refused before onstart), and there is nothing left to
      release at that point, so the failure is the outcome we wanted anyway. */
  private stopDictation(): void {
    const recognition = this.recognition;
    this.recognition = null;
    this.listening.set(false);
    if (!recognition) return;
    try {
      if (typeof recognition.abort === 'function') recognition.abort();
      else recognition.stop?.();
    } catch {
      // Nothing was listening; the indicator is already off.
    }
  }

  /** Held so the request can be abandoned; see stop(). */
  private inFlight: Subscription | null = null;
  private recognition: any = null;

  /** Dictation needs the browser's speech API, which not every browser exposes. */
  readonly voiceSupported =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  /**
   * The tick has to mean the clipboard actually changed.
   *
   * copyText reports whether the copy happened, and it genuinely does fail: a deployment served
   * over plain HTTP has no Clipboard API at all, an unfocused document is refused, and the
   * execCommand fallback can be refused too. The tick used to appear either way, so an answer
   * somebody copied to paste into a ticket arrived as whatever was on the clipboard before, with
   * nothing on screen having suggested a problem. The code-block copy inside a reply
   * (Markdown.copyBlock) was fixed for exactly this; this one, on the whole answer, was missed.
   */
  copyMessage(index: number, text: string): void {
    copyText(text).then(copied => {
      if (!copied) {
        this.toast.error('Could not copy that answer. Select it and copy it by hand.');
        return;
      }
      this.copiedIndex.set(index);
      // Only clear if nothing else was copied since, or copying a second answer inside the window
      // would have the first one's timer wipe the tick off the second.
      setTimeout(() => { if (this.copiedIndex() === index) this.copiedIndex.set(null); }, 1500);
    });
  }

  /**
   * Drops the last exchange and asks again. The failed or unwanted reply is removed first so
   * the model is not handed its own bad answer as context for the retry.
   *
   * Nothing is committed until the send is known to be going ahead. The shortened transcript used
   * to be written first and send()'s guards ran afterwards, so a retry send() then refused took
   * the question with it: with no agent selected -- which is precisely what loadAgents leaves
   * behind when nothing is usable, since the auto-select only runs over a non-empty list -- the
   * reader pressed Retry and the sentence they wanted asked again vanished, held nowhere else.
   */
  retry(): void {
    const history = [...this.messages()];
    while (history.length && history[history.length - 1].role !== 'user') history.pop();
    const last = history.pop();
    const message = (last?.text ?? '').trim();
    if (this.cannotSend(message)) return;
    this.messages.set(history);
    this.send(message);
  }

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly composer = viewChild<ElementRef<HTMLTextAreaElement>>('composer');

  /**
   * Focus goes back to the message box after a send, so the next question can simply be typed.
   *
   * It only ever moves when the send came from somewhere else -- a suggestion chip, or the Send
   * button, which disables itself the moment the draft is cleared and drops focus to the document
   * body when it does. A keyboard or screen-reader user was then outside the conversation with no
   * indication of where they were, and had to tab back in past the whole panel.
   */
  private focusComposer(): void {
    // Moved now rather than from a queued callback: the box is already on screen, and taking
    // focus before the next render means the Send button disabling itself under the pointer is
    // no longer the thing that decides where focus ends up.
    this.composer()?.nativeElement.focus();
  }

  readonly suggestions = [
    'Summarise this file',
    'What are the key points?',
    'List any dates mentioned',
  ];

  constructor() {
    // Keep the newest message in view as the conversation grows.
    effect(() => {
      this.messages();
      queueMicrotask(() => {
        const el = this.scroller()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  ngOnInit(): void {
    this.restoreHistory();
    // prepare() runs once the agent list settles: the readable size depends on which provider
    // answers, so asking before one is chosen reports a limit that may not apply.
    this.loadAgents();
  }

  private loadAgents(): void {
    this.http.get<ApiResponse<Agent[]>>(`${API_BASE}/aiAgent.json/fetchAllAgents`).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          // Returning here left "Reading the file..." up for good with the composer disabled.
          // Said once, then the file is still read -- the same as when the request fails outright.
          this.toast.error(response.message || 'The list of agents could not be read.');
          this.prepare();
          return;
        }
        // Only agents that can actually answer: active, and either keyed or local Ollama.
        const usable = (response.data ?? []).filter(a =>
          a.status === 'Active' && (a.apiKeyConfigured || a.provider?.toLowerCase() === 'ollama'));
        // Narrowed further to agents that actually accept this file's type where at least one
        // does -- offering "Bucket Assistant (csv,json)" against a PDF used to be silently
        // useless right up until the backend's new rejection message. If nothing matches, every
        // usable agent is still offered rather than showing an empty, unexplained dropdown; the
        // backend's own error names the mismatch clearly if one of them is picked and asked.
        const matching = usable.filter(a => agentAcceptsFile(a, this.fileKey()));
        const offered = matching.length ? matching : usable;
        this.agents.set(offered);
        if (offered.length && this.agentId() === null) this.agentId.set(offered[0].aiAgentId);
          // Chained rather than run in parallel: the readable size depends on which provider
          // answers, so preparing before an agent is chosen reports a limit that may not apply.
          this.prepare();
        },
        error: () => { this.prepare(); },
    });
  }

  /**
   * Switching agents mid-session used to leave the coverage banner (truncated/RAG/char-count)
   * describing the *previous* agent's context window until the next message was sent and
   * `refreshCoverage()` happened to run -- the select's own (change) only ever wrote `agentId`
   * and nothing re-read readiness for the newly chosen agent. `prepare()` is the right call here
   * rather than the quieter `refreshCoverage()`: switching agents is exactly the "just opened the
   * panel" moment as far as readiness is concerned, so `preparing`/`prepareError` should reflect
   * it too, not just the banner.
   */
  onAgentChange(id: number): void {
    this.agentId.set(id);
    this.prepare();
  }

  private prepare(): void {
    this.preparing.set(true);
    this.prepareError.set('');
    this.http.post<ApiResponse>(`${API_BASE}/fileChat.json/prepareContext`,
      { bucket: this.bucket(), key: this.fileKey(), aiAgentId: this.agentId() }).subscribe({
      next: response => {
        this.preparing.set(false);
        if (response.status !== API_SUCCESS) { this.prepareError.set(response.message); return; }
        this.coverage.set(response.data as any ?? null);
      },
      error: err => {
        this.preparing.set(false);
        this.prepareError.set(err?.error?.message || 'Could not read this file.');
      },
    });
  }

  /** Silent re-check of the same readiness `prepare()` fetches, called after every message so
      the banner reflects the live state a question was actually just answered against, not the
      state from when the panel opened. Deliberately doesn't touch `preparing`/`prepareError` --
      a failed refresh just leaves the existing banner in place rather than disrupting the chat
      that already succeeded. */
  private refreshCoverage(): void {
    this.http.post<ApiResponse>(`${API_BASE}/fileChat.json/prepareContext`,
      { bucket: this.bucket(), key: this.fileKey(), aiAgentId: this.agentId() }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) { this.coverage.set(response.data as any ?? null); }
      },
      error: () => { /* best-effort; the existing banner stands */ },
    });
  }

  /**
   * Why a question cannot be put to an agent right now, reported to the reader once.
   *
   * Separate from send() so retry() can ask BEFORE it edits the transcript instead of finding out
   * from inside send(), after the question it was about to re-ask has already been deleted.
   */
  private cannotSend(message: string): boolean {
    if (!message || this.sending()) return true;
    if (this.agentId() === null) {
      this.toast.error('Choose an agent first.');
      return true;
    }
    return false;
  }

  send(text?: string): void {
    const message = (text ?? this.draft()).trim();
    if (this.cannotSend(message)) return;

    // Only the recent turns are sent -- the file itself dominates the context window. Built
    // BEFORE the new question is appended below, so the question travels once, in the request's
    // own message field, rather than also arriving as the last history turn.
    //
    // The field is text, not content: FileChatHistoryItemDto carries role and text and is
    // annotated to ignore unknown properties, so a differently-named field is discarded by
    // Jackson without a word and every turn deserializes with a null text. appendHistory then
    // writes its "Recent conversation so far:" header and skips every turn under it, leaving the
    // model a dangling header and no conversation at all -- so "expand on the second one" had
    // nothing to refer back to.
    //
    // Error turns are dropped because they are this panel's own text, not the person's:
    // "Stopped." and "The AI didn't respond: ..." are written here, and appendHistory labels
    // every non-assistant role "User", so they would be replayed to the model as things the user
    // actually said. This mirrors what the legacy Object Browser chat has always sent.
    const history = this.messages()
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-8)
      .map(m => ({ role: m.role, text: m.text }));

    this.messages.update(list => [...list, { role: 'user', text: message, at: Date.now() }]);
    this.draft.set('');
    this.sending.set(true);

    this.inFlight = this.http.post<ApiResponse<string>>(`${API_BASE}/fileChat.json/sendMessage`, {
      bucket: this.bucket(), key: this.fileKey(), aiAgentId: this.agentId(), message, history,
    }).subscribe({
      next: response => {
        this.settle();
        if (response.status !== API_SUCCESS) {
          this.messages.update(list => [...list, { role: 'error', text: response.message, at: Date.now() }]);
          return;
        }
        // The raw reply carries the export fence so the file can be pulled out of it, but that
        // same fence must not also render -- otherwise the file's escaped markup fills the
        // bubble directly above a button offering the identical content.
        const raw = String(response.data ?? '');
        this.messages.update(list => [...list, {
          role: 'assistant',
          at: Date.now(),
          text: stripExportFences(raw),
          files: parseDownloadableFiles(raw, this.baseName()),
        }]);
        this.refreshCoverage();
      },
      error: err => {
        this.settle();
        this.messages.update(list => [...list,
          { role: 'error', text: err?.error?.message || 'The agent did not respond.',
            at: Date.now() }]);
      },
    });

    this.focusComposer();
  }

  private settle(): void {
    this.sending.set(false);
    this.inFlight = null;
  }

  /** The file's name without its extension, used to name anything the reply produces. */
  private baseName(): string {
    return this.fileName().replace(/\.[^./]+$/, '') || 'export';
  }

  /**
   * Abandons a reply in progress. A long answer over a large file is the case people actually
   * want to escape, and without this the only way out was to close the panel and lose the
   * conversation with it.
   */
  stop(): void {
    if (!this.inFlight) return;
    this.abandonInFlight();
    this.messages.update(list => [...list, { role: 'error', text: 'Stopped.', at: Date.now() }]);
  }

  /**
   * Dictation into the draft box. Results are appended rather than replacing what is already
   * typed, so speaking after typing extends the question instead of discarding it. Signals
   * make the callbacks safe without NgZone -- setting one schedules its own change detection.
   */
  toggleMic(): void {
    if (this.listening()) {
      this.recognition?.stop();
      return;
    }
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      this.toast.error('This browser cannot record speech.');
      return;
    }
    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => this.listening.set(true);
    recognition.onerror = (event: any) => {
      this.listening.set(false);
      if (event?.error === 'not-allowed') this.toast.error('Microphone access was refused.');
      else if (event?.error !== 'aborted') this.toast.error('Could not hear anything.');
    };
    recognition.onend = () => { this.listening.set(false); this.recognition = null; };
    recognition.onresult = (event: any) => {
      const said = event.results?.[0]?.[0]?.transcript?.trim();
      if (!said) return;
      const current = this.draft().trim();
      this.draft.set(current ? `${current} ${said}` : said);
    };
    this.recognition = recognition;
    recognition.start();
  }

  /**
   * A plain fence is already the file; one carrying pendingExport is source text the server
   * turns into xlsx, docx or pdf before it can be saved.
   */
  download(file: ChatFile): void {
    if (!file.pendingExport) {
      this.save(new Blob([file.content], { type: file.mimeType }), file.filename);
      return;
    }
    if (this.converting()) return;
    const pending = file.pendingExport;
    this.converting.set(file.filename);
    this.http.post<ApiResponse<string>>(`${API_BASE}/fileChat.json/exportFile`, {
      content: file.content, sourceFormat: pending.sourceFormat, targetFormat: pending.targetFormat,
    }).subscribe({
      next: response => {
        this.converting.set(null);
        if (response.status === API_SUCCESS && response.data) {
          this.save(this.blobFromBase64(String(response.data), pending.mimeType), pending.filename);
        } else {
          this.toast.error(response.message || 'Could not convert this file.');
        }
      },
      error: () => {
        this.converting.set(null);
        this.toast.error('Could not convert this file.');
      },
    });
  }

  /** Which file currently has an email in flight, so two cannot be sent at once. */
  readonly emailing = signal<string | null>(null);

  /**
   * The same export, sent to an address instead of to this browser.
   *
   * It exists because the download is not always a way out: a reader on a locked-down machine,
   * or one reading on a phone, can see the answer and have no way to keep it. The server does
   * the conversion either way -- this changes only where the bytes go.
   *
   * The recipient is collected in the app's own dialog, NOT window.prompt: a browser prompt in
   * the middle of a designed panel reads as a fault, and this app already owns a share dialog
   * that asks for exactly an address and a note.
   *
   * No address validation beyond an obviously-incomplete check lives here. FileShareService owns
   * the rule, the 20 MiB ceiling and the delivery, because a second copy of any of those is the
   * one that drifts.
   */
  /**
   * Emails one answer, converted to PDF.
   *
   * Separate from emailExport(file) because the two send different things: that one sends a file
   * the model produced, this one sends the reply itself. Most replies are not files, and the
   * first version of this feature only offered emailing on the ones that were -- so the ordinary
   * case, "send me what you just told me", had no button anywhere.
   *
   * Markdown is the source format because that is what the model writes and what the bubble
   * renders; the server converts it through the same LibreOffice path the download uses.
   */
  emailAnswer(text: string, index?: number): void {
    const answer = (text ?? '').trim();
    if (!answer || this.emailing()) return;
    const token = `answer-${index ?? this.messages().findIndex(m => m.text === text)}`;
    this.dialog.open<ShareResult>(ShareDialog, {
      hasBackdrop: true,
      data: {
        count: 1,
        title: 'Email this answer',
        subtitle: 'Converted to a PDF and sent as an attachment.',
      },
    }).closed.subscribe(result => {
      if (!result) return;
      this.emailing.set(token);
      this.http.post<ApiResponse>(`${API_BASE}/fileChat.json/emailExport`, {
        content: answer, sourceFormat: 'md', targetFormat: 'pdf',
        recipientEmail: result.recipientEmail, message: result.message,
      }).subscribe({
        next: response => {
          this.emailing.set(null);
          response.status === API_SUCCESS
            ? this.toast.success(`Sent to ${result.recipientEmail}.`)
            : this.toast.error(response.message || 'The email could not be sent.');
        },
        error: err => {
          this.emailing.set(null);
          this.toast.error(err?.error?.message || 'The email could not be sent.');
        },
      });
    });
  }

  emailExport(file: ChatFile): void {
    if (this.emailing() || this.converting()) return;
    const pending = file.pendingExport;
    const format = pending ? pending.targetFormat : fileExtension(file.filename);
    this.dialog.open<ShareResult>(ShareDialog, {
      hasBackdrop: true,
      data: {
        count: 1,
        title: `Email this ${format.toUpperCase()}`,
        subtitle: pending
          ? `The reply is converted to .${format} and sent as an attachment.`
          : `${file.filename} is sent as an attachment.`,
      },
    }).closed.subscribe(result => {
      if (!result) return;
      this.emailing.set(file.filename);
      this.http.post<ApiResponse>(`${API_BASE}/fileChat.json/emailExport`, {
        content: file.content,
        sourceFormat: pending ? pending.sourceFormat : 'txt',
        targetFormat: pending ? pending.targetFormat : 'pdf',
        recipientEmail: result.recipientEmail,
        message: result.message,
      }).subscribe({
        next: response => {
          this.emailing.set(null);
          response.status === API_SUCCESS
            ? this.toast.success(`Sent to ${result.recipientEmail}.`)
            : this.toast.error(response.message || 'The email could not be sent.');
        },
        error: err => {
          this.emailing.set(null);
          this.toast.error(err?.error?.message || 'The email could not be sent.');
        },
      });
    });
  }

  private blobFromBase64(base64: string, mimeType: string): Blob {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  }

  private save(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  onKeydown(event: KeyboardEvent): void {
    // Enter sends; Shift+Enter is a newline, which people expect in a chat box.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  /**
   * The clock time a message was sent, in the reader's own locale.
   *
   * Time only, not the date: a conversation is read in the session that produced it, and
   * history expires after thirty minutes, so a date would be noise on every line.
   */
  formatTime(at: number | undefined): string {
    if (!at) {
      return '';
    }
    return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
}

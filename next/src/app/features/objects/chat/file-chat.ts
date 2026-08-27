import { Component, OnInit, effect, inject, input, output, signal, viewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { Markdown } from '../../../shared/ui/markdown';
import { Avatar } from '../../../shared/ui/avatar';
import { AuthService } from '../../../core/auth/auth.service';
import { copyText } from '../../../shared/ui/clipboard.util';
import { ChatFile, parseDownloadableFiles, stripExportFences } from './chat-export';
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
interface Agent { aiAgentId: number; agentName: string; provider: string; status: string; apiKeyConfigured?: boolean; }

@Component({
  selector: 'app-file-chat',
  imports: [Icon, Markdown, Avatar],
  templateUrl: './file-chat.html',
})
export class FileChat implements OnInit {
  readonly bucket = input.required<string>();
  readonly fileKey = input.required<string>();
  readonly fileName = input.required<string>();
  readonly closed = output<void>();
  readonly viewRequested = output<void>();

  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  /** Whose picture sits beside their own messages. */
  readonly auth = inject(AuthService);

  readonly agents = signal<Agent[]>([]);
  readonly agentId = signal<number | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly draft = signal('');
  readonly preparing = signal(true);
  readonly prepareError = signal('');
  readonly sending = signal(false);
  readonly minimized = signal(false);
  readonly copiedIndex = signal<number | null>(null);
  readonly listening = signal(false);
  readonly converting = signal<string | null>(null);

  /**
   * How long a conversation outlives its panel.
   *
   * Closing used to discard the transcript outright -- the component was destroyed and the
   * messages went with it -- so a mis-click cost the whole conversation. It is kept for half an
   * hour instead, long enough to reopen the file and carry on, short enough that a shared
   * machine does not hold somebody's questions about a document indefinitely.
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
  close(): void {
    this.rememberHistory();
    this.http.post(`${API_BASE}/fileChat.json/endSession`,
      { bucket: this.bucket(), key: this.fileKey() }).subscribe({ error: () => {} });
    this.closed.emit();
  }

  /** Held so the request can be abandoned; see stop(). */
  private inFlight: Subscription | null = null;
  private recognition: any = null;

  /** Dictation needs the browser's speech API, which not every browser exposes. */
  readonly voiceSupported =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  copyMessage(index: number, text: string): void {
    copyText(text).then(() => {
      this.copiedIndex.set(index);
      setTimeout(() => this.copiedIndex.set(null), 1500);
    });
  }

  /**
   * Drops the last exchange and asks again. The failed or unwanted reply is removed first so
   * the model is not handed its own bad answer as context for the retry.
   */
  retry(): void {
    if (this.sending()) return;
    const history = [...this.messages()];
    while (history.length && history[history.length - 1].role !== 'user') history.pop();
    const last = history.pop();
    if (!last) return;
    this.messages.set(history);
    this.send(last.text);
  }

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

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
    this.loadAgents();
    this.restoreHistory();
    this.prepare();
  }

  private loadAgents(): void {
    this.http.get<ApiResponse<Agent[]>>(`${API_BASE}/aiAgent.json/fetchAllAgents`).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) return;
        // Only agents that can actually answer: active, and either keyed or local Ollama.
        const usable = (response.data ?? []).filter(a =>
          a.status === 'Active' && (a.apiKeyConfigured || a.provider?.toLowerCase() === 'ollama'));
        this.agents.set(usable);
        if (usable.length && this.agentId() === null) this.agentId.set(usable[0].aiAgentId);
      },
      error: () => { /* the prepare error below is the one worth surfacing */ },
    });
  }

  private prepare(): void {
    this.preparing.set(true);
    this.prepareError.set('');
    this.http.post<ApiResponse>(`${API_BASE}/fileChat.json/prepareContext`,
      { bucket: this.bucket(), key: this.fileKey() }).subscribe({
      next: response => {
        this.preparing.set(false);
        if (response.status !== API_SUCCESS) this.prepareError.set(response.message);
      },
      error: err => {
        this.preparing.set(false);
        this.prepareError.set(err?.error?.message || 'Could not read this file.');
      },
    });
  }

  send(text?: string): void {
    const message = (text ?? this.draft()).trim();
    if (!message || this.sending()) return;
    if (this.agentId() === null) {
      this.toast.error('Choose an agent first.');
      return;
    }

    this.messages.update(list => [...list, { role: 'user', text: message, at: Date.now() }]);
    this.draft.set('');
    this.sending.set(true);

    // Only the recent turns are sent -- the file itself dominates the context window.
    const history = this.messages().slice(-8).map(m => ({ role: m.role, content: m.text }));

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
      },
      error: err => {
        this.settle();
        this.messages.update(list => [...list,
          { role: 'error', text: err?.error?.message || 'The agent did not respond.',
            at: Date.now() }]);
      },
    });
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
    this.inFlight.unsubscribe();
    this.settle();
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

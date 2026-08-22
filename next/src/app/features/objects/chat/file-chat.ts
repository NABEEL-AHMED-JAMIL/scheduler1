import { Component, OnInit, effect, inject, input, output, signal, viewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';

interface ChatMessage { role: 'user' | 'assistant' | 'error'; text: string; }
interface Agent { aiAgentId: number; agentName: string; provider: string; status: string; apiKeyConfigured?: boolean; }

@Component({
  selector: 'app-file-chat',
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

  readonly agents = signal<Agent[]>([]);
  readonly agentId = signal<number | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly draft = signal('');
  readonly preparing = signal(true);
  readonly prepareError = signal('');
  readonly sending = signal(false);
  readonly minimized = signal(false);

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

    this.messages.update(list => [...list, { role: 'user', text: message }]);
    this.draft.set('');
    this.sending.set(true);

    // Only the recent turns are sent -- the file itself dominates the context window.
    const history = this.messages().slice(-8).map(m => ({ role: m.role, content: m.text }));

    this.http.post<ApiResponse<string>>(`${API_BASE}/fileChat.json/sendMessage`, {
      bucket: this.bucket(), key: this.fileKey(), aiAgentId: this.agentId(), message, history,
    }).subscribe({
      next: response => {
        this.sending.set(false);
        this.messages.update(list => [...list, response.status === API_SUCCESS
          ? { role: 'assistant', text: String(response.data ?? '') }
          : { role: 'error', text: response.message }]);
      },
      error: err => {
        this.sending.set(false);
        this.messages.update(list => [...list,
          { role: 'error', text: err?.error?.message || 'The agent did not respond.' }]);
      },
    });
  }

  onKeydown(event: KeyboardEvent): void {
    // Enter sends; Shift+Enter is a newline, which people expect in a chat box.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }
}

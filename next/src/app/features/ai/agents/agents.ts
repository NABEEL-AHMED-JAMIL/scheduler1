import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';

interface AiAgent {
  aiAgentId: number;
  agentName: string;
  description?: string;
  provider: string;
  model: string;
  targetFileTypes?: string;
  apiKeyConfigured?: boolean;
  jsonMode?: boolean;
  status: string;
}

@Component({
  selector: 'app-agents',
  imports: [TableShell, StatusPill],
  templateUrl: './agents.html',
})
export class Agents implements OnInit {
  private readonly http = inject(HttpClient);

  readonly agents = signal<AiAgent[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.agents();
    return this.agents().filter(a =>
      (a.agentName ?? '').toLowerCase().includes(term)
      || (a.provider ?? '').toLowerCase().includes(term)
      || (a.model ?? '').toLowerCase().includes(term));
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<AiAgent[]>>(`${API_BASE}/aiAgent.json/fetchAllAgents`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status === API_SUCCESS) this.agents.set(response.data ?? []);
        else this.error.set(response.message);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load agents.');
      },
    });
  }

  /** Ollama runs locally and needs no key, so "not set" is only a problem elsewhere. */
  keyState(agent: AiAgent): { cls: string; label: string; hint: string } {
    if (agent.apiKeyConfigured) {
      return { cls: 'pill pill-ok', label: 'Configured', hint: 'A key is stored for this agent' };
    }
    if ((agent.provider ?? '').toLowerCase() === 'ollama') {
      return { cls: 'pill pill-neutral', label: 'Not needed', hint: 'Ollama runs locally without a key' };
    }
    return { cls: 'pill pill-warn', label: 'Not set', hint: 'This provider needs an API key to work' };
  }
}

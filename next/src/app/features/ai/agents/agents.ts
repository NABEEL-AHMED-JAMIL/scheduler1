import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { MineFilter, isMine } from '../../../shared/ui/mine-filter';
import { AuthService } from '../../../core/auth/auth.service';
import { TableShell } from '../../../shared/ui/data-table';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { AgentDialog } from './agent-dialog';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { Icon } from '../../../shared/ui/icon';
import { ViewToggle } from '../../../shared/ui/view-toggle';

interface AiAgent {
  /** Filled in by the server on the way out; null on rows with no recorded author. */
  createdByName?: string | null;
  updatedByName?: string | null;
  /** The author's id, so "Only mine" matches on identity rather than display text. */
  createdBy?: number | null;

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
  imports: [MineFilter, ViewToggle, Icon, TableShell, StatusPill, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './agents.html',
})
export class Agents implements OnInit {
  readonly view = signal<'table' | 'cards'>('table');
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly agents = signal<AiAgent[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');

  /** Public: the template gates every write control on auth.canManageAgents(). */
  readonly auth = inject(AuthService);

  /** Narrows the list to rows this person created. Not persisted -- see MineFilter. */

  readonly onlyMine = signal(false);


  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const rows = this.mine(this.agents());
    if (!term) return rows;
    return rows.filter(a =>
      (a.agentName ?? '').toLowerCase().includes(term)
      || (a.provider ?? '').toLowerCase().includes(term)
      || (a.model ?? '').toLowerCase().includes(term));
  });

  ngOnInit(): void { this.load(); this.loadProviders(); }

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

  /** Providers come from the AI_PROVIDER lookup so the list stays configurable. */
  readonly providers = signal<string[]>([]);

  private loadProviders(): void {
    this.http.get<ApiResponse<any>>(`${API_BASE}/setting.json/appSetting`).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) return;
        const lookup = (response.data?.lookupDatas ?? [])
          .find((l: any) => l.lookupType === 'AI_PROVIDER');
        const values = (lookup?.children ?? []).map((c: any) => c.lookupValue).filter(Boolean);
        this.providers.set(values.length ? values : ['OpenAI', 'Anthropic', 'Ollama']);
      },
      error: () => this.providers.set(['OpenAI', 'Anthropic', 'Ollama']),
    });
  }

  create(): void {
    this.dialog.open<boolean>(AgentDialog, {
      data: { providers: this.providers() }, hasBackdrop: true,
    }).closed.subscribe(saved => { if (saved) this.load(); });
  }

  edit(agent: AiAgent): void {
    this.dialog.open<boolean>(AgentDialog, {
      data: { agent, providers: this.providers() }, hasBackdrop: true,
    }).closed.subscribe(saved => { if (saved) this.load(); });
  }

  async remove(agent: AiAgent): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: 'Delete agent',
      body: `"${agent.agentName}" will be removed. Any file chat using it will fall back to another agent.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(`${API_BASE}/aiAgent.json/deleteAgent`,
      { params: { aiAgentId: String(agent.aiAgentId) } }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) {
          this.toast.success(`${agent.agentName} deleted.`);
          this.load();
        } else { this.toast.error(response.message); }
      },
      error: err => this.toast.error(err?.error?.message || 'Delete failed.'),
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

  /**
   * Applies the "Only mine" toggle.
   *
   * Pure -- it runs inside a computed, where writing a signal is not allowed. The surviving
   * count is already on the table header, so nothing needs recording.
   */
  private mine<T extends { createdBy?: number | null }>(rows: T[]): T[] {
    if (!this.onlyMine()) {
      return rows;
    }
    const myId = this.auth.user()?.appUserId ?? null;
    return rows.filter(row => isMine(row, myId));
  }
}

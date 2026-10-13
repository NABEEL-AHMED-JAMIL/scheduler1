import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { SidePanel } from '../../../shared/ui/side-panel';
import { refusal } from '../../../shared/ui/bulk/bulk.model';
import { AccessProfile, AccessProfilesService } from '../../admin/access-profiles/access-profiles.service';
import { AlertKindInfo, AlertRule, AlertScope, AlertsApi, ruleSentence } from './alerts.api';

export interface AlertRulePanelData {
  scope: AlertScope;
  kinds: AlertKindInfo[];
  rule: AlertRule | null;
}

interface Schedule { jobId: number; jobName: string; }

/**
 * MIG-355: one alert rule, made or changed, over the right of the rules list -- what it watches and how much is too much,
 * how bad (warning or critical), how it is told (the bell, mail, the workspace's webhooks) and to whom (roles and groups),
 * and quiet hours that hold mail. The server checks everything again and answers a refusal in a sentence, shown here.
 */
@Component({
  selector: 'app-alert-rule-panel',
  imports: [SidePanel, Icon],
  template: `
    <app-side-panel [heading]="draft().id ? 'Change the alert rule' : 'New alert rule'" [subtitle]="sentence()" data-test="alert-rule-panel">
      <div class="form-lock flex flex-col gap-4">
        <div>
          <label class="label" for="rule-kind">Watch for</label>
          <select id="rule-kind" class="input" [value]="draft().kind" [disabled]="!!draft().id" (change)="setKind($any($event.target).value)"
                  data-test="rule-kind">
            @for (k of data.kinds; track k.kind) { <option [value]="k.kind">{{ k.label }}</option> }
          </select>
          @if (kindInfo(); as k) { <p class="field-note text-[color:var(--text-muted)]">What to do when it fires: {{ k.whatToDo }}</p> }
        </div>
        <div>
          <label class="label" for="rule-name">Name</label>
          <input id="rule-name" class="input" maxlength="120" [value]="draft().name" (input)="patch({ name: $any($event.target).value })"
                 data-test="rule-name" />
        </div>

        @if (needsThreshold()) {
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label" for="rule-threshold">{{ thresholdLabel() }}</label>
              <input id="rule-threshold" class="input" type="number" min="1" [value]="draft().threshold"
                     (input)="patch({ threshold: +$any($event.target).value })" data-test="rule-threshold" />
            </div>
            @if (needsWindow()) {
              <div>
                <label class="label" for="rule-window">{{ windowLabel() }}</label>
                <input id="rule-window" class="input" type="number" min="1" [value]="draft().windowMinutes"
                       (input)="patch({ windowMinutes: +$any($event.target).value })" data-test="rule-window" />
              </div>
            }
          </div>
        } @else if (needsWindow()) {
          <div class="max-w-48">
            <label class="label" for="rule-window">{{ windowLabel() }}</label>
            <input id="rule-window" class="input" type="number" min="1" [value]="draft().windowMinutes"
                   (input)="patch({ windowMinutes: +$any($event.target).value })" data-test="rule-window" />
          </div>
        }
        @if (draft().kind === 'RUN_SLOW') {
          <div class="max-w-48">
            <label class="label" for="rule-factor">Slower than (× the usual p95)</label>
            <input id="rule-factor" class="input" type="number" min="1.2" max="20" step="0.1" [value]="draft().factor ?? 2"
                   (input)="patch({ factor: +$any($event.target).value })" data-test="rule-factor" />
          </div>
        }
        @if (data.scope === 'workspace') {
          <div>
            <label class="label" for="rule-job">Schedule</label>
            <select id="rule-job" class="input" [value]="draft().jobId ?? ''" (change)="setJob($any($event.target).value)" data-test="rule-job">
              <option value="">Every schedule of the workspace</option>
              @for (s of schedules(); track s.jobId) { <option [value]="s.jobId">{{ s.jobName }}</option> }
            </select>
          </div>
        }

        <div role="group">
          <p class="label m-0 mb-1">How bad</p>
          <div class="flex gap-4 text-sm">
            <label class="flex items-center gap-2"><input type="radio" name="sev" class="checkbox" [checked]="draft().severity === 'WARNING'"
                   (change)="patch({ severity: 'WARNING' })" />Warning</label>
            <label class="flex items-center gap-2"><input type="radio" name="sev" class="checkbox" [checked]="draft().severity === 'CRITICAL'"
                   (change)="patch({ severity: 'CRITICAL' })" />Critical</label>
          </div>
        </div>

        <div role="group">
          <p class="label m-0 mb-1">Tell them by</p>
          <div class="flex flex-wrap gap-4 text-sm">
            <label class="flex items-center gap-2"><input type="checkbox" class="checkbox" [checked]="draft().channels.bell"
                   (change)="channel('bell', $any($event.target).checked)" data-test="rule-bell" />The bell</label>
            <label class="flex items-center gap-2"><input type="checkbox" class="checkbox" [checked]="draft().channels.email"
                   (change)="channel('email', $any($event.target).checked)" data-test="rule-email" />Mail</label>
            @if (data.scope === 'workspace') {
              <label class="flex items-center gap-2"><input type="checkbox" class="checkbox" [checked]="draft().channels.webhook"
                     (change)="channel('webhook', $any($event.target).checked)" data-test="rule-webhook" />Webhooks</label>
            }
          </div>
          @if (draft().channels.webhook) {
            <p class="field-note text-[color:var(--text-muted)]">Sent as alert.opened and alert.resolved to the workspace's webhooks that subscribe to them
              (Developers › API Clients), signed like every event.</p>
          }
        </div>

        @if (data.scope === 'workspace') {
          <div role="group">
            <p class="label m-0 mb-1">Who hears of it</p>
            <div class="flex flex-wrap gap-4 text-sm">
              <label class="flex items-center gap-2"><input type="checkbox" class="checkbox" [checked]="draft().roles.includes('TENANT_ADMIN')"
                     (change)="role('TENANT_ADMIN', $any($event.target).checked)" data-test="rule-role-admin" />Administrators</label>
              <label class="flex items-center gap-2"><input type="checkbox" class="checkbox" [checked]="draft().roles.includes('TENANT_USER')"
                     (change)="role('TENANT_USER', $any($event.target).checked)" />Every other member</label>
            </div>
            @if (profiles().length) {
              <p class="field-note text-[color:var(--text-muted)] mt-2 mb-1">And these groups (access profiles):</p>
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                @for (p of profiles(); track p.pageAccessProfileId) {
                  <label class="flex items-center gap-2"><input type="checkbox" class="checkbox" [checked]="draft().groups.includes(p.pageAccessProfileId)"
                         (change)="group(p.pageAccessProfileId, $any($event.target).checked)" />{{ p.profileName }}</label>
                }
              </div>
            }
          </div>
        } @else {
          <p class="text-sm text-[color:var(--text-secondary)] m-0">Every platform administrator hears of the platform's alerts.</p>
        }

        <div role="group">
          <p class="label m-0 mb-1">Quiet hours</p>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox" [checked]="!!draft().quietHours"
                 (change)="quiet($any($event.target).checked)" data-test="rule-quiet" />Hold mail during quiet hours</label>
          @if (draft().quietHours; as q) {
            <div class="flex items-center gap-2 mt-2 text-sm">
              <input class="input max-w-28" type="time" [value]="q.start" (input)="quietPatch({ start: $any($event.target).value })" aria-label="Quiet from" />
              <span>to</span>
              <input class="input max-w-28" type="time" [value]="q.end" (input)="quietPatch({ end: $any($event.target).value })" aria-label="Quiet until" />
              <span class="text-[color:var(--text-muted)]">{{ q.zone || 'America/Chicago' }}</span>
            </div>
            <p class="field-note text-[color:var(--text-muted)]">Mail waits until they end, then goes if the alert is still open. The bell and webhooks are not held.</p>
          }
        </div>

        <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox" [checked]="draft().enabled"
               (change)="patch({ enabled: $any($event.target).checked })" />On</label>
        @if (error()) { <p class="text-sm text-crit-500 m-0" role="alert" data-test="rule-error">{{ error() }}</p> }
      </div>
      <div foot class="flex items-center gap-2 w-full">
        <button type="button" class="btn btn-ghost btn-sm" (click)="ref.close(false)">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm ml-auto" [disabled]="saving()" (click)="save()" data-test="rule-save">
          <app-icon name="save" [busy]="saving()" />Save the rule</button>
      </div>
    </app-side-panel>
  `,
})
export class AlertRulePanel implements OnInit {
  readonly ref = inject<DialogRef<boolean, AlertRulePanel>>(DialogRef);
  readonly data = inject<AlertRulePanelData>(DIALOG_DATA);
  private readonly api = inject(AlertsApi);
  private readonly http = inject(HttpClient);
  private readonly profilesApi = inject(AccessProfilesService);

  readonly draft = signal<AlertRule>(this.data.rule ? structuredClone(this.data.rule) : this.fresh(this.data.kinds[0]));
  readonly schedules = signal<Schedule[]>([]);
  readonly profiles = signal<AccessProfile[]>([]);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly kindInfo = computed(() => this.data.kinds.find(k => k.kind === this.draft().kind) ?? null);
  readonly sentence = computed(() => ruleSentence(this.draft()));
  readonly needsThreshold = computed(() => ['RUN_FAILED', 'SERVICE_UNHEALTHY', 'MEMORY_HIGH', 'KAFKA_LAG', 'DISK_LOW'].includes(this.draft().kind));
  readonly needsWindow = computed(() => ['RUN_FAILED', 'SCHEDULE_MISSED', 'RUN_SLOW', 'REVIEW_WAITING', 'SERVICE_RESTARTED'].includes(this.draft().kind));
  readonly thresholdLabel = computed(() => ({
    RUN_FAILED: 'Failed runs', SERVICE_UNHEALTHY: 'Minutes down', MEMORY_HIGH: 'Heap after GC (%)', KAFKA_LAG: 'Messages behind',
    DISK_LOW: 'Free space under (%)',
  } as Record<string, string>)[this.draft().kind] ?? 'Threshold');
  readonly windowLabel = computed(() => this.draft().kind === 'REVIEW_WAITING' ? 'Waiting longer than (minutes)' : 'Within (minutes)');

  ngOnInit(): void {
    if (this.data.scope !== 'workspace') return;
    this.http.get<ApiResponse<Schedule[]>>(`${API_BASE}/sourceJob.json/listSourceJob`).subscribe({
      next: r => this.schedules.set((r?.data ?? []).map(j => ({ jobId: j.jobId, jobName: j.jobName }))),
      error: () => this.schedules.set([]),
    });
    this.profilesApi.list().subscribe({ next: r => this.profiles.set(r?.data ?? []), error: () => this.profiles.set([]) });
  }

  private fresh(kind: AlertKindInfo): AlertRule {
    return {
      id: null, kind: kind.kind, name: kind.label, enabled: true, severity: 'WARNING', jobId: null, threshold: kind.threshold,
      windowMinutes: kind.windowMinutes, factor: kind.kind === 'RUN_SLOW' ? 2 : null, channels: { bell: true, email: false, webhook: false },
      roles: this.data.scope === 'workspace' ? ['TENANT_ADMIN'] : [], groups: [], quietHours: null,
    };
  }

  patch(change: Partial<AlertRule>): void {
    this.draft.update(d => ({ ...d, ...change }));
  }

  setKind(kind: string): void {
    const info = this.data.kinds.find(k => k.kind === kind);
    if (info) this.draft.set({ ...this.fresh(info), roles: this.draft().roles, groups: this.draft().groups, channels: this.draft().channels });
  }

  setJob(value: string): void {
    this.patch({ jobId: value ? Number(value) : null });
  }

  channel(which: 'bell' | 'email' | 'webhook', on: boolean): void {
    this.draft.update(d => ({ ...d, channels: { ...d.channels, [which]: on } }));
  }

  role(role: string, on: boolean): void {
    this.draft.update(d => ({ ...d, roles: on ? [...new Set([...d.roles, role])] : d.roles.filter(r => r !== role) }));
  }

  group(id: number, on: boolean): void {
    this.draft.update(d => ({ ...d, groups: on ? [...new Set([...d.groups, id])] : d.groups.filter(g => g !== id) }));
  }

  quiet(on: boolean): void {
    this.patch({ quietHours: on ? { start: '22:00', end: '07:00', zone: 'America/Chicago' } : null });
  }

  quietPatch(change: Partial<{ start: string; end: string }>): void {
    const q = this.draft().quietHours;
    if (q) this.patch({ quietHours: { ...q, ...change } });
  }

  save(): void {
    this.saving.set(true);
    this.error.set('');
    this.api.save(this.draft()).subscribe({
      next: r => {
        this.saving.set(false);
        if (r?.status === API_SUCCESS) this.ref.close(true);
        else this.error.set(r?.message || 'The rule could not be saved.');
      },
      error: err => {
        this.saving.set(false);
        this.error.set(refusal(err, 'The rule could not be saved.'));
      },
    });
  }
}

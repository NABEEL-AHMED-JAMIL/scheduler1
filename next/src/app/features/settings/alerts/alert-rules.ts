import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { forkJoin } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { confirmWith } from '../../../shared/ui/confirm';
import { ToastService } from '../../../shared/ui/toast.service';
import { refusal } from '../../../shared/ui/bulk/bulk.model';
import { Alert, AlertRule, AlertRulesAnswer, AlertScope, AlertsApi, recommendedRules, ruleSentence } from './alerts.api';
import { AlertRulePanel, AlertRulePanelData } from './alert-rule-panel';

/**
 * MIG-355: alerts and their rules, for a workspace (Settings › Alerts) or the platform (Platform › Service health). Owner #6
 * (2026-10-19) redesigned it: the count says what it is ("6 rules · up to 50 per workspace": the rules in use against the
 * scope's limit, which the server enforces); the alerts open now and lately sit beside the rules, which are grouped by what
 * they watch -- each with its condition in a sentence, who it tells and how, its quiet hours, when it last fired, and a
 * mute (a time it tells nobody, its alerts still recorded). A rule opens in the side panel to change; a workspace with none
 * is offered the recommended five in one press.
 */
@Component({
  selector: 'app-alert-rules',
  imports: [Icon, ServerTimePipe, CdkMenu, CdkMenuItem, CdkMenuTrigger, Segmented],
  styles: `
    .alerts-layout { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); }
    @media (min-width: 80rem) { .alerts-layout { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); } }
    .alert-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 0.75rem; align-items: start; padding: 0.75rem 0;
      border-top: 1px solid var(--border-subtle); }
    .alert-row:first-child { border-top: 0; }
    .sev { width: 0.5rem; height: 0.5rem; border-radius: 999px; margin-top: 0.45rem; }
    .sev-CRITICAL { background: var(--series-crit); }
    .sev-WARNING { background: var(--series-warn, var(--warn-text)); }
    .sev-RESOLVED { background: var(--border-strong); }
    .kind-group + .kind-group { margin-top: 1rem; }
    .kind-head { display: flex; align-items: baseline; gap: 0.5rem; padding-bottom: 0.25rem; border-bottom: 1px solid var(--border-subtle); }
    .rule-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.75rem; align-items: start; padding: 0.65rem 0;
      border-top: 1px solid var(--border-subtle); }
    .kind-head + .rule-row { border-top: 0; }
    .rule-meta { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.125rem 0.75rem; margin-top: 0.375rem; font-size: 0.75rem; }
    .rule-meta dt { color: var(--text-muted); }
    .rule-meta dd { margin: 0; color: var(--text-secondary); min-width: 0; }
    .chip { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0 0.45rem; border-radius: 999px; font-size: 11px;
      line-height: 1.25rem; border: 1px solid var(--border-subtle); color: var(--text-secondary); white-space: nowrap; }
    .rules-count { font-size: 0.75rem; color: var(--text-secondary); }
  `,
  template: `
    <div [attr.data-alert-scope]="scope()">
      <div class="flex flex-wrap items-center gap-2 mb-3" data-test="alerts-toolbar">
        <!-- Owner #6 (2026-10-19): "Rules 6 of 50" was the rules in use against the scope's limit; it says so now. -->
        <span class="rules-count" data-test="rules-count" [title]="limitHelp()">
          <strong class="text-[color:var(--text-primary)]">{{ rules().length }} {{ rules().length === 1 ? 'rule' : 'rules' }}</strong>
          · up to {{ maxRules() }} {{ scope() === 'workspace' ? 'per workspace' : 'for the platform' }}
          @if (enabledCount() < rules().length) { · {{ rules().length - enabledCount() }} off }
          @if (mutedCount()) { · {{ mutedCount() }} muted }
        </span>
        <span class="rules-count">· {{ openCount() }} {{ openCount() === 1 ? 'alert' : 'alerts' }} open</span>
        <div class="ml-auto flex gap-2">
          <button type="button" class="btn btn-default btn-sm" (click)="load()" [disabled]="loading()"><app-icon name="refresh" [busy]="loading()" />Refresh</button>
          @if (scope() === 'workspace' && !rules().length && !loading()) {
            <button type="button" class="btn btn-default btn-sm" (click)="addRecommended()" [disabled]="busy()" data-test="alerts-recommended">
              <app-icon name="sparkle" />Add the recommended rules</button>
          }
          <button type="button" class="btn btn-primary btn-sm" (click)="edit(null)" [disabled]="!answer() || atLimit()" data-test="alerts-new-rule"
                  [title]="atLimit() ? 'This ' + (scope() === 'workspace' ? 'workspace' : 'platform') + ' has ' + maxRules() + ' rules, the most it may have: remove one first.' : ''">
            <app-icon name="plus" />New rule</button>
        </div>
      </div>
      @if (error()) { <p class="text-sm text-crit-500 m-0 mb-3" role="alert">{{ error() }}</p> }

      <div class="alerts-layout">
        <section class="card p-4 min-w-0" aria-labelledby="alerts-title" data-test="alerts-list">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <h3 class="chart-title m-0" id="alerts-title">Alerts</h3>
            <span class="chart-sub">open first · resolved ones are kept 30 days</span>
            <app-segmented class="ml-auto" ariaLabel="Which alerts" [options]="filters" [value]="alertFilter()" (valueChange)="alertFilter.set($event)" />
          </div>
          @for (a of shownAlerts(); track a.id) {
            <div class="alert-row" [attr.data-alert]="a.id" [attr.data-alert-state]="a.state">
              <span class="sev" [class]="'sev sev-' + (a.state === 'OPEN' ? a.severity : 'RESOLVED')" [attr.aria-label]="a.severity"></span>
              <div class="min-w-0">
                <p class="text-sm font-medium m-0">{{ a.title }}</p>
                @if (a.detail) { <p class="text-xs text-[color:var(--text-secondary)] m-0 mt-0.5">{{ a.detail }}</p> }
                <p class="text-xs text-[color:var(--text-muted)] m-0 mt-1">
                  {{ a.kindLabel }} · since {{ a.firstSeenAt | serverTime:'recent' }}@if (a.occurrences > 1) { <span> · seen {{ a.occurrences }} times</span> }
                  @if (a.state === 'RESOLVED') { <span> · resolved {{ a.resolvedAt | serverTime:'recent' }} ({{ a.resolvedHow === 'AUTO' ? 'cleared by itself' : 'by a person' }})</span> }
                  @if (a.emailHeld) { <span> · mail held for quiet hours</span> }
                </p>
                @if (a.state === 'OPEN' && a.whatToDo) { <p class="text-xs m-0 mt-1"><span class="font-medium">What to do:</span> {{ a.whatToDo }}</p> }
              </div>
              <div class="flex flex-col items-end gap-1">
                @if (a.link) { <button type="button" class="btn btn-default btn-sm" (click)="go(a)"><app-icon name="external" />Open</button> }
                @if (a.state === 'OPEN') {
                  <button type="button" class="btn btn-default btn-sm" (click)="resolve(a)" [attr.data-resolve]="a.id"><app-icon name="check" />Resolve</button>
                }
              </div>
            </div>
          } @empty {
            <p class="text-sm text-[color:var(--text-muted)] m-0 py-4" data-test="alerts-empty">{{ loading() ? 'Reading the alerts…' : (alertFilter() === 'OPEN' ? 'No alert is open.' : 'No alert has fired.') }}</p>
          }
        </section>

        <section class="card p-4 min-w-0" aria-labelledby="rules-title" data-test="alert-rules">
          <h3 class="chart-title m-0" id="rules-title">Rules</h3>
          <p class="chart-sub m-0 mb-2">Grouped by what they watch. A rule opens in the panel to change.</p>
          @for (g of groups(); track g.kind) {
            <div class="kind-group" [attr.data-kind]="g.kind">
              <div class="kind-head"><h4 class="text-sm font-semibold m-0">{{ g.label }}</h4>
                <span class="text-xs text-[color:var(--text-muted)]">{{ g.rules.length }} {{ g.rules.length === 1 ? 'rule' : 'rules' }}</span></div>
              @for (r of g.rules; track r.id) {
                <div class="rule-row" [attr.data-rule]="r.id" [class.opacity-70]="!r.enabled">
                  <div class="min-w-0">
                    <button type="button" class="text-left bg-transparent border-0 p-0 cursor-pointer" (click)="edit(r)">
                      <span class="text-sm font-medium">{{ r.name }}</span>
                      <span class="chip ml-2" [class.text-crit-500]="r.severity === 'CRITICAL'">{{ r.severity === 'CRITICAL' ? 'Critical' : 'Warning' }}</span>
                      @if (!r.enabled) { <span class="chip ml-1">Off</span> }
                      @if (muted(r)) { <span class="chip ml-1" data-test="rule-muted"><app-icon name="volumeOff" size="0.8em" />Muted until {{ r.mutedUntil | serverTime:'recent' }}</span> }
                    </button>
                    <dl class="rule-meta">
                      <dt>When</dt><dd>{{ sentence(r) }}</dd>
                      <dt>Tells</dt>
                      <dd>
                        <span class="inline-flex flex-wrap gap-1">
                          @if (scope() === 'workspace') { <span class="chip"><app-icon name="users" size="0.8em" />{{ audience(r) }}</span> }
                          @else { <span class="chip"><app-icon name="users" size="0.8em" />Platform administrators</span> }
                          @if (r.channels.bell) { <span class="chip"><app-icon name="bell" size="0.8em" />Bell</span> }
                          @if (r.channels.email) { <span class="chip"><app-icon name="mail" size="0.8em" />Mail</span> }
                          @if (r.channels.webhook) { <span class="chip"><app-icon name="link" size="0.8em" />Webhooks</span> }
                        </span>
                      </dd>
                      <dt>Quiet hours</dt><dd>{{ r.quietHours ? ('mail held ' + r.quietHours.start + '–' + r.quietHours.end + (r.quietHours.zone ? ' (' + r.quietHours.zone + ')' : '') + '; the bell is not') : 'none' }}</dd>
                      <dt>Last fired</dt>
                      <dd data-test="rule-last-fired">@if (r.lastFiredAt) { {{ r.lastFiredAt | serverTime:'recent' }}@if (r.openAlerts) { <span class="text-crit-500"> · {{ r.openAlerts }} open</span> } } @else { never }</dd>
                    </dl>
                  </div>
                  <div class="flex items-center gap-1">
                    <label class="flex items-center gap-1.5 text-xs"><input type="checkbox" class="checkbox" [checked]="r.enabled" (change)="toggle(r, $any($event.target).checked)"
                           [attr.aria-label]="'Turn ' + r.name + (r.enabled ? ' off' : ' on')" />On</label>
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" [cdkMenuTriggerFor]="ruleMenu" [cdkMenuTriggerData]="{ $implicit: r }"
                            [attr.aria-label]="'Actions for ' + r.name" data-test="rule-actions"><app-icon name="dots" size="1.05em" /></button>
                  </div>
                </div>
              }
            </div>
          } @empty {
            <p class="text-sm text-[color:var(--text-muted)] m-0 py-4">{{ loading() ? 'Reading the rules…' : (scope() === 'workspace'
              ? 'No rule yet: nothing tells you when a run fails. Add the recommended rules to start.' : 'No platform rule.') }}</p>
          }
        </section>
      </div>

      <ng-template #ruleMenu let-r>
        <div cdkMenu class="card shadow-xl py-1 min-w-48 text-sm">
          <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="edit(r)"><app-icon name="edit" />Change</button>
          @if (muted(r)) {
            <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="mute(r, 0)" data-unmute><app-icon name="volume" />Unmute</button>
          } @else {
            @for (m of muteChoices; track m.minutes) {
              <button cdkMenuItem class="menu-item" (cdkMenuItemTriggered)="mute(r, m.minutes)" [attr.data-mute]="m.minutes"><app-icon name="volumeOff" />Mute for {{ m.label }}</button>
            }
          }
          <div class="my-1 border-t border-subtle" role="separator"></div>
          <button cdkMenuItem class="menu-item menu-item-danger" (cdkMenuItemTriggered)="remove(r)"><app-icon name="trash" class="icon-crit" />Remove</button>
        </div>
      </ng-template>
    </div>
  `,
})
export class AlertRules implements OnInit {
  readonly scope = input<AlertScope>('workspace');
  private readonly api = inject(AlertsApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly answer = signal<AlertRulesAnswer | null>(null);
  readonly alerts = signal<Alert[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly rules = computed(() => this.answer()?.rules ?? []);
  readonly openCount = computed(() => this.alerts().filter(a => a.state === 'OPEN').length);
  readonly maxRules = computed(() => this.answer()?.maxRules ?? 50);
  readonly atLimit = computed(() => this.rules().length >= this.maxRules());
  readonly enabledCount = computed(() => this.rules().filter(r => r.enabled).length);
  readonly mutedCount = computed(() => this.rules().filter(r => this.muted(r)).length);
  readonly limitHelp = computed(() => `The rules in use, out of the most ${this.scope() === 'workspace' ? 'a workspace' : 'the platform'} may have `
    + `(${this.maxRules()}). Turned-off and muted rules count; remove one to make room.`);
  /** Owner #6: the rules grouped by what they watch, in the order the kinds are offered. */
  readonly groups = computed(() => {
    const kinds = this.answer()?.kinds ?? [];
    const order = new Map(kinds.map((k, i) => [k.kind, i]));
    const label = new Map(kinds.map(k => [k.kind, k.label]));
    const by = new Map<string, AlertRule[]>();
    for (const r of this.rules()) by.set(r.kind, [...(by.get(r.kind) ?? []), r]);
    return [...by.entries()].sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99))
      .map(([kind, rules]) => ({ kind, label: label.get(kind) ?? rules[0]?.kindLabel ?? kind, rules }));
  });
  readonly filters: SegmentOption<'OPEN' | 'ALL'>[] = [{ id: 'ALL', label: 'All' }, { id: 'OPEN', label: 'Open' }];
  readonly alertFilter = signal<'OPEN' | 'ALL'>('ALL');
  readonly shownAlerts = computed(() => this.alertFilter() === 'OPEN' ? this.alerts().filter(a => a.state === 'OPEN') : this.alerts());
  readonly muteChoices = [{ minutes: 60, label: 'an hour' }, { minutes: 480, label: '8 hours' }, { minutes: 1440, label: 'a day' },
    { minutes: 10080, label: 'a week' }];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin([this.api.rules(), this.api.alerts('all', 100)]).subscribe({
      next: ([rules, alerts]) => {
        this.loading.set(false);
        if (rules?.status === API_SUCCESS && rules.data) this.answer.set(rules.data);
        else this.error.set(rules?.message || 'The rules could not be read.');
        this.alerts.set(alerts?.data ?? []);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(refusal(err, 'The alerts could not be read.'));
      },
    });
  }

  sentence(rule: AlertRule): string { return ruleSentence(rule); }

  /** Whether the rule tells nobody right now. */
  muted(rule: AlertRule): boolean {
    return !!rule.mutedUntil && Date.parse(rule.mutedUntil) > Date.now();
  }

  /** Owner #6: tells nobody for that long (its alerts still open and resolve); 0 ends the mute. */
  mute(rule: AlertRule, minutes: number): void {
    if (rule.id == null) return;
    this.api.mute(rule.id, minutes).subscribe({
      next: r => { if (r?.status === API_SUCCESS) { this.toast.success(r.message || (minutes ? 'Muted.' : 'Unmuted.')); this.load(); } else this.toast.error(r?.message || 'Not changed.'); },
      error: err => this.toast.error(refusal(err, 'Not changed.')),
    });
  }

  audience(rule: AlertRule): string {
    const who: string[] = [];
    if (rule.roles.includes('TENANT_ADMIN')) who.push('Administrators');
    if (rule.roles.includes('TENANT_USER')) who.push('Members');
    if (rule.teams?.length) who.push(`${rule.teams.length} ${rule.teams.length === 1 ? 'team' : 'teams'}`);
    return who.join(', ') || 'Nobody (webhooks only)';
  }

  edit(rule: AlertRule | null): void {
    const answer = this.answer();
    if (!answer) return;
    const data: AlertRulePanelData = { scope: this.scope(), kinds: answer.kinds, rule };
    this.dialog.open<boolean, AlertRulePanelData, AlertRulePanel>(AlertRulePanel, sidePanelConfig(data, 'narrow', 'right'))
      .closed.subscribe(saved => { if (saved) { this.toast.success('Alert rule saved.'); this.load(); } });
  }

  toggle(rule: AlertRule, on: boolean): void {
    this.api.save({ ...rule, enabled: on }).subscribe({
      next: r => { if (r?.status === API_SUCCESS) this.load(); else this.toast.error(r?.message || 'Not saved.'); },
      error: err => this.toast.error(refusal(err, 'Not saved.')),
    });
  }

  async remove(rule: AlertRule): Promise<void> {
    const ok = await confirmWith(this.dialog, { title: `Remove "${rule.name}"?`, body: 'Its alerts go with it. Nothing else changes.',
      confirmLabel: 'Remove', danger: true });
    if (!ok || rule.id == null) return;
    this.api.remove(rule.id).subscribe({
      next: r => { if (r?.status === API_SUCCESS) this.load(); else this.toast.error(r?.message || 'Not removed.'); },
      error: err => this.toast.error(refusal(err, 'Not removed.')),
    });
  }

  resolve(alert: Alert): void {
    this.api.resolve(alert.id).subscribe({
      next: r => { if (r?.status === API_SUCCESS) { this.toast.success('Alert resolved.'); this.load(); } else this.toast.error(r?.message || 'Not resolved.'); },
      error: err => this.toast.error(refusal(err, 'Not resolved.')),
    });
  }

  addRecommended(): void {
    this.busy.set(true);
    forkJoin(recommendedRules().map(rule => this.api.save(rule))).subscribe({
      next: () => { this.busy.set(false); this.toast.success('The recommended rules were added.'); this.load(); },
      error: err => { this.busy.set(false); this.toast.error(refusal(err, 'The rules could not all be added.')); this.load(); },
    });
  }

  go(alert: Alert): void {
    if (alert.link) this.router.navigateByUrl(alert.link);
  }
}

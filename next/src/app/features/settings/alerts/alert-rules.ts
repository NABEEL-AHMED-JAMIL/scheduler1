import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
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
 * MIG-355: alerts and their rules, for a workspace (Settings › Alerts) or the platform (Platform › Reliability) -- the
 * alerts open now and lately (open first, each with what to do and Resolve), then the rules: what each watches, how it
 * tells, to whom, and On. A rule opens in the side panel to change; a workspace with none is offered the recommended
 * five in one press.
 */
@Component({
  selector: 'app-alert-rules',
  imports: [Icon, ServerTimePipe],
  styles: `
    .alert-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 0.75rem; align-items: start; padding: 0.75rem 0;
      border-top: 1px solid var(--border-subtle); }
    .alert-row:first-child { border-top: 0; }
    .sev { width: 0.5rem; height: 0.5rem; border-radius: 999px; margin-top: 0.45rem; }
    .sev-CRITICAL { background: var(--series-crit); }
    .sev-WARNING { background: var(--series-warn, var(--warn-text)); }
    .sev-RESOLVED { background: var(--border-strong); }
    .rule-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.75rem; align-items: center; padding: 0.65rem 0;
      border-top: 1px solid var(--border-subtle); }
    .rule-row:first-child { border-top: 0; }
    .chip { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0 0.45rem; border-radius: 999px; font-size: 11px;
      line-height: 1.25rem; border: 1px solid var(--border-subtle); color: var(--text-secondary); white-space: nowrap; }
  `,
  template: `
    <div class="grid gap-4 xl:grid-cols-2" [attr.data-alert-scope]="scope()">
      <section class="card p-4" aria-labelledby="alerts-title" data-test="alerts-list">
        <div class="flex flex-wrap items-center gap-2 mb-1">
          <h3 class="chart-title m-0" id="alerts-title">Alerts</h3>
          <span class="chart-sub">{{ openCount() }} open · the last 30 days resolved are kept</span>
          <button type="button" class="btn btn-ghost btn-sm ml-auto" (click)="load()" [disabled]="loading()"><app-icon name="refresh" [busy]="loading()" />Refresh</button>
        </div>
        @for (a of alerts(); track a.id) {
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
              @if (a.link) { <button type="button" class="btn btn-ghost btn-sm" (click)="go(a)"><app-icon name="external" />Open</button> }
              @if (a.state === 'OPEN') {
                <button type="button" class="btn btn-default btn-sm" (click)="resolve(a)" [attr.data-resolve]="a.id"><app-icon name="check" />Resolve</button>
              }
            </div>
          </div>
        } @empty {
          <p class="text-sm text-[color:var(--text-muted)] m-0 py-4" data-test="alerts-empty">{{ loading() ? 'Reading the alerts…' : 'No alert has fired.' }}</p>
        }
      </section>

      <section class="card p-4" aria-labelledby="rules-title" data-test="alert-rules">
        <div class="flex flex-wrap items-center gap-2 mb-1">
          <h3 class="chart-title m-0" id="rules-title">Rules</h3>
          <span class="chart-sub">{{ rules().length }} of {{ answer()?.maxRules ?? 50 }}</span>
          <div class="ml-auto flex gap-2">
            @if (scope() === 'workspace' && !rules().length && !loading()) {
              <button type="button" class="btn btn-default btn-sm" (click)="addRecommended()" [disabled]="busy()" data-test="alerts-recommended">
                <app-icon name="sparkle" />Add the recommended rules</button>
            }
            <button type="button" class="btn btn-primary btn-sm" (click)="edit(null)" [disabled]="!answer()" data-test="alerts-new-rule">
              <app-icon name="plus" />New rule</button>
          </div>
        </div>
        @for (r of rules(); track r.id) {
          <div class="rule-row" [attr.data-rule]="r.id">
            <button type="button" class="text-left min-w-0 bg-transparent border-0 p-0 cursor-pointer" (click)="edit(r)">
              <span class="text-sm font-medium block">{{ r.name }}@if (!r.enabled) { <span class="text-[color:var(--text-muted)] font-normal"> (off)</span> }</span>
              <span class="text-xs text-[color:var(--text-secondary)] block">{{ sentence(r) }}</span>
              <span class="flex flex-wrap gap-1 mt-1">
                <span class="chip">{{ r.severity === 'CRITICAL' ? 'Critical' : 'Warning' }}</span>
                @if (r.channels.bell) { <span class="chip"><app-icon name="bell" size="0.8em" />Bell</span> }
                @if (r.channels.email) { <span class="chip"><app-icon name="mail" size="0.8em" />Mail</span> }
                @if (r.channels.webhook) { <span class="chip"><app-icon name="link" size="0.8em" />Webhooks</span> }
                @if (scope() === 'workspace') { <span class="chip"><app-icon name="users" size="0.8em" />{{ audience(r) }}</span> }
                @if (r.quietHours) { <span class="chip"><app-icon name="moon" size="0.8em" />Quiet {{ r.quietHours.start }}–{{ r.quietHours.end }}</span> }
              </span>
            </button>
            <div class="flex items-center gap-1">
              <label class="flex items-center gap-1.5 text-xs"><input type="checkbox" class="checkbox" [checked]="r.enabled" (change)="toggle(r, $any($event.target).checked)"
                     [attr.aria-label]="'Turn ' + r.name + (r.enabled ? ' off' : ' on')" />On</label>
              <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="remove(r)" [attr.aria-label]="'Remove ' + r.name"><app-icon name="trash" /></button>
            </div>
          </div>
        } @empty {
          <p class="text-sm text-[color:var(--text-muted)] m-0 py-4">{{ loading() ? 'Reading the rules…' : (scope() === 'workspace'
            ? 'No rule yet: nothing tells you when a run fails. Add the recommended rules to start.' : 'No platform rule.') }}</p>
        }
        @if (error()) { <p class="text-sm text-crit-500 m-0 mt-2" role="alert">{{ error() }}</p> }
      </section>
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

  audience(rule: AlertRule): string {
    const who: string[] = [];
    if (rule.roles.includes('TENANT_ADMIN')) who.push('Administrators');
    if (rule.roles.includes('TENANT_USER')) who.push('Members');
    if (rule.groups.length) who.push(`${rule.groups.length} ${rule.groups.length === 1 ? 'group' : 'groups'}`);
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

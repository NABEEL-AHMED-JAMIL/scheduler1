import { Component, OnInit, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { ApiClientsApi, AttemptRow, DeliveryRow, WebhookRow } from './api-clients.api';

export interface DeliveriesDialogData {
  webhook: WebhookRow;
}

const PAGE = 50;

/**
 * MIG-333: a webhook's delivery log, newest first -- each event sent to it, its state (pending, retrying with the next
 * attempt's time, delivered, failed), the receiver's last answer and why it failed; each delivery's attempts on request;
 * and Send again, which sends the same event (the same Webhook-Id) as a new delivery. A paused webhook sends nothing, so
 * Send again waits for it to be resumed.
 */
@Component({
  selector: 'app-webhook-deliveries-dialog',
  imports: [FormDialog, Icon, ServerTimePipe],
  template: `
    <app-form-dialog heading="Deliveries" [subtitle]="data.webhook.url" size="xwide"
        [showConfirm]="false" cancelLabel="Close" (cancelled)="ref.close(sent())">
      <div class="flex items-center justify-between gap-2 mb-2">
        <p class="text-sm text-[color:var(--text-muted)]">
          A failed attempt is tried again after 10 s, 30 s, 90 s and so on, at most an hour apart, for a day.
        </p>
        <button type="button" class="btn btn-default btn-sm" (click)="reload()" [disabled]="loading()">
          <app-icon name="refresh" [class.spin]="loading()" />Refresh
        </button>
      </div>
      @if (error()) {
        <p class="text-sm text-[color:var(--color-crit-500)]" role="alert">{{ error() }}</p>
      } @else if (!loading() && !rows().length) {
        <p class="text-sm text-[color:var(--text-muted)] py-6 text-center" data-no-deliveries>Nothing has been sent to this webhook yet.</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="table-modern" data-deliveries>
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>State</th>
                <th class="text-right">Attempts</th>
                <th>Last answer</th>
                <th><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (d of rows(); track d.id) {
                <tr>
                  <td class="whitespace-nowrap text-[color:var(--text-secondary)]">{{ d.createdAt | serverTime: 'dateTimeSec' }}</td>
                  <td class="max-w-72">
                    <div class="mono text-sm truncate">{{ d.eventType }}</div>
                    <div class="mono text-xs text-[color:var(--text-muted)] truncate" [title]="d.eventId">{{ d.eventId }}</div>
                    @if (d.redeliveryOf) { <div class="text-xs text-[color:var(--text-muted)]">Sent again (of {{ d.redeliveryOf }})</div> }
                  </td>
                  <td>
                    <span [class]="pill(d)">{{ word(d) }}</span>
                    @if (d.status === 'retrying' && d.nextAttemptAt) {
                      <div class="text-xs text-[color:var(--text-muted)] whitespace-nowrap">next {{ d.nextAttemptAt | serverTime: 'timeSec' }}</div>
                    }
                  </td>
                  <td class="text-right tabular-nums">{{ d.attempt }}</td>
                  <td class="text-sm max-w-80">
                    @if (d.responseStatus) { <span class="mono">{{ d.responseStatus }}</span> }
                    @if (d.durationMs !== null) { <span class="text-[color:var(--text-muted)]"> · {{ d.durationMs }} ms</span> }
                    @if (d.error) { <div class="text-xs text-[color:var(--text-secondary)] line-clamp-2" [title]="d.error">{{ d.error }}</div> }
                  </td>
                  <td class="text-right whitespace-nowrap">
                    @if (d.attempt > 0) {
                      <button type="button" class="btn btn-ghost btn-sm" [attr.aria-expanded]="open() === d.id" aria-label="Attempts"
                              title="Attempts" (click)="toggle(d)">
                        <app-icon name="list" /><span class="hidden xl:inline">Attempts</span>
                      </button>
                    }
                    <button type="button" class="btn btn-ghost btn-sm" [disabled]="!data.webhook.active || busy() === d.id"
                            [title]="data.webhook.active ? 'Send this event again' : 'Resume the webhook to send again'"
                            [attr.aria-label]="'Send ' + d.eventType + ' again'" (click)="resend(d)">
                      <app-icon name="send" [busy]="busy() === d.id" /><span class="hidden xl:inline">Send again</span>
                    </button>
                  </td>
                </tr>
                @if (open() === d.id) {
                  <tr data-attempts>
                    <td colspan="6" class="bg-[color:var(--surface-inset)]">
                      @for (a of attempts(); track a.attempt) {
                        <div class="flex flex-wrap items-baseline gap-x-3 text-sm py-0.5">
                          <span class="tabular-nums w-6 text-right">{{ a.attempt }}</span>
                          <span class="whitespace-nowrap text-[color:var(--text-secondary)]">{{ a.at | serverTime: 'dateTimeSec' }}</span>
                          <span [class]="a.outcome === 'delivered' ? 'pill pill-ok' : 'pill pill-crit'">{{ a.outcome }}</span>
                          @if (a.responseStatus) { <span class="mono">{{ a.responseStatus }}</span> }
                          @if (a.durationMs !== null) { <span class="text-[color:var(--text-muted)]">{{ a.durationMs }} ms</span> }
                          @if (a.error) { <span class="text-[color:var(--text-secondary)]">{{ a.error }}</span> }
                        </div>
                      } @empty {
                        <p class="text-sm text-[color:var(--text-muted)]">Loading…</p>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        @if (more()) {
          <div class="flex justify-center mt-2">
            <button type="button" class="btn btn-default btn-sm" (click)="older()" [disabled]="loading()">Older deliveries</button>
          </div>
        }
      }
    </app-form-dialog>
  `,
})
export class DeliveriesDialog implements OnInit {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<DeliveriesDialogData>(DIALOG_DATA);
  private readonly api = inject(ApiClientsApi);
  private readonly toast = inject(ToastService);

  readonly rows = signal<DeliveryRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly more = signal(false);
  readonly open = signal<string | null>(null);
  readonly attempts = signal<AttemptRow[]>([]);
  readonly busy = signal<string | null>(null);
  /** Whether anything was sent again, so the page refreshes when this closes. */
  readonly sent = signal(false);

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.fetch(null);
  }

  older(): void {
    const last = this.rows()[this.rows().length - 1];
    if (last) this.fetch(last.id);
  }

  private fetch(before: string | null): void {
    this.loading.set(true);
    this.error.set('');
    this.api.deliveries(this.data.webhook.id, before, PAGE).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) {
          this.error.set(r.message || 'The deliveries could not be read.');
          return;
        }
        const page = r.data ?? [];
        this.rows.set(before ? [...this.rows(), ...page] : page);
        this.more.set(page.length === PAGE);
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'The deliveries could not be read.'); },
    });
  }

  word(d: DeliveryRow): string {
    return d.status === 'delivered' ? 'Delivered' : d.status === 'failed' ? 'Failed' : d.status === 'retrying' ? 'Retrying' : 'Pending';
  }

  pill(d: DeliveryRow): string {
    return d.status === 'delivered' ? 'pill pill-ok' : d.status === 'failed' ? 'pill pill-crit'
      : d.status === 'retrying' ? 'pill pill-warn' : 'pill pill-neutral';
  }

  toggle(d: DeliveryRow): void {
    if (this.open() === d.id) {
      this.open.set(null);
      return;
    }
    this.open.set(d.id);
    this.attempts.set([]);
    this.api.attempts(this.data.webhook.id, d.id).subscribe({
      next: r => this.attempts.set(r.status === API_SUCCESS ? r.data ?? [] : []),
      error: () => this.attempts.set([]),
    });
  }

  resend(d: DeliveryRow): void {
    this.busy.set(d.id);
    this.api.redeliver(this.data.webhook.id, d.id).subscribe({
      next: r => {
        this.busy.set(null);
        if (r.status === API_SUCCESS && r.data) {
          this.sent.set(true);
          this.toast.success(r.message || 'Sent again.');
          this.rows.set([r.data, ...this.rows()]);
        } else {
          this.toast.error(r.message || 'It could not be sent again.');
        }
      },
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'It could not be sent again.'); },
    });
  }
}

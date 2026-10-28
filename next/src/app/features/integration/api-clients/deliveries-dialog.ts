import { Component, OnInit, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { ApiClientsApi, AttemptRow, DeliveryRow, WebhookRow } from './api-clients.api';
import { formatDuration } from '../../../shared/ui/time-format';
import { AppLoading, InlineStatus, createLoadState, loadErrorText } from '../../../shared/ui/loading';
import { LoadError } from '../../../shared/ui/load-error';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';

export interface DeliveriesDialogData {
  webhook: WebhookRow;
  /** The workspace a platform administrator picked; none for a workspace administrator (their own). */
  tenantId?: number | null;
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
  imports: [FormDialog, Icon, ServerTimePipe, AppLoading, InlineStatus, LoadError, SortHeader],
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
      <!-- Owner 2026-10-27: skeleton rows on the first read (it drew only an empty header before), the reason with Try
           again when it fails, and a failed "Older deliveries" says so under the rows instead of replacing them. -->
      @if (error()) {
        <app-load-error [message]="error()" (retry)="reload()" />
      } @else if (state.pending() || (loading() && !rows().length)) {
        <app-loading shape="rows" label="Loading deliveries…" [count]="4" />
      } @else if (!rows().length) {
        <p class="text-sm text-[color:var(--text-muted)] py-6 text-center" data-no-deliveries>Nothing has been sent to this webhook yet.</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="table-modern" data-deliveries>
            <thead>
              <tr>
                <th appSort="when" [sortBy]="sort">When</th>
                <th appSort="event" [sortBy]="sort">Event</th>
                <th appSort="state" [sortBy]="sort">State</th>
                <th class="text-right" appSort="attempts" [sortBy]="sort">Attempts</th>
                <th>Last answer</th>
                <th class="th-actions">Actions</th>
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
                    @if (d.durationMs !== null) { <span class="text-[color:var(--text-muted)]"> · {{ took(d.durationMs) }}</span> }
                    @if (d.error) { <div class="text-xs text-[color:var(--text-secondary)] line-clamp-2" [title]="d.error">{{ d.error }}</div> }
                  </td>
                  <td class="text-right whitespace-nowrap">
                    @if (d.attempt > 0) {
                      <button type="button" class="btn btn-default btn-sm" [attr.aria-expanded]="open() === d.id" aria-label="Attempts"
                              title="Attempts" (click)="toggle(d)">
                        <app-icon name="list" /><span class="hidden xl:inline">Attempts</span>
                      </button>
                    }
                    <button type="button" class="btn btn-default btn-sm" [disabled]="!data.webhook.active || busy() === d.id"
                            [title]="data.webhook.active ? 'Send this event again' : 'Resume the webhook to send again'"
                            [attr.aria-label]="'Send ' + d.eventType + ' again'" (click)="resend(d)">
                      <app-icon name="send" [busy]="busy() === d.id" /><span class="hidden xl:inline">Send again</span>
                    </button>
                  </td>
                </tr>
                @if (open() === d.id) {
                  <tr data-attempts>
                    <td colspan="6" class="bg-[color:var(--surface-inset)]">
                      @if (attemptsState.error()) {
                        <app-inline-status [error]="attemptsState.error()" (retry)="readAttempts(d)" />
                      } @else if (attemptsState.loading()) {
                        <app-loading shape="inline" label="Loading attempts…" />
                      } @else {
                      @for (a of attempts(); track a.attempt) {
                        <div class="flex flex-wrap items-baseline gap-x-3 text-sm py-0.5">
                          <span class="tabular-nums w-6 text-right">{{ a.attempt }}</span>
                          <span class="whitespace-nowrap text-[color:var(--text-secondary)]">{{ a.at | serverTime: 'dateTimeSec' }}</span>
                          <span [class]="a.outcome === 'delivered' ? 'pill pill-ok' : 'pill pill-crit'">{{ a.outcome }}</span>
                          @if (a.responseStatus) { <span class="mono">{{ a.responseStatus }}</span> }
                          @if (a.durationMs !== null) { <span class="text-[color:var(--text-muted)]">{{ took(a.durationMs) }}</span> }
                          @if (a.error) { <span class="text-[color:var(--text-secondary)]">{{ a.error }}</span> }
                        </div>
                      } @empty {
                        <p class="text-sm text-[color:var(--text-muted)]">No attempt recorded yet.</p>
                      }
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        @if (olderError()) {
          <app-inline-status class="text-center" [error]="olderError()" (retry)="older()" data-older-error />
        }
        @if (more()) {
          <div class="flex justify-center mt-2">
            <button type="button" class="btn btn-default btn-sm" (click)="older()" [disabled]="loading() || loadingOlder()">
              <app-icon name="history" [busy]="loadingOlder()" />{{ sort.key() ? 'More deliveries' : 'Older deliveries' }}
            </button>
          </div>
        }
      }
    </app-form-dialog>
  `,
})
export class DeliveriesDialog implements OnInit {
  /** Milliseconds in the console's duration words (formatDuration): "420 ms", "1.4 sec", "15 sec". */
  took(ms: number): string { return formatDuration(ms / 1000); }

  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<DeliveriesDialogData>(DIALOG_DATA);
  private readonly api = inject(ApiClientsApi);
  private readonly toast = inject(ToastService);

  readonly rows = signal<DeliveryRow[]>([]);
  /** The first page's read (and Refresh): loading until it answers, so "Nothing has been sent" never shows before it. */
  readonly state = createLoadState();
  readonly loading = this.state.loading;
  readonly error = this.state.error;
  /** A failed "Older deliveries": said under the rows, which stay. */
  readonly olderError = signal('');
  readonly more = signal(false);
  readonly open = signal<string | null>(null);
  readonly attempts = signal<AttemptRow[]>([]);
  /** The open delivery's attempts: it said "Loading…" forever when the read failed or came back empty. */
  readonly attemptsState = createLoadState(false);
  readonly busy = signal<string | null>(null);
  /** Whether anything was sent again, so the page refreshes when this closes. */
  readonly sent = signal(false);

  /**
   * Owner 2026-10-27 ("add a sort on each table"): the log is paged, so it sorts on the server (webhook.json/deliveries
   * sort/dir) and a new order reads it again from the first page; "More deliveries" then pages on by offset, since the
   * newest-first cursor (before) means nothing in another order. No order picked: newest first, as before, and no sort is
   * sent. Not remembered: the dialog opens fresh each time. An open delivery's attempts are keyed by its id.
   */
  readonly sort = createTableSort<DeliveryRow>({
    id: 'webhook-deliveries',
    server: true,
    remember: false,
    columns: {
      when: { value: d => d.createdAt, kind: 'date', param: 'when' },
      event: { value: d => d.eventType, param: 'event' },
      state: { value: d => d.status, kind: 'status', param: 'state' },
      attempts: { value: d => d.attempt, kind: 'number', param: 'attempts' },
    },
    onChange: () => this.reload(),
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.fetch(false);
  }

  older(): void {
    if (this.rows().length) this.fetch(true);
  }

  private fetch(more: boolean): void {
    this.olderError.set('');
    if (more) {
      this.loadingOlder.set(true);
    } else {
      this.state.start();
    }
    const failed = (err: unknown) => {
      if (more) { this.loadingOlder.set(false); this.olderError.set(loadErrorText(err, 'The older deliveries could not be read.')); }
      else this.state.fail(err, 'The deliveries could not be read.');
    };
    const order = this.sort.param();
    const seq = ++this.fetchSeq;
    const last = this.rows()[this.rows().length - 1];
    const read = order
      ? this.api.deliveries(this.data.webhook.id, null, PAGE, this.data.tenantId, { ...order, offset: more ? this.rows().length : 0 })
      : this.api.deliveries(this.data.webhook.id, more && last ? last.id : null, PAGE, this.data.tenantId);
    read.subscribe({
      next: r => {
        // A reply for the order before the one picked now is dropped (owner 2026-10-27: an old answer never wins).
        if (seq !== this.fetchSeq) return;
        if (r.status !== API_SUCCESS) { failed(r); return; }
        const page = r.data ?? [];
        this.rows.set(more ? [...this.rows(), ...page] : page);
        this.more.set(page.length === PAGE);
        if (more) this.loadingOlder.set(false); else this.state.done();
      },
      error: err => { if (seq === this.fetchSeq) failed(err); },
    });
  }

  private fetchSeq = 0;

  /** "Older deliveries" in flight: its button spins; the rows stay. */
  readonly loadingOlder = signal(false);

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
    this.readAttempts(d);
  }

  /** The attempts of the open delivery; a reply for one closed or switched away from is dropped. */
  readAttempts(d: DeliveryRow): void {
    this.attempts.set([]);
    this.attemptsState.start();
    this.api.attempts(this.data.webhook.id, d.id, this.data.tenantId).subscribe({
      next: r => {
        if (this.open() !== d.id) return;
        if (r.status !== API_SUCCESS) { this.attemptsState.fail(r, 'The attempts could not be read.'); return; }
        this.attempts.set(r.data ?? []);
        this.attemptsState.done();
      },
      error: err => { if (this.open() === d.id) this.attemptsState.fail(err, 'The attempts could not be read.'); },
    });
  }

  resend(d: DeliveryRow): void {
    this.busy.set(d.id);
    this.api.redeliver(this.data.webhook.id, d.id, this.data.tenantId).subscribe({
      next: r => {
        this.busy.set(null);
        if (r.status === API_SUCCESS && r.data) {
          this.sent.set(true);
          this.toast.success(r.message || 'Sent again.');
          // Newest first, the new delivery is the top row; in another order its place is the server's to say.
          if (this.sort.key()) this.reload(); else this.rows.set([r.data, ...this.rows()]);
        } else {
          this.toast.error(r.message || 'It could not be sent again.');
        }
      },
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'It could not be sent again.'); },
    });
  }
}

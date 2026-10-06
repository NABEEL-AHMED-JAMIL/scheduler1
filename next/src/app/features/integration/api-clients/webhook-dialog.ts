import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { ToastService } from '../../../shared/ui/toast.service';
import { ApiClientsApi, EventTypeRow, WebhookRow, WebhookWithSecret } from './api-clients.api';

export interface WebhookDialogData {
  eventTypes: EventTypeRow[];
  webhook?: WebhookRow | null;
}

/** What the dialog closes with: the new webhook (its secret, once), a change, or nothing. */
export type WebhookDialogResult = { made: WebhookWithSecret } | { saved: true } | undefined;

/**
 * MIG-333: one webhook -- the URL your system receives events at and the event types it wants. The URL must be https to a
 * public address: the platform refuses a private, loopback or metadata one. A new webhook's signing secret is shown once.
 */
@Component({
  selector: 'app-webhook-dialog',
  imports: [Field, FormDialog],
  template: `
    <app-form-dialog [heading]="data.webhook ? 'Change the webhook' : 'New webhook'" size="wide"
        subtitle="Each event is POSTed to the URL as JSON, signed with the webhook's secret (Webhook-Signature)."
        [confirmLabel]="data.webhook ? 'Save' : 'Add webhook'" busyLabel="Saving…"
        [saving]="saving()" [confirmDisabled]="!ready()" (cancelled)="ref.close(undefined)" (confirmed)="save()">
      <app-field label="URL" for="webhookUrl" hint="https, a public address, such as https://portal.example.com/hooks/etl." [required]="true">
        <input id="webhookUrl" class="input mono" maxlength="2048" [value]="url()" (input)="url.set($any($event.target).value)"
               placeholder="https://" cdkFocusInitial />
      </app-field>
      <div class="flex flex-col gap-1.5" role="group" aria-labelledby="webhookTypes" data-webhook-types>
        <p id="webhookTypes" class="text-sm font-medium mb-1">Events</p>
        @for (t of data.eventTypes; track t.type) {
          <label class="flex items-start gap-2 text-sm">
            <input type="checkbox" class="checkbox mt-0.5" [checked]="chosen().includes(t.type)" (change)="toggle(t.type, $any($event.target).checked)" />
            <span><span class="mono">{{ t.type }}</span> <span class="text-[color:var(--text-muted)]">— {{ t.description }}</span></span>
          </label>
        }
      </div>
      @if (error()) { <p class="text-sm text-[color:var(--color-crit-500)]" role="alert">{{ error() }}</p> }
    </app-form-dialog>
  `,
})
export class WebhookDialog {
  readonly ref = inject<DialogRef<WebhookDialogResult>>(DialogRef);
  readonly data = inject<WebhookDialogData>(DIALOG_DATA);
  private readonly api = inject(ApiClientsApi);
  private readonly toast = inject(ToastService);

  readonly url = signal(this.data.webhook?.url ?? '');
  readonly chosen = signal<string[]>(this.data.webhook?.eventTypes ?? []);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly ready = computed(() => /^https?:\/\/\S+$/i.test(this.url().trim()) && this.chosen().length > 0 && !this.saving());

  toggle(type: string, on: boolean): void {
    this.chosen.update(list => on ? [...list.filter(t => t !== type), type] : list.filter(t => t !== type));
  }

  save(): void {
    if (!this.ready()) return;
    this.saving.set(true);
    this.error.set('');
    const types = this.data.eventTypes.map(t => t.type).filter(t => this.chosen().includes(t));
    const webhook = this.data.webhook;
    const call = webhook
      ? this.api.updateWebhook({ webhookId: webhook.id, url: this.url().trim(), eventTypes: types })
      : this.api.createWebhook({ url: this.url().trim(), eventTypes: types });
    call.subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS) {
          this.error.set(r.message || 'The webhook was refused.');
        } else if (webhook) {
          this.toast.success(r.message || 'Webhook saved.');
          this.ref.close({ saved: true });
        } else {
          this.ref.close({ made: r.data as WebhookWithSecret });
        }
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'The webhook could not be saved.'); },
    });
  }
}

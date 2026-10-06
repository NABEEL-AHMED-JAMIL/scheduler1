import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Field } from '../../../shared/ui/field';
import { Icon } from '../../../shared/ui/icon';
import { confirmWith } from '../../../shared/ui/confirm';
import { BucketSummary } from '../../objects/storage.service';
import { InboxSettings, capProblem, limitText, megabytes } from './inbox.model';
import { InboxApi } from './inbox.service';

export interface InboxSettingsData { settings: InboxSettings; }

const MB = 1048576;

/**
 * A workspace administrator's inbox settings (MIG-239): which of the workspace's own storage connections the inbox
 * writes to, an optional size limit below the platform's, and turning the inbox off -- after a confirm, because it
 * stops uploads; the files already in the bucket stay. Closes true when something changed, false when nothing did.
 */
@Component({
  selector: 'app-inbox-settings-dialog',
  imports: [FormDialog, Field, Icon],
  template: `
    <app-form-dialog heading="Inbox settings"
                     subtitle="Where files uploaded to the inbox are stored, and how large one may be."
                     [confirmLabel]="data.settings.configured ? 'Save changes' : 'Turn on the inbox'" [saving]="saving()"
                     [confirmDisabled]="loadingBuckets()" (confirmed)="save()" (cancelled)="cancel()">
      @if (data.settings.configured) {
        <button footer-start type="button" class="btn btn-ghost btn-sm text-crit-500" [disabled]="saving()" (click)="turnOff()">
          <app-icon name="power" />Turn off
        </button>
      }
      <div class="form-stack">
        <app-field label="Storage connection" for="inboxAlias" [required]="true" [error]="aliasError()"
                   hint="One of this workspace's own connections. Files land under intake/ in its bucket.">
          <select id="inboxAlias" class="input" [value]="alias()" [disabled]="loadingBuckets()"
                  (change)="alias.set($any($event.target).value); aliasError.set('')">
            <option value="">{{ loadingBuckets() ? 'Reading the connections…' : 'Choose a connection' }}</option>
            @for (o of options(); track o.value) {
              <option [value]="o.value" [selected]="o.value === alias()">{{ o.label }}</option>
            }
          </select>
        </app-field>
        @if (bucketsError()) { <p class="text-sm text-crit-500" role="alert">{{ bucketsError() }}</p> }
        @if (!loadingBuckets() && !bucketsError() && !options().length) {
          <p class="text-sm text-[color:var(--text-muted)]">This workspace has no storage connection yet. Add one under Integration › Storage Connections first.</p>
        }
        <app-field label="Size limit (MB)" for="inboxCap" [error]="capError()" [hint]="capHint">
          <input id="inboxCap" class="input max-w-40" inputmode="numeric" [value]="capMb()" placeholder="No lower limit"
                 (input)="capMb.set($any($event.target).value); capError.set('')" />
        </app-field>
        @if (error()) { <p class="text-sm text-crit-500" role="alert">{{ error() }}</p> }
      </div>
    </app-form-dialog>
  `,
})
export class InboxSettingsDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<InboxSettingsData>(DIALOG_DATA);
  private readonly api = inject(InboxApi);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  private readonly buckets = signal<BucketSummary[]>([]);
  readonly loadingBuckets = signal(true);
  readonly bucketsError = signal('');
  readonly alias = signal(this.data.settings.alias ?? '');
  readonly capMb = signal(this.data.settings.workspaceMaxBytes ? String(megabytes(this.data.settings.workspaceMaxBytes)) : '');
  readonly aliasError = signal('');
  readonly capError = signal('');
  readonly error = signal('');
  readonly saving = signal(false);

  readonly capHint = `Optional. Empty means the platform's limit, ${limitText(this.data.settings.platformMaxBytes)} a file.`;

  readonly options = computed(() => this.buckets().map(b => ({
    value: b.bucket,
    label: b.label && b.label !== b.bucket ? `${b.label} (${b.bucket})` : b.bucket,
  })));

  constructor() {
    this.api.buckets().subscribe({
      next: r => {
        this.loadingBuckets.set(false);
        if (r.status === API_SUCCESS) this.buckets.set(r.data ?? []);
        else this.bucketsError.set(r.message);
      },
      error: err => { this.loadingBuckets.set(false); this.bucketsError.set(err?.error?.message || 'The storage connections could not be read.'); },
    });
  }

  save(): void {
    this.error.set('');
    const alias = this.alias().trim();
    this.aliasError.set(alias ? '' : 'Choose the storage connection the inbox uses.');
    this.capError.set(capProblem(this.capMb(), this.data.settings.platformMaxBytes));
    if (this.aliasError() || this.capError()) return;
    const cap = this.capMb().trim() ? Number(this.capMb().trim()) * MB : null;
    this.saving.set(true);
    this.api.configure(alias, cap).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        this.toast.success(r.message || 'Inbox saved.');
        this.ref.close(true);
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'The inbox could not be saved.'); },
    });
  }

  cancel(): void { this.ref.close(false); }

  async turnOff(): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: 'Turn off the inbox?',
      body: 'Members can no longer upload to it, and no new file starts a job. The files already in the inbox stay in '
        + 'the bucket, and you can turn it on again later.',
      confirmLabel: 'Turn off', danger: true,
    });
    if (!ok) return;
    this.saving.set(true);
    this.api.turnOff().subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        this.toast.success(r.message || 'The inbox is off.');
        this.ref.close(true);
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message || 'The inbox could not be turned off.'); },
    });
  }
}

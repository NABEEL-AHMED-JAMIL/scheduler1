import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Icon } from '../../../shared/ui/icon';
import { ALIAS_PATTERN } from './connection-dialog';

/**
 * Copies a connection so only the bucket has to change.
 *
 * Asks for three things and nothing else. Provider, endpoint, region, host, credentials -- all
 * of it comes from the source on the server, which is the only place it can come from: the
 * secret is never sent to the browser, so a copy assembled here would arrive with no credential
 * and fail its first test.
 *
 * The bucket list is discovered from the source connection where the provider supports it, so
 * an existing bucket can be picked rather than typed from memory.
 */
@Component({
  selector: 'app-clone-dialog',
  imports: [FormsModule, Field, FormDialog, Icon],
  template: `
    <app-form-dialog heading="Clone connection"
        [subtitle]="'Copies everything from &quot;' + data.connection.connectionName + '&quot; except the bucket.'"
        confirmLabel="Create copy" [saving]="saving()"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <div class="form-stack">
        <app-field label="Name" for="connectionName" [required]="true"
                   [control]="nameModel.control" [submitted]="submitted()">
          <input id="connectionName" class="input" [(ngModel)]="connectionName" name="connectionName"
                 #nameModel="ngModel" required [ngModelOptions]="{standalone: true}" />
        </app-field>

        <app-field label="Alias" for="alias" [required]="true"
                   [control]="aliasModel.control" [submitted]="submitted()"
                   [errorMessages]="{ pattern: 'Letters, numbers, . _ - only.' }"
                   hint="Must be unique — this is what jobs and tasks refer to.">
          <input id="alias" class="input mono" [(ngModel)]="alias" name="alias"
                 #aliasModel="ngModel" required [pattern]="aliasPattern"
                 [ngModelOptions]="{standalone: true}" />
        </app-field>

        <app-field label="Bucket" for="bucket"
                   [hint]="discovered().length
                     ? 'Pick one that exists, or type another.'
                     : 'The bucket this copy points at.'">
          @if (discovered().length) {
            <div class="flex gap-2">
              <select id="bucket" class="input" [(ngModel)]="bucketName" name="bucketName"
                      [ngModelOptions]="{standalone: true}">
                @for (b of discovered(); track b) { <option [value]="b">{{ b }}</option> }
              </select>
              <!-- The hint offers typing another, so there has to be a way back to the input. -->
              <button type="button" class="btn btn-default btn-sm whitespace-nowrap"
                      (click)="discovered.set([])"><app-icon name="edit" />Type instead</button>
            </div>
          } @else {
            <input id="bucket" class="input mono" [(ngModel)]="bucketName" name="bucketName"
                   [ngModelOptions]="{standalone: true}" />
          }
        </app-field>

        <button type="button" class="btn btn-default btn-sm self-start"
                [disabled]="discovering()" (click)="discover()">
          @if (discovering()) { <app-icon name="refresh" class="spin" /> }
          {{ discovering() ? 'Looking…' : 'List buckets on this server' }}
        </button>

        <p class="field-note text-[color:var(--text-muted)]">
          Credentials and connection settings are copied on the server, so nothing secret passes
          through the browser. The copy starts untested.
        </p>
      </div>
    </app-form-dialog>
  `,
})
export class CloneDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<{ connection: any }>(DIALOG_DATA);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);

  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly discovering = signal(false);
  readonly discovered = signal<string[]>([]);
  readonly aliasPattern = ALIAS_PATTERN;

  connectionName = `${this.data.connection.connectionName} (copy)`;
  alias = `${this.data.connection.alias}-copy`;
  bucketName = this.data.connection.bucketName ?? '';

  discover(): void {
    this.discovering.set(true);
    this.http.post<ApiResponse<string[]>>(
      `${API_BASE}/storageConnection.json/discoverBuckets`,
      { storageConnectionId: this.data.connection.storageConnectionId }).subscribe({
      next: response => {
        this.discovering.set(false);
        if (response.status !== API_SUCCESS) {
          this.toast.error(response.message || 'Could not list buckets.');
          return;
        }
        const buckets = response.data ?? [];
        if (!buckets.length) {
          // The server treats "the credentials work, there is just nothing to list" as a
          // success. Reported in red it read as the connection itself having failed.
          this.toast.info(response.message || 'No buckets came back.');
          return;
        }
        this.discovered.set(buckets);
        if (!buckets.includes(this.bucketName)) {
          this.bucketName = buckets[0];
        }
      },
      error: err => {
        this.discovering.set(false);
        this.toast.error(err?.error?.message || 'Could not list buckets.');
      },
    });
  }

  save(): void {
    // Both fields are starred, so both are checked here -- the name used to go through blank and
    // come back as a server error on a field that never turned red. Trimming in place rather
    // than around the check so a field holding only spaces fails its required validator too.
    this.submitted.set(true);
    this.connectionName = this.connectionName.trim();
    this.alias = this.alias.trim();
    if (!this.connectionName) { this.toast.error('Give the copy a name.'); return; }
    if (!this.alias) { this.toast.error('Give the copy an alias.'); return; }
    // Same rule the new-connection dialog holds an alias to. Without it a copy could be given an
    // alias the other dialog would refuse, and the only sign was a server error.
    if (!ALIAS_PATTERN.test(this.alias)) {
      this.toast.error('The alias may only contain letters, numbers, . _ and -.');
      return;
    }
    this.saving.set(true);
    this.http.post<ApiResponse>(
      `${API_BASE}/storageConnection.json/cloneConnection`,
      { connectionName: this.connectionName, alias: this.alias,
        bucketName: this.bucketName.trim() || null },
      { params: { sourceId: String(this.data.connection.storageConnectionId) } }).subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status === API_SUCCESS) {
          this.toast.success(response.message);
          this.ref.close(true);
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'The copy could not be created.');
      },
    });
  }
}

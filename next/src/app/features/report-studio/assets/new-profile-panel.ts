import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { ReportStudioApi, studioError } from '../report-studio.api';
import { BrandProfileRow } from '../assets.model';

export interface NewProfileData { profiles: BrandProfileRow[]; }

/** A new brand profile (MIG-406): a name, and a copy of another profile's newest settings or the starter's. A draft until published. */
@Component({
  selector: 'app-rs-new-profile',
  imports: [SidePanel, Icon, FormsModule],
  template: `
    <app-side-panel heading="New brand profile" subtitle="It starts as a draft; publishing it needs an approver.">
      <div class="form-stack">
        <label class="field"><span class="label">Name</span>
          <input class="input" maxlength="160" [ngModel]="name()" (ngModelChange)="name.set($event)" aria-label="Name" placeholder="Board pack" /></label>
        <label class="field"><span class="label">Start from</span>
          <select class="input" [ngModel]="from()" (ngModelChange)="from.set($event)" aria-label="Start from">
            <option [ngValue]="null">The starter (empty fields inherit the workspace default)</option>
            @for (p of data.profiles; track p.profileId) { <option [ngValue]="p.profileId">A copy of {{ p.name }}</option> }
          </select></label>
        @if (error()) { <p class="field-note text-[color:var(--crit-text)]" role="alert">{{ error() }}</p> }
      </div>
      <div foot class="flex justify-end gap-2">
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" [disabled]="busy() || !name().trim()" (click)="create()"><app-icon name="plus" />Create the draft</button>
      </div>
    </app-side-panel>
  `,
})
export class NewProfilePanel {
  readonly data = inject<NewProfileData>(DIALOG_DATA);
  readonly ref = inject<DialogRef<string | undefined>>(DialogRef);
  private readonly api = inject(ReportStudioApi);
  readonly name = signal('');
  readonly from = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');

  create(): void {
    this.busy.set(true);
    this.api.createBrandProfile(this.name().trim(), this.from()).subscribe({
      next: p => { this.busy.set(false); this.ref.close(p.profileId); },
      error: e => { this.busy.set(false); this.error.set(studioError(e, 'The profile could not be made.').message); },
    });
  }
}

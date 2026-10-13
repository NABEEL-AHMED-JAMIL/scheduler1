import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { SidePanel } from '../../../shared/ui/side-panel';
import { refusal } from '../../../shared/ui/bulk/bulk.model';
import { RetentionApi } from './retention.api';

/**
 * MIG-354: the platform's retention minimums, a platform administrator's alone -- how long audit records are kept at
 * the least in every workspace (6 years unless changed), and the share of a class one pass removes before it stops and
 * asks a workspace administrator to confirm (20%).
 */
@Component({
  selector: 'app-retention-platform-panel',
  imports: [SidePanel, Icon],
  template: `
    <app-side-panel heading="Platform minimums" subtitle="For every workspace; platform administrators only" data-test="retention-platform-panel">
      @if (loaded()) {
        <div class="form-lock flex flex-col gap-4">
          <div>
            <label class="label" for="floor-days">Keep audit records at least (days)</label>
            <input id="floor-days" class="input max-w-40" inputmode="numeric" [value]="floor()" (input)="floor.set($any($event.target).value)" data-test="floor-days" />
            <p class="field-note text-[color:var(--text-muted)]">365 to 36,500. 2,190 days is six years. No workspace can set less.</p>
          </div>
          <div>
            <label class="label" for="share-pct">A pass removes at most, without asking (% of a class)</label>
            <input id="share-pct" class="input max-w-40" inputmode="numeric" [value]="share()" (input)="share.set($any($event.target).value)" data-test="share-pct" />
            <p class="field-note text-[color:var(--text-muted)]">1 to 100. Above it the class pauses and its administrators are alerted to confirm.</p>
          </div>
          @if (problem()) { <p class="text-sm text-crit-500 m-0" role="alert">{{ problem() }}</p> }
          @if (error()) { <p class="text-sm text-crit-500 m-0" role="alert">{{ error() }}</p> }
        </div>
      } @else {
        <p class="text-sm text-[color:var(--text-muted)] flex items-center gap-2"><span class="spinner"></span>Reading…</p>
      }
      <div foot class="flex items-center gap-2 w-full">
        <button type="button" class="btn btn-ghost btn-sm" (click)="ref.close(false)">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm ml-auto" [disabled]="!!problem() || saving() || !loaded()" (click)="save()" data-test="platform-save">
          <app-icon name="save" [busy]="saving()" />Save minimums
        </button>
      </div>
    </app-side-panel>
  `,
})
export class RetentionPlatformPanel implements OnInit {
  readonly ref = inject<DialogRef<boolean, RetentionPlatformPanel>>(DialogRef);
  private readonly api = inject(RetentionApi);

  readonly floor = signal('');
  readonly share = signal('');
  readonly loaded = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly problem = computed(() => {
    const floor = Number(this.floor());
    const share = Number(this.share());
    if (!/^\d+$/.test(this.floor().trim()) || floor < 365 || floor > 36500) return 'The audit minimum is 365 to 36,500 days.';
    if (!/^\d+$/.test(this.share().trim()) || share < 1 || share > 100) return 'The share is 1 to 100 percent.';
    return '';
  });

  ngOnInit(): void {
    this.api.platform().subscribe({
      next: r => {
        if (r?.status !== API_SUCCESS || !r.data) { this.error.set(r?.message || 'The platform minimums could not be read.'); return; }
        this.floor.set(String(r.data.auditFloorDays));
        this.share.set(String(r.data.maxSharePct));
        this.loaded.set(true);
      },
      error: err => this.error.set(refusal(err, 'The platform minimums could not be read.')),
    });
  }

  save(): void {
    if (this.problem() || this.saving()) return;
    this.saving.set(true);
    this.api.savePlatform({ auditFloorDays: Number(this.floor()), maxSharePct: Number(this.share()) }).subscribe({
      next: r => {
        this.saving.set(false);
        if (r?.status !== API_SUCCESS) { this.error.set(r?.message || 'The minimums were not saved.'); return; }
        this.ref.close(true);
      },
      error: err => { this.saving.set(false); this.error.set(refusal(err, 'The minimums were not saved.')); },
    });
  }
}

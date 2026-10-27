import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { SidePanel } from '../../../shared/ui/side-panel';
import { FormRow } from '../../../shared/ui/form-row';
import { Section } from '../../../shared/ui/section';
import { refusal } from '../../../shared/ui/bulk/bulk.model';
import { RetentionApi } from './retention.api';
import {
  ClassDays, ClassResult, RetentionClass, RetentionPreview, RetentionView, daysProblem, draftDays, keepText, previewLine, readable, stateOf,
} from './retention.model';

export interface RetentionEditPanelData {
  view: RetentionView;
  /** A platform administrator's picked workspace; null for a workspace administrator's own. */
  tenantId: number | null;
}

interface Row { c: RetentionClass; value: string; }

/**
 * MIG-354: the workspace's retention, changed over the right of the page -- the switch, and the days of each class
 * (empty keeps it forever). "Preview these days" asks Core what a pass would remove with them before anything is saved;
 * saving removes nothing by itself. The server checks everything again (the audit floor among it) and answers a refusal
 * in a sentence, shown here.
 */
@Component({
  selector: 'app-retention-edit-panel',
  imports: [SidePanel, Icon, FormRow, Section],
  // Owner #4 (2026-10-19): one row a kind of data on the shared form-row grid -- what it is, its days, what a pass would
  // remove -- so the label, the field and its note line up in every row (the table's header cells had no padding of their
  // own and stood off their rows), and every row is the whole width on a narrow panel.
  styles: `
    .retention-rows { display: flex; flex-direction: column; }
    .retention-row { padding: 0.75rem 0; border-top: 1px solid var(--border-subtle); align-items: start; row-gap: 0.5rem; }
    .retention-row:first-child { border-top: 0; padding-top: 0; }
    .retention-row .form-row + * { margin-top: 0; }
    .retention-heads { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);
      padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-subtle); margin-bottom: 0.75rem; }
    @media (max-width: 47.99rem) { .retention-heads { display: none; } }
  `,
  template: `
    <app-side-panel heading="Edit retention" subtitle="Days per kind of data; empty keeps it forever" data-test="retention-edit-panel">
      <div class="form-lock flex flex-col gap-5">
        <app-section title="Removal" [level]="3">
          <label class="flex items-start gap-2 text-sm">
            <input type="checkbox" class="checkbox shrink-0 mt-0.5" role="switch" [checked]="enabled()" (change)="enabled.set($any($event.target).checked)"
                   data-test="retention-enabled" />
            <span>
              <span class="font-medium">Remove data older than its days</span>
              <span class="block field-note text-[color:var(--text-muted)]">
                Off: nothing is removed, whatever the days say. On: the daily pass after 02:00 removes what is older, outside every legal hold.
              </span>
            </span>
          </label>
        </app-section>

        <app-section title="Days per kind of data" [level]="3" sub="A number of days, or empty to keep it forever. Nothing is removed by saving.">
          <app-form-row class="retention-heads" aria-hidden="true">
            <span class="fr-5">Data</span><span class="fr-3">Keep for (days)</span><span class="fr-4">If saved, a pass now removes</span>
          </app-form-row>
          <div class="retention-rows" role="list" aria-label="Days per kind of data">
            @for (r of rows(); track r.c.dataClass; let i = $index) {
              <app-form-row class="retention-row" role="listitem" [attr.data-class]="r.c.dataClass">
                <div class="fr-5 min-w-0">
                  <label class="block text-sm font-medium" [attr.for]="r.c.configurable ? 'days-' + r.c.dataClass : null">{{ r.c.label }}</label>
                  @if (r.c.minDays != null) {
                    <span class="block text-xs text-[color:var(--text-muted)]">At least {{ r.c.minDays.toLocaleString('en-US') }} days, the platform's minimum</span>
                  }
                </div>
                <div class="fr-3 min-w-0">
                  @if (r.c.configurable) {
                    <div class="field" [class.field-invalid]="!!problems()[i]">
                      <input class="input" inputmode="numeric" [id]="'days-' + r.c.dataClass" placeholder="Forever"
                             [value]="r.value" (input)="setValue(i, $any($event.target).value)" [attr.data-days]="r.c.dataClass" />
                      @if (problems()[i]; as problem) { <p class="field-note text-crit-500" role="alert">{{ problem }}</p> }
                      @else { <p class="field-note text-[color:var(--text-muted)]">{{ hint(r) }}</p> }
                    </div>
                  } @else {
                    <span class="text-sm text-[color:var(--text-secondary)]">{{ keepText(r.c) }}</span>
                  }
                </div>
                <div class="fr-4 min-w-0 text-sm" data-preview-cell>
                  @if (previewOf(r.c.dataClass); as p) {
                    {{ previewLine(p) }}
                    @if (p.state === 'NEEDS_CONFIRMATION' || p.state === 'HELD') {
                      <span class="block mt-1"><span class="pill" [class]="'pill pill-' + stateOf(p.state).tone">{{ stateOf(p.state).label }}</span></span>
                    }
                  } @else { <span class="text-[color:var(--text-muted)]">Preview to see</span> }
                </div>
              </app-form-row>
            }
          </div>
        </app-section>
        @if (preview(); as p) {
          <p class="text-sm text-[color:var(--text-secondary)] m-0" aria-live="polite" data-test="retention-edit-preview">
            With these days a pass now would remove {{ p.items.toLocaleString('en-US') }} item(s){{ p.workspaceHold ? ' once the workspace hold is released' : '' }}.
            A class that would lose more than {{ data.view.platform.maxSharePct }}% stops and asks you to confirm first.
          </p>
        }
        @if (error()) { <p class="text-sm text-crit-500 m-0" role="alert" data-test="retention-edit-error">{{ readable(error()) }}</p> }
      </div>
      <div foot class="flex items-center justify-end gap-2 w-full">
        <button type="button" class="btn btn-ghost btn-sm mr-auto" (click)="ref.close()">Cancel</button>
        <button type="button" class="btn btn-default btn-sm" [disabled]="invalid() || previewing()" (click)="runPreview()" data-test="retention-edit-preview-btn">
          <app-icon name="eye" [busy]="previewing()" />Preview these days
        </button>
        <button type="button" class="btn btn-primary btn-sm" [disabled]="invalid() || saving()" (click)="save()" data-test="retention-save">
          <app-icon name="save" [busy]="saving()" />Save retention
        </button>
      </div>
    </app-side-panel>
  `,
})
export class RetentionEditPanel {
  readonly ref = inject<DialogRef<RetentionView, RetentionEditPanel>>(DialogRef);
  readonly data = inject<RetentionEditPanelData>(DIALOG_DATA);
  private readonly api = inject(RetentionApi);

  readonly enabled = signal(this.data.view.enabled);
  readonly rows = signal<Row[]>(this.data.view.classes.map(c => ({ c, value: c.keepDays == null ? '' : String(c.keepDays) })));
  readonly preview = signal<RetentionPreview | null>(null);
  readonly previewing = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly problems = computed(() => this.rows().map(r => r.c.configurable ? daysProblem(r.c, r.value) : ''));
  readonly invalid = computed(() => this.problems().some(Boolean));

  readonly keepText = keepText;
  readonly previewLine = previewLine;
  readonly stateOf = stateOf;
  readonly readable = readable;

  setValue(i: number, value: string): void {
    this.rows.update(rows => rows.map((r, j) => j === i ? { ...r, value } : r));
    this.preview.set(null);
  }

  hint(r: Row): string {
    const days = draftDays(r.value);
    return days == null ? 'Kept forever' : `Removed after ${keepText({ configurable: true, keepDays: days }).toLowerCase()}`;
  }

  previewOf(dataClass: string): ClassResult | null {
    return this.preview()?.classes.find(c => c.dataClass === dataClass) ?? null;
  }

  private classes(): ClassDays {
    const out: ClassDays = {};
    for (const r of this.rows()) {
      if (r.c.configurable) out[r.c.dataClass] = draftDays(r.value);
    }
    return out;
  }

  runPreview(): void {
    if (this.invalid() || this.previewing()) return;
    this.previewing.set(true);
    this.error.set('');
    this.api.preview(this.data.tenantId, this.classes()).subscribe({
      next: r => {
        this.previewing.set(false);
        if (r?.status !== API_SUCCESS || !r.data) { this.error.set(r?.message || 'The preview could not be made.'); return; }
        this.preview.set(r.data);
      },
      error: err => { this.previewing.set(false); this.error.set(refusal(err, 'The preview could not be made.')); },
    });
  }

  save(): void {
    if (this.invalid() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.save(this.data.tenantId, this.enabled(), this.classes()).subscribe({
      next: r => {
        this.saving.set(false);
        if (r?.status !== API_SUCCESS || !r.data) { this.error.set(r?.message || 'Retention could not be saved.'); return; }
        this.ref.close(r.data);
      },
      error: err => { this.saving.set(false); this.error.set(refusal(err, 'Retention could not be saved.')); },
    });
  }
}

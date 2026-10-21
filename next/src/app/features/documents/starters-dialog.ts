import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../core/api/api.config';
import { FormDialog } from '../../shared/ui/form-dialog';
import { StarterMarket, StarterRow, StartersAdded, refusalText } from './documents.model';
import { DocumentsApi } from './documents.service';

/** What the types list does next: read the types again when any was added. */
export interface StartersDialogResult { changed: boolean; }

/**
 * Add from starters (owner 2026-10-20, §0.2): the starter document types grouped by market -- the catalog is ai-service's
 * data (document-types/catalog.json), so nothing here names a market or a type. A workspace administrator ticks the ones the
 * workspace reads and adds them as its own types, version 1 each, to change as it likes afterwards. A built-in starter is
 * every workspace's already, and one the workspace has added says so; neither can be ticked.
 */
@Component({
  selector: 'app-starters-dialog',
  imports: [FormDialog],
  styles: [`
    .market + .market { margin-top: 1.25rem; }
    .starter { display: grid; grid-template-columns: 1.25rem minmax(0, 1fr) auto; gap: 0.25rem 0.625rem; align-items: start;
      padding: 0.5rem 0.25rem; border-top: 1px solid var(--border-subtle); }
    .starter input { margin-top: 0.2rem; }
    .starter-fields { grid-column: 2 / -1; }
  `],
  template: `
    <app-form-dialog heading="Add from starters" size="wide"
                     subtitle="Ready-made document types, grouped by the kind of work that reads them. Each one you add is this workspace's own type, to change as you like."
                     [confirmLabel]="answer() ? 'Done' : chosenLabel()" busyLabel="Adding…" [saving]="saving()"
                     [confirmDisabled]="!answer() && !chosen().size" [cancelLabel]="answer() ? 'Close' : 'Cancel'"
                     (confirmed)="confirm()" (cancelled)="close()">
      <div class="form-stack" data-test="starters">
        @if (answer(); as a) {
          <p class="text-sm" role="status">{{ message() }}</p>
          @if (a.skipped.length) {
            <ul class="text-sm" aria-label="Skipped">
              @for (s of a.skipped; track s.typeKey) { <li class="py-1"><span class="font-medium">{{ s.name }}</span> <span class="text-xs text-[color:var(--text-muted)]">{{ s.reason }}</span></li> }
            </ul>
          }
        } @else if (loading()) {
          <p class="text-sm text-[color:var(--text-muted)]" role="status">Reading the starters…</p>
        } @else if (error() && !markets().length) {
          <p class="text-sm text-crit-500" role="alert">{{ error() }}</p>
        } @else {
          @for (m of markets(); track m.key) {
            <section class="market" [attr.data-market]="m.key" [attr.aria-labelledby]="'market-' + m.key">
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 class="text-sm font-semibold" [id]="'market-' + m.key">{{ m.label }}</h3>
                @if (m.description) { <p class="text-xs text-[color:var(--text-muted)] flex-1 min-w-48">{{ m.description }}</p> }
                @if (addable(m).length) {
                  <button type="button" class="btn btn-ghost btn-xs" (click)="toggleMarket(m)">{{ allChosen(m) ? 'Clear' : 'Choose all ' + addable(m).length }}</button>
                }
              </div>
              <ul class="mt-1">
                @for (s of m.starters; track s.typeKey) {
                  <li class="starter" [attr.data-starter]="s.typeKey">
                    <input type="checkbox" class="checkbox" [id]="'starter-' + s.typeKey" [disabled]="!canAdd(s) || saving()"
                           [checked]="!canAdd(s) || chosen().has(s.typeKey)" (change)="toggle(s)" />
                    <label [for]="'starter-' + s.typeKey" class="min-w-0">
                      <span class="font-medium text-sm">{{ s.name }}</span>
                      @if (s.description) { <span class="block text-xs text-[color:var(--text-secondary)]">{{ s.description }}</span> }
                    </label>
                    <span class="text-xs whitespace-nowrap">
                      @if (s.added) { <span class="pill pill-ok">Added</span> }
                      @else if (s.builtIn) { <span class="pill pill-neutral" title="Every workspace reads with it already">Built in</span> }
                      @else { <span class="text-[color:var(--text-muted)]">{{ counts(s) }}</span> }
                    </span>
                    <span class="starter-fields text-xs text-[color:var(--text-muted)] [overflow-wrap:anywhere]">Reads {{ fieldsText(s) }}</span>
                  </li>
                }
              </ul>
            </section>
          }
          @if (error()) { <p class="text-xs text-crit-500" role="alert">{{ error() }}</p> }
        }
      </div>
    </app-form-dialog>
  `,
})
export class StartersDialog implements OnInit {
  private readonly ref = inject<DialogRef<StartersDialogResult>>(DialogRef);
  private readonly api = inject(DocumentsApi);

  readonly markets = signal<StarterMarket[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly chosen = signal<Set<string>>(new Set());
  readonly answer = signal<StartersAdded | null>(null);
  readonly message = signal('');
  readonly chosenLabel = computed(() => {
    const n = this.chosen().size;
    return n ? `Add ${n} type${n === 1 ? '' : 's'}` : 'Add';
  });

  ngOnInit(): void {
    this.api.starters().subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message || 'Could not read the starters.'); return; }
        this.markets.set(r.data ?? []);
      },
      error: err => { this.loading.set(false); this.error.set(refusalText(err, 'Could not read the starters.')); },
    });
  }

  canAdd(s: StarterRow): boolean { return !s.builtIn && !s.added; }
  addable(m: StarterMarket): StarterRow[] { return m.starters.filter(s => this.canAdd(s)); }
  allChosen(m: StarterMarket): boolean { return this.addable(m).every(s => this.chosen().has(s.typeKey)); }

  toggle(s: StarterRow): void {
    if (!this.canAdd(s)) return;
    this.chosen.update(set => {
      const next = new Set(set);
      if (next.has(s.typeKey)) next.delete(s.typeKey); else next.add(s.typeKey);
      return next;
    });
  }

  toggleMarket(m: StarterMarket): void {
    const all = this.allChosen(m);
    this.chosen.update(set => {
      const next = new Set(set);
      for (const s of this.addable(m)) { if (all) next.delete(s.typeKey); else next.add(s.typeKey); }
      return next;
    });
  }

  counts(s: StarterRow): string {
    const part = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
    return [part(s.fieldCount, 'field'), s.tableCount ? part(s.tableCount, 'table') : '', s.ruleCount ? part(s.ruleCount, 'rule') : '']
      .filter(Boolean).join(' · ');
  }

  fieldsText(s: StarterRow): string {
    const shown = s.fields.slice(0, 6).join(', ');
    return s.fields.length > 6 ? `${shown} and ${s.fields.length - 6} more` : shown;
  }

  confirm(): void {
    if (this.answer()) { this.close(); return; }
    const keys = [...this.chosen()];
    if (!keys.length) return;
    this.saving.set(true); this.error.set('');
    this.api.addStarters(keys).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message || 'The starters could not be added.'); return; }
        this.message.set(r.message);
        this.answer.set({ added: r.data.added ?? [], skipped: r.data.skipped ?? [] });
      },
      error: err => { this.saving.set(false); this.error.set(refusalText(err, 'The starters could not be added.')); },
    });
  }

  close(): void { this.ref.close({ changed: !!this.answer()?.added.length }); }
}

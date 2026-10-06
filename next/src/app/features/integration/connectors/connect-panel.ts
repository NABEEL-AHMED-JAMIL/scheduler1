import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { Field } from '../../../shared/ui/field';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { SidePanel } from '../../../shared/ui/side-panel';
import { ToastService } from '../../../shared/ui/toast.service';
import { ConnectorsApi, StorageTarget } from './connectors.api';
import {
  Connection, ConnectorCard, ConnectorField, Dataset, SCHEDULES, Stream, SyncMode, countText, modeText, needsCursor, settingsFields,
  suggestedCursor, suggestedMode,
} from './connectors.model';

/** What opens the panel: the connector chosen in the gallery (or none: choose here), or a connection to add tables to. */
export interface ConnectPanelData {
  cards: ConnectorCard[];
  card: ConnectorCard | null;
  connection: Connection | null;
  changed: () => void;
}

type Step = 0 | 1 | 2 | 3 | 4;

/** One table the person may sync, and how. */
interface Choice {
  dataset: Dataset;
  on: boolean;
  cursor: string | null;
}

/**
 * Connect (MIG-292): a stepper in a panel -- Credentials (or an OAuth grant) → Tables → Sync → Schedule, as modules.html
 * draws it. Credentials saves the connection and tests it: a failure shows its cause and its fix and stays on the step.
 * An OAuth connector saves, then sends the browser to the provider; it comes back to the callback page, and the
 * connection's panel takes up Tables from there. Secrets are typed, sent once and never shown again.
 */
@Component({
  selector: 'app-connect-panel',
  imports: [SidePanel, Icon, Segmented, Field],
  template: `
    <app-side-panel [heading]="heading()" [subtitle]="data.connection ? 'Add tables to ' + data.connection.name : 'New connection'">
      <ol class="connect-steps" aria-label="Steps">
        @for (s of steps; track s.id) {
          <li class="connect-step" [class.is-done]="step() > s.id" [class.is-current]="step() === s.id" [attr.aria-current]="step() === s.id ? 'step' : null">
            <span class="connect-dot">@if (step() > s.id) { <app-icon name="check" size="0.75em" /> } @else { {{ s.id }} }</span>{{ s.label }}
          </li>
        }
      </ol>

      @if (step() === 0) {
        <section class="flex flex-col gap-2" data-step="connector">
          <p class="text-sm text-[color:var(--text-secondary)]">Choose what to connect.</p>
          <div class="connector-gallery">
            @for (c of data.cards; track c.spec.key) {
              <button type="button" class="connector-card text-left" (click)="choose(c)" [attr.data-choose]="c.spec.key">
                <span class="min-w-0 flex-1"><span class="font-medium block truncate">{{ c.spec.label }}</span>
                  <span class="text-xs text-[color:var(--text-muted)] block truncate">{{ c.spec.summary }}</span></span>
              </button>
            }
          </div>
        </section>
      }

      @if (step() === 1 && card(); as c) {
        <section class="flex flex-col gap-3" data-step="credentials">
          <div class="form-grid">
            <app-field label="Name" for="cName" [required]="true">
              <input class="input" id="cName" [value]="name()" (input)="name.set($any($event.target).value)" maxlength="255" placeholder="ERP replica" />
            </app-field>
            <app-field label="Write to" for="cTarget" [required]="true" hint="Synced data lands in this workspace's bucket, under connectors/.">
              <select class="input" id="cTarget" (change)="target.set($any($event.target).value)">
                <option value="" [selected]="!target()">Choose a storage connection</option>
                @for (t of targets(); track t.alias) { <option [value]="t.alias" [selected]="target() === t.alias">{{ t.connectionName }} ({{ t.alias }})</option> }
              </select>
            </app-field>
          </div>
          @if (c.spec.auth === 'OAUTH') {
            <p class="hub-note text-sm" data-oauth-note><app-icon name="key" /> Saving sends you to {{ c.spec.label }} to grant read-only access. Come back
              here when it asks; nothing is synced until you choose tables.</p>
          }
          @if (fields().length) {
            <div class="form-grid">
              @for (f of fields(); track f.name) {
                <app-field [label]="f.label" [for]="'cf-' + f.name" [required]="f.required && !(f.secret && kept(f))" [hint]="f.help || ''">
                  @switch (f.type) {
                    @case ('select') {
                      <select class="input" [id]="'cf-' + f.name" [attr.data-field]="f.name" (change)="set(f, $any($event.target).value)">
                        <option value="" [selected]="!values()[f.name]">Default</option>
                        @for (o of f.options; track o) { <option [value]="o" [selected]="values()[f.name] === o">{{ o }}</option> }
                      </select>
                    }
                    @case ('password') {
                      <input class="input" type="password" autocomplete="new-password" [id]="'cf-' + f.name" [attr.data-field]="f.name"
                             [value]="values()[f.name] || ''" [placeholder]="kept(f) ? 'Kept. Type to replace it.' : ''" (input)="set(f, $any($event.target).value)" />
                    }
                    @case ('number') {
                      <input class="input" type="number" [id]="'cf-' + f.name" [attr.data-field]="f.name" [value]="values()[f.name] || ''" (input)="set(f, $any($event.target).value)" />
                    }
                    @default {
                      <input class="input" [id]="'cf-' + f.name" [attr.data-field]="f.name" [value]="values()[f.name] || ''" (input)="set(f, $any($event.target).value)" />
                    }
                  }
                </app-field>
              }
            </div>
          }
          @if (problem(); as p) {
            <div class="hub-note hub-note-crit text-sm" role="alert" data-problem>
              <p><app-icon name="alert" /> {{ p.cause }}</p>
              @if (p.fix) { <p class="mt-1"><strong>Fix:</strong> {{ p.fix }}</p> }
            </div>
          }
          @if (connected()) {
            <p class="hub-note text-sm" data-connected><app-icon name="checkCircle" class="icon-ok" /> {{ connected() }}</p>
          }
        </section>
      }

      @if (step() === 2) {
        <section class="flex flex-col gap-2" data-step="tables">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium flex-1">Choose {{ kindWord() }}</span>
            @if (choices().length > 8) {
              <label class="sr-only" for="tableSearch">Search</label>
              <input id="tableSearch" class="input input-sm w-48" type="search" placeholder="Search" (input)="tableSearch.set($any($event.target).value)" />
            }
          </div>
          @if (discovering()) {
            <p class="text-sm text-[color:var(--text-muted)]" role="status">Reading what the connection can sync…</p>
          } @else if (!choices().length) {
            <p class="text-sm text-[color:var(--text-muted)]">The connection has nothing to sync, or its user may not read anything.</p>
          }
          <ul class="connect-tables">
            @for (ch of shownChoices(); track ch.dataset.name) {
              <li>
                <label class="flex items-center gap-2 min-w-0">
                  <input type="checkbox" class="checkbox" role="switch" [checked]="ch.on" (change)="toggle(ch, $any($event.target).checked)"
                         [attr.data-table]="ch.dataset.name" />
                  <span class="mono truncate" [title]="ch.dataset.ref">{{ ch.dataset.name }}</span>
                </label>
                <span class="text-xs text-[color:var(--text-muted)] tabular">{{ ch.dataset.rowEstimate != null ? countText(ch.dataset.rowEstimate) : '' }}</span>
              </li>
            }
          </ul>
        </section>
      }

      @if (step() === 3 && card(); as c) {
        <section class="flex flex-col gap-3" data-step="sync">
          <div class="flex flex-col gap-1">
            <span class="text-sm font-medium">Sync mode</span>
            <app-segmented [value]="mode()" (valueChange)="mode.set($event)" [options]="modes()" ariaLabel="Sync mode" />
            <span class="text-xs text-[color:var(--text-muted)]">{{ modeHelp() }}</span>
          </div>
          @if (needsCursor(mode())) {
            <table class="table-modern">
              <thead><tr><th>{{ kindWord() === 'tables' ? 'Table' : 'Dataset' }}</th><th>Follow changes by</th></tr></thead>
              <tbody>
                @for (ch of chosen(); track ch.dataset.name) {
                  <tr>
                    <td class="mono">{{ ch.dataset.name }}</td>
                    <td>
                      @if (c.spec.sourceKind === 'file') {
                        <span class="text-sm">When a file last changed</span>
                      } @else if (ch.dataset.columns.length || ch.dataset.cursorCandidates.length) {
                        <select class="input input-sm w-auto" [attr.data-cursor]="ch.dataset.name" (change)="setCursor(ch, $any($event.target).value)">
                          @for (col of cursorOptions(ch); track col) { <option [value]="col" [selected]="ch.cursor === col">{{ col }}</option> }
                        </select>
                      } @else {
                        <input class="input input-sm" [attr.data-cursor]="ch.dataset.name" [value]="ch.cursor || ''" placeholder="updated_at"
                               (input)="setCursor(ch, $any($event.target).value)" />
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
          @if (c.spec.sourceKind === 'file') {
            <div class="form-grid">
              <app-field label="Read files as" for="cFormat">
                <select id="cFormat" class="input" (change)="format.set($any($event.target).value)" data-format>
                  @for (f of formats; track f.id) { <option [value]="f.id" [selected]="format() === f.id">{{ f.label }}</option> }
                </select>
              </app-field>
              <app-field label="File pattern" for="cPattern" hint="* and ? match any characters; empty: the format's own files.">
                <input id="cPattern" class="input" [value]="pattern()" placeholder="*.csv" (input)="pattern.set($any($event.target).value)" data-pattern />
              </app-field>
            </div>
          }
          <label class="toggle-row"><span>Detect sensitive columns<span class="block text-xs text-[color:var(--text-muted)]">Email, phone, ids, card
            numbers and credentials are tagged on the first sync.</span></span>
            <input type="checkbox" class="checkbox" role="switch" [checked]="detect()" (change)="detect.set($any($event.target).checked)" data-detect /></label>
          <label class="toggle-row"><span>Register in Data Catalog<span class="block text-xs text-[color:var(--text-muted)]">Each sync tells the catalog
            what it wrote, with its lineage.</span></span>
            <input type="checkbox" class="checkbox" role="switch" [checked]="register()" (change)="register.set($any($event.target).checked)" data-register /></label>
        </section>
      }

      @if (step() === 4) {
        <section class="flex flex-col gap-3" data-step="schedule">
          <app-field label="Sync" for="cSchedule">
            <select id="cSchedule" class="input w-auto" (change)="schedule.set($any($event.target).value === '' ? null : +$any($event.target).value)" data-schedule>
              @for (s of schedules; track s.label) { <option [value]="s.minutes ?? ''" [selected]="schedule() === s.minutes">{{ s.label }}</option> }
            </select>
          </app-field>
          <label class="toggle-row"><span>Sync now as well</span>
            <input type="checkbox" class="checkbox" role="switch" [checked]="syncNow()" (change)="syncNow.set($any($event.target).checked)" data-sync-now /></label>
          <p class="text-sm text-[color:var(--text-secondary)]" data-summary>{{ summary() }}</p>
          @if (problem(); as p) {
            <div class="hub-note hub-note-crit text-sm" role="alert" data-problem>
              <p><app-icon name="alert" /> {{ p.cause }}</p>
              @if (p.fix) { <p class="mt-1"><strong>Fix:</strong> {{ p.fix }}</p> }
            </div>
          }
        </section>
      }

      <div foot class="flex items-center gap-2 w-full">
        @if (step() > minStep()) { <button type="button" class="btn btn-ghost btn-sm" (click)="back()" [disabled]="busy()">Back</button> }
        <span class="flex-1"></span>
        @switch (step()) {
          @case (1) {
            <button type="button" class="btn btn-primary btn-sm" (click)="saveCredentials()" [disabled]="busy() || !canSave()" data-next>
              {{ card()?.spec?.auth === 'OAUTH' ? 'Save and connect with ' + card()!.spec.label : busy() ? 'Testing…' : 'Next: tables' }}</button>
          }
          @case (2) { <button type="button" class="btn btn-primary btn-sm" (click)="go(3)" [disabled]="!chosen().length" data-next>Next: sync settings</button> }
          @case (3) { <button type="button" class="btn btn-primary btn-sm" (click)="go(4)" [disabled]="!cursorsSet()" data-next>Next: schedule</button> }
          @case (4) { <button type="button" class="btn btn-primary btn-sm" (click)="finish()" [disabled]="busy()" data-finish>Save and start</button> }
        }
      </div>
    </app-side-panel>
  `,
})
export class ConnectPanel implements OnInit {
  readonly data = inject<ConnectPanelData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly api = inject(ConnectorsApi);
  private readonly toast = inject(ToastService);

  readonly steps = [{ id: 1 as Step, label: 'Credentials' }, { id: 2 as Step, label: 'Tables' }, { id: 3 as Step, label: 'Sync' },
    { id: 4 as Step, label: 'Schedule' }];
  readonly schedules = SCHEDULES;
  readonly formats = [{ id: 'csv', label: 'CSV rows' }, { id: 'json', label: 'JSON rows' }, { id: 'jsonl', label: 'JSON Lines rows' },
    { id: 'files', label: 'Files as they are (PDFs, images)' }];
  readonly countText = countText;
  readonly modeText = modeText;
  readonly needsCursor = needsCursor;

  readonly card = signal<ConnectorCard | null>(this.data.card ?? this.cardOf(this.data.connection));
  readonly step = signal<Step>(this.data.connection ? 2 : this.data.card ? 1 : 0);
  readonly minStep = computed<Step>(() => this.data.connection ? 2 : this.data.card ? 1 : 0);
  readonly connection = signal<Connection | null>(this.data.connection);
  readonly targets = signal<StorageTarget[]>([]);
  readonly name = signal(this.data.card ? this.data.card.spec.label : '');
  readonly target = signal('');
  readonly values = signal<Record<string, string>>({});
  readonly busy = signal(false);
  readonly problem = signal<{ cause: string; fix: string | null } | null>(null);
  readonly connected = signal('');
  readonly discovering = signal(false);
  readonly choices = signal<Choice[]>([]);
  readonly tableSearch = signal('');
  readonly mode = signal<SyncMode>('FULL');
  readonly format = signal('csv');
  readonly pattern = signal('');
  readonly detect = signal(true);
  readonly register = signal(true);
  readonly schedule = signal<number | null>(60);
  readonly syncNow = signal(true);

  readonly heading = computed(() => this.card() ? `Connect ${this.card()!.spec.label}` : 'New connection');
  readonly fields = computed(() => this.card() ? settingsFields(this.card()!.spec) : []);
  readonly kindWord = computed(() => this.card()?.spec.sourceKind === 'file' ? 'folders' : this.card()?.spec.sourceKind === 'endpoint' ? 'requests'
    : 'tables');
  readonly shownChoices = computed(() => {
    const q = this.tableSearch().trim().toLowerCase();
    return this.choices().filter(c => !q || c.dataset.name.toLowerCase().includes(q));
  });
  readonly chosen = computed(() => this.choices().filter(c => c.on));
  readonly modes = computed<SegmentOption<SyncMode>[]>(() => (this.card()?.spec.modes ?? ['FULL']).map(m => ({
    id: m, label: m === 'FULL' ? 'Full refresh' : m === 'INCREMENTAL' ? 'Incremental' : 'Continuous (CDC)' })));
  readonly modeHelp = computed(() => this.mode() === 'FULL' ? 'Every sync reads everything again into a new folder.'
    : this.mode() === 'INCREMENTAL' ? 'Each sync reads only what changed since the last one.'
      : 'Changes are read every few minutes and also published to this workspace\'s change topic.');
  readonly scheduleLabel = computed(() => SCHEDULES.find(s => s.minutes === this.schedule())?.label ?? 'On demand');
  /** "2 tables, incremental, hourly." */
  readonly summary = computed(() => {
    const n = this.chosen().length;
    const word = n === 1 ? this.kindWord().replace(/s$/, '') : this.kindWord();
    return `${n} ${word}, ${modeText(this.mode()).toLowerCase()}, ${this.scheduleLabel().toLowerCase()}.`;
  });
  readonly canSave = computed(() => {
    const c = this.card();
    if (!c || !this.name().trim() || !this.target()) return false;
    return c.spec.fields.every(f => !f.required || !!this.values()[f.name]?.trim() || (f.secret && this.kept(f)));
  });
  readonly cursorsSet = computed(() => !needsCursor(this.mode()) || this.card()?.spec.sourceKind === 'file'
    || this.chosen().every(c => !!c.cursor));

  ngOnInit(): void {
    this.api.storageTargets().pipe(catchError(() => of(null))).subscribe(res => {
      const live = (res?.data ?? []).filter(t => t.status === 'Active');
      this.targets.set(live);
      if (!this.target() && live.length === 1) this.target.set(live[0].alias);
    });
    if (this.data.connection) {
      this.discover();
    }
  }

  private cardOf(connection: Connection | null): ConnectorCard | null {
    return connection ? this.data.cards.find(c => c.spec.key === connection.connectorKey) ?? null : null;
  }

  kept(field: ConnectorField): boolean {
    return !!this.connection()?.secretsSet?.includes(field.name);
  }

  choose(card: ConnectorCard): void {
    this.card.set(card);
    this.name.set(card.spec.label);
    this.step.set(1);
  }

  set(field: ConnectorField, value: string): void {
    this.values.update(v => ({ ...v, [field.name]: value }));
  }

  go(step: Step): void {
    this.problem.set(null);
    if (step === 3 && this.mode() === 'FULL' && this.card()) {
      this.mode.set(suggestedMode(this.card()!.spec, this.chosen()[0]?.dataset));
    }
    this.step.set(step);
  }

  back(): void {
    this.problem.set(null);
    this.step.update(s => Math.max(this.minStep(), s - 1) as Step);
  }

  /** Save the connection (secrets typed now go once), then test it; an OAuth one goes to the provider instead. */
  saveCredentials(): void {
    const c = this.card();
    if (!c) return;
    const config: Record<string, string | number> = {};
    const secrets: Record<string, string> = {};
    for (const f of c.spec.fields) {
      const value = (this.values()[f.name] ?? '').trim();
      if (!value) continue;
      if (f.secret) secrets[f.name] = value;
      else config[f.name] = f.type === 'number' ? Number(value) : value;
    }
    this.busy.set(true);
    this.problem.set(null);
    this.connected.set('');
    this.api.save({ connectionId: this.connection()?.id, name: this.name().trim(), connectorKey: c.spec.key, config, secrets,
      targetAlias: this.target() }).subscribe({
      next: res => {
        if (res.status !== API_SUCCESS || !res.data) {
          this.busy.set(false);
          this.problem.set({ cause: res.message || 'The connection could not be saved.', fix: null });
          return;
        }
        this.connection.set(res.data);
        this.values.update(v => {
          const next = { ...v };
          c.spec.fields.filter(f => f.secret).forEach(f => delete next[f.name]);
          return next;
        });
        this.data.changed();
        if (c.spec.auth === 'OAUTH') {
          this.authorise(res.data.id);
          return;
        }
        this.api.test(res.data.id).subscribe({
          next: t => {
            this.busy.set(false);
            if (t.status === API_SUCCESS && t.data?.ok) {
              this.connected.set('Connected. Reading what it can sync…');
              this.step.set(2);
              this.discover();
            } else {
              this.problem.set({ cause: t.data?.message || t.message, fix: t.data?.fix ?? null });
            }
          },
          error: () => { this.busy.set(false); this.problem.set({ cause: 'The test could not be run.', fix: 'Try again in a minute.' }); },
        });
      },
      error: err => { this.busy.set(false); this.problem.set({ cause: err?.error?.message || 'The connection could not be saved.', fix: null }); },
    });
  }

  private authorise(connectionId: number): void {
    this.api.oauthStart(connectionId).subscribe({
      next: res => {
        this.busy.set(false);
        if (res.status !== API_SUCCESS || !res.data?.authorizeUrl) {
          this.problem.set({ cause: res.message || 'The grant could not start.', fix: null });
          return;
        }
        window.location.assign(res.data.authorizeUrl);
      },
      error: () => { this.busy.set(false); this.problem.set({ cause: 'The grant could not start.', fix: 'Try again in a minute.' }); },
    });
  }

  discover(): void {
    const connection = this.connection();
    if (!connection) return;
    this.discovering.set(true);
    this.api.discover(connection.id).subscribe({
      next: res => {
        this.discovering.set(false);
        if (res.status !== API_SUCCESS) {
          this.problem.set({ cause: res.message, fix: null });
          return;
        }
        const kind = this.card()?.spec.sourceKind ?? 'table';
        this.choices.set((res.data ?? []).map(d => ({ dataset: d, on: false, cursor: suggestedCursor(d, kind) })));
      },
      error: () => { this.discovering.set(false); this.problem.set({ cause: 'The connection could not be read.', fix: 'Test it again.' }); },
    });
  }

  toggle(choice: Choice, on: boolean): void {
    this.choices.update(all => all.map(c => c.dataset.name === choice.dataset.name ? { ...c, on } : c));
  }

  setCursor(choice: Choice, cursor: string): void {
    this.choices.update(all => all.map(c => c.dataset.name === choice.dataset.name ? { ...c, cursor: cursor.trim() || null } : c));
  }

  cursorOptions(choice: Choice): string[] {
    const names = [...choice.dataset.cursorCandidates, ...choice.dataset.columns.map(c => c.name)];
    return names.filter((n, i) => names.indexOf(n) === i);
  }

  /** Every chosen table becomes a stream; then, if asked, they all sync now. */
  finish(): void {
    const connection = this.connection();
    const c = this.card();
    if (!connection || !c) return;
    this.busy.set(true);
    this.problem.set(null);
    const file = c.spec.sourceKind === 'file';
    const calls: Observable<ApiResponse<Stream> | null>[] = this.chosen().map(ch => this.api.saveStream({
      connectionId: connection.id, name: ch.dataset.name, mode: this.mode(),
      cursorColumn: needsCursor(this.mode()) ? file ? 'modified' : ch.cursor : null,
      primaryKey: ch.dataset.primaryKey.length ? ch.dataset.primaryKey.join(',') : null,
      scheduleMinutes: this.schedule(), detectSensitive: this.detect(), registerCatalog: this.register(),
      options: file ? { format: this.format(), ...(this.pattern().trim() ? { pattern: this.pattern().trim() } : {}) } : {},
    }).pipe(catchError(err => of({ status: 'ERROR', message: err?.error?.message || 'Not saved.' } as ApiResponse<Stream>))));
    forkJoin(calls).pipe(map(results => results.filter(r => r?.status !== API_SUCCESS))).subscribe(failed => {
      if (failed.length) {
        this.busy.set(false);
        this.problem.set({ cause: failed.map(f => f?.message).join(' '), fix: 'Change the settings and save again; the others are saved.' });
        this.data.changed();
        return;
      }
      const done = () => {
        this.busy.set(false);
        this.toast.success(this.syncNow() ? `${connection.name}: syncing now.` : `${connection.name} is set up.`);
        this.data.changed();
        this.ref.close();
      };
      if (this.syncNow()) {
        this.api.runNow({ connectionId: connection.id }).subscribe({ next: done, error: done });
      } else {
        done();
      }
    });
  }
}

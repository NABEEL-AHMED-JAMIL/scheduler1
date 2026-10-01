import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { instantOf } from '../../../core/instant';
import { AuthService } from '../../../core/auth/auth.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { Icon } from '../../../shared/ui/icon';
import { LoadError } from '../../../shared/ui/load-error';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { SidePanel, sidePanelConfig } from '../../../shared/ui/side-panel';
import { ToastService } from '../../../shared/ui/toast.service';
import { ConnectorsApi } from './connectors.api';
import {
  ConnectionDetail, ConnectorCard, Stream, SyncRun, agoText, connectionState, countText, lagText, modeText, runTone, scheduleText,
  stateIcon, stateTone,
} from './connectors.model';
import { ConnectPanel, ConnectPanelData } from './connect-panel';

/** What the page hands the panel: the connection to open, the gallery (for Add tables), and a way to say the list changed. */
export interface ConnectionPanelData {
  connectionId: number;
  name: string;
  cards: ConnectorCard[];
  changed: () => void;
}

/**
 * One connection (MIG-292): its state with the last error's cause and fix, its sync health (rows, lag, failures), its
 * streams -- mode, schedule, rows, lag, a schema change waiting with what changed and Accept -- and its last runs, each
 * failure with its cause and fix. Test, Sync now, Connect (an OAuth grant) and Add tables; Disconnect and Delete.
 */
@Component({
  selector: 'app-connection-panel',
  imports: [SidePanel, Icon, LoadError, ServerTimePipe],
  template: `
    <app-side-panel [heading]="detail()?.connection?.name || data.name" [subtitle]="subtitle()">
      @if (loading() && !detail()) {
        <p class="text-sm text-[color:var(--text-muted)]" role="status">Reading the connection…</p>
      } @else if (error()) {
        <app-load-error [message]="error()" (retry)="load()" />
      } @else if (detail(); as d) {
        <div class="flex flex-col gap-5" data-connection-panel>
          <section class="flex flex-wrap items-center gap-2">
            <span class="pill" [class]="(state() === 'Error' || state() === 'Needs you' ? 'pill-solid-' : 'pill-') + stateTone(state())" data-state>
              <app-icon [name]="stateIcon(state())" size="0.85em" />{{ state() }}</span>
            @if (d.connection.lastTestAt) {
              <span class="text-xs text-[color:var(--text-muted)]">Tested {{ d.connection.lastTestAt | serverTime: 'recent' }}:
                {{ d.connection.lastTestOk ? 'connected' : 'failed' }}</span>
            }
            <span class="flex-1"></span>
            @if (isAdmin()) {
              <button type="button" class="btn btn-default btn-sm" (click)="test()" [disabled]="busy()" data-test-connection><app-icon name="plug" />Test</button>
              @if (d.connection.authKind === 'OAUTH') {
                <button type="button" class="btn btn-default btn-sm" (click)="authorise()" [disabled]="busy()" data-authorise><app-icon name="key" />
                  {{ d.connection.oauthStatus === 'CONNECTED' ? 'Reconnect' : 'Connect with ' + (card()?.spec?.label || 'the provider') }}</button>
              }
              <button type="button" class="btn btn-primary btn-sm" (click)="runNow()" [disabled]="busy() || !d.streams.length" data-sync-now>
                <app-icon name="refresh" />Sync now</button>
            }
          </section>

          @if (d.connection.lastError) {
            <div class="hub-note hub-note-crit text-sm" role="alert" data-error>
              <p><app-icon name="alert" /> {{ d.connection.lastError }}</p>
              @if (d.connection.lastErrorFix) { <p class="mt-1"><strong>Fix:</strong> {{ d.connection.lastErrorFix }}</p> }
              @if (d.connection.lastErrorAt) { <p class="mt-1 text-xs">{{ d.connection.lastErrorAt | serverTime: 'dateTime' }}</p> }
            </div>
          }
          @if (testResult(); as t) {
            <div class="hub-note text-sm" [class.hub-note-crit]="!t.ok" role="status" data-test-result>
              <p><app-icon [name]="t.ok ? 'checkCircle' : 'alert'" /> {{ t.message }}</p>
              @if (t.fix) { <p class="mt-1"><strong>Fix:</strong> {{ t.fix }}</p> }
            </div>
          }

          <section class="hub-health" aria-label="Sync health" data-health>
            <div><span class="text-xs text-[color:var(--text-muted)]">Streams</span><strong class="tabular">{{ d.streams.length }}</strong></div>
            <div><span class="text-xs text-[color:var(--text-muted)]">Rows</span><strong class="tabular">{{ countText(d.connection.health?.rows ?? 0) }}</strong></div>
            <div><span class="text-xs text-[color:var(--text-muted)]">Lag</span><strong class="tabular">{{ lagText(d.connection.health?.lagSeconds) }}</strong></div>
            <div><span class="text-xs text-[color:var(--text-muted)]">Last sync</span><strong>{{ ago(d.connection.health?.lastSyncAt ?? null) }}</strong></div>
            <div><span class="text-xs text-[color:var(--text-muted)]">Failed, 24 h</span>
              <strong class="tabular" [class.is-stale]="(d.connection.health?.failed24h ?? 0) > 0">{{ d.connection.health?.failed24h ?? 0 }}</strong></div>
          </section>

          <section class="flex flex-col gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-semibold flex-1">Streams</h3>
              @if (canBuild() && card()) {
                <button type="button" class="btn btn-ghost btn-sm" (click)="addTables()" [disabled]="busy()" data-add-tables><app-icon name="plus" />Add {{ addWord() }}</button>
              }
            </div>
            @for (s of d.streams; track s.id) {
              @if (s.pendingSchema; as p) {
                <div class="hub-note hub-note-warn text-sm" [attr.data-schema]="s.name">
                  <p><app-icon name="alert" /> <span class="mono">{{ s.name }}</span>: {{ p.summary }}</p>
                  <p class="mt-1">{{ p.dropped.length || p.changed.length ? 'Its syncs stop until the change is accepted, so no column is lost unseen.'
                    : 'Syncs go on; the new columns are read once the change is accepted.' }}</p>
                  @if (canBuild()) { <button type="button" class="btn btn-default btn-sm mt-2" (click)="accept(s)" [disabled]="busy()" data-accept>Accept the change</button> }
                </div>
              }
            }
            @if (d.streams.length) {
              <div class="overflow-x-auto">
                <table class="table-modern" data-streams>
                  <thead><tr><th>Stream</th><th>Mode</th><th>Schedule</th><th class="text-right">Rows</th><th>Last sync</th><th class="text-right">Lag</th>
                    <th>Sensitive</th>@if (isAdmin()) { <th></th> }</tr></thead>
                  <tbody>
                    @for (s of d.streams; track s.id) {
                      <tr [attr.data-stream]="s.name">
                        <td class="mono max-w-xs truncate" [title]="s.folder">{{ s.name }}</td>
                        <td class="whitespace-nowrap">{{ modeText(s.mode) }}@if (s.cursorColumn) { <span class="block text-xs text-[color:var(--text-muted)]">by {{ s.cursorColumn }}</span> }</td>
                        <td class="whitespace-nowrap">{{ scheduleText(s.scheduleMinutes) }}@if (s.runRequested) { <span class="pill pill-brand">Queued</span> }</td>
                        <td class="text-right tabular">{{ countText(s.rowsTotal) }}</td>
                        <td class="whitespace-nowrap">{{ ago(s.lastSyncAt) }}</td>
                        <td class="text-right tabular">{{ lagText(s.lagSeconds) }}</td>
                        <td>
                          @for (t of s.sensitiveColumns ?? []; track t.column) { <span class="pill pill-warn" [title]="t.level">{{ t.column }}</span> }
                          @if (!(s.sensitiveColumns ?? []).length) { <span class="text-[color:var(--text-muted)]">—</span> }
                        </td>
                        @if (isAdmin()) {
                          <td class="whitespace-nowrap text-right">
                            <button type="button" class="btn btn-ghost btn-xs" (click)="runNow(s)" [disabled]="busy()" [attr.aria-label]="'Sync ' + s.name + ' now'">Sync</button>
                            @if (canBuild() && s.mode !== 'FULL' && !s.sourceId) {
                              <button type="button" class="btn btn-ghost btn-xs" (click)="asSource(s)" [disabled]="busy()" title="Use its data in a pipeline (Sources)">Make a source</button>
                            }
                            @if (canBuild()) {
                              <button type="button" class="btn btn-ghost btn-xs" (click)="removeStream(s)" [disabled]="busy()" [attr.aria-label]="'Stop syncing ' + s.name">
                                <app-icon name="trash" /></button>
                            }
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="text-sm text-[color:var(--text-muted)]">Nothing is synced yet{{ canBuild() ? ': add ' + addWord() + '.' : '.' }}</p>
            }
          </section>

          <section class="flex flex-col gap-2">
            <h3 class="text-sm font-semibold">Sync runs</h3>
            @if (d.runs.length) {
              <div class="overflow-x-auto">
                <table class="table-modern" data-runs>
                  <thead><tr><th>Started</th><th>Stream</th><th>Status</th><th class="text-right">Rows</th><th>Took</th><th>Why</th></tr></thead>
                  <tbody>
                    @for (r of d.runs; track r.id) {
                      <tr [attr.data-run]="r.syncId">
                        <td class="whitespace-nowrap">{{ r.startedAt | serverTime: 'recent' }}
                          <span class="block text-xs text-[color:var(--text-muted)]">{{ triggerText(r) }}</span></td>
                        <td class="mono max-w-xs truncate">{{ r.stream }}</td>
                        <td class="whitespace-nowrap"><span class="pill" [class]="(r.status === 'Failed' ? 'pill-solid-' : 'pill-') + runTone(r.status)">{{ r.status }}</span></td>
                        <td class="text-right tabular">{{ countText(r.rows) }}</td>
                        <td class="whitespace-nowrap tabular">{{ took(r) }}</td>
                        <td class="text-sm min-w-0">
                          @if (r.error) {
                            <span class="block">{{ r.error }}</span>
                            @if (r.errorFix) { <span class="block text-xs"><strong>Fix:</strong> {{ r.errorFix }}</span> }
                          } @else if (r.errorFix) {
                            <span class="block text-xs text-[color:var(--text-secondary)]">{{ r.errorFix }}</span>
                          } @else {
                            <span class="text-[color:var(--text-muted)]">—</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="text-sm text-[color:var(--text-muted)]">No sync yet.</p>
            }
          </section>
        </div>
      }
      <div foot class="flex items-center gap-2 w-full">
        @if (canBuild() && detail(); as d) {
          @if (d.connection.authKind === 'OAUTH' && d.connection.oauthStatus === 'CONNECTED') {
            <button type="button" class="btn btn-ghost btn-sm" (click)="disconnect()" [disabled]="busy()">Disconnect</button>
          }
          <button type="button" class="btn btn-danger btn-sm" (click)="remove()" [disabled]="busy()" data-delete><app-icon name="trash" />Delete</button>
        }
        <span class="flex-1"></span>
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Close</button>
      </div>
    </app-side-panel>
  `,
})
export class ConnectionPanel implements OnInit {
  readonly data = inject<ConnectionPanelData>(DIALOG_DATA);
  readonly ref = inject(DialogRef);
  private readonly api = inject(ConnectorsApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly detail = signal<ConnectionDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly testResult = signal<{ ok: boolean; message: string; fix: string | null } | null>(null);
  readonly now = signal(Date.now());

  readonly canBuild = computed(() => this.auth.canBuild());
  readonly isAdmin = computed(() => this.auth.isTenantAdmin());
  readonly card = computed(() => this.data.cards.find(c => c.spec.key === this.detail()?.connection.connectorKey) ?? null);
  readonly state = computed(() => this.detail() ? connectionState(this.detail()!.connection) : 'Active');
  readonly subtitle = computed(() => {
    const c = this.detail()?.connection;
    return c ? `${c.connectorLabel} · writes to ${c.targetAlias}/${c.folder}` : '';
  });
  readonly addWord = computed(() => this.card()?.spec.sourceKind === 'file' ? 'folders' : this.card()?.spec.sourceKind === 'endpoint'
    ? 'requests' : 'tables');

  readonly countText = countText;
  readonly lagText = lagText;
  readonly modeText = modeText;
  readonly scheduleText = scheduleText;
  readonly runTone = runTone;
  readonly stateTone = stateTone;
  readonly stateIcon = stateIcon;
  readonly ago = (at: string | null) => agoText(at, this.now());

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.now.set(Date.now());
    this.api.connection(this.data.connectionId).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.status !== API_SUCCESS || !res.data) {
          this.error.set(res.message || 'The connection could not be read.');
          return;
        }
        this.error.set('');
        this.detail.set(res.data);
      },
      error: () => { this.loading.set(false); this.error.set('Connector Hub could not be reached.'); },
    });
  }

  triggerText(run: SyncRun): string {
    const how = run.trigger === 'MANUAL' ? 'Asked for' : run.trigger === 'RESUME' ? 'Resumed' : 'Scheduled';
    return run.resumedCount > 0 && run.trigger !== 'RESUME' ? `${how}, resumed ${run.resumedCount}×` : how;
  }

  took(run: SyncRun): string {
    if (!run.finishedAt) return run.status === 'Running' ? 'running' : '—';
    const start = instantOf(run.startedAt);
    const end = instantOf(run.finishedAt);
    if (!start || !end) return '—';
    const seconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
    return seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;
  }

  test(): void {
    this.busy.set(true);
    this.testResult.set(null);
    this.api.test(this.data.connectionId).subscribe({
      next: res => {
        this.busy.set(false);
        this.testResult.set(res.data ? { ok: res.data.ok, message: res.data.message, fix: res.data.fix } : { ok: false, message: res.message, fix: null });
        this.load();
      },
      error: () => { this.busy.set(false); this.testResult.set({ ok: false, message: 'The test could not be run.', fix: 'Try again in a minute.' }); },
    });
  }

  runNow(stream?: Stream): void {
    this.busy.set(true);
    this.api.runNow(stream ? { streamId: stream.id } : { connectionId: this.data.connectionId }).subscribe({
      next: res => {
        this.busy.set(false);
        if (res.status !== API_SUCCESS) {
          this.toast.error(res.message);
          return;
        }
        this.toast.success(stream ? `${stream.name}: syncing within seconds.` : 'Syncing within seconds.');
        this.load();
        this.data.changed();
        setTimeout(() => this.load(), 6000);
      },
      error: () => { this.busy.set(false); this.toast.error('The sync could not be asked for.'); },
    });
  }

  authorise(): void {
    this.busy.set(true);
    this.api.oauthStart(this.data.connectionId).subscribe({
      next: res => {
        this.busy.set(false);
        if (res.status !== API_SUCCESS || !res.data?.authorizeUrl) {
          this.testResult.set({ ok: false, message: res.message, fix: null });
          return;
        }
        window.location.assign(res.data.authorizeUrl);
      },
      error: () => { this.busy.set(false); this.toast.error('The grant could not start.'); },
    });
  }

  async disconnect(): Promise<void> {
    const ok = await confirmWith(this.dialog, { title: 'Disconnect?', body: 'The provider is asked to end the grant; syncs stop until you connect'
      + ' again. What was synced stays.', confirmLabel: 'Disconnect', danger: true });
    if (!ok) return;
    this.api.oauthDisconnect(this.data.connectionId).subscribe(() => { this.load(); this.data.changed(); });
  }

  accept(stream: Stream): void {
    this.busy.set(true);
    this.api.acceptSchema(stream.id).subscribe({
      next: res => {
        this.busy.set(false);
        if (res.status !== API_SUCCESS) {
          this.toast.error(res.message);
          return;
        }
        this.toast.success(`${stream.name}: the change applies from the next sync.`);
        this.load();
        this.data.changed();
      },
      error: () => { this.busy.set(false); this.toast.error('The change could not be accepted.'); },
    });
  }

  asSource(stream: Stream): void {
    this.api.asSource(stream.id).subscribe(res => {
      if (res.status === API_SUCCESS) {
        this.toast.success(`${stream.name} is a source now (Integration › Sources).`);
        this.load();
      } else {
        this.toast.error(res.message);
      }
    });
  }

  async removeStream(stream: Stream): Promise<void> {
    const ok = await confirmWith(this.dialog, { title: `Stop syncing ${stream.name}?`, body: 'Its syncs stop; what it synced stays in the bucket.',
      confirmLabel: 'Stop syncing', danger: true });
    if (!ok) return;
    this.api.removeStream(stream.id).subscribe(() => { this.load(); this.data.changed(); });
  }

  async remove(): Promise<void> {
    const name = this.detail()?.connection.name ?? this.data.name;
    const ok = await confirmWith(this.dialog, { title: `Delete ${name}?`, body: 'Its syncs stop and its secrets and grant are dropped. What it'
      + ' synced stays in the bucket.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    this.api.remove(this.data.connectionId).subscribe(res => {
      if (res.status === API_SUCCESS) {
        this.toast.success(`${name} deleted.`);
        this.data.changed();
        this.ref.close();
      } else {
        this.toast.error(res.message);
      }
    });
  }

  addTables(): void {
    const d = this.detail();
    if (!d) return;
    this.ref.close();
    this.dialog.open<void>(ConnectPanel, sidePanelConfig<ConnectPanelData>({
      cards: this.data.cards, card: this.card(), connection: d.connection, changed: this.data.changed,
    }, 'wide'));
  }
}

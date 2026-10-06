import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { LoadError } from '../../shared/ui/load-error';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { SidePanel } from '../../shared/ui/side-panel';
import { ToastService } from '../../shared/ui/toast.service';
import { CatalogApi } from './catalog.api';
import {
  AssetDetail, Grant, LineageGraph, SENSITIVITIES, TAGS, freshnessText, grantTone, isSensitive, kindText, lineageSides, nodeIcon,
  sensitivityTone, sourceText, tagText, whereText,
} from './catalog.model';

/** What the page hands the panel: the asset to open, and a way to say the list should be read again. */
export interface CatalogPanelData {
  assetId: number;
  name: string;
  changed: () => void;
}

/**
 * One catalog asset (MIG-288): what it is and where it lives, its owner and description, its columns and what they hold
 * (tags a person can correct), how sensitive it is, where its data came from and goes (lineage), and access -- asking
 * for it when its values are masked for you, or, for its owner or an admin, the requests and grants to end.
 */
@Component({
  selector: 'app-catalog-panel',
  imports: [SidePanel, Icon, LoadError, ServerTimePipe],
  template: `
    <app-side-panel [heading]="asset()?.name || data.name" [subtitle]="subtitle()">
      @if (loading()) {
        <p class="text-sm text-[color:var(--text-muted)]" role="status">Reading the asset…</p>
      } @else if (error()) {
        <app-load-error [message]="error()" (retry)="load()" />
      } @else if (asset(); as a) {
        <div class="flex flex-col gap-5" data-catalog-panel>
          <section class="flex flex-wrap items-center gap-2 text-sm">
            <span class="pill" [class]="'pill-' + tone(a.sensitivity)" data-sensitivity>{{ a.sensitivity }}</span>
            @if (a.sensitivityByHand) { <span class="text-xs text-[color:var(--text-muted)]">set by hand</span> }
            <span class="text-[color:var(--text-secondary)]">{{ where(a) }}</span>
            @if (a.qualityScore != null) { <span class="pill pill-neutral">Quality {{ a.qualityScore }}%</span> }
            <span class="pill pill-neutral">Changed {{ fresh(a.lastChangedAt) }} ago</span>
            @if (a.status === 'Deleted') { <span class="pill pill-crit">Deleted at its source</span> }
          </section>

          @if (a.masked) {
            <section class="card p-4 flex flex-col gap-3" data-access>
              @if (a.myAccess?.status === 'Requested') {
                <p class="text-sm"><app-icon name="clock" /> You asked for access on {{ a.myAccess!.requestedAt | serverTime: 'dateTime' }};
                  a workspace admin decides in their task inbox.</p>
              } @else {
                <p class="text-sm"><app-icon name="lock" /> Its sensitive values are masked for you. Ask for access for a time; a workspace
                  admin decides.</p>
                <label class="text-xs font-medium" for="accessReason">Why you need it</label>
                <textarea id="accessReason" class="input" rows="2" maxlength="1000" [value]="reason()" (input)="reason.set($any($event.target).value)"
                          placeholder="What you will use it for"></textarea>
                <div class="flex flex-wrap items-center gap-2">
                  <label class="text-xs font-medium" for="accessDays">For</label>
                  <select id="accessDays" class="input input-sm w-auto" (change)="days.set(+$any($event.target).value)">
                    @for (d of [1, 7, 30, 90]; track d) { <option [value]="d" [selected]="days() === d">{{ d }} day{{ d === 1 ? '' : 's' }}</option> }
                  </select>
                  <button type="button" class="btn btn-primary btn-sm" [disabled]="busy() || !reason().trim()" (click)="requestAccess()" data-request-access>
                    <app-icon name="key" />Request access</button>
                </div>
              }
            </section>
          } @else if (a.myAccess?.status === 'Granted') {
            <p class="text-sm" data-access><app-icon name="checkCircle" /> You can see its values until
              {{ a.myAccess!.expiresAt | serverTime: 'dateTime' }}.</p>
          }

          <section class="flex flex-col gap-2">
            <h3 class="text-sm font-semibold">About</h3>
            @if (a.canEdit) {
              <label class="sr-only" for="assetDescription">Description</label>
              <textarea id="assetDescription" class="input" rows="3" maxlength="4000" [value]="description()"
                        (input)="description.set($any($event.target).value)" placeholder="What it holds and what it is for"></textarea>
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <span class="text-[color:var(--text-secondary)]">Owner: {{ ownerName() || 'nobody' }}</span>
                @if (owner() !== me()) { <button type="button" class="btn btn-ghost btn-sm" (click)="owner.set(me()); ownerName.set('you')">Make me the owner</button> }
                @if (owner() !== null) { <button type="button" class="btn btn-ghost btn-sm" (click)="owner.set(null); ownerName.set('')">Clear owner</button> }
                <button type="button" class="btn btn-default btn-sm" [disabled]="busy()" (click)="saveDetails()" data-save-details>
                  <app-icon name="save" />Save details</button>
              </div>
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <label for="assetSensitivity">Sensitivity</label>
                <select id="assetSensitivity" class="input input-sm w-auto" (change)="classify($any($event.target).value)" data-classify>
                  <option value="" [selected]="!a.sensitivityByHand">Follow its tags ({{ tagLevel() }})</option>
                  @for (s of sensitivities; track s) { <option [value]="s" [selected]="a.sensitivityByHand && a.sensitivity === s">{{ s }}</option> }
                </select>
              </div>
            } @else {
              <p class="text-sm text-[color:var(--text-secondary)]">{{ a.description || 'No description yet.' }}</p>
              <p class="text-sm">Owner: {{ a.ownerName || 'nobody' }}</p>
            }
          </section>

          <section class="flex flex-col gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-sm font-semibold flex-1">Columns</h3>
              @if (a.kind !== 'document_type' && a.status === 'Active') {
                <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="profile()" data-profile><app-icon name="chart" />Profile</button>
                <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="scan()" data-scan><app-icon name="shield" />Scan for sensitive data</button>
              }
            </div>
            @if (a.scanError) { <p class="text-xs text-[color:var(--text-muted)]">Last scan: {{ a.scanError }}</p> }
            @if (a.profileError) { <p class="text-xs text-[color:var(--text-muted)]">Last profile: {{ a.profileError }}</p> }
            @if (a.columns.length) {
              <table class="table-modern" data-columns>
                <thead><tr><th>Column</th><th>Type</th><th class="text-right">Empty</th><th>Holds</th></tr></thead>
                <tbody>
                  @for (c of a.columns; track c.name) {
                    <tr [attr.data-column]="c.name">
                      <td class="mono">{{ c.name }}</td>
                      <td class="text-xs">{{ c.dataType || '—' }}</td>
                      <td class="text-right tabular text-xs">{{ c.nullPercent != null ? c.nullPercent + '%' : '—' }}</td>
                      <td>
                        @if (a.canEdit) {
                          <label class="sr-only" [for]="'tag-' + c.name">What {{ c.name }} holds</label>
                          <select class="input input-sm w-auto" [id]="'tag-' + c.name" (change)="tag(c.name, $any($event.target).value)">
                            <option value="" [selected]="!c.tags.length">nothing sensitive</option>
                            @for (t of tags; track t.id) { <option [value]="t.id" [selected]="c.tags.includes(t.id)">{{ t.label }}</option> }
                          </select>
                          @if (c.tagsReviewed) { <span class="text-xs text-[color:var(--text-muted)]"> reviewed</span> }
                        } @else {
                          @for (t of c.tags; track t) { <span class="pill pill-warn">{{ tagLabel(t) }}</span> }
                          @if (!c.tags.length) { <span class="text-xs text-[color:var(--text-muted)]">—</span> }
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="text-sm text-[color:var(--text-muted)]">No columns known yet{{ a.kind === 'file' ? ' -- profile it to read them' : '' }}.</p>
            }
          </section>

          <section class="flex flex-col gap-2" data-lineage>
            <h3 class="text-sm font-semibold">Lineage</h3>
            @if (!sides().upstream.length && !sides().downstream.length) {
              <p class="text-sm text-[color:var(--text-muted)]">Nothing seen feeding it or reading it yet.</p>
            } @else {
              <div class="lineage-row">
                @for (n of sides().upstream; track n.ref) {
                  <span class="lineage-node" [title]="n.ref"><app-icon [name]="icon(n.kind)" />{{ n.name || n.ref }}</span>
                  <app-icon name="arrowRight" class="text-[color:var(--text-muted)]" />
                }
                <span class="lineage-node lineage-self"><app-icon [name]="icon(a.kind)" />{{ a.name }}</span>
                @for (n of sides().downstream; track n.ref) {
                  <app-icon name="arrowRight" class="text-[color:var(--text-muted)]" />
                  <span class="lineage-node" [title]="n.ref"><app-icon [name]="icon(n.kind)" />{{ n.name || n.ref }}</span>
                }
              </div>
              <p class="text-xs text-[color:var(--text-secondary)]">Used by {{ usedBy() }}</p>
            }
          </section>

          @if (a.canEdit && grants().length) {
            <section class="flex flex-col gap-2" data-grants>
              <h3 class="text-sm font-semibold">Access requests</h3>
              @for (g of grants(); track g.grantId) {
                <div class="flex flex-wrap items-center gap-2 text-sm" [attr.data-grant]="g.grantId">
                  <span class="pill" [class]="'pill-' + grantTone(g.status)">{{ g.status }}</span>
                  <span class="flex-1 min-w-0 truncate">{{ g.userName || ('person ' + g.userId) }} · {{ g.days }} day{{ g.days === 1 ? '' : 's' }}
                    @if (g.reason) { · "{{ g.reason }}" }</span>
                  @if (g.expiresAt && g.status === 'Granted') { <span class="text-xs">until {{ g.expiresAt | serverTime: 'dateTime' }}</span> }
                  @if (g.status === 'Granted' || g.status === 'Requested') {
                    <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="revoke(g)">End</button>
                  }
                </div>
              }
            </section>
          }
        </div>
      }
    </app-side-panel>
  `,
})
export class CatalogPanel implements OnInit {
  readonly data = inject<CatalogPanelData>(DIALOG_DATA);
  private readonly api = inject(CatalogApi);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly asset = signal<AssetDetail | null>(null);
  readonly graph = signal<LineageGraph | null>(null);
  readonly grants = signal<Grant[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly description = signal('');
  readonly owner = signal<number | null>(null);
  readonly ownerName = signal('');
  readonly reason = signal('');
  readonly days = signal(30);
  readonly me = computed(() => this.auth.user()?.appUserId ?? null);

  readonly sensitivities = SENSITIVITIES;
  readonly tags = TAGS;
  readonly tone = sensitivityTone;
  readonly grantTone = grantTone;
  readonly tagLabel = tagText;
  readonly icon = nodeIcon;
  readonly fresh = (at: string | null) => freshnessText(at);
  readonly where = whereText;

  readonly subtitle = computed(() => {
    const a = this.asset();
    return a ? `${kindText(a.kind)} · ${sourceText(a.source)} · owner ${a.ownerName || 'nobody'}` : '';
  });
  readonly sides = computed(() => lineageSides(this.graph()));
  readonly usedBy = computed(() => {
    const down = this.sides().downstream;
    const count = (kind: string) => down.filter(n => n.kind === kind).length;
    const parts = [[count('pipeline'), 'pipeline'], [count('dataset'), 'dataset'], [count('dashboard'), 'dashboard']]
      .filter(([n]) => (n as number) > 0).map(([n, what]) => `${n} ${what}${n === 1 ? '' : 's'}`);
    return parts.length ? parts.join(' · ') : 'nothing yet';
  });
  /** What the tags alone make it: the highest level a tagged column raises it to. */
  readonly tagLevel = computed(() => {
    const tags = (this.asset()?.columns ?? []).flatMap(c => c.tags);
    if (tags.some(t => ['national_id', 'card_number', 'bank_account'].includes(t))) return 'Restricted';
    return tags.length ? 'Confidential' : 'Unclassified';
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.asset(this.data.assetId).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.status !== API_SUCCESS || !res.data) {
          this.error.set(res.message || 'The asset could not be read.');
          return;
        }
        this.show(res.data);
        this.api.lineage(this.data.assetId).subscribe({ next: g => this.graph.set(g.status === API_SUCCESS ? g.data ?? null : null) });
        if (res.data.canEdit) {
          this.api.accessRequests().subscribe({
            next: r => this.grants.set(r.status === API_SUCCESS ? (r.data ?? []).filter(g => g.assetId === this.data.assetId) : []),
          });
        }
      },
      error: () => { this.loading.set(false); this.error.set('The catalog could not be reached.'); },
    });
  }

  private show(a: AssetDetail): void {
    this.asset.set(a);
    this.description.set(a.description ?? '');
    this.owner.set(a.ownerUserId);
    this.ownerName.set(a.ownerName ?? '');
  }

  /** Runs one change and shows what came back; the list is told to read again. */
  private act(call: ReturnType<CatalogApi['asset']>, done: string): void {
    this.busy.set(true);
    call.subscribe({
      next: res => {
        this.busy.set(false);
        if (res.status !== API_SUCCESS || !res.data) {
          this.toast.error(res.message || 'That did not work.');
          return;
        }
        this.show(res.data);
        this.toast.success(done);
        this.data.changed();
      },
      error: () => { this.busy.set(false); this.toast.error('The catalog could not be reached.'); },
    });
  }

  saveDetails(): void {
    this.act(this.api.describe(this.data.assetId, this.owner(), this.description().trim() || null), 'Details saved.');
  }

  classify(level: string): void {
    this.act(this.api.classify(this.data.assetId, level || null), level ? `Marked ${level}.` : 'It follows its tags again.');
  }

  tag(column: string, tag: string): void {
    this.act(this.api.tag(this.data.assetId, column, tag ? [tag] : []), tag ? `${column} holds ${tagText(tag)}.` : `${column} holds nothing sensitive.`);
  }

  profile(): void {
    this.act(this.api.profile(this.data.assetId), 'Profiled and scanned.');
  }

  scan(): void {
    this.act(this.api.scan(this.data.assetId), 'Scanned.');
  }

  requestAccess(): void {
    this.busy.set(true);
    this.api.requestAccess(this.data.assetId, this.reason().trim(), this.days()).subscribe({
      next: res => {
        this.busy.set(false);
        if (res.status !== API_SUCCESS) {
          this.toast.error(res.message || 'The request could not be sent.');
          return;
        }
        this.toast.success(res.message || 'Asked.');
        this.load();
      },
      error: () => { this.busy.set(false); this.toast.error('The catalog could not be reached.'); },
    });
  }

  revoke(g: Grant): void {
    this.busy.set(true);
    this.api.revokeAccess(g.grantId).subscribe({
      next: res => {
        this.busy.set(false);
        if (res.status !== API_SUCCESS || !res.data) {
          this.toast.error(res.message || 'Access could not be ended.');
          return;
        }
        this.grants.update(list => list.map(x => x.grantId === g.grantId ? res.data! : x));
        this.toast.success('Access ended.');
      },
      error: () => { this.busy.set(false); this.toast.error('The catalog could not be reached.'); },
    });
  }

  sensitive(level: string): boolean {
    return isSensitive(level);
  }
}

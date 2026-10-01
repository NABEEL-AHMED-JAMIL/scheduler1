import { Component, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/ui/icon';
import { TableShell } from '../../../shared/ui/data-table';
import { ManagedBanner } from '../../../shared/ui/managed-banner';
import { SegmentOption, Segmented } from '../../../shared/ui/segmented';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { StatStrip, StatStripItem } from '../../../shared/ui/stat-strip';
import { ConnectorsApi } from './connectors.api';
import {
  CATEGORIES, Category, Connection, ConnectorCard, agoText, categoryIcon, connectionState, countText, lagText, modeText, scheduleText,
  stateIcon, stateTone,
} from './connectors.model';
import { ConnectPanel, ConnectPanelData } from './connect-panel';
import { ConnectionPanel, ConnectionPanelData } from './connection-panel';

type Chip = '' | Category | 'connected';
type StateFilter = '' | 'Active' | 'Syncing' | 'Error' | 'Needs you' | 'Paused' | 'Not connected';

/**
 * Integration › Connector Hub (Wave 5, MIG-292; page 'connector-hub'): ready-made connectors for databases, SaaS apps and
 * files (integration-service's /connectorHub.json). The gallery, narrowed by category chips and a search, connects one in a
 * panel -- credentials or an OAuth grant, then tables, sync mode and schedule. Below it the workspace's connections with
 * their sync health: mode, last sync, rows, lag and state; a row opens the connection -- its streams, runs and errors,
 * each error with its cause and its fix. ?connection= opens one (the bell's link when a grant was revoked).
 *
 * Every member holding the page reads. Making and changing connections are a workspace administrator's builder actions
 * (canBuild); testing, granting access and syncing now stay an administrator's in a managed workspace too.
 */
@Component({
  selector: 'app-connectors',
  imports: [Icon, TableShell, ManagedBanner, Segmented, StatStrip],
  templateUrl: './connectors.html',
})
export class Connectors implements OnInit {
  private readonly api = inject(ConnectorsApi);
  private readonly dialog = inject(Dialog);
  private readonly auth = inject(AuthService);

  /** ?connection= opens that connection's panel. */
  readonly connectionParam = input<string | undefined>(undefined, { alias: 'connection' });

  readonly canBuild = computed(() => this.auth.canBuild());
  readonly isAdmin = computed(() => this.auth.isTenantAdmin());
  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());

  readonly cards = signal<ConnectorCard[]>([]);
  readonly connections = signal<Connection[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly galleryError = signal('');
  readonly chip = signal<Chip>('');
  readonly search = signal('');
  readonly stateFilter = signal<StateFilter>('');
  readonly now = signal(Date.now());

  readonly chips = computed<SegmentOption<Chip>[]>(() => {
    const cards = this.cards();
    return CATEGORIES.map(c => {
      const n = c.id === '' ? cards.length : c.id === 'connected' ? cards.filter(x => this.isConnected(x)).length
        : cards.filter(x => x.spec.category === c.id).length;
      return { id: c.id, label: `${c.label} (${n})` };
    });
  });

  readonly shownCards = computed(() => {
    const chip = this.chip();
    const q = this.search().trim().toLowerCase();
    return this.cards().filter(c => (chip === '' || (chip === 'connected' ? this.isConnected(c) : c.spec.category === chip))
      && (!q || `${c.spec.label} ${c.spec.summary} ${c.spec.key}`.toLowerCase().includes(q)));
  });

  readonly states: { id: StateFilter; label: string }[] = [
    { id: '', label: 'All states' }, { id: 'Active', label: 'Active' }, { id: 'Syncing', label: 'Syncing' }, { id: 'Error', label: 'Error' },
    { id: 'Needs you', label: 'Needs you' }, { id: 'Not connected', label: 'Not connected' }, { id: 'Paused', label: 'Paused' },
  ];

  readonly shownConnections = computed(() => {
    const state = this.stateFilter();
    return state ? this.connections().filter(c => connectionState(c) === state) : this.connections();
  });

  readonly kpis = computed<StatStripItem[]>(() => {
    const all = this.connections();
    if (!all.length) return [];
    const streams = all.reduce((n, c) => n + (c.health?.streams ?? 0), 0);
    const failed = all.reduce((n, c) => n + (c.health?.failed24h ?? 0), 0);
    const waiting = all.filter(c => connectionState(c) === 'Needs you' || c.health?.schemaPending).length;
    const lags = all.map(c => c.health?.lagSeconds).filter((l): l is number => l != null);
    return [
      { label: 'Connections', value: all.length, icon: 'plug', foot: `${streams} stream${streams === 1 ? '' : 's'}` },
      { label: 'Rows synced', value: countText(all.reduce((n, c) => n + (c.health?.rows ?? 0), 0)), icon: 'database' },
      { label: 'Failed syncs, 24 h', value: failed, icon: 'alert', tone: failed ? 'crit' : undefined },
      { label: 'Waiting for you', value: waiting, icon: 'key', tone: waiting ? 'warn' : undefined,
        foot: lags.length ? `Most behind: ${lagText(Math.max(...lags))}` : undefined },
    ];
  });

  readonly modeText = modeText;
  readonly scheduleText = scheduleText;
  readonly countText = countText;
  readonly lagText = lagText;
  readonly state = connectionState;
  readonly stateTone = stateTone;
  readonly stateIcon = stateIcon;
  readonly categoryIcon = categoryIcon;
  readonly ago = (at: string | null) => agoText(at, this.now());

  constructor() {
    effect(() => {
      const id = Number(this.connectionParam());
      if (id > 0) untracked(() => this.open(id, ''));
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.now.set(Date.now());
    this.api.connectors().subscribe({
      next: res => {
        if (res.status !== API_SUCCESS) {
          this.galleryError.set(res.message || 'The connectors could not be read.');
          return;
        }
        this.galleryError.set('');
        this.cards.set(res.data ?? []);
      },
      error: () => this.galleryError.set('Connector Hub could not be reached.'),
    });
    if (this.isPlatformAdmin()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api.connections().subscribe({
      next: res => {
        this.loading.set(false);
        if (res.status !== API_SUCCESS) {
          this.error.set(res.message || 'The connections could not be read.');
          return;
        }
        this.connections.set(res.data ?? []);
      },
      error: () => { this.loading.set(false); this.error.set('Connector Hub could not be reached.'); },
    });
  }

  /** A connector the workspace has a connection of, that can run here (not one waiting on the owner's OAuth app). */
  isConnected(card: ConnectorCard): boolean {
    return card.connections > 0 && !this.blocked(card);
  }

  /** Why a card cannot be connected now, or null when it can. */
  blocked(card: ConnectorCard): string | null {
    if (!card.spec.available) return `Not available yet: ${card.spec.unavailableReason}`;
    if (!card.oauthRegistered) return `${card.spec.label} is added on request: the platform's owner registers its OAuth app, then it connects here.`;
    return null;
  }

  connect(card: ConnectorCard | null): void {
    if (card && this.blocked(card)) return;
    this.dialog.open<void>(ConnectPanel, sidePanelConfig<ConnectPanelData>({
      cards: this.cards().filter(c => !this.blocked(c)), card, connection: null, changed: () => this.load(),
    }, 'wide'));
  }

  /** "Build custom (REST)": the REST connector, over one of the workspace's API Collections. */
  custom(): void {
    const rest = this.cards().find(c => c.spec.key === 'rest');
    if (rest) this.connect(rest);
  }

  open(connectionId: number, name: string): void {
    this.dialog.open<void>(ConnectionPanel, sidePanelConfig<ConnectionPanelData>({
      connectionId, name, cards: this.cards(), changed: () => this.load(),
    }, 'wide'));
  }
}

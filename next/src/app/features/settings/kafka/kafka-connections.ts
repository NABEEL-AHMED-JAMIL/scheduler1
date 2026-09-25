import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { KAFKA_ENVIRONMENTS, kafkaEnvironment } from './kafka-environment';
import { HttpClient } from '@angular/common/http';

import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { MineFilter, isMine } from '../../../shared/ui/mine-filter';
import { AuthService } from '../../../core/auth/auth.service';
import { StatTile } from '../../../shared/ui/stat-tile';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Icon } from '../../../shared/ui/icon';
import { CopyButton } from '../../../shared/ui/copy-button';
import { BlurLoader } from '../../../shared/ui/blur-loader';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { TopicPipelinesPanel } from './topic-pipelines-panel';
import { copyText } from '../../../shared/ui/clipboard.util';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { KafkaDialog } from './kafka-dialog';
import { TaskType, TaskTypeDialog } from '../task-types/task-type-dialog';
import { parseTopicPartition } from '../../../shared/ui/topic';
import { HttpParams } from '@angular/common/http';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { profileLabel } from './platform-default';

/** As much of a tenant.json/listTenants row as this screen reads. */
export interface TenantName {
  tenantId: number;
  tenantName: string;
}

export interface KafkaProfile {
  /** The author's id, so "Only mine" matches on identity rather than display text. */
  createdBy?: number | null;

  /** Filled in by the server on the way out; null on rows with no recorded author. */
  createdByName?: string | null;
  updatedByName?: string | null;

  kafkaConnectionProfileId: number;

  /**
   * Which workspace owns the row. Absent, not null, on the platform's own profiles -- the DTO is
   * serialised NON_NULL -- so it has to be tested with `== null` rather than `=== null`.
   */
  tenantId?: number | null;
  profileName: string;
  environmentLabel?: string;
  /** Absent on a profile the caller is shown but does not own (readOnly). */
  bootstrapServers?: string;
  securityProtocol: string;
  saslMechanism?: string;
  saslUsername?: string;
  saslPasswordConfigured?: boolean;
  sslKeystoreBucket?: string;
  sslKeystoreLocation?: string;
  sslKeystorePasswordConfigured?: boolean;
  sslKeyPasswordConfigured?: boolean;
  sslTruststoreBucket?: string;
  sslTruststoreLocation?: string;
  sslTruststorePasswordConfigured?: boolean;

  /** "https" verifies the broker's hostname, "" switches the check off. Declared because the
      dialog has to send back what it was given: the server writes this field on every save. */
  sslEndpointIdentificationAlgorithm?: string;
  additionalProperties?: string;
  isDefault?: boolean;
  status: string;
  connectionStatus?: 'UNTESTED' | 'SUCCESS' | 'FAILED';
  lastTestedAt?: string;
  lastTestMessage?: string;
  dateCreated?: string;
  /** The platform's own profile: no workspace owns it. */
  platform?: boolean;
  /**
   * Shown, not the caller's: the platform default as a workspace with no Kafka of its own sees it,
   * with its brokers, login and last test message left out. The server refuses every edit, test,
   * default change and delete on it; the screen does not offer them.
   */
  readOnly?: boolean;
}

@Component({
  selector: 'app-kafka-connections',
  imports: [MineFilter, StatTile, ServerTimePipe, StatusPill, Icon, CdkMenu, CdkMenuItem, CdkMenuTrigger, CopyButton, RouterLink, BlurLoader],
  templateUrl: './kafka-connections.html',
})
export class KafkaConnections implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /**
   * Which profile the detail pane shows. Mirrored to ?profileId=, which is also what Source
   * Task Types links to, so arriving from there lands on that profile rather than on a banner.
   */
  readonly selectedId = signal<number | null>(null);
  readonly selected = computed(() =>
    this.profiles().find(p => p.kafkaConnectionProfileId === this.selectedId()) ?? null);

  select(profile: KafkaProfile): void {
    this.selectedId.set(profile.kafkaConnectionProfileId);
    this.topicSearch.set('');
    this.topicTests.set({});
    this.detailsOpen.set(false);
    this.router.navigate([], { relativeTo: this.route, queryParams: { profileId: profile.kafkaConnectionProfileId }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /**
   * The topics (source task types) that publish through the selected profile. A topic belongs
   * to the connection it was added under; one from before that rule with no connection of its
   * own is shown under the default, since that is where the resolver sends it.
   */
  private readonly taskTypes = signal<TaskType[]>([]);
  /** Which profile the loaded topics belong to; anything else on screen is stale. */
  private readonly topicsFor = signal<number | null>(null);
  readonly topicsLoading = signal(false);
  /**
   * Why the selected profile's topics could not be read. A toast alone left the pane saying
   * "No topic publishes through this profile yet", which a failed request is not.
   */
  readonly topicsError = signal('');
  readonly topicsHere = computed<{ type: TaskType }[]>(() => {
    const p = this.selected();
    if (!p) return [];
    // While the next profile's topics are on their way the previous rows stay, blurred under
    // the loader, so switching profiles reads as the list changing rather than going blank.
    if (this.topicsFor() !== p.kafkaConnectionProfileId && !this.topicsLoading()) return [];
    return this.taskTypes().map(type => ({ type }));
  });

  /** Narrows the pane's topics by name, Kafka topic or description; a hundred rows need it. */
  readonly topicSearch = signal('');
  readonly topicsShown = computed(() => {
    const term = this.topicSearch().trim().toLowerCase();
    const rows = this.topicsHere();
    if (!term) return rows;
    return rows.filter(r => `${r.type.serviceName} ${r.type.description ?? ''} ${this.topicOf(r.type.queueTopicPartition)}`
      .toLowerCase().includes(term));
  });

  /**
   * Whether each topic exists on the profile it is listed under -- the server describes it with
   * that profile's own client. Kept per row so a page of a hundred topics can be checked one
   * at a time and the answers stay put; cleared when another profile is picked.
   */
  readonly topicTests = signal<Record<number, { ok: boolean; message: string; unread?: boolean }>>({});
  readonly testingTopic = signal<number | null>(null);
  testTopic(profile: KafkaProfile, type: TaskType): void {
    const topic = this.topicOf(type.queueTopicPartition);
    const id = type.sourceTaskTypeId!;
    if (!topic) { this.toast.error('This topic has no Kafka topic name to check.'); return; }
    this.testingTopic.set(id);
    // A profile the caller only sees cannot be named to the server (it reads as not found); the
    // topic is tested on the connection that resolves for the caller, which for a workspace shown
    // the platform default is that one.
    const params: Record<string, string> = profile.readOnly
      ? { topicName: topic }
      : { topicName: topic, kafkaConnectionProfileId: String(profile.kafkaConnectionProfileId) };
    this.http.get<ApiResponse>(`${API_BASE}/kafkaConnectionProfile.json/testTopic`, { params }).subscribe({
      next: r => {
        this.testingTopic.set(null);
        // Reachable but read by nobody is the case that strands a run at Start; it passes the
        // test and is shown as a warning, not as a tick.
        const unread = r.status === API_SUCCESS && /no consumer is reading/.test(r.message || '');
        this.topicTests.update(m => ({ ...m, [id]: { ok: r.status === API_SUCCESS, message: r.message, unread } }));
      },
      error: err => {
        this.testingTopic.set(null);
        this.topicTests.update(m => ({ ...m, [id]: { ok: false, message: err?.error?.message || 'The topic check could not be run.' } }));
      },
    });
  }

  /** The strip's fold-out for TLS files, the stored SASL password and extra properties. */
  readonly detailsOpen = signal(false);
  toggleDetails(): void { this.detailsOpen.update(v => !v); }
  hasMoreConnectionDetail(p: KafkaProfile): boolean {
    return p.securityProtocol === 'SSL' || p.securityProtocol === 'SASL_SSL'
      || !!p.saslPasswordConfigured || !!p.additionalProperties?.trim();
  }

  readonly copiedTopicId = signal<number | null>(null);
  topicOf(raw?: string): string { return parseTopicPartition(raw).topic; }
  partitionsOf(raw?: string): string {
    const partitions = parseTopicPartition(raw).partitions;
    return partitions ? `[${partitions}]` : '';
  }
  copyTopic(id: number | undefined, topic: string): void {
    copyText(topic).then(ok => {
      if (!ok) { this.toast.error('Could not copy that. Select it and copy by hand.'); return; }
      this.copiedTopicId.set(id ?? null);
      setTimeout(() => { if (this.copiedTopicId() === (id ?? null)) this.copiedTopicId.set(null); }, 1500);
    });
  }

  /**
   * The pipelines that publish on each topic, so the row can name them rather than count them
   * -- "2" said nothing; "Claims file loader, Load claims" says what the topic carries.
   */
  private readonly pipelinesByTopic = signal<Record<number, { pipelineKey: number; pipelineId: string; pipelineName: string; status?: string; fields?: number }[]>>({});
  pipelinesOf(type: TaskType) { return this.pipelinesByTopic()[type.sourceTaskTypeId!] ?? []; }
  pipelineCount(type: TaskType): number { return this.pipelinesOf(type).length; }
  /** Topic rows whose pipeline list is unfolded. */
  /** Opens the drawer with this topic's pipelines; a row holds one name, not a list. */
  showPipelines(type: TaskType): void {
    this.dialog.open<void>(TopicPipelinesPanel, sidePanelConfig({
      sourceTaskTypeId: type.sourceTaskTypeId!,
      topicName: type.serviceName,
      kafkaTopic: parseTopicPartition(type.queueTopicPartition).topic,
      pipelines: this.pipelinesOf(type),
    }));
  }

  /**
   * The selected profile's topics, each with its pipelines, in one call -- asked when a
   * profile is picked, not for every profile up front. A workspace with ten thousand topics
   * used to download all of them (and every pipeline) to show the one pane it was looking at.
   */
  loadTopics(): void {
    const p = this.selected();
    this.topicsError.set('');
    if (!p) { this.taskTypes.set([]); this.topicsFor.set(null); return; }
    const id = p.kafkaConnectionProfileId;
    this.topicsLoading.set(true);
    this.http.get<ApiResponse<any[]>>(`${API_BASE}/setting.json/topicsForProfile`, { params: { kafkaConnectionProfileId: id } }).subscribe({
      next: r => {
        this.topicsLoading.set(false);
        // A slower answer for a profile no longer selected must not overwrite the current one.
        if (this.selectedId() !== id) return;
        if (r.status !== API_SUCCESS) { this.topicsError.set(r.message || 'The topics could not be loaded.'); return; }
        const byTopic: Record<number, { pipelineKey: number; pipelineId: string; pipelineName: string; status?: string; fields?: number }[]> = {};
        for (const t of r.data ?? []) byTopic[t.sourceTaskTypeId] = t.pipelines ?? [];
        this.pipelinesByTopic.set(byTopic);
        this.taskTypes.set(r.data ?? []);
        this.topicsFor.set(id);
      },
      error: err => {
        this.topicsLoading.set(false);
        if (this.selectedId() !== id) return;
        this.topicsError.set(err?.error?.message || 'The topics could not be loaded.');
      },
    });
  }

  addTopic(profile: KafkaProfile): void {
    // Under the platform default a workspace adds its topic unrouted: that is what lands it there,
    // and it keeps following the workspace's default once the workspace brings its own Kafka.
    this.dialog.open<boolean>(TaskTypeDialog, { data: {
      profiles: this.profiles(), defaultProfileId: profile.readOnly ? null : profile.kafkaConnectionProfileId,
      profileName: this.displayName(profile),
      tenantId: profile.tenantId ?? null, tenants: this.tenants(),
    } }).closed.subscribe(saved => { if (saved) this.loadTopics(); });
  }

  editTopic(type: TaskType): void {
    const profile = this.selected();
    this.dialog.open<boolean>(TaskTypeDialog, { data: { type, profiles: this.profiles(), tenants: this.tenants(), profileName: profile?.profileName } }).closed
      .subscribe(saved => { if (saved) this.loadTopics(); });
  }

  async removeTopic(type: TaskType): Promise<void> {
    const linked = type.totalTaskLink ?? 0;
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${type.serviceName}?`,
      body: linked
        ? `${linked} task${linked === 1 ? '' : 's'} use this topic. Deleting it also marks their jobs deleted — they will stop running.`
        : 'No task uses this topic.',
      confirmLabel: 'Delete topic',
      danger: true,
    });
    if (!ok) return;
    this.http.delete<ApiResponse>(`${API_BASE}/setting.json/deleteSourceTaskType`,
      { params: new HttpParams().set('sourceTaskTypeId', type.sourceTaskTypeId!) }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) { this.toast.success(response.message); this.loadTopics(); }
        else this.toast.error(response.message);
      },
      error: err => this.toast.error(err?.error?.message || 'The topic could not be deleted.'),
    });
  }

  /** The last test, as one tone the rail dot, the pane banner and its glyph all share. */
  testTone(p: KafkaProfile): { cls: 'ok' | 'crit' | 'muted'; label: string; icon: string } {
    if (p.connectionStatus === 'SUCCESS') return { cls: 'ok', label: 'Last test passed', icon: 'check' };
    if (p.connectionStatus === 'FAILED') return { cls: 'crit', label: 'Last test failed', icon: 'xCircle' };
    return { cls: 'muted', label: 'Not tested yet', icon: 'plug' };
  }

  constructor() {
    // The pane's topics follow the selection: every change of selected profile is one fetch.
    effect(() => {
      const id = this.selectedId();
      untracked(() => { if (id !== null) this.loadTopics(); else { this.taskTypes.set([]); this.topicsFor.set(null); } });
    });
    // Keep something selected: the linked profile when the list arrives, else the first, and
    // move off a profile the moment it stops existing or is filtered out.
    effect(() => {
      const rows = this.filtered();
      const current = untracked(this.selectedId);
      if (!rows.length) { if (current !== null) this.selectedId.set(null); return; }
      if (rows.some(p => p.kafkaConnectionProfileId === current)) return;
      const linked = Number(untracked(() => this.route.snapshot.queryParamMap.get('profileId')));
      // The linked profile, else the default -- the one a hundred-profile workspace actually
      // routes through -- else the first by name.
      const pick = rows.find(p => p.kafkaConnectionProfileId === linked)
        ?? rows.find(p => p.isDefault && (p.tenantId != null || !this.canSeeWorkspace()))
        ?? rows.find(p => p.isDefault)
        ?? rows[0];
      this.selectedId.set(pick.kafkaConnectionProfileId);
    });
  }

  readonly profiles = signal<KafkaProfile[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly environmentFilter = signal('');
  readonly statusFilter = signal('');
  readonly environments = KAFKA_ENVIRONMENTS;
  readonly env = (p: KafkaProfile) => kafkaEnvironment(p.environmentLabel);
  readonly testing = signal<number | null>(null);

  readonly hasFilters = computed(() =>
    !!(this.search().trim() || this.environmentFilter() || this.statusFilter()
       || this.onlyMine()));

  /** Narrows the list to rows this person created. Not persisted -- see MineFilter. */

  private readonly auth = inject(AuthService);

  readonly onlyMine = signal(false);

  /**
   * Workspace names for the tenant ids sitting on the rows.
   *
   * fetchAllProfiles gives a platform administrator every workspace's profiles and carries only a
   * tenantId, so the screen listed six rows called "Globex Data PLAINTEXT" with nothing on them
   * saying whose they were. The names come from listTenants, the same source Tenants and Users
   * read; nothing here invents one for a tenant that list does not mention.
   */
  private readonly tenants = signal<TenantName[]>([]);

  /** A tenant sees only its own profiles, so the column would be one repeated value for them. */
  readonly canSeeWorkspace = this.auth.isPlatformAdmin;

  workspaceName(profile: KafkaProfile): string {
    if (profile.tenantId == null) {
      return 'Platform';
    }
    return this.tenants().find(t => t.tenantId === profile.tenantId)?.tenantName
      ?? `Tenant ${profile.tenantId}`;
  }

  /** Title for the workspace pill. A platform row is not a workspace; it is what the others fall back to. */
  workspaceHint(profile: KafkaProfile): string {
    return profile.tenantId == null
      ? 'Platform-owned — the fallback for a workspace with no default of its own'
      : `Workspace: ${this.workspaceName(profile)}`;
  }

  /**
   * What the "default" pill on a row actually means, which depends on whose default it is.
   *
   * isDefault is per-workspace -- setAsDefault clears it inside one tenant and leaves every other
   * tenant's alone -- so on a platform administrator's list several rows carry it at once, and the fixed
   * "Used by tasks with no explicit profile" read as though each of them were the only default
   * there is.
   */
  defaultHint(profile: KafkaProfile): string {
    if (!this.canSeeWorkspace()) {
      return 'Used by tasks with no explicit profile';
    }
    return profile.tenantId == null
      ? 'Platform default — used by a workspace that has no default of its own'
      : `Default for ${this.workspaceName(profile)} — used by that workspace's tasks with no explicit profile`;
  }

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const environment = this.environmentFilter();
    const status = this.statusFilter();
    const rows = this.profiles().filter(p => {
      if (environment && kafkaEnvironment(p.environmentLabel)?.key !== environment) return false;
      if (status && p.status !== status) return false;
      if (!term) return true;
      // Only a platform administrator has a workspace column to read, so only their search matches on one.
      const workspace = this.canSeeWorkspace() ? this.workspaceName(p) : '';
      return `${p.profileName} ${p.environmentLabel ?? ''} ${p.bootstrapServers ?? ''} ${workspace}`
        .toLowerCase().includes(term);
    });
    return this.mine(rows).slice().sort((a, b) => a.profileName.localeCompare(b.profileName));
  });

  /** Whether the row is the caller's to edit, test, make default or delete. */
  canManage(profile: KafkaProfile): boolean { return !profile.readOnly; }

  /** The name as the rail and the pane show it: a platform default says so. */
  displayName(profile: KafkaProfile): string { return profileLabel(profile); }

  /** The broker list, or -- on a row the caller only sees -- whose it is. */
  brokersText(profile: KafkaProfile): string {
    return profile.readOnly || !profile.bootstrapServers ? 'Managed by the platform' : profile.bootstrapServers;
  }

  /** The workspace's own profiles only: the platform default it is shown is not one of them. */
  readonly summary = computed(() => {
    const list = this.profiles().filter(p => !p.readOnly);
    return {
      total: list.length,
      active: list.filter(p => p.status === 'Active').length,
      testedOk: list.filter(p => p.connectionStatus === 'SUCCESS').length,
      failing: list.filter(p => p.connectionStatus === 'FAILED').length,
    };
  });

  /**
   * The default this screen is answerable for -- the tile, the "nothing is default" warning and
   * the Clear default action all mean this one.
   *
   * Taking the first flagged row was right only while the list held one workspace. A platform
   * admin's list holds a flagged row per tenant, ordered newest id first, so the tile credited
   * whichever tenant most recently set one -- "Default: ETL Demo Broker" against a platform whose
   * own default was a different profile entirely -- and the warning stayed quiet while the
   * platform had no default at all. clearDefault() here clears the platform's row, so that is the
   * row these read.
   */
  readonly defaultProfile = computed(() => {
    const rows = this.profiles();
    if (this.canSeeWorkspace()) {
      return rows.find(p => p.isDefault && p.tenantId == null) ?? null;
    }
    return rows.find(p => p.isDefault) ?? null;
  });

  ngOnInit(): void {
    this.loadTenants();
    this.load();
  }

  /**
   * tenant.json is @PreAuthorize("hasRole('PLATFORM_ADMIN')") as a whole, so asking as anyone else
   * buys a 403 for a column they are not shown. Failing to get the names leaves workspaceName on
   * its "Tenant <id>" fallback rather than taking the profile list down with it.
   */
  private loadTenants(): void {
    if (!this.canSeeWorkspace()) return;
    this.http.get<ApiResponse<TenantName[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) this.tenants.set(response.data ?? []);
      },
      error: () => {},
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<KafkaProfile[]>>(`${API_BASE}/kafkaConnectionProfile.json/fetchAllProfiles`)
      .subscribe({
        next: response => {
          this.loading.set(false);
          if (response.status === API_SUCCESS) this.profiles.set(response.data ?? []);
          else this.error.set(response.message || 'Kafka profiles could not be loaded.');
        },
        error: () => { this.loading.set(false); this.error.set('Kafka profiles could not be loaded.'); },
      });
  }

  clearFilters(): void {
    this.search.set('');
    this.environmentFilter.set('');
    this.statusFilter.set('');
    // hasFilters() counts Only mine, so Clear has to turn it off -- with only that on, the button
    // was shown and did nothing.
    this.onlyMine.set(false);
  }

  create(): void {
    this.dialog.open<boolean>(KafkaDialog, { data: {} }).closed
      .subscribe(saved => { if (saved) this.load(); });
  }

  edit(profile: KafkaProfile): void {
    this.dialog.open<boolean>(KafkaDialog, { data: { profile } }).closed
      .subscribe(saved => { if (saved) this.load(); });
  }

  testConnection(profile: KafkaProfile): void {
    this.testing.set(profile.kafkaConnectionProfileId);
    this.http.post<ApiResponse>(`${API_BASE}/kafkaConnectionProfile.json/testConnection`,
      { kafkaConnectionProfileId: profile.kafkaConnectionProfileId }).subscribe({
      next: response => {
        this.testing.set(null);
        if (response.status === API_SUCCESS) this.toast.success(response.message);
        else this.toast.error(response.message);
        this.load();
      },
      error: err => {
        this.testing.set(null);
        this.toast.error(err?.error?.message || 'The connection test could not be run.');
        this.load();
      },
    });
  }

  setDefault(profile: KafkaProfile): void {
    // setAsDefault takes a request parameter, not a body. Sent as a body the id never arrived,
    // Spring rejected the call with 400 before the handler ran, and the action did nothing.
    this.http.post<ApiResponse>(`${API_BASE}/kafkaConnectionProfile.json/setAsDefault`, null,
      { params: { kafkaConnectionProfileId: String(profile.kafkaConnectionProfileId) } }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) { this.toast.success(response.message); this.load(); }
        else this.toast.error(response.message);
      },
      error: err => this.toast.error(err?.error?.message || 'The default could not be set.'),
    });
  }

  /**
   * Takes the default off whichever profile currently holds it.
   *
   * The endpoint takes nothing at all -- a tenant has one default, so there is no id to name. It
   * was being sent one anyway, which Spring dropped on the floor and which read as though the
   * clear were scoped to this row.
   */
  clearDefault(): void {
    this.http.post<ApiResponse>(`${API_BASE}/kafkaConnectionProfile.json/clearDefault`, null)
      .subscribe({
      next: response => {
        if (response.status === API_SUCCESS) { this.toast.success(response.message); this.load(); }
        else this.toast.error(response.message);
      },
      error: err => this.toast.error(err?.error?.message || 'The default could not be cleared.'),
    });
  }

  async remove(profile: KafkaProfile): Promise<void> {
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${profile.profileName}?`,
      body: profile.isDefault
        ? 'This is the default profile. Tasks that fall back to the default will have no broker to reach until another profile is marked default.'
        : 'Tasks pointing at this profile will no longer have broker settings to use.',
      confirmLabel: 'Delete profile',
      danger: true,
    });
    if (!ok) return;
    // Same as setAsDefault: a request parameter, not a body.
    this.http.put<ApiResponse>(`${API_BASE}/kafkaConnectionProfile.json/deleteProfile`, null,
      { params: { kafkaConnectionProfileId: String(profile.kafkaConnectionProfileId) } }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) { this.toast.success(response.message); this.load(); }
        else this.toast.error(response.message);
      },
      error: err => this.toast.error(err?.error?.message || 'The profile could not be deleted.'),
    });
  }

  /**
   * Applies the "Only mine" toggle.
   *
   * Kept pure -- it runs inside a computed, and writing a signal from there is not allowed. The
   * count of what survives is already on the table header, so nothing needs to be recorded.
   */
  private mine<T extends { createdBy?: number | null }>(rows: T[]): T[] {
    if (!this.onlyMine()) {
      return rows;
    }
    const myId = this.auth.user()?.appUserId ?? null;
    return rows.filter(row => isMine(row, myId));
  }

  /** `<id>` of the row whose value was just copied, so exactly one icon ticks. */
  readonly copiedId = signal<number | null>(null);

  /** The broker list is what a worker's config and a kafka-console command are typed against. */
  copyRow(id: number | undefined, value: string): void {
    copyText(value ?? '').then(ok => {
      if (!ok) { this.toast.error('Could not copy that. Select it and copy by hand.'); return; }
      this.copiedId.set(id ?? null);
      setTimeout(() => { if (this.copiedId() === (id ?? null)) this.copiedId.set(null); }, 1500);
    });
  }
}

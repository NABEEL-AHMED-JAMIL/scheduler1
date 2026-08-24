import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { StatTile } from '../../../shared/ui/stat-tile';
import { StatusPill } from '../../../shared/ui/status-pill';
import { Icon } from '../../../shared/ui/icon';
import { ViewToggle } from '../../../shared/ui/view-toggle';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { createSort } from '../../../shared/ui/sort';
import { KafkaDialog } from './kafka-dialog';

export interface KafkaProfile {
  kafkaConnectionProfileId: number;
  profileName: string;
  environmentLabel?: string;
  bootstrapServers: string;
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
  additionalProperties?: string;
  isDefault?: boolean;
  status: string;
  connectionStatus?: 'UNTESTED' | 'SUCCESS' | 'FAILED';
  lastTestedAt?: string;
  lastTestMessage?: string;
  dateCreated?: string;
}

@Component({
  selector: 'app-kafka-connections',
  imports: [ViewToggle, StatTile, DatePipe, TableShell, StatusPill, Icon, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './kafka-connections.html',
})
export class KafkaConnections implements OnInit {
  readonly view = signal<'table' | 'cards'>('table');
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly profiles = signal<KafkaProfile[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly protocolFilter = signal('');
  readonly statusFilter = signal('');
  readonly testing = signal<number | null>(null);
  readonly sort = createSort<KafkaProfile>('profileName');

  readonly protocols = computed(() =>
    [...new Set(this.profiles().map(p => p.securityProtocol).filter(Boolean))].sort());

  readonly hasFilters = computed(() =>
    !!(this.search().trim() || this.protocolFilter() || this.statusFilter()));

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const protocol = this.protocolFilter();
    const status = this.statusFilter();
    const rows = this.profiles().filter(p => {
      if (protocol && p.securityProtocol !== protocol) return false;
      if (status && p.status !== status) return false;
      if (!term) return true;
      return `${p.profileName} ${p.environmentLabel ?? ''} ${p.bootstrapServers}`.toLowerCase().includes(term);
    });
    return this.sort.apply(rows, (row, key) => (row as any)[key]);
  });

  readonly summary = computed(() => {
    const list = this.profiles();
    return {
      total: list.length,
      active: list.filter(p => p.status === 'Active').length,
      testedOk: list.filter(p => p.connectionStatus === 'SUCCESS').length,
      failing: list.filter(p => p.connectionStatus === 'FAILED').length,
    };
  });

  readonly defaultProfile = computed(() => this.profiles().find(p => p.isDefault) ?? null);

  ngOnInit(): void {
    this.load();
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
    this.protocolFilter.set('');
    this.statusFilter.set('');
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
    this.http.post<ApiResponse>(`${API_BASE}/kafkaConnectionProfile.json/setAsDefault`,
      { kafkaConnectionProfileId: profile.kafkaConnectionProfileId }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) { this.toast.success(response.message); this.load(); }
        else this.toast.error(response.message);
      },
      error: err => this.toast.error(err?.error?.message || 'The default could not be set.'),
    });
  }

  clearDefault(profile: KafkaProfile): void {
    this.http.post<ApiResponse>(`${API_BASE}/kafkaConnectionProfile.json/clearDefault`,
      { kafkaConnectionProfileId: profile.kafkaConnectionProfileId }).subscribe({
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
    this.http.put<ApiResponse>(`${API_BASE}/kafkaConnectionProfile.json/deleteProfile`,
      { kafkaConnectionProfileId: profile.kafkaConnectionProfileId }).subscribe({
      next: response => {
        if (response.status === API_SUCCESS) { this.toast.success(response.message); this.load(); }
        else this.toast.error(response.message);
      },
      error: err => this.toast.error(err?.error?.message || 'The profile could not be deleted.'),
    });
  }

  testPill(profile: KafkaProfile): string {
    switch (profile.connectionStatus) {
      case 'SUCCESS': return 'pill pill-ok';
      case 'FAILED':  return 'pill pill-crit';
      default:        return 'pill pill-neutral';
    }
  }

  testGlyph(profile: KafkaProfile): string {
    switch (profile.connectionStatus) {
      case 'SUCCESS': return 'checkCircle';
      case 'FAILED':  return 'xCircle';
      default:        return '';
    }
  }

  testLabel(profile: KafkaProfile): string {
    switch (profile.connectionStatus) {
      case 'SUCCESS': return 'OK';
      case 'FAILED':  return 'Failed';
      default:        return 'Untested';
    }
  }

  /** SASL and SSL each imply a different set of things that must be configured. */
  protocolTone(profile: KafkaProfile): string {
    return profile.securityProtocol === 'PLAINTEXT' ? 'pill pill-warn' : 'pill pill-neutral';
  }
}

import { Component, computed, inject } from '@angular/core';
import { DIALOG_DATA } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { ToastService } from '../../../shared/ui/toast.service';
import { ReportStudioApi, studioError } from '../report-studio.api';
import { AssetDetail, AssetVersion } from '../assets.model';
import { AssetPicture } from './asset-picture';
import { RsTimePipe } from '../rs-time.pipe';

export interface AssetVersionData {
  asset: AssetDetail;
  version: AssetVersion;
}

/** A version's state in words, as the Versions table and this panel say it. */
export function versionStateWord(v: AssetVersion): string {
  return v.state === 'PENDING' ? 'Waiting for approval' : v.state === 'APPROVED' ? 'Current' : v.state === 'REJECTED' ? 'Rejected' : 'Replaced';
}

export function versionStateTone(v: AssetVersion): string {
  return v.state === 'PENDING' ? 'pill-warn' : v.state === 'APPROVED' ? 'pill-ok' : v.state === 'REJECTED' ? 'pill-crit' : 'pill-neutral';
}

/**
 * One version of an asset, opened from its Versions table (owner 2026-11-02: "there is no option to check the old version
 * of the previous stamp"): the picture as it prints, its file, who uploaded it and when, who approved or rejected it, when
 * and why, which templates pin it, and the file at full size. Any version -- waiting, current, replaced or rejected.
 */
@Component({
  selector: 'app-rs-asset-version-panel',
  imports: [SidePanel, Icon, AssetPicture, RsTimePipe, RouterLink],
  template: `
    <app-side-panel [heading]="data.asset.name + ' · v' + v.version" [subtitle]="stateWord(v)">
      <div class="flex flex-col gap-4">
        <div class="rsa-hero rsa-hero-white">
          <app-rs-asset-picture [assetId]="data.asset.assetId" [version]="v.version"
                                [alt]="data.asset.name + ', version ' + v.version" maxHeight="16rem" />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="pill" [class]="stateTone(v)" data-test="version-state">{{ stateWord(v) }}</span>
          @if (current() && current()!.version !== v.version && v.state !== 'REJECTED') {
            <span class="text-xs text-[color:var(--text-muted)]">v{{ current()!.version }} is the version in use now.</span>
          }
        </div>
        @if (v.state === 'PENDING') {
          <p class="text-sm">Waiting for an approver. Until it is approved, reports keep using
            @if (current()) { v{{ current()!.version }}. } @else { nothing: the asset has no approved version yet. }
            The person who uploaded it cannot approve it.</p>
        } @else if (v.state === 'REJECTED') {
          <p class="text-sm">Rejected: it was never used in a report.</p>
        }
        <dl class="rs-kv">
          <dt>File</dt><dd class="mono text-xs">{{ v.originalName || '—' }}</dd>
          <dt>Size</dt><dd>{{ v.width }} × {{ v.height }} px · {{ size(v.bytes) }} · {{ v.alpha ? 'transparent PNG' : (v.contentType === 'image/png' ? 'PNG' : 'JPEG') }}</dd>
          <dt>Uploaded</dt><dd>{{ v.uploadedByName || '—' }} · {{ v.uploadedAt | rsTime: 'recent' }}</dd>
          <dt>{{ v.state === 'REJECTED' ? 'Rejected' : 'Approved' }}</dt>
          <dd>@if (v.state === 'PENDING') { Not yet } @else if (!v.reviewRequired) { Usable on upload }
              @else { {{ v.reviewedByName || '—' }}@if (v.reviewedAt) { · {{ v.reviewedAt | rsTime: 'recent' }} } }
              @if (v.reviewNote) { <div class="text-xs text-[color:var(--text-muted)]">{{ v.reviewNote }}</div> }</dd>
          <dt>Pinned by</dt>
          <dd>@for (u of pinnedHere(); track u.templateId + ':' + u.templateVersion) {
                <a class="link-inline" [routerLink]="['/reports/templates', u.templateId]">{{ u.name }} · v{{ u.templateVersion }}</a>@if (!$last) {, }
              } @empty { <span class="text-[color:var(--text-muted)]">No template pins this version.</span> }</dd>
        </dl>
      </div>
      <div foot class="flex items-center justify-end gap-2">
        <button type="button" class="btn btn-default btn-sm" (click)="fullSize()"><app-icon name="external" />View full size</button>
      </div>
    </app-side-panel>
  `,
  styleUrl: './assets.css',
})
export class AssetVersionPanel {
  readonly data = inject<AssetVersionData>(DIALOG_DATA);
  private readonly api = inject(ReportStudioApi);
  private readonly toast = inject(ToastService);
  readonly v = this.data.version;
  readonly stateWord = versionStateWord;
  readonly stateTone = versionStateTone;
  readonly current = computed(() => this.data.asset.versions.find(x => x.version === this.data.asset.currentVersion) ?? null);
  /** The templates that print this very version on purpose (the rest follow the latest approved version). */
  readonly pinnedHere = computed(() => this.data.asset.usage.filter(u => u.kind === 'TEMPLATE' && u.pinned && u.assetVersion === this.v.version));

  size(bytes?: number | null): string {
    if (!bytes && bytes !== 0) return '—';
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
  }

  fullSize(): void {
    this.api.assetFile(this.data.asset.assetId, this.v.version).subscribe({
      next: blob => { const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60_000); },
      error: e => this.toast.error(studioError(e).message),
    });
  }
}

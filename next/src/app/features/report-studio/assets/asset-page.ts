import { codeWords } from '../../../shared/ui/plain-words';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { of, switchMap } from 'rxjs';
import { PageHeader } from '../../../shared/ui/page-header';
import { Icon } from '../../../shared/ui/icon';
import { LoadError } from '../../../shared/ui/load-error';
import { RsTimePipe } from '../rs-time.pipe';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { AuthService } from '../../../core/auth/auth.service';
import { ReportStudioApi, studioError } from '../report-studio.api';
import { TemplateDefinition, TemplateRow } from '../report-studio.model';
import { AssetCard, AssetDetail, KIND_WORDS, Person, stateTone, stateWord, typeOf } from '../assets.model';
import { RsPickSearch } from '../pick-search';
import { AssetPicture } from './asset-picture';
import { UploadData, UploadPanel } from './upload-panel';

/**
 * One asset (MIG-406, the owner-approved screen 10, Figma frame 10; page report-assets, or report-approve for the
 * approver it belongs to): for a signature, the two parts -- the picture, and the digital signature its owner's approvals
 * put on a PDF; the current approved version; every version (the uploader is never its approver, a CHECK in the table);
 * where it is used; who may place, replace and approve it, and its grants; the digital signature (signs as, when, the
 * certificate, when last used); placing it on a template's draft; and its activity.
 */
@Component({
  selector: 'app-asset-page',
  imports: [PageHeader, Icon, LoadError, RsTimePipe, FormsModule, RouterLink, AssetPicture, RsPickSearch],
  templateUrl: './asset-page.html',
  styleUrl: './assets.css',
})
export class AssetPage implements OnInit {
  readonly assetId = input.required<string>();
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly a = signal<AssetDetail | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly people = signal<Person[]>([]);
  readonly templates = signal<TemplateRow[]>([]);
  readonly stamps = signal<AssetCard[]>([]);
  /** How many templates and stamps the pickers' searches match in all (the selects hold 200 at most). */
  readonly templatesTotal = signal(0);
  readonly stampsTotal = signal(0);
  readonly grantTo = signal<number | null>(null);
  readonly grantTemplate = signal<string>('');
  // Placement on a template (the design's optional section).
  readonly placeTemplate = signal('');
  readonly placeVersion = signal<number | null>(null);
  readonly placeAt = signal<'end' | 'inline'>('end');
  readonly placeWidth = signal('40mm');
  readonly placeAlign = signal<'left' | 'center' | 'right'>('left');
  /** Drawing 10's one "Width · alignment" choice: "40 mm · left". */
  /** The activity's every entry (drawing 10's "Full audit"), not only the latest eight. */
  readonly fullAudit = signal(false);
  readonly aligns = [{ value: 'left', label: 'left' }, { value: 'center', label: 'centre' }, { value: 'right', label: 'right' }];
  readonly placeStamp = signal('');
  readonly kindWords = KIND_WORDS;
  readonly stateWord = stateWord;
  readonly stateTone = stateTone;
  readonly typeOf = typeOf;

  readonly canLibrary = computed(() => this.auth.canOpen('report-assets') && !this.auth.isPlatformAdmin());
  readonly canCustodian = computed(() => this.auth.canOpen('report-asset-custodian') && !this.auth.isPlatformAdmin());
  readonly canApprove = computed(() => this.auth.canOpen('report-approve') && !this.auth.isPlatformAdmin());
  readonly canTemplates = computed(() => this.auth.canOpen('report-templates') && !this.auth.isPlatformAdmin());
  readonly canManage = computed(() => { const a = this.a(); return !!a && (a.restricted ? this.canCustodian() : this.canLibrary()); });
  readonly current = computed(() => { const a = this.a(); return a?.versions.find(v => v.version === a.currentVersion) ?? null; });
  readonly pending = computed(() => this.a()?.versions.find(v => v.state === 'PENDING') ?? null);
  readonly approvedVersions = computed(() => (this.a()?.versions ?? []).filter(v => v.state === 'APPROVED' || v.state === 'SUPERSEDED'));
  readonly ownerWord = computed(() => this.a()?.ownerName ?? 'its owner');
  readonly reviewOf = (v: { reviewedByName?: string | null; reviewedAt?: string | null; state: string; reviewRequired: boolean }) =>
    v.state === 'PENDING' ? 'Waiting for an approver' : !v.reviewRequired ? 'Usable on upload' : v.reviewedByName ?? '—';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.error.set('');
    this.api.asset(this.assetId()).subscribe({
      next: a => {
        this.a.set(a);
        this.placeVersion.set(a.currentVersion ?? null);
        if (a.you.mayGrant && !this.people().length) this.api.people().subscribe({ next: p => this.people.set(p), error: () => { /* none to pick */ } });
        if (a.restricted && this.canTemplates() && a.you.mayPlace && !this.templates().length) {
          this.findTemplates('');
          this.findStamps('');
        }
      },
      error: e => this.error.set(studioError(e, 'The asset could not be read.').message),
    });
  }

  /** The placement's template picker, searched on the service (the first 200 and how many match; the picked one kept). */
  findTemplates(q: string): void {
    this.api.list({ q, limit: 200 }).subscribe({
      next: l => {
        const picked = this.templates().find(t => t.templateId === this.placeTemplate());
        this.templates.set([...(picked && !l.templates.some(t => t.templateId === picked.templateId) ? [picked] : []), ...l.templates]);
        this.templatesTotal.set(l.total);
      },
      error: () => { /* none to pick */ },
    });
  }

  /** The placement's stamp picker: the stamps this person may place, searched on the service. */
  findStamps(q: string): void {
    this.api.usable(null, { q, kinds: ['STAMP'] }).subscribe({
      next: u => {
        const picked = this.stamps().find(x => x.assetId === this.placeStamp());
        const found = u.assets.filter(x => x.mayPlace);
        this.stamps.set([...(picked && !found.some(x => x.assetId === picked.assetId) ? [picked] : []), ...found]);
        this.stampsTotal.set(u.total);
      },
      error: () => { /* none to pick */ },
    });
  }

  size(bytes?: number | null): string {
    if (!bytes && bytes !== 0) return '—';
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
  }

  fullSize(): void {
    const a = this.a();
    if (!a) return;
    this.api.assetFile(a.assetId, a.currentVersion ?? null).subscribe({
      next: blob => { const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60_000); },
      error: e => this.toast.error(studioError(e).message),
    });
  }

  newVersion(): void {
    const a = this.a();
    if (!a) return;
    this.dialog.open<AssetDetail | undefined, UploadData>(UploadPanel, sidePanelConfig<UploadData>({
      assetId: a.assetId, assetName: a.name, kind: a.kind, custodian: this.canCustodian(), library: this.canLibrary(),
    })).closed.subscribe(next => {
      if (next) { this.a.set(next); this.toast.success(next.restricted ? 'New version uploaded; it waits for an approver.' : 'New version uploaded.'); }
    });
  }

  review(version: number, approve: boolean): void {
    this.busy.set(true);
    this.api.reviewAsset(this.assetId(), version, approve).subscribe({
      next: a => { this.busy.set(false); this.a.set(a); this.toast.success(approve ? `v${version} approved: it is the version in use now.` : `v${version} rejected.`); },
      error: e => { this.busy.set(false); this.toast.error(studioError(e).message); },
    });
  }

  grant(): void {
    const to = this.grantTo();
    if (!to) return;
    this.api.grant(this.assetId(), to, this.grantTemplate() || null).subscribe({
      next: a => { this.a.set(a); this.grantTo.set(null); this.grantTemplate.set(''); this.toast.success('Use granted.'); },
      error: e => this.toast.error(studioError(e).message),
    });
  }

  revoke(grantId: string): void {
    this.api.revokeGrant(grantId).subscribe({
      next: a => { this.a.set(a); this.toast.success('Grant ended.'); },
      error: e => this.toast.error(studioError(e).message),
    });
  }

  async retire(): Promise<void> {
    const a = this.a();
    if (!a) return;
    const ok = await confirmWith(this.dialog, { title: `Retire ${a.name}?`, confirmLabel: 'Retire', danger: true,
      body: 'It cannot be added to a template any more. Templates that have it keep printing their version, and old reports and the audit stay.' });
    if (!ok) return;
    this.api.retireAsset(a.assetId, a.restricted).subscribe({
      next: next => { this.a.set(next); this.toast.success(`${a.name} retired.`); },
      error: e => this.toast.error(studioError(e).message),
    });
  }

  async remove(): Promise<void> {
    const a = this.a();
    if (!a) return;
    const ok = await confirmWith(this.dialog, { title: `Delete ${a.name}?`, confirmLabel: 'Delete', danger: true,
      body: 'Nothing has used it, so it goes with its pictures. This cannot be undone.' });
    if (!ok) return;
    this.api.deleteAsset(a.assetId).subscribe({
      next: () => { this.toast.success(`${a.name} deleted.`); void this.router.navigate(['/reports/assets']); },
      error: e => this.toast.error(studioError(e).message),
    });
  }

  /**
   * Places the signature (and a stamp) on a template's draft: its asset entries pinned to the version picked, and a
   * signature block -- at the end of the report, kept together, or after the last block where it can be moved. A template
   * with no draft gets one from its newest published version. The server checks again that this person may place it.
   */
  place(): void {
    const a = this.a();
    const templateId = this.placeTemplate();
    if (!a || !templateId) return;
    this.busy.set(true);
    this.api.template(templateId).pipe(
      switchMap(t => (t.draft ? of(t) : t.currentPublishedVersion ? this.api.newDraft(templateId, t.currentPublishedVersion) : of(t))),
      switchMap(t => {
        const draft = t.draft;
        if (!draft?.definition) throw new Error('The template has no draft to place it on.');
        const def = JSON.parse(JSON.stringify(draft.definition)) as TemplateDefinition;
        const tpl = def.template as Record<string, unknown> & { assets?: Record<string, unknown>[]; components?: Record<string, unknown>[] };
        const assets = tpl.assets ?? [];
        const sigId = `sig-${a.assetNo}`;
        const assetsKept = assets.filter(x => x['id'] !== sigId && x['id'] !== `stamp-${this.placeStamp().slice(-6)}`);
        assetsKept.push({ id: sigId, purpose: a.kind === 'STAMP' ? 'stamp' : 'signature', assetRef: a.assetId, ...(this.placeVersion() ? { version: this.placeVersion() } : {}) });
        const stamp = this.stamps().find(s => s.assetId === this.placeStamp());
        const stampId = stamp ? `stamp-${stamp.assetNo}` : null;
        if (stamp && stampId && a.kind === 'SIGNATURE') assetsKept.push({ id: stampId, purpose: 'stamp', assetRef: stamp.assetId });
        tpl.assets = assetsKept;
        const components = (tpl.components ?? []).filter(c => c['id'] !== `place-${a.assetNo}`);
        const block: Record<string, unknown> = { id: `place-${a.assetNo}`, type: a.kind === 'STAMP' ? 'stamp' : 'signature', assetRef: sigId,
          width: this.placeWidth(), align: this.placeAlign(), placement: this.placeAt() };
        if (a.kind === 'SIGNATURE') block['caption'] = a.ownerName ? `${a.ownerName}${a.ownerTitle ? ' · ' + a.ownerTitle : ''}` : a.name;
        if (stampId && a.kind === 'SIGNATURE') block['stampRef'] = stampId;
        const footerAt = components.findIndex(c => c['type'] === 'section' && c['role'] === 'footer');
        components.splice(footerAt >= 0 ? footerAt : components.length, 0, block);
        tpl.components = components;
        return this.api.saveDraft(templateId, draft.revision, def);
      }),
    ).subscribe({
      next: t => { this.busy.set(false); this.toast.success(`Placed on ${t.name}'s draft v${t.draft?.version}. Open the designer to move it.`); this.load(); },
      error: e => { this.busy.set(false); this.toast.error(e instanceof Error && !('status' in e) ? e.message : studioError(e).message); },
    });
  }

  activityWord(action: string): string {
    const words: Record<string, string> = {
      'asset.uploaded': 'Uploaded', 'asset.version.uploaded': 'New version uploaded', 'asset.approved': 'Version approved', 'asset.rejected': 'Version rejected',
      'asset.retired': 'Retired', 'asset.renamed': 'Details changed', 'grant.added': 'Use granted', 'grant.revoked': 'Grant ended', 'asset.placed': 'Placed on a template',
      'asset.deleted': 'Deleted',
    };
    // Owner 2026-10-27: an action with no words yet reads as words ("asset.foo.bar": "Foo bar"), never its code.
    return words[action] ?? codeWords(action.replace(/^asset\./, ''));
  }

  detailOf(d: Record<string, unknown>): string {
    const out: string[] = [];
    if (d['version']) out.push(`v${d['version']}`);
    if (d['pending']) out.push('waiting for approval');
    if (d['note']) out.push(String(d['note']));
    return out.join(' · ');
  }
}

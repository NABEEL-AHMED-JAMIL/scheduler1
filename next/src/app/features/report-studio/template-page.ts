import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { Icon } from '../../shared/ui/icon';
import { RsTimePipe } from './rs-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { LoadError } from '../../shared/ui/load-error';
import { confirmWith } from '../../shared/ui/confirm';
import { sidePanelConfig } from '../../shared/ui/side-panel';
import { AuthService } from '../../core/auth/auth.service';
import { ReportStudioApi, studioError } from './report-studio.api';
import { ProblemList } from './problem-list';
import { Problem, SampleRow, TemplateDetail, TemplateDefinition, VersionRow, originWord, size } from './report-studio.model';
import { NewTemplateData, NewTemplatePanel, PublishData, PublishPanel } from './template-panels';
import { TestPanel, TestPanelData } from './test-panel';
import { downloadJson } from './report-files';

interface ContractField { path: string; type: string; required?: boolean; label?: string; }

/**
 * One template (MIG-403): its draft and versions, its test samples and its data contract. The draft is edited in the
 * visual designer (MIG-404, /design) or here as its JSON, checked by the server's schema on every save, and tested with any data
 * before anything is published. Publishing (report-publish) freezes the draft as the next version; "New draft" starts
 * one from any version; "Make a copy" is a new template with its own history.
 */
/** What deleting a template does, said the same on the list and on the template (owner 2026-10-20). */
export const TEMPLATE_DELETE_WORDS = 'Its versions, drafts and test samples are deleted for good. A template a report was made from cannot be '
  + 'deleted, because every report keeps the exact template it came from: archive it instead.';

@Component({
  selector: 'app-report-template-page',
  imports: [PageHeader, RefreshButton, Icon, RsTimePipe, LoadError, ProblemList, FormsModule, CdkMenu, CdkMenuItem,
    CdkMenuTrigger, RouterLink],
  templateUrl: './template-page.html',
})
export class ReportTemplatePage implements OnInit {
  readonly templateId = input.required<string>();
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly t = signal<TemplateDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly text = signal('');
  readonly dirty = signal(false);
  readonly busy = signal(false);
  readonly problems = signal<Problem[]>([]);
  readonly checked = signal(false);
  readonly saveError = signal('');
  readonly originWord = originWord;
  readonly size = size;

  readonly canEdit = computed(() => this.auth.canOpen('report-templates') && !this.auth.isPlatformAdmin() && this.t()?.status !== 'ARCHIVED');
  /** Owner 2026-10-20: Delete is on the template's own page too, archived or not; the server refuses one a report was made from. */
  readonly canDelete = computed(() => this.auth.canOpen('report-templates') && !this.auth.isPlatformAdmin() && !!this.t());
  readonly canPublish = computed(() => this.auth.canOpen('report-publish') && !this.auth.isPlatformAdmin());
  readonly canGenerate = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin());
  readonly shown = computed<VersionRow | undefined>(() => this.t()?.draft ?? this.t()?.published);
  readonly contract = computed<ContractField[]>(() => {
    const def = this.shown()?.definition?.template as { dataContract?: { fields?: ContractField[] } } | undefined;
    return def?.dataContract?.fields ?? [];
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.template(this.templateId()).subscribe({
      next: t => {
        this.t.set(t);
        this.loading.set(false);
        const def = (t.draft ?? t.published)?.definition;
        this.text.set(def ? JSON.stringify(def, null, 2) : '');
        this.dirty.set(false);
        this.checked.set(false);
      },
      error: e => { this.error.set(studioError(e, 'The template could not be read.').message); this.loading.set(false); },
    });
  }

  edited(value: string): void {
    this.text.set(value);
    this.dirty.set(true);
    this.checked.set(false);
  }

  private parsed(): TemplateDefinition | null {
    try {
      return JSON.parse(this.text()) as TemplateDefinition;
    } catch (e) {
      this.saveError.set(`That is not valid JSON: ${(e as Error).message}`);
      return null;
    }
  }

  validate(): void {
    const definition = this.parsed();
    if (!definition) return;
    this.saveError.set('');
    this.busy.set(true);
    this.api.validate({ definition }).subscribe({
      next: r => { this.busy.set(false); this.problems.set(r.problems); this.checked.set(true); },
      error: e => { this.busy.set(false); this.saveError.set(studioError(e).message); },
    });
  }

  save(): void {
    const t = this.t();
    const definition = this.parsed();
    if (!t || !definition) return;
    this.saveError.set('');
    this.busy.set(true);
    this.api.saveDraft(t.templateId, t.draft?.revision ?? 0, definition).subscribe({
      next: saved => {
        this.busy.set(false);
        this.toast.success(`Draft saved (revision ${saved.draft?.revision ?? 1}).`);
        this.t.set(saved);
        this.text.set(JSON.stringify(saved.draft?.definition ?? definition, null, 2));
        this.dirty.set(false);
      },
      error: e => {
        this.busy.set(false);
        const err = studioError(e, 'The draft could not be saved.');
        this.saveError.set(err.message);
        this.problems.set(err.problems);
        this.checked.set(!!err.problems.length);
      },
    });
  }

  test(version: string | null = null, unsaved = false): void {
    const t = this.t();
    if (!t) return;
    const definition = unsaved ? this.parsed() : null;
    if (unsaved && !definition) return;
    this.dialog.open<boolean, TestPanelData>(TestPanel, sidePanelConfig<TestPanelData>({
      templateId: t.templateId, title: t.name + (version ? ` v${version}` : ''), version, definition, samples: t.samples,
      canKeep: this.canEdit(),
    }, 'wide', 'right')).closed.subscribe(kept => { if (kept) this.load(); });
  }

  publish(): void {
    const t = this.t();
    if (!t?.draft) return;
    if (this.dirty()) {
      this.toast.info('Save the draft first: publishing freezes what is saved.');
      return;
    }
    this.dialog.open<TemplateDetail | undefined, PublishData>(PublishPanel, sidePanelConfig<PublishData>({
      templateId: t.templateId, name: t.name, version: t.draft.version, revision: t.draft.revision,
    }, 'narrow', 'right')).closed.subscribe(done => {
      if (done) { this.toast.success(`${t.name} v${t.draft!.version} published.`); this.load(); }
    });
  }

  newDraft(from: number): void {
    const t = this.t();
    if (!t) return;
    this.api.newDraft(t.templateId, from).subscribe({
      next: () => { this.toast.success(`A new draft from v${from}.`); this.load(); },
      error: e => this.toast.error(studioError(e).message),
    });
  }

  discard(): void {
    const t = this.t();
    if (!t) return;
    void confirmWith(this.dialog, { title: 'Discard the draft?', body: `The published v${t.currentPublishedVersion} stays as it is.`,
      confirmLabel: 'Discard', danger: true }).then(ok => {
      if (!ok) return;
      this.api.discardDraft(t.templateId).subscribe({ next: () => this.load(), error: e => this.toast.error(studioError(e).message) });
    });
  }

  copy(version: number | null): void {
    const t = this.t();
    if (!t) return;
    this.dialog.open<TemplateDetail | undefined, NewTemplateData>(NewTemplatePanel, sidePanelConfig<NewTemplateData>({
      copyOf: { templateId: t.templateId, name: t.name, version: version === null ? null : String(version) },
    }, 'narrow', 'right')).closed.subscribe(made => { if (made) void this.router.navigate(['/reports/templates', made.templateId]); });
  }

  exportJson(version: string): void {
    const t = this.t();
    if (!t) return;
    this.api.exportJson(t.templateId, version).subscribe({
      next: doc => downloadJson(doc, `${t.name}${version === 'draft' ? '.draft' : '.v' + version}.template.json`),
      error: e => this.toast.error(studioError(e).message),
    });
  }

  removeSample(s: SampleRow): void {
    void confirmWith(this.dialog, { title: `Delete the test sample "${s.name}"?`, body: 'Reports made with it keep their own copy of the data.',
      confirmLabel: 'Delete', danger: true }).then(ok => {
      if (!ok) return;
      this.api.deleteSample(s.sampleId).subscribe({ next: () => this.load(), error: e => this.toast.error(studioError(e).message) });
    });
  }

  remove(): void {
    const t = this.t();
    if (!t) return;
    void confirmWith(this.dialog, { title: `Delete ${t.name}?`, body: TEMPLATE_DELETE_WORDS, confirmLabel: 'Delete', danger: true }).then(ok => {
      if (!ok) return;
      this.api.remove(t.templateId).subscribe({
        next: () => { this.toast.success(`${t.name} deleted.`); void this.router.navigate(['/reports/templates']); },
        error: e => this.toast.error(studioError(e).message),
      });
    });
  }

  archive(): void {
    const t = this.t();
    if (!t) return;
    void confirmWith(this.dialog, { title: `Archive ${t.name}?`, body: 'No new report can be made from it. Its versions and reports are kept.',
      confirmLabel: 'Archive' }).then(ok => {
      if (!ok) return;
      this.api.archive(t.templateId).subscribe({ next: () => this.load(), error: e => this.toast.error(studioError(e).message) });
    });
  }
}

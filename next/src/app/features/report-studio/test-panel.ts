import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SidePanel } from '../../shared/ui/side-panel';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast.service';
import { PdfViewer } from '../objects/preview/pdf-viewer';
import { ReportStudioApi, studioError } from './report-studio.api';
import { ProblemList } from './problem-list';
import { Problem, SampleRow, SourceRef, TemplateDefinition, keepable } from './report-studio.model';
import { ReportSourcePicker } from './source-picker';

export interface TestPanelData {
  templateId: string;
  title: string;
  /** "draft", a version number, or null for the draft when there is one, else the newest published version. */
  version?: string | null;
  /** Unsaved JSON the reader is editing, tested as it stands. */
  definition?: TemplateDefinition | null;
  samples: SampleRow[];
  /** Whether the reader may save a test sample with the template (report-templates). */
  canKeep: boolean;
}

/**
 * "Test with data" (the owner's 2026-10-19 rule, phase 1): the template -- its draft, a version, or unsaved JSON -- filled
 * with pasted JSON, a pipeline run's output, an upload or a saved test sample, checked and drawn at once, as HTML (in a
 * sandboxed frame that runs nothing) or as the PDF. Nothing is published and nothing is stored; "Keep as a test sample"
 * saves the data with the template, by name, only when the reader asks.
 */
@Component({
  selector: 'app-report-test-panel',
  imports: [SidePanel, Icon, FormsModule, ReportSourcePicker, ProblemList, PdfViewer],
  template: `
    <app-side-panel [heading]="'Test with data: ' + data.title"
                    subtitle="Fill the template with data and check it. Nothing is published or stored.">
      <div class="flex flex-col gap-5">
        <section class="flex flex-col gap-3" aria-labelledby="rsTestData">
          <h3 id="rsTestData" class="text-sm font-semibold">Data</h3>
          <app-report-source-picker [samples]="data.samples" [(source)]="source" />
          <label class="field">
            <span class="label">Report data starts at</span>
            <input class="input mono max-w-80" [ngModel]="rootPath()" (ngModelChange)="rootPath.set($event)" aria-label="Root path"
                   placeholder="$" />
            <span class="block field-note text-[color:var(--text-muted)]">A JSON path such as $.data.quality; the template's paths start there.</span>
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="btn btn-primary btn-sm" [disabled]="busy() || !source()" (click)="check()">
              <app-icon name="check" />Check and show
            </button>
            <button type="button" class="btn btn-default btn-sm" [disabled]="busy() || !source()" (click)="pdf()">
              <app-icon name="file" />Show the PDF
            </button>
            <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="structure()">
              <app-icon name="eye" />Without data
            </button>
            @if (busy()) { <span class="spinner" role="status" aria-label="Working"></span> }
          </div>
          @if (error()) { <p class="field-note text-[color:var(--crit-text)]" role="alert">{{ error() }}</p> }
        </section>

        @if (checked()) {
          <section class="flex flex-col gap-2" aria-labelledby="rsTestChecks">
            <div class="flex flex-wrap items-center gap-2">
              <h3 id="rsTestChecks" class="text-sm font-semibold mr-auto">Checks</h3>
              @if (label()) { <span class="text-xs text-[color:var(--text-muted)]">{{ label() }} · {{ records() }} record{{ records() === 1 ? '' : 's' }}</span> }
            </div>
            <app-report-problems [problems]="problems()" />
          </section>
        }

        @if (html()) {
          <section class="flex flex-col gap-2" aria-label="Preview">
            <iframe class="rs-preview-frame" title="Report preview" sandbox="" [srcdoc]="html()"></iframe>
            <p class="text-xs text-[color:var(--text-muted)]">A preview prints at most 200 rows a table; "—" marks a value the data does not have.</p>
          </section>
        }
        @if (pdfUrl(); as src) {
          <section class="rs-preview-pdf" aria-label="PDF preview"><app-pdf-viewer [src]="src" /></section>
        }

        @if (data.canKeep && checked() && keepable(source())) {
          <section class="flex flex-col gap-2 border-t pt-4 border-subtle" aria-labelledby="rsKeep">
            <h3 id="rsKeep" class="text-sm font-semibold">Keep this data with the template</h3>
            <p class="text-xs text-[color:var(--text-muted)]">
              @if (source()!.connector === 'INLINE_JSON') { The pasted data is stored with the template under this name, for the next test. }
              @else if (source()!.connector === 'BUNDLE') { The files are read now, as you, and stored with the template as one document under this name. }
              @else { The template remembers the run's output and reads it again, as whoever tests, each time. }
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <input class="input max-w-64" [ngModel]="sampleName()" (ngModelChange)="sampleName.set($event)" aria-label="Sample name"
                     placeholder="September, all sites" />
              <button type="button" class="btn btn-default btn-sm" [disabled]="busy() || !sampleName().trim()" (click)="keep()">
                <app-icon name="save" />Keep as a test sample
              </button>
            </div>
          </section>
        }
      </div>
      <div foot class="flex justify-end">
        <button type="button" class="btn btn-default btn-sm" (click)="close()">Close</button>
      </div>
    </app-side-panel>
  `,
  styles: `
    .rs-preview-frame { width: 100%; height: 34rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-sunken); }
    .rs-preview-pdf { height: 36rem; display: flex; flex-direction: column; }
  `,
})
export class TestPanel {
  readonly data = inject<TestPanelData>(DIALOG_DATA);
  private readonly api = inject(ReportStudioApi);
  private readonly toast = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly dialogRef = inject<DialogRef<boolean>>(DialogRef);

  readonly source = signal<SourceRef | null>(null);
  readonly keepable = keepable;
  readonly rootPath = signal('$');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly problems = signal<Problem[]>([]);
  readonly checked = signal(false);
  readonly records = signal(0);
  readonly label = signal('');
  readonly htmlText = signal('');
  readonly pdfUrl = signal<string | null>(null);
  readonly sampleName = signal('');
  readonly html = computed<SafeHtml | null>(() => this.htmlText() ? this.sanitizer.bypassSecurityTrustHtml(this.htmlText()) : null);
  /** Saved samples, as the panel's closing value: the page reloads the template when one was kept. */
  private kept = false;
  private readonly ref = inject(DestroyRef);

  constructor() {
    this.ref.onDestroy(() => this.dropPdf());
  }

  private body(withSource: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = this.data.definition ? { definition: this.data.definition }
      : { templateId: this.data.templateId, ...(this.data.version ? { version: this.data.version } : {}) };
    if (withSource && this.source()) {
      body['source'] = this.source();
      body['rootPath'] = this.rootPath().trim() || '$';
    }
    return body;
  }

  check(): void {
    this.run(true);
  }

  structure(): void {
    this.run(false);
  }

  private run(withSource: boolean): void {
    this.busy.set(true);
    this.error.set('');
    this.dropPdf();
    this.api.previewHtml(this.body(withSource)).subscribe({
      next: r => {
        this.busy.set(false);
        this.checked.set(true);
        this.problems.set(r.problems ?? []);
        this.records.set(r.records ?? 0);
        this.label.set(withSource ? (r.label ?? '') : 'No data: the template\'s paths are shown');
        this.htmlText.set(r.html ?? '');
      },
      error: e => this.fail(e),
    });
  }

  pdf(): void {
    this.busy.set(true);
    this.error.set('');
    this.htmlText.set('');
    this.dropPdf();
    this.api.previewPdf(this.body(true)).subscribe({
      next: response => {
        this.busy.set(false);
        const blob = response.body;
        if (!blob || !(response.headers.get('Content-Type') ?? '').includes('pdf')) {
          // The template does not pass its schema: the answer is its problems, as JSON.
          blob?.text().then(text => {
            try {
              const parsed = JSON.parse(text) as { data?: { problems?: Problem[] } };
              this.problems.set(parsed.data?.problems ?? []);
              this.checked.set(true);
            } catch {
              this.error.set('The PDF could not be made.');
            }
          });
          return;
        }
        this.checked.set(true);
        const errors = Number(response.headers.get('X-Report-Errors') ?? 0);
        const warnings = Number(response.headers.get('X-Report-Warnings') ?? 0);
        this.problems.set([]);
        this.label.set(`${response.headers.get('X-Report-Pages') ?? '?'} page PDF · ${errors} error${errors === 1 ? '' : 's'}, `
          + `${warnings} warning${warnings === 1 ? '' : 's'} (Check and show lists them)`);
        this.pdfUrl.set(URL.createObjectURL(blob));
      },
      error: e => {
        // A refusal arrives as a Blob too: read its envelope for the sentence.
        const raw = (e as { error?: unknown })?.error;
        if (raw instanceof Blob) {
          raw.text().then(text => {
            try { this.fail({ error: JSON.parse(text) }); } catch { this.fail(e); }
          });
        } else {
          this.fail(e);
        }
      },
    });
  }

  keep(): void {
    const source = this.source();
    if (!source) return;
    this.busy.set(true);
    this.api.saveSample(this.data.templateId, this.sampleName().trim(), source).subscribe({
      next: () => {
        this.busy.set(false);
        this.kept = true;
        this.toast.success(`Test sample "${this.sampleName().trim()}" kept with the template.`);
        this.sampleName.set('');
      },
      error: e => this.fail(e),
    });
  }

  close(): void {
    this.dialogRef.close(this.kept);
  }

  private fail(e: unknown): void {
    this.busy.set(false);
    const err = studioError(e, 'The preview could not be made.');
    this.error.set(err.message);
    if (err.problems.length) {
      this.problems.set(err.problems);
      this.checked.set(true);
    }
  }

  private dropPdf(): void {
    const url = this.pdfUrl();
    if (url) URL.revokeObjectURL(url);
    this.pdfUrl.set(null);
  }
}

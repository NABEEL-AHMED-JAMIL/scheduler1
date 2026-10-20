import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { ToastService } from '../../../shared/ui/toast.service';
import { ReportStudioApi, studioError } from '../report-studio.api';
import { SampleRow, SourceRef } from '../report-studio.model';
import { ReportSourcePicker, SourceMode } from '../source-picker';

export interface TestDataData {
  templateId: string;
  samples: SampleRow[];
  rootPath: string;
  /** Whether the reader may keep the data with the template (an editable draft). */
  canKeep: boolean;
}

/** The data the canvas is drawn with, as the panel hands it back. */
export interface TestDataChoice { source: SourceRef | null; rootPath: string; kept?: boolean; }

/**
 * The designer's test data (the owner's 2026-10-19 requirement, MIG-404): paste JSON, pick a pipeline run's output, an
 * upload, or one of the template's saved test samples, and the canvas fills with it at once. Nothing is stored unless the
 * reader keeps it as a named test sample; "No test data" draws the template with its paths showing.
 */
@Component({
  selector: 'app-rs-test-data-panel',
  imports: [SidePanel, Icon, FormsModule, ReportSourcePicker],
  template: `
    <app-side-panel heading="Test data" subtitle="Fill the canvas with real or pasted data. Nothing is published or stored unless you keep it.">
      <div class="flex flex-col gap-4">
        <app-report-source-picker [samples]="data.samples" [(source)]="source" [(mode)]="mode" />
        <label class="field">
          <span class="label">Report data starts at</span>
          <input class="input mono max-w-80" [ngModel]="rootPath()" (ngModelChange)="rootPath.set($event)" aria-label="Root path" placeholder="$" />
          <span class="block field-note text-[color:var(--text-muted)]">The template's paths are read from here ($ is the whole document).</span>
        </label>
        @if (data.canKeep && source() && source()!.connector !== 'SAMPLE') {
          <section class="flex flex-col gap-2 border-t pt-4 border-subtle" aria-labelledby="rsdKeep">
            <h3 id="rsdKeep" class="text-sm font-semibold">Keep it with the template</h3>
            <div class="flex flex-wrap items-center gap-2">
              <input class="input max-w-64" [ngModel]="name()" (ngModelChange)="name.set($event)" aria-label="Sample name" placeholder="September, all sites" />
              <button type="button" class="btn btn-default btn-sm" [disabled]="busy() || !name().trim()" (click)="keep()"><app-icon name="save" />Keep as a test sample</button>
            </div>
          </section>
        }
        @if (error()) { <p class="field-note text-[color:var(--crit-text)]" role="alert">{{ error() }}</p> }
      </div>
      <div foot class="flex justify-between gap-2">
        <button type="button" class="btn btn-ghost btn-sm" (click)="clear()">No test data</button>
        <div class="flex gap-2">
          <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm" [disabled]="!source()" (click)="use()"><app-icon name="check" />Fill the canvas</button>
        </div>
      </div>
    </app-side-panel>
  `,
})
export class TestDataPanel {
  readonly data = inject<TestDataData>(DIALOG_DATA);
  readonly ref = inject<DialogRef<TestDataChoice>>(DialogRef);
  private readonly api = inject(ReportStudioApi);
  private readonly toast = inject(ToastService);

  readonly source = signal<SourceRef | null>(null);
  readonly mode = signal<SourceMode>(this.data.samples.length ? 'sample' : 'paste');
  readonly rootPath = signal(this.data.rootPath || '$');
  readonly name = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  private kept = false;

  use(): void {
    this.ref.close({ source: this.source(), rootPath: this.rootPath().trim() || '$', kept: this.kept });
  }

  clear(): void {
    this.ref.close({ source: null, rootPath: this.rootPath().trim() || '$', kept: this.kept });
  }

  keep(): void {
    const source = this.source();
    if (!source) return;
    this.busy.set(true);
    this.error.set('');
    this.api.saveSample(this.data.templateId, this.name().trim(), source).subscribe({
      next: () => {
        this.busy.set(false);
        this.kept = true;
        this.toast.success(`Test sample "${this.name().trim()}" kept with the template.`);
        this.name.set('');
      },
      error: e => { this.busy.set(false); this.error.set(studioError(e, 'The sample could not be kept.').message); },
    });
  }
}

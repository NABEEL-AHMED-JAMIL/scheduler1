import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormsModule } from '@angular/forms';
import { SidePanel } from '../../shared/ui/side-panel';
import { Icon } from '../../shared/ui/icon';
import { FileDropzone } from '../../shared/ui/file-dropzone';
import { ReportStudioApi, studioError } from './report-studio.api';
import { ProblemList } from './problem-list';
import { Problem, StarterRow, TemplateDetail } from './report-studio.model';

export interface NewTemplateData {
  /** A starter to copy, or null for a blank template. */
  starter?: StarterRow | null;
  /** A template (and version) to copy as a new template ("Make a copy"). */
  copyOf?: { templateId: string; name: string; version?: string | null } | null;
}

/**
 * A new template, always a draft (MIG-403): blank, a copy of a platform starter (copied, never shared live), or a copy of
 * one of the workspace's templates with its own history from here on. The name must be new in the workspace.
 */
@Component({
  selector: 'app-report-new-template',
  imports: [SidePanel, Icon, FormsModule],
  template: `
    <app-side-panel [heading]="heading()" [subtitle]="subtitle()">
      <div class="form-stack">
        <label class="field">
          <span class="label">Name</span>
          <input class="input" [ngModel]="name()" (ngModelChange)="name.set($event)" aria-label="Template name" maxlength="160" />
        </label>
        <label class="field">
          <span class="label">Description (optional)</span>
          <input class="input" [ngModel]="description()" (ngModelChange)="description.set($event)" aria-label="Description" maxlength="1000" />
        </label>
        <label class="field">
          <span class="label">Category (optional)</span>
          <input class="input max-w-64" [ngModel]="category()" (ngModelChange)="category.set($event)" aria-label="Category" maxlength="80"
                 placeholder="Quality" />
        </label>
        @if (error()) { <p class="field-note text-[color:var(--crit-text)]" role="alert">{{ error() }}</p> }
      </div>
      <div foot class="flex justify-end gap-2">
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" [disabled]="busy() || !name().trim()" (click)="create()">
          <app-icon name="plus" />Create the draft
        </button>
      </div>
    </app-side-panel>
  `,
})
export class NewTemplatePanel {
  readonly data = inject<NewTemplateData>(DIALOG_DATA);
  readonly ref = inject<DialogRef<TemplateDetail | undefined>>(DialogRef);
  private readonly api = inject(ReportStudioApi);

  readonly name = signal(this.data.copyOf ? `Copy of ${this.data.copyOf.name}` : this.data.starter?.name ?? '');
  readonly description = signal(this.data.starter?.description ?? '');
  readonly category = signal(this.data.starter?.category ?? '');
  readonly busy = signal(false);
  readonly error = signal('');

  heading(): string {
    return this.data.copyOf ? `Make a copy of ${this.data.copyOf.name}` : this.data.starter ? `Use the ${this.data.starter.name} starter` : 'New template';
  }

  subtitle(): string {
    return this.data.copyOf ? 'A new template with its own history; the original is unchanged.'
      : this.data.starter ? 'The starter is copied into your workspace as a draft.' : 'A blank draft with a title and a page number.';
  }

  create(): void {
    this.busy.set(true);
    this.error.set('');
    const body: Record<string, unknown> = {
      name: this.name().trim(),
      ...(this.description().trim() ? { description: this.description().trim() } : {}),
      ...(this.category().trim() ? { category: this.category().trim() } : {}),
      ...(this.data.copyOf ? { from: 'COPY', copyOf: { templateId: this.data.copyOf.templateId, version: this.data.copyOf.version ?? undefined } }
        : this.data.starter ? { from: 'STARTER', starter: this.data.starter.key } : { from: 'BLANK' }),
    };
    this.api.create(body).subscribe({
      next: t => this.ref.close(t),
      error: e => { this.busy.set(false); this.error.set(studioError(e, 'The template could not be created.').message); },
    });
  }
}

/**
 * Import a template's JSON (spec section 6): a file or pasted text, checked by the server against the template schema
 * (the same file the designer will use) before anything is kept; refused with the paths that failed.
 */
@Component({
  selector: 'app-report-import-template',
  imports: [SidePanel, Icon, FormsModule, FileDropzone, ProblemList],
  template: `
    <app-side-panel heading="Import a template" subtitle="A Report Studio template's JSON, from an export or written by hand.">
      <div class="form-stack">
        <app-file-dropzone accept=".json,application/json" prompt="Drop a template's .json file here" hint="Or paste it below."
                           (picked)="read($event)" />
        <label class="field">
          <span class="label">Template JSON</span>
          <textarea class="input mono text-xs" rows="14" spellcheck="false" [ngModel]="text()" (ngModelChange)="text.set($event)"
                    aria-label="Template JSON" placeholder='{"schemaVersion": "1.0", "template": {"name": "...", "components": [...]}}'></textarea>
        </label>
        <label class="field">
          <span class="label">Name (optional)</span>
          <input class="input" [ngModel]="name()" (ngModelChange)="name.set($event)" aria-label="Name" placeholder="The JSON's own name" />
        </label>
        @if (problems().length) { <app-report-problems [problems]="problems()" /> }
        @if (error()) { <p class="field-note text-[color:var(--crit-text)]" role="alert">{{ error() }}</p> }
      </div>
      <div foot class="flex justify-end gap-2">
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Cancel</button>
        <button type="button" class="btn btn-default btn-sm" [disabled]="busy() || !text().trim()" (click)="check()"><app-icon name="check" />Check</button>
        <button type="button" class="btn btn-primary btn-sm" [disabled]="busy() || !text().trim()" (click)="importIt()"><app-icon name="upload" />Import as a draft</button>
      </div>
    </app-side-panel>
  `,
})
export class ImportTemplatePanel {
  readonly ref = inject<DialogRef<TemplateDetail | undefined>>(DialogRef);
  private readonly api = inject(ReportStudioApi);
  readonly text = signal('');
  readonly name = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly problems = signal<Problem[]>([]);

  read(files: File[]): void {
    const file = files[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      this.error.set('A template is at most 512 KB of JSON.');
      return;
    }
    file.text().then(t => this.text.set(t));
  }

  private parsed(): unknown | null {
    try {
      return JSON.parse(this.text());
    } catch (e) {
      this.error.set(`That is not valid JSON: ${(e as Error).message}`);
      return null;
    }
  }

  check(): void {
    const definition = this.parsed();
    if (definition === null) return;
    this.busy.set(true);
    this.error.set('');
    this.api.validate({ definition }).subscribe({
      next: r => { this.busy.set(false); this.problems.set(r.problems); if (r.summary.valid) this.error.set(''); },
      error: e => { this.busy.set(false); this.error.set(studioError(e).message); },
    });
  }

  importIt(): void {
    const definition = this.parsed();
    if (definition === null) return;
    this.busy.set(true);
    this.error.set('');
    this.api.create({ from: 'IMPORT', definition, ...(this.name().trim() ? { name: this.name().trim() } : {}) }).subscribe({
      next: t => this.ref.close(t),
      error: e => {
        this.busy.set(false);
        const err = studioError(e, 'The template could not be imported.');
        this.error.set(err.message);
        this.problems.set(err.problems);
      },
    });
  }
}

export interface PublishData { templateId: string; name: string; version: number; revision: number; }

/** Publish a draft (page report-publish): it becomes version N, which can never change; reports pin it. */
@Component({
  selector: 'app-report-publish',
  imports: [SidePanel, Icon, FormsModule, ProblemList],
  template: `
    <app-side-panel [heading]="'Publish ' + data.name + ' v' + data.version" subtitle="A published version never changes. Edits go into a new draft.">
      <div class="form-stack">
        <label class="field">
          <span class="label">What changed (optional)</span>
          <input class="input" [ngModel]="summary()" (ngModelChange)="summary.set($event)" aria-label="What changed" maxlength="500"
                 placeholder="Department chart added" />
        </label>
        @if (problems().length) { <app-report-problems [problems]="problems()" /> }
        @if (error()) { <p class="field-note text-[color:var(--crit-text)]" role="alert">{{ error() }}</p> }
      </div>
      <div foot class="flex justify-end gap-2">
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="publish()"><app-icon name="check" />Publish v{{ data.version }}</button>
      </div>
    </app-side-panel>
  `,
})
export class PublishPanel {
  readonly data = inject<PublishData>(DIALOG_DATA);
  readonly ref = inject<DialogRef<TemplateDetail | undefined>>(DialogRef);
  private readonly api = inject(ReportStudioApi);
  readonly summary = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly problems = signal<Problem[]>([]);

  publish(): void {
    this.busy.set(true);
    this.error.set('');
    this.api.publish(this.data.templateId, this.data.revision, this.summary().trim()).subscribe({
      next: t => this.ref.close(t),
      error: e => {
        this.busy.set(false);
        const err = studioError(e, 'The draft could not be published.');
        this.error.set(err.message);
        this.problems.set(err.problems);
      },
    });
  }
}

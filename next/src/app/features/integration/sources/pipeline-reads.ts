import { Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../shared/ui/icon';
import { Section } from '../../../shared/ui/section';
import { TableShell } from '../../../shared/ui/data-table';

/**
 * UX review 2026-10-13 (I1): what the workspace's pipelines actually read, from Core's GET pipeline.json/steps/reads --
 * every place their step-engine steps read (a bucket and path, an API request, a database connection, a document type,
 * the file or documents that started a run, rows written in a step), grouped by place, with the pipelines and steps that
 * read it. Connections › Sources said "0 sources" while every pipeline read data; this is the answer above its list.
 */

export type ReadKind = 'storage' | 'api' | 'database' | 'documents' | 'other';

/** A pipeline that reads a place, and its steps that do. */
export interface PipelineReader {
  taskDetailId: number;
  taskName: string;
  pipelineKey: number;
  steps: string[];
}

/** One place read, as Core answers it. */
export interface PipelineRead {
  kind: ReadKind | string;
  task: string;
  taskName: string;
  label: string;
  target: Record<string, unknown>;
  link?: string | null;
  pipelines: PipelineReader[];
}

const READ_KINDS: Record<string, { label: string; icon: string; pill: string }> = {
  storage: { label: 'Storage', icon: 'cloud', pill: 'pill-info' },
  api: { label: 'API', icon: 'code', pill: 'pill-brand' },
  database: { label: 'Database', icon: 'database', pill: 'pill-neutral' },
  documents: { label: 'Documents', icon: 'file', pill: 'pill-ok' },
  other: { label: 'In the step', icon: 'table', pill: 'pill-neutral' },
};

export const readKindLabel = (kind: string | null | undefined) => READ_KINDS[String(kind ?? '')]?.label ?? String(kind ?? '—');
export const readKindIcon = (kind: string | null | undefined) => READ_KINDS[String(kind ?? '')]?.icon ?? 'database';
export const readKindPill = (kind: string | null | undefined) => READ_KINDS[String(kind ?? '')]?.pill ?? 'pill-neutral';

/** How many different pipelines read anything. */
export function readingPipelines(reads: PipelineRead[]): number {
  return new Set(reads.flatMap(r => (r.pipelines ?? []).map(p => p.taskDetailId))).size;
}

/** The empty state of saved sources, when pipelines already read data directly (I1). */
export function readsSentence(reads: PipelineRead[]): string {
  const pipelines = readingPipelines(reads);
  const places = reads.length;
  return `Your ${pipelines} pipeline${pipelines === 1 ? '' : 's'} read ${places} place${places === 1 ? '' : 's'} directly, listed above. `
    + 'Add a source here to test and preview one.';
}

/** Pipelines shown in a row before "+N more". */
export const READERS_SHOWN = 3;

@Component({
  selector: 'app-pipeline-reads',
  imports: [RouterLink, Icon, Section, TableShell],
  template: `
    <app-section title="What your pipelines read" data-test="pipeline-reads"
                 sub="Read straight from each pipeline's steps: storage, API Collections, databases and documents. Nothing to set up here; open a pipeline to change what it reads.">
      <app-table-shell heading="Places read" columnsKey="pipeline-reads" [loading]="loading()" [error]="error()"
                       [isEmpty]="!reads().length" [shown]="reads().length" [scrollRows]="false"
                       emptyMessage="No pipeline reads data from its steps yet."
                       emptyHint="A pipeline built with steps lists here what it reads: a bucket, an API request, a database or documents."
                       emptyIcon="download" (retry)="retry.emit()">
        <div empty-action class="flex justify-center">
          <a routerLink="/pipelines/list" class="btn btn-ghost btn-sm">See pipelines</a>
        </div>
        <table class="table-modern">
          <thead>
            <tr>
              <th>What</th>
              <th>Kind</th>
              <th>Read by</th>
            </tr>
          </thead>
          <tbody>
            @for (r of reads(); track r.kind + r.label; let i = $index) {
              <tr>
                <td class="min-w-48 max-w-96">
                  @if (r.link) {
                    <a class="link-inline font-medium [overflow-wrap:anywhere]" [routerLink]="r.link">{{ r.label }}</a>
                  } @else {
                    <span class="font-medium [overflow-wrap:anywhere]">{{ r.label }}</span>
                  }
                  <span class="block text-xs text-[color:var(--text-muted)]">{{ r.taskName }}</span>
                </td>
                <td class="whitespace-nowrap">
                  <span class="pill {{ pill(r.kind) }}"><app-icon [name]="icon(r.kind)" size="0.85em" />{{ kind(r.kind) }}</span>
                </td>
                <td class="min-w-56">
                  <ul class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" [attr.aria-label]="'Pipelines that read ' + r.label">
                    @for (p of shownReaders(r, i); track p.taskDetailId) {
                      <li>
                        <a class="link-inline" [routerLink]="['/pipelines', p.taskDetailId, 'edit']" [queryParams]="{ tab: 'steps' }"
                           [attr.title]="'Steps: ' + p.steps.join(', ')">{{ p.taskName }}</a>
                      </li>
                    }
                    @if (hiddenReaders(r, i) > 0) {
                      <li><button type="button" class="btn btn-ghost btn-xs" (click)="expand(i)">+{{ hiddenReaders(r, i) }} more</button></li>
                    }
                  </ul>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </app-table-shell>
    </app-section>
  `,
})
export class PipelineReads {
  readonly reads = input<PipelineRead[]>([]);
  readonly loading = input(false);
  readonly error = input('');
  readonly retry = output<void>();

  /** The rows whose every reader is shown. */
  private readonly expanded = signal<ReadonlySet<number>>(new Set());
  readonly pipelineCount = computed(() => readingPipelines(this.reads()));

  kind(k: string): string { return readKindLabel(k); }
  icon(k: string): string { return readKindIcon(k); }
  pill(k: string): string { return readKindPill(k); }

  shownReaders(r: PipelineRead, index: number): PipelineReader[] {
    const all = r.pipelines ?? [];
    return this.expanded().has(index) ? all : all.slice(0, READERS_SHOWN);
  }

  hiddenReaders(r: PipelineRead, index: number): number {
    return (r.pipelines ?? []).length - this.shownReaders(r, index).length;
  }

  expand(index: number): void {
    this.expanded.update(open => new Set(open).add(index));
  }
}

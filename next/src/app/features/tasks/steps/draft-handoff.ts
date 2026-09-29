import { Injectable } from '@angular/core';

export interface HandedDraft {
  format: 'yaml' | 'json';
  text: string;
}

/**
 * A pipeline definition handed to the step builder from elsewhere -- the AI Assistant's drafted
 * pipeline (MIG-252) -- to show on its YAML or JSON tab as typed text, unsaved. The builder takes
 * it once, for the pipeline it was offered for; saving stays the person's own act in the builder.
 * Kept in memory only: a reload drops it, and nothing about it is stored.
 */
@Injectable({ providedIn: 'root' })
export class PipelineDraftHandoff {
  private offered: { pipelineKey: number; draft: HandedDraft } | null = null;

  offer(pipelineKey: number, draft: HandedDraft): void {
    this.offered = { pipelineKey, draft: { ...draft } };
  }

  /** The draft offered for this pipeline, once; null when there is none (or it was for another). */
  take(pipelineKey: number | null | undefined): HandedDraft | null {
    const offered = this.offered;
    if (!offered || pipelineKey == null || offered.pipelineKey !== pipelineKey) return null;
    this.offered = null;
    return offered.draft;
  }
}

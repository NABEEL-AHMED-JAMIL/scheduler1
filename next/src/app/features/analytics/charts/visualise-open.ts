import type { Dialog } from '@angular/cdk/dialog';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import type { VisualiseSource } from './visualise-panel';

/**
 * MIG-357: opens Visualise for a dataset or a run output. The panel -- and the chart engine behind it -- is imported here,
 * when it is asked for, so a screen that offers the button carries none of it until it is pressed.
 */
export async function openVisualise(dialog: Dialog, source: VisualiseSource): Promise<void> {
  const { VisualisePanel } = await import('./visualise-panel');
  dialog.open(VisualisePanel, sidePanelConfig(source, 'wide'));
}

/** The file formats Analytics reads as a table, and so can chart. */
export function chartable(name: string | null | undefined, format?: string | null): boolean {
  const f = (format || (name ?? '').split('.').pop() || '').toLowerCase();
  return ['csv', 'tsv', 'parquet', 'json', 'jsonl', 'ndjson', 'xlsx'].includes(f);
}

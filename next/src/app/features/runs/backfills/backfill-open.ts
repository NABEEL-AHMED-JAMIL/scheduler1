import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import type { Backfill } from './backfills.api';
import { BackfillPanel, BackfillPanelData } from './backfill-panel';

/**
 * MIG-347: opens "Backfill…" for a schedule -- from the Schedules list, a schedule's runs and its editor, each a lazy page
 * of its own, so none of it is in the first load. Resolves with the started backfill, or null.
 */
export async function openBackfill(dialog: Dialog, data: BackfillPanelData): Promise<Backfill | null> {
  const ref = dialog.open<Backfill | null, BackfillPanelData>(BackfillPanel, sidePanelConfig(data, 'wide', 'right'));
  return (await firstValueFrom(ref.closed, { defaultValue: null })) ?? null;
}

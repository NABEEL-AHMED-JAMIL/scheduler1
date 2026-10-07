import { Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { SidePanel } from '../../../shared/ui/side-panel';
import { WidgetChart } from '../widget-chart';
import type { WidgetView } from '../widget-view';
import { KindPicker } from './kind-picker';
import { ChartSettings } from './chart-settings';

export interface KindPickerData {
  title: string;
  view: WidgetView;
  kind: string;
  settings: ChartSettings;
  boardTheme: string | null;
}

/**
 * "Choose a chart" for one tile: every kind, with the tile's own result drawn in the kind under
 * the pointer. Closing with a kind hands it back; the board saves it and runs nothing, exactly
 * as choosing from the tile's menu does.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-kind-picker-panel',
  imports: [SidePanel, KindPicker, WidgetChart],
  template: `
    <app-side-panel heading="Choose a chart" [subtitle]="data.title">
      <app-kind-picker [issues]="data.view.issues" [selected]="data.kind" [preview]="preview" (chosen)="ref.close($event)" />
      <ng-template #preview let-kind>
        <app-widget-chart [view]="data.view" [kind]="kind" [settings]="data.settings" [boardTheme]="data.boardTheme" [height]="260" />
      </ng-template>
      <div foot class="flex w-full"><button type="button" class="btn btn-ghost btn-sm ms-auto" (click)="ref.close()">Cancel</button></div>
    </app-side-panel>
  `,
})
export class KindPickerPanel {
  readonly ref = inject<DialogRef<string | undefined>>(DialogRef);
  readonly data = inject<KindPickerData>(DIALOG_DATA);
}

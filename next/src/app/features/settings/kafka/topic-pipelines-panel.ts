import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { StatusPill } from '../../../shared/ui/status-pill';

export interface TopicPipelineRow {
  pipelineKey: number;
  pipelineId: string;
  pipelineName: string;
  status?: string;
  fields?: number;
}

/**
 * The pipelines on one topic, in a drawer beside the Kafka pane. A row used to unfold them
 * under itself, which read fine for three and pushed the table apart for thirty; the drawer
 * holds any number, with a search once there are more than a handful, and each row opens
 * the Pipelines screen narrowed to this topic.
 */
@Component({
  selector: 'app-topic-pipelines-panel',
  imports: [SidePanel, Icon, StatusPill, RouterLink],
  template: `
    <app-side-panel [heading]="data.topicName" [subtitle]="data.kafkaTopic ? 'Publishes on ' + data.kafkaTopic : ''">
      <div class="flex items-center gap-2 mb-3">
        <span class="text-sm text-[color:var(--text-secondary)]">
          {{ shown().length }}@if (shown().length !== data.pipelines.length) { of {{ data.pipelines.length }} }
          pipeline{{ data.pipelines.length === 1 ? '' : 's' }}
        </span>
        @if (data.pipelines.length > 6) {
          <div class="search-field ml-auto max-w-52">
            <app-icon name="search" size="0.95em" />
            <input class="input" placeholder="Find a pipeline" aria-label="Find a pipeline"
                   [value]="search()" (input)="search.set($any($event.target).value)" />
          </div>
        }
      </div>
      @if (!shown().length) {
        <p class="text-sm text-[color:var(--text-muted)] py-6 text-center">No pipeline matches “{{ search() }}”.</p>
      }
      <ul class="side-panel-list">
        @for (p of shown(); track p.pipelineKey) {
          <li>
            <div class="min-w-0">
              <a class="link-inline font-medium truncate block" [routerLink]="['/settings/pipelines']"
                 [queryParams]="{ topic: data.sourceTaskTypeId }" [title]="p.pipelineName" (click)="ref.close()">{{ p.pipelineName }}</a>
              <div class="text-xs text-[color:var(--text-muted)]">
                <span class="mono">{{ p.pipelineId }}</span> · {{ p.fields ?? 0 }} field{{ p.fields === 1 ? '' : 's' }}
              </div>
            </div>
            <app-status [label]="p.status || 'Active'" [quiet]="true" />
          </li>
        }
      </ul>
      <div foot>
        <a class="btn btn-default btn-sm" [routerLink]="['/settings/pipelines']" [queryParams]="{ topic: data.sourceTaskTypeId }" (click)="ref.close()">
          <app-icon name="template" />Open in Pipelines
        </a>
        <button type="button" class="btn btn-ghost btn-sm ml-auto" (click)="ref.close()">Close</button>
      </div>
    </app-side-panel>
  `,
})
export class TopicPipelinesPanel {
  readonly ref = inject<DialogRef<void>>(DialogRef);
  readonly data = inject<{ sourceTaskTypeId: number; topicName: string; kafkaTopic?: string; pipelines: TopicPipelineRow[] }>(DIALOG_DATA);
  readonly search = signal('');
  readonly shown = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.data.pipelines;
    if (!q) return rows;
    return rows.filter(p => `${p.pipelineName} ${p.pipelineId}`.toLowerCase().includes(q));
  });
}

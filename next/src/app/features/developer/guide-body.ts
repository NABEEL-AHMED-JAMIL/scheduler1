import { Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DevCode } from './code-block';
import { GuideBlock } from './guide-markdown';

/**
 * MIG-336: draws parsed markdown (guide-markdown.ts) through templates -- never innerHTML -- with heading anchors,
 * tables, code groups and copy buttons.
 */
@Component({
  selector: 'app-guide-body',
  imports: [NgTemplateOutlet, RouterLink, DevCode],
  styles: [`
    .anchor { margin-left: .375rem; font-size: .875rem; color: var(--text-muted); opacity: 0; }
    .group:hover .anchor, .anchor:focus { opacity: 1; }
  `],
  template: `
    <div class="guide flex flex-col gap-3 min-w-0">
      @for (block of blocks(); track $index) {
        @switch (block.kind) {
          @case ('h') {
            @if (block.level <= 2) {
              <h2 [id]="block.id" class="group text-lg font-semibold mt-6 scroll-mt-20">
                <ng-container [ngTemplateOutlet]="spans" [ngTemplateOutletContext]="{ $implicit: block.spans }" />
                <a [routerLink]="[]" [fragment]="block.id" class="anchor" aria-label="Link to this section">#</a>
              </h2>
            } @else {
              <h3 [id]="block.id" class="group text-base font-semibold mt-4 scroll-mt-20">
                <ng-container [ngTemplateOutlet]="spans" [ngTemplateOutletContext]="{ $implicit: block.spans }" />
                <a [routerLink]="[]" [fragment]="block.id" class="anchor" aria-label="Link to this section">#</a>
              </h3>
            }
          }
          @case ('p') {
            <p class="leading-relaxed"><ng-container [ngTemplateOutlet]="spans" [ngTemplateOutletContext]="{ $implicit: block.spans }" /></p>
          }
          @case ('quote') {
            <p class="leading-relaxed border-l-2 border-subtle pl-3 text-[color:var(--text-secondary)]">
              <ng-container [ngTemplateOutlet]="spans" [ngTemplateOutletContext]="{ $implicit: block.spans }" />
            </p>
          }
          @case ('ul') {
            <ul class="md-list leading-relaxed">
              @for (item of block.items; track $index) {
                <li><ng-container [ngTemplateOutlet]="spans" [ngTemplateOutletContext]="{ $implicit: item }" /></li>
              }
            </ul>
          }
          @case ('ol') {
            <ol class="md-list md-list-ol leading-relaxed">
              @for (item of block.items; track $index) {
                <li><ng-container [ngTemplateOutlet]="spans" [ngTemplateOutletContext]="{ $implicit: item }" /></li>
              }
            </ol>
          }
          @case ('code') {
            <app-dev-code [snippets]="[{ key: block.lang || 'code', label: block.lang || 'Code', code: block.code }]" />
          }
          @case ('group') {
            <app-dev-code [snippets]="block.tabs" />
          }
          @case ('table') {
            <div class="overflow-x-auto scroll-table">
              <table class="table-modern">
                <thead><tr>
                  @for (cell of block.head; track $index) {
                    <th><ng-container [ngTemplateOutlet]="spans" [ngTemplateOutletContext]="{ $implicit: cell }" /></th>
                  }
                </tr></thead>
                <tbody>
                  @for (row of block.rows; track $index) {
                    <tr>
                      @for (cell of row; track $index) {
                        <td class="text-sm align-top"><ng-container [ngTemplateOutlet]="spans" [ngTemplateOutletContext]="{ $implicit: cell }" /></td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
          @case ('hr') {
            <hr class="md-hr" />
          }
        }
      }
    </div>

    <ng-template #spans let-list>
      @for (span of list; track $index) {
        @if (span.href) {
          <a [href]="span.href" target="_blank" rel="noopener noreferrer" class="md-link">{{ span.text }}</a>
        } @else if (span.route === '.') {
          <a [routerLink]="[]" [fragment]="span.fragment" class="md-link">{{ span.text }}</a>
        } @else if (span.route) {
          <a [routerLink]="span.route" [fragment]="span.fragment" class="md-link">{{ span.text }}</a>
        } @else if (span.code) {
          <code class="md-inline-code">{{ span.text }}</code>
        } @else if (span.bold) {
          <strong>{{ span.text }}</strong>
        } @else if (span.italic) {
          <em>{{ span.text }}</em>
        } @else {<ng-container>{{ span.text }}</ng-container>}
      }
    </ng-template>
  `,
})
export class GuideBody {
  readonly blocks = input.required<GuideBlock[]>();
}

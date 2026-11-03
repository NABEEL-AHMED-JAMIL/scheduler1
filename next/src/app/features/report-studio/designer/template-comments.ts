import { Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../shared/ui/icon';
import { RsTimePipe } from '../rs-time.pipe';
import { TemplateComment } from '../report-library.api';
import { Block, find } from './designer-model';

/**
 * Reports redesign, feature 16: the review comments about this template's blocks, from the reports made with it -- a
 * reviewer ticked "About the template" on a block. Over the canvas, folded; a row selects the block when it is still in
 * the draft, and opens the report's comment. The words are masked on the server for a reader without See personal data.
 */
@Component({
  selector: 'app-rs-template-comments',
  imports: [Icon, RouterLink, RsTimePipe],
  template: `
    @if (comments().length) {
      <section class="rs-banner rs-banner-info tcm" aria-label="Review comments about this template" data-template-comments>
        <div class="tcm-head">
          <app-icon name="chat" class="shrink-0" />
          <h2 class="text-sm font-semibold flex-1 min-w-0">{{ heading() }}</h2>
          <button type="button" class="btn btn-default btn-xs" [attr.aria-expanded]="open()" (click)="open.set(!open())">{{ open() ? 'Hide' : 'Show' }}</button>
        </div>
        @if (open()) {
          <ul class="tcm-list">
            @for (c of comments(); track c.commentId) {
              <li class="tcm-row" [class.is-on]="selectedId() === c.componentId">
                <button type="button" class="tcm-what" (click)="pick(c)" [disabled]="!inDraft(c)"
                        [attr.title]="inDraft(c) ? 'Select the block' : 'This block is no longer in the draft'">
                  <b>{{ c.componentLabel || c.componentId }}</b>
                  <span class="text-xs text-[color:var(--text-muted)]">{{ c.reportLabel }} v{{ c.version }} · {{ c.authorName }} · {{ c.createdAt | rsTime: 'recent' }}</span>
                  <span class="text-sm tcm-text">{{ c.text }}@if (c.masked) { <app-icon name="lock" [attr.title]="maskedTitle" /> }</span>
                </button>
                <a class="link-inline text-xs whitespace-nowrap" [routerLink]="routeOf(c)" [queryParams]="queryOf(c)">Open the comment</a>
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
  styles: `
    :host { display: block; width: min(100%, 52rem); margin-bottom: 0.5rem; }
    .tcm { flex-direction: column; gap: 0.375rem; padding: 0.625rem 0.75rem; }
    .tcm-head { display: flex; align-items: center; gap: 0.5rem; width: 100%; }
    .tcm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; width: 100%; }
    .tcm-row { display: flex; gap: 0.5rem; align-items: flex-start; padding: 0.375rem 0.5rem; border-radius: var(--radius-md);
      background: var(--surface-raised); border: 1px solid var(--border-subtle); }
    .tcm-row.is-on { border-color: var(--accent-mark-strong); }
    .tcm-what { display: flex; flex-direction: column; gap: 0.125rem; flex: 1; min-width: 0; text-align: left; background: none; border: 0; padding: 0;
      color: var(--text-primary); cursor: pointer; font-size: 0.8125rem; }
    .tcm-what:disabled { cursor: default; }
    .tcm-text { white-space: pre-wrap; overflow-wrap: anywhere; }
  `,
})
export class TemplateComments {
  readonly comments = input<TemplateComment[]>([]);
  readonly blocks = input<Block[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly selected = output<string>();
  readonly open = signal(true);
  readonly maskedTitle = 'Personal values are hidden: reading them needs See personal data.';
  readonly heading = computed(() => {
    const n = this.comments().length;
    return `${n} open review comment${n === 1 ? '' : 's'} about this template's blocks`;
  });

  inDraft(c: TemplateComment): boolean {
    return !!c.componentId && !!find(this.blocks(), c.componentId);
  }

  pick(c: TemplateComment): void {
    if (c.componentId && this.inDraft(c)) this.selected.emit(c.componentId);
  }

  routeOf(c: TemplateComment): string[] {
    return ['/reports/library', c.link.split('?')[0].split('/').pop() ?? ''];
  }

  queryOf(c: TemplateComment): Record<string, string> {
    return { version: String(c.version), comment: c.commentId };
  }
}

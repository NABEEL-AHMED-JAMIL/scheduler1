import { Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon';
import { StatusPill } from '../../shared/ui/status-pill';
import { DRAFT_TITLE, RequestEntry } from './request-data';
import { MASKED_TITLE, isMasked } from './value-kind';

/**
 * A request's data (request-data.ts) as the Approvals task, My requests' request and Review's side panel show it: label
 * above value, as many columns as fit; a run's outcome, a decision, a record, a table or a long text takes the row.
 */
@Component({
  selector: 'app-request-data',
  imports: [NgTemplateOutlet, RouterLink, Icon, StatusPill],
  styles: `
    .req-nested { margin-top: 0.75rem; padding-left: 0.875rem; border-left: 2px solid var(--border-subtle); gap: 0.75rem 1.5rem; }
    .req-line { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem 0.625rem; }
    .req-step { font-weight: 500; color: var(--text-primary); }
    .req-run { font-size: 0.8125rem; color: var(--text-secondary); }
    .req-problem { display: flex; align-items: flex-start; gap: 0.375rem; margin: 0.4rem 0 0; font-size: 0.8125rem; }
    .req-decision.is-ok { color: var(--series-ok); }
    .req-decision.is-crit { color: var(--series-crit); }
    .req-decision.is-warn { color: var(--series-warn); }
    .req-decision.is-neutral { color: var(--text-muted); }
    .req-when { color: var(--text-secondary); }
    .req-masked { display: inline-flex; align-items: center; gap: 0.3rem; color: var(--text-muted); cursor: help; }
    .inbox-long { display: block; max-width: 80ch; line-height: 1.55; }
    dt .pill { margin-left: 0.4rem; vertical-align: 0.05em; text-transform: none; letter-spacing: 0; }
  `,
  template: `
    <ng-container *ngTemplateOutlet="list; context: { $implicit: entries(), nested: false }" />

    <ng-template #list let-entries let-nested="nested">
      <dl class="inbox-fields" [class.req-nested]="nested" [attr.data-test]="nested ? 'request-subfields' : 'request-fields'">
        @for (e of entries; track e.key) {
          <div [class.is-wide]="wide(e)" [attr.data-kind]="e.kind === 'value' ? e.view.kind : e.kind" [attr.data-key]="e.key">
            <dt>{{ e.label }}@if (e.kind === 'value' && e.draft) {<span class="pill pill-warn" [title]="draftTitle">DRAFT</span>}</dt>
            <dd>
              @switch (e.kind) {
                @case ('outcome') {
                  <span class="req-line" data-test="outcome-line">
                    @if (e.step) { <span class="req-step">{{ e.step }}</span> }
                    <app-status [label]="e.status" />
                    @if (e.runId != null) {
                      @if (e.link) {
                        <a class="link-inline req-run" [routerLink]="e.link" data-test="outcome-run">Run #{{ e.runId }}</a>
                      } @else { <span class="req-run">Run #{{ e.runId }}</span> }
                    }
                  </span>
                  @if (e.problem) {
                    <p class="req-problem text-crit-500" data-test="outcome-problem"><app-icon name="alert" size="0.95em" class="mt-0.5 shrink-0" /><span>{{ e.problem }}</span></p>
                  }
                  @if (e.fields.length) { <ng-container *ngTemplateOutlet="list; context: { $implicit: e.fields, nested: true }" /> }
                }
                @case ('decision') {
                  <span class="req-line" data-test="decision-line">
                    <app-icon [class]="'req-decision is-' + e.tone" [name]="e.tone === 'crit' ? 'xCircle' : e.tone === 'warn' ? 'chat' : 'checkCircle'" size="1em" />
                    <span>{{ e.line }}@if (e.at) { · <time class="req-when" [attr.datetime]="e.atIso" [title]="e.atTitle">{{ e.at }}</time>}</span>
                  </span>
                  @if (e.comment) { <blockquote class="inbox-quote">{{ e.comment }}</blockquote> }
                }
                @case ('group') { <ng-container *ngTemplateOutlet="list; context: { $implicit: e.fields, nested: true }" /> }
                @default {
                  @switch (e.view.kind) {
                    @case ('masked') { <ng-container *ngTemplateOutlet="mask; context: { $implicit: e.view.text }" /> }
                    @case ('id') { <span class="inbox-id">{{ e.view.text }}</span> }
                    @case ('page') {
                      <a class="link-inline inline-flex items-center gap-1" [routerLink]="e.view.path" [queryParams]="e.view.query" data-test="field-page"><app-icon name="external" size="0.9em" />Open</a>
                    }
                    @case ('long') { <span class="inbox-long">{{ e.view.text }}</span> }
                    @case ('chips') { <span class="inbox-chips">@for (c of e.view.items; track $index) { <span class="pill pill-neutral">{{ c }}</span> }</span> }
                    @case ('file') {
                      @if (e.view.href) {
                        <a class="inbox-file" [href]="e.view.href" target="_blank" rel="noopener"><app-icon [name]="e.view.image ? 'image' : 'file'" size="0.95em" />{{ e.view.name }}</a>
                      } @else {
                        <span class="inbox-file"><app-icon [name]="e.view.image ? 'image' : 'file'" size="0.95em" />{{ e.view.name }}</span>
                      }
                    }
                    @case ('table') {
                      <div class="inbox-table-wrap">
                        <table class="inbox-table">
                          <thead><tr>@for (c of e.view.columns; track $index) { <th scope="col">{{ c }}</th> }</tr></thead>
                          <tbody>@for (row of e.view.rows; track $index) { <tr>@for (cell of row; track $index) {
                            <td>@if (masked(cell)) { <ng-container *ngTemplateOutlet="mask; context: { $implicit: cell }" /> } @else { {{ cell }} }</td>
                          } </tr> }</tbody>
                        </table>
                      </div>
                    }
                    @default { {{ e.view.text }} }
                  }
                }
              }
            </dd>
          </div>
        }
      </dl>
    </ng-template>

    <!-- A value a policy hides: the platform's mask, and why, never the value. -->
    <ng-template #mask let-text>
      <span class="req-masked" [title]="maskedTitle"><app-icon name="lock" size="0.85em" /><span class="secret-mask" aria-hidden="true">{{ text }}</span><span class="sr-only">{{ maskedTitle }}</span></span>
    </ng-template>
  `,
})
export class RequestDataView {
  readonly entries = input<RequestEntry[]>([]);
  readonly draftTitle = DRAFT_TITLE;
  readonly maskedTitle = MASKED_TITLE;

  wide(e: RequestEntry): boolean {
    return e.kind !== 'value' || e.view.kind === 'table' || e.view.kind === 'long';
  }

  masked(cell: string): boolean {
    return isMasked(cell);
  }
}

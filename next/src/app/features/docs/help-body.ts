import { Component, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon';
import { copyText } from '../../shared/ui/clipboard.util';
import { HelpBlock, HelpSpan } from './help-markdown';
import { figureSrc } from './help-content';

/** One row of the live menu (the Reference article's menu-map widget), with whether the reader's menu links it. */
export interface MenuRow { group: string; entry: string; path: string; tabs: string; linked: boolean; why: string; }

/**
 * An article's blocks (help-markdown.ts), drawn through templates -- never innerHTML. Headings are shifted one level
 * down where several articles share a page (a whole chapter). A link to another article is a plain <a href="/docs#id">
 * whose click the page handles (the help keeps its own place in the address); a console page is a routerLink; a figure
 * is drawn at its CSS size (it was taken at device scale 2), never wider than the column, and opens full size.
 */
@Component({
  selector: 'app-help-body',
  imports: [NgTemplateOutlet, RouterLink, Icon],
  styles: [`
    :host { display: block; }
    .hb > * + * { margin-top: 1rem; }
    .hb h2, .hb h3, .hb h4 { scroll-margin-top: 5rem; letter-spacing: -0.01em; }
    .hb .hb-h2 { font-size: 1.3rem; font-weight: 600; margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border-subtle); }
    .hb .hb-h3 { font-size: 1.05rem; font-weight: 600; margin-top: 1.75rem; }
    .hb .hb-h4 { font-size: .95rem; font-weight: 600; margin-top: 1.25rem; }
    .hb > .hb-h2:first-child { margin-top: .5rem; padding-top: 0; border-top: 0; }
    .hb p, .hb li { line-height: 1.7; }
    .hb ol, .hb ul { padding-left: 1.4rem; }
    .hb ol { list-style: decimal; } .hb ul { list-style: disc; }
    .hb li + li { margin-top: .4rem; }
    .hb li > ol, .hb li > ul { margin-top: .4rem; }
    .hb li::marker { color: var(--text-muted); font-weight: 600; }
    .hb code.inl { font-family: var(--font-mono, ui-monospace, monospace); font-size: .85em; padding: .05rem .3rem; border-radius: var(--radius-sm);
                   background: var(--surface-inset); border: 1px solid var(--border-subtle); white-space: break-spaces; overflow-wrap: anywhere; }
    .hb a.lnk { color: var(--accent-text); text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; }
    .hb a.lnk:hover { text-decoration-thickness: 2px; }
    .callout { display: flex; gap: 0.65rem; align-items: flex-start; padding: 0.8rem 1rem; border-radius: var(--radius-md);
               border: 1px solid var(--border-subtle); font-size: 0.9rem; line-height: 1.6; color: var(--text-primary); }
    .callout p + p { margin-top: .4rem; }
    .callout-tip  { border-color: color-mix(in oklab, var(--ok-text) 45%, var(--border-subtle)); background: color-mix(in oklab, var(--ok-text) 7%, var(--surface-raised)); }
    .callout-tip > app-icon { color: var(--ok-text); }
    .callout-note { border-color: color-mix(in oklab, var(--info-mark) 45%, var(--border-subtle)); background: color-mix(in oklab, var(--info-mark) 7%, var(--surface-raised)); }
    .callout-note > app-icon { color: var(--info-text); }
    .callout-warn { border-color: color-mix(in oklab, var(--warn-text) 50%, var(--border-subtle)); background: color-mix(in oklab, var(--warn-text) 8%, var(--surface-raised)); }
    .callout-warn > app-icon { color: var(--warn-text); }
    .callout-privacy { border-color: color-mix(in oklab, var(--crit-text) 40%, var(--border-subtle)); background: color-mix(in oklab, var(--crit-text) 6%, var(--surface-raised)); }
    .callout-privacy > app-icon { color: var(--crit-text); }
    .code { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; background: var(--surface-inset); }
    .code-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.5rem 0.35rem 0.8rem; border-bottom: 1px solid var(--border-subtle);
                 font-size: 0.75rem; color: var(--text-secondary); }
    .code pre { margin: 0; padding: 0.7rem 0.8rem; overflow-x: auto; font-size: 0.8125rem; line-height: 1.55; color: var(--text-primary); }
    .tbl { overflow-x: auto; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); }
    .tbl table { width: 100%; border-collapse: collapse; font-size: .875rem; }
    .tbl th { text-align: left; font-weight: 600; font-size: .78rem; color: var(--text-secondary); background: var(--surface-inset);
              padding: .55rem .75rem; border-bottom: 1px solid var(--border-subtle); white-space: nowrap; }
    .tbl td { padding: .55rem .75rem; vertical-align: top; border-top: 1px solid var(--border-subtle); line-height: 1.55; min-width: 7rem; }
    .tbl tr:first-child td { border-top: 0; }
    .tbl td:first-child { min-width: 9rem; }
    figure.fig { margin: 1.5rem 0; }
    figure.fig button { display: block; padding: 0; border: 0; background: none; cursor: zoom-in; max-width: 100%; }
    figure.fig img { display: block; max-width: 100%; height: auto; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);
                     box-shadow: 0 8px 24px -16px var(--scrim); background: var(--surface-raised); }
    figure.fig figcaption { margin-top: .55rem; font-size: .8rem; color: var(--text-muted); line-height: 1.5; }
    .wide { width: 100%; }
  `],
  template: `
    <div class="hb">
      @for (b of blocks(); track $index) {
        @switch (b.kind) {
          @case ('h') {
            @if (b.level + shift() <= 2) {
              <h2 [id]="b.id" data-part class="hb-h2"><ng-container *ngTemplateOutlet="spansT; context: { $implicit: b.spans }" /></h2>
            } @else if (b.level + shift() === 3) {
              <h3 [id]="b.id" [attr.data-part]="shift() ? '' : null" class="hb-h3"><ng-container *ngTemplateOutlet="spansT; context: { $implicit: b.spans }" /></h3>
            } @else {
              <h4 [id]="b.id" class="hb-h4"><ng-container *ngTemplateOutlet="spansT; context: { $implicit: b.spans }" /></h4>
            }
          }
          @case ('p') { <p><ng-container *ngTemplateOutlet="spansT; context: { $implicit: b.spans }" /></p> }
          @case ('callout') {
            <div class="callout callout-{{ b.tone }}" role="note" [attr.data-test]="'doc-' + b.tone">
              <app-icon [name]="b.tone === 'tip' ? 'zap' : b.tone === 'warn' ? 'alert' : b.tone === 'privacy' ? 'lock' : 'info'" class="mt-0.5 shrink-0" />
              <div class="min-w-0">
                @for (p of b.paras; track $index; let first = $first) {
                  <p>@if (first) {<span class="font-semibold mr-1">{{ b.label }}.</span>}<ng-container *ngTemplateOutlet="spansT; context: { $implicit: p }" /></p>
                }
              </div>
            </div>
          }
          @case ('ol') { <ol><ng-container *ngTemplateOutlet="itemsT; context: { $implicit: b.items }" /></ol> }
          @case ('ul') { <ul><ng-container *ngTemplateOutlet="itemsT; context: { $implicit: b.items }" /></ul> }
          @case ('code') {
            <div class="code" data-test="doc-code">
              <div class="code-head">
                <span class="min-w-0 flex-1 truncate">{{ b.label }}</span>
                <button type="button" class="btn btn-default btn-xs" [attr.aria-label]="'Copy ' + b.label" (click)="copy(b.code)">
                  <app-icon [name]="copied() === b.code ? 'check' : 'copy'" size="0.9em" />{{ copied() === b.code ? 'Copied' : 'Copy' }}
                </button>
              </div>
              <pre class="mono"><code>{{ b.code }}</code></pre>
            </div>
          }
          @case ('table') {
            <div class="tbl scroll-table">
              <table>
                <thead><tr>@for (c of b.head; track $index) {<th><ng-container *ngTemplateOutlet="spansT; context: { $implicit: c }" /></th>}</tr></thead>
                <tbody>
                  @for (r of b.rows; track $index) {
                    <tr>@for (c of r; track $index) {<td><ng-container *ngTemplateOutlet="spansT; context: { $implicit: c }" /></td>}</tr>
                  }
                </tbody>
              </table>
            </div>
          }
          @case ('figure') {
            @if (figures()[b.name]; as size) {
              <figure class="fig" [attr.data-figure]="b.name">
                <button type="button" (click)="zoom.emit({ src: src(b.name), alt: b.alt, caption: b.caption })" [attr.aria-label]="'Open the picture full size: ' + b.alt">
                  <img [src]="src(b.name)" [alt]="b.alt" [width]="size[0]" [height]="size[1]" loading="lazy" decoding="async" />
                </button>
                @if (b.caption) { <figcaption>{{ b.caption }}</figcaption> }
              </figure>
            }
          }
          @case ('widget') {
            @if (b.name === 'menu-map' && menu().length) {
              <div class="tbl scroll-table" data-test="doc-menu">
                <table>
                  <thead><tr><th>Group</th><th>Entry</th><th>Tabs</th></tr></thead>
                  <tbody>
                    @for (m of menu(); track m.path) {
                      <tr>
                        <td class="text-[color:var(--text-secondary)] whitespace-nowrap">{{ m.group }}</td>
                        <td class="whitespace-nowrap">
                          @if (m.linked) { <a class="lnk" [routerLink]="m.path">{{ m.entry }}</a> }
                          @else { <span data-test="doc-menu-unlinked">{{ m.entry }}</span> <span class="ml-1 text-xs text-[color:var(--text-muted)]">({{ m.why }})</span> }
                        </td>
                        <td>{{ m.tabs || '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
          @case ('hr') { <hr class="border-subtle" /> }
        }
      }
    </div>

    <ng-template #itemsT let-items>
      @for (it of items; track $index) {
        <li>
          <ng-container *ngTemplateOutlet="spansT; context: { $implicit: it.spans }" />
          @if (it.sub; as sub) {
            @if (sub.ordered) {
              <ol>@for (s of sub.items; track $index) {<li><ng-container *ngTemplateOutlet="spansT; context: { $implicit: s }" /></li>}</ol>
            } @else {
              <ul>@for (s of sub.items; track $index) {<li><ng-container *ngTemplateOutlet="spansT; context: { $implicit: s }" /></li>}</ul>
            }
          }
        </li>
      }
    </ng-template>

    <ng-template #spansT let-spans>@for (s of asSpans(spans); track $index) {@if (s.article) {<a class="lnk" [href]="'/docs#' + s.article" (click)="follow($event, s.article)"><ng-container *ngTemplateOutlet="oneT; context: { $implicit: s }" /></a>} @else if (s.route) {<a class="lnk" [routerLink]="routeOf(s.route)" [queryParams]="queryOf(s.route)"><ng-container *ngTemplateOutlet="oneT; context: { $implicit: s }" /></a>} @else if (s.href) {<a class="lnk" [href]="s.href" [attr.target]="isFile(s.href) ? null : '_blank'" [attr.rel]="isFile(s.href) ? null : 'noopener'" [attr.download]="isFile(s.href) ? '' : null"><ng-container *ngTemplateOutlet="oneT; context: { $implicit: s }" /></a>} @else {<ng-container *ngTemplateOutlet="oneT; context: { $implicit: s }" />}}</ng-template>

    <ng-template #oneT let-s>@if (s.code) {<code class="inl">{{ s.text }}</code>} @else if (s.bold && s.italic) {<strong><em>{{ s.text }}</em></strong>} @else if (s.bold) {<strong class="font-semibold">{{ s.text }}</strong>} @else if (s.italic) {<em>{{ s.text }}</em>} @else {{{ s.text }}}</ng-template>
  `,
})
export class HelpBody {
  readonly blocks = input<HelpBlock[]>([]);
  readonly figures = input<Record<string, [number, number]>>({});
  /** How many levels the headings go down (1 on a page of several articles). */
  readonly shift = input(0);
  readonly menu = input<MenuRow[]>([]);
  /** Another article (or one of its parts) the reader follows. */
  readonly go = output<string>();
  readonly zoom = output<{ src: string; alt: string; caption: string }>();

  readonly copied = signal('');

  asSpans(x: unknown): HelpSpan[] { return x as HelpSpan[]; }
  src(name: string): string { return figureSrc(name); }
  isFile(href: string): boolean { return href.startsWith('/help/'); }
  routeOf(route: string): string { return route.split('?')[0]; }
  queryOf(route: string): Record<string, string> | null {
    const q = route.split('?')[1];
    return q ? Object.fromEntries(new URLSearchParams(q)) : null;
  }

  follow(event: Event, article: string): void {
    event.preventDefault();
    this.go.emit(article);
  }

  async copy(text: string): Promise<void> {
    if (await copyText(text)) {
      this.copied.set(text);
      setTimeout(() => { if (this.copied() === text) this.copied.set(''); }, 2000);
    }
  }
}

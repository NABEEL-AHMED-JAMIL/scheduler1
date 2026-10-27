import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../../shared/ui/brand-mark';
import { dayText } from '../../shared/ui/date-field';
import { ThemeService } from '../../core/theme.service';
import { AuthService } from '../../core/auth/auth.service';
import { NAV, NavGate, NavTab } from '../../core/nav/nav-tree';
import { NavAccess } from '../../core/nav/nav-access';
import { HelpBody, MenuRow } from './help-body';
import { HelpArticle, HelpContent, HelpData, HelpTopic, SearchHit, blocksOf, blocksOfText, figureSrc, search, spansOf } from './help-content';
import { partsOf } from './help-markdown';

/** What the page shows: the front, a topic, one article, or a topic's articles on one page (a chapter, to read or print). */
type View = { kind: 'home' } | { kind: 'topic'; topic: HelpTopic } | { kind: 'article'; article: HelpArticle }
  | { kind: 'chapter'; topic: HelpTopic };

/** A heading in the right-hand contents. */
interface Part { id: string; title: string; }

/**
 * Who a role-only entry is for, or null for an entry any role may have: Platform's tabs are all the platform
 * administrators', Billing's Settings tab theirs too, Administration's Users a workspace administrator's.
 */
export function roleOnly(gate: NavGate & { tabs?: NavTab[] }): 'platform administrators' | 'workspace administrators' | null {
  const tabs = gate.tabs ?? [];
  if (gate.platformOnly || (tabs.length && tabs.every(t => t.platformOnly))) return 'platform administrators';
  if (gate.adminOnly || (tabs.length && tabs.every(t => t.adminOnly || t.platformOnly))) return 'workspace administrators';
  return null;
}

/** Every menu entry and tab with an address, so a path can be matched to the rule the menu shows it by. */
const GATES: { path: string; gate: NavGate & { tabs?: NavTab[] } }[] = NAV.flatMap(item => [
  ...(item.path ? [{ path: item.path, gate: item as NavGate & { tabs?: NavTab[] } }] : []),
  ...(item.tabs ?? []).map(t => ({ path: t.path, gate: t })),
  ...(item.children ?? []).flatMap(c => [{ path: c.path, gate: c }, ...(c.tabs ?? []).map(t => ({ path: t.path, gate: t }))]),
]);

/** The menu entry or tab a path is (or lies beneath), the most specific one; none for a page outside the menu. */
export function gateOf(path: string): (NavGate & { tabs?: NavTab[] }) | null {
  let best: { path: string; gate: NavGate & { tabs?: NavTab[] } } | null = null;
  for (const g of GATES) {
    if ((path === g.path || path.startsWith(g.path + '/')) && (!best || g.path.length > best.path.length)) best = g;
  }
  return best?.gate ?? null;
}

/**
 * The help centre (owner 2026-10-26: "a nice shell around almost no content" -- now about two hundred articles in the
 * client book's chapters). Public, like the landing page: it describes the console's own screens and carries nothing
 * tenant-specific. The content is help/ (Markdown), gathered by scripts/build-help.mjs into public/help/content.json.
 *
 * - The front: search, the topics grouped by the book's parts (each with its first articles), popular how-tos, what's new.
 * - A topic: its summary, Start here (numbered steps with pictures), what you can do (its sections and articles), popular
 *   questions, related topics, and Read the whole chapter (every article of the topic on one page, in reading order).
 * - An article: the topic's sections on the left, the article in the middle, its own contents on the right on a wide
 *   screen; who may do it and where, figures that open full size, related articles, previous and next.
 *
 * An address names what is shown: /docs#topic-<id>, /docs#chapter-<id>, /docs#<article> or /docs#<article>--<part>; the
 * one-page guide's addresses (/docs#review, #reference--menu) open the article that took their place. Signed in, the
 * reader is offered only the topics and articles about pages their menu opens (the menu's own rule, NavAccess); signed
 * out, everything. Search reads every article's whole text, not only its title.
 */
@Component({
  selector: 'app-docs',
  imports: [RouterLink, Icon, BrandMark, HelpBody],
  styles: [`
    :host { display: block; }
    .help-hero { border-bottom: 1px solid var(--border-subtle);
      background: radial-gradient(60rem 18rem at 15% 0%, color-mix(in oklab, var(--accent-mark) 12%, transparent), transparent 70%),
        linear-gradient(180deg, color-mix(in oklab, var(--accent-mark) 6%, var(--surface-raised)), var(--surface-page)); }
    .help-search { position: relative; }
    .help-search > app-icon { position: absolute; left: 0.9rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
    .help-search > .input { padding-left: 2.6rem; }
    .grid-cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); }
    .lift { transition: border-color .15s, box-shadow .15s; }
    .lift:hover { border-color: color-mix(in oklab, var(--accent-mark) 50%, var(--border-strong)); box-shadow: 0 6px 20px -14px var(--scrim-strong); }
    a:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent-mark); outline-offset: 2px; }
    .ticon { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; flex: none; border-radius: var(--radius-md);
             background: color-mix(in oklab, var(--accent-mark) 12%, var(--surface-raised)); color: var(--accent-text); }
    .ticon-lg { width: 3rem; height: 3rem; }
    .num { display: grid; place-items: center; flex: none; width: 1.6rem; height: 1.6rem; border-radius: 999px; font-size: .75rem;
           font-weight: 600; background: var(--btn-primary-bg); color: var(--btn-primary-fg); }
    .row-link + .row-link { border-top: 1px solid var(--border-subtle); }
    .row-link:hover { background: var(--surface-inset); }
    .eyebrow { font-size: .72rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); }
    .start-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(13.5rem, 1fr)); }
    .thumb { aspect-ratio: 16 / 9; overflow: hidden; background: var(--surface-inset); border-bottom: 1px solid var(--border-subtle); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; object-position: left top; display: block; }
    .thumb.crop img { width: 170%; height: auto; max-width: none; margin: -1% 0 0 -21%; object-fit: initial; }
    .sec-grid { columns: 2 24rem; column-gap: 1rem; }
    .sec-grid > * { break-inside: avoid; margin-bottom: 1rem; }
    .faq + .faq { border-top: 1px solid var(--border-subtle); }
    .faq summary { list-style: none; cursor: pointer; }
    .faq summary::-webkit-details-marker { display: none; }
    .faq[open] .chev { transform: rotate(90deg); }
    .doc-grid { display: grid; gap: 2.5rem; grid-template-columns: minmax(0, 1fr); }
    @media (min-width: 1024px) { .doc-grid { grid-template-columns: 15rem minmax(0, 1fr); } }
    @media (min-width: 1440px) { .doc-grid { grid-template-columns: 16rem minmax(0, 1fr) 14rem; } }
    .doc-aside, .doc-nav { display: none; }
    @media (min-width: 1440px) { .doc-aside { display: block; } .toc-fold { display: none; } }
    @media (min-width: 1024px) { .doc-nav { display: block; } .nav-fold { display: none; } }
    .nav-link { display: block; padding: .35rem .6rem; border-radius: var(--radius-md); color: var(--text-secondary); font-size: .85rem; line-height: 1.35; }
    .nav-link:hover { background: var(--surface-inset); color: var(--text-primary); }
    .nav-link.on { background: color-mix(in oklab, var(--accent-mark) 10%, var(--surface-raised)); color: var(--accent-text); font-weight: 600; }
    .doc-article { max-width: 54rem; min-width: 0; }
    @media (min-width: 1440px) { .doc-article { margin-inline: auto; width: 100%; } }
    .toc-link.on { color: var(--accent-text); font-weight: 600; border-color: var(--accent-mark); }
    .chip { display: inline-flex; align-items: center; gap: .35rem; padding: .2rem .6rem; border-radius: 999px; font-size: .78rem;
            border: 1px solid var(--border-subtle); background: var(--surface-raised); color: var(--text-secondary); }
    mark.hit { background: color-mix(in oklab, var(--warn-text) 22%, transparent); color: inherit; border-radius: var(--radius-sm); padding: 0 1px; }
    .zoom { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 2rem; background: var(--scrim-strong); cursor: zoom-out; }
    .zoom img { max-width: min(96vw, 1920px); max-height: 88vh; width: auto; height: auto; border-radius: var(--radius-md); background: var(--surface-raised); }
    @media print { header, footer, .doc-nav, .doc-aside, .no-print { display: none !important; } .doc-grid { display: block; } }
  `],
  template: `
    <div class="min-h-screen flex flex-col bg-page">
      <header class="sticky top-0 z-40 border-b bg-raised border-subtle">
        <div class="mx-auto w-full max-w-[100rem] px-5 lg:px-8 h-14 flex items-center gap-3">
          <a routerLink="/"><app-brand-mark /></a>
          <a href="/docs" class="text-sm text-[color:var(--text-muted)] hover:underline hidden sm:inline" (click)="go($event, '')">Help centre</a>
          @if (view().kind !== 'home') {
            <div class="help-search flex-1 max-w-md ml-4 hidden md:block">
              <app-icon name="search" size="0.95em" />
              <input class="input input-sm w-full" type="search" placeholder="Search the help" aria-label="Search the help"
                     [value]="query()" (input)="query.set($any($event.target).value)" data-test="doc-search-top" />
            </div>
          }
          <div class="ml-auto flex items-center gap-1.5">
            <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light' : 'Switch to dark'"
                    (click)="theme.toggle()"><app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" /></button>
            @if (auth.isLoggedIn()) { <a routerLink="/dashboard" class="btn btn-primary btn-sm">Back to console</a> }
            @else { <a routerLink="/login" class="btn btn-primary btn-sm">Sign in</a> }
          </div>
        </div>
      </header>

      @if (view().kind === 'home' && data()) {
        <section class="help-hero" aria-labelledby="helpTitle">
          <div class="mx-auto w-full max-w-[100rem] px-5 lg:px-8 py-12 lg:py-14 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] items-end">
            <div>
              <p class="eyebrow !text-[color:var(--accent-text)]">Help centre</p>
              <h1 id="helpTitle" class="mt-2 text-3xl lg:text-4xl font-semibold tracking-tight">How can we help?</h1>
              <p class="mt-2 text-[color:var(--text-secondary)] max-w-2xl">
                Step-by-step help for every part of the console, in the order of the work, with recipes that build each
                example from an empty workspace and a checklist for testing it.
              </p>
              <div class="help-search mt-6 max-w-2xl">
                <app-icon name="search" size="1.1em" />
                <input class="input w-full !h-12 !text-base" type="search" placeholder="Search every article, for example “retry failed items”"
                       aria-label="Search the help" [value]="query()" (input)="query.set($any($event.target).value)" data-test="doc-search" />
              </div>
              <p class="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span class="text-[color:var(--text-muted)]">Popular:</span>
                @for (h of howTos().slice(0, 5); track h.id) {
                  <a class="chip lift" [href]="'/docs#' + h.id" (click)="open($event, h.id)">{{ h.popular }}</a>
                }
              </p>
            </div>
            <dl class="hidden lg:grid grid-cols-3 gap-3 text-center" data-test="doc-stats">
              <div class="card p-4"><dt class="eyebrow">Topics</dt><dd class="text-2xl font-semibold mt-1">{{ topics().length }}</dd></div>
              <div class="card p-4"><dt class="eyebrow">Articles</dt><dd class="text-2xl font-semibold mt-1">{{ articles().length }}</dd></div>
              <div class="card p-4"><dt class="eyebrow">Pictures</dt><dd class="text-2xl font-semibold mt-1">{{ figureCount() }}</dd></div>
            </dl>
          </div>
        </section>
      }

      <div class="mx-auto w-full max-w-[100rem] px-5 lg:px-8 py-8 lg:py-10 flex-1">
        @if (loadError()) {
          <div class="card p-8 text-center max-w-xl mx-auto" role="alert">
            <p class="font-medium">The help could not be read.</p>
            <p class="mt-1 text-sm text-[color:var(--text-secondary)]">{{ loadError() }}</p>
            <button type="button" class="btn btn-default btn-sm mt-4" (click)="load()">Try again</button>
          </div>
        } @else if (!data()) {
          <div class="flex flex-col gap-4" aria-busy="true" aria-label="Reading the help">
            <div class="h-8 w-72 rounded bg-[color:var(--surface-inset)]"></div>
            <div class="grid-cards">@for (i of [1,2,3,4,5,6,7,8]; track i) {<div class="card h-40 bg-[color:var(--surface-inset)]"></div>}</div>
          </div>
        } @else if (query().trim().length > 1) {
          <!-- Search results, on any view. -->
          <section class="max-w-4xl" aria-labelledby="resultsTitle" data-test="doc-results">
            <div class="flex flex-wrap items-baseline gap-3">
              <h2 id="resultsTitle" class="text-xl font-semibold tracking-tight">Search results</h2>
              <p class="text-sm text-[color:var(--text-muted)]" aria-live="polite">{{ hits().length }} {{ hits().length === 1 ? 'article' : 'articles' }} for “{{ query().trim() }}”</p>
              <button type="button" class="btn btn-default btn-sm ml-auto" (click)="query.set('')">Clear search</button>
            </div>
            @if (hits().length) {
              <div class="card mt-4 overflow-hidden">
                @for (h of hits(); track h.article.id) {
                  <a class="row-link flex items-start gap-3 px-4 py-3" [href]="'/docs#' + (h.part ?? h.article.id)" (click)="open($event, h.part ?? h.article.id)" data-test="doc-hit">
                    <span class="ticon !w-8 !h-8 mt-0.5"><app-icon [name]="topicOf(h.article)?.icon ?? 'file'" size="0.95em" /></span>
                    <span class="min-w-0">
                      <span class="block text-xs text-[color:var(--text-muted)]">{{ topicOf(h.article)?.title }} · {{ h.article.section }}</span>
                      <span class="block font-semibold">{{ h.article.title }}@if (h.partTitle) {<span class="font-normal text-[color:var(--text-muted)]"> › {{ h.partTitle }}</span>}</span>
                      <span class="block mt-0.5 text-sm text-[color:var(--text-secondary)]">@for (s of h.snippet; track $index) {@if (s.hit) {<mark class="hit">{{ s.text }}</mark>} @else {<span>{{ s.text }}</span>}}</span>
                    </span>
                  </a>
                }
              </div>
            } @else {
              <div class="card mt-4 p-8 text-center">
                <p class="font-medium">Nothing matches “{{ query().trim() }}”.</p>
                <p class="mt-1 text-sm text-[color:var(--text-secondary)]">Try fewer words, or browse the topics.</p>
              </div>
            }
          </section>
        } @else {
          @switch (view().kind) {
            @case ('home') {
              <div class="flex flex-col gap-12">
                <section aria-labelledby="topicsTitle">
                  <div class="flex flex-wrap items-baseline gap-3">
                    <h2 id="topicsTitle" class="text-lg font-semibold tracking-tight">Browse by topic</h2>
                    @if (auth.isLoggedIn() && topics().length < (data()?.topics?.length ?? 0)) {
                      <p class="text-sm text-[color:var(--text-muted)]">The topics for the pages you can open.</p>
                    }
                  </div>
                  <div class="grid-cards mt-4">
                    @for (t of mainTopics(); track t.id) {
                      <div class="card lift p-4 flex flex-col gap-3 min-w-0" [attr.data-topic]="t.id">
                        <a class="flex items-start gap-3" [href]="'/docs#topic-' + t.id" (click)="go($event, 'topic-' + t.id)">
                          <span class="ticon"><app-icon [name]="t.icon" size="1.1em" /></span>
                          <span class="min-w-0">
                            <span class="block eyebrow !text-[0.7rem]">{{ partName(t) }}</span>
                            <span class="block font-semibold leading-snug mt-0.5">{{ t.title }}</span>
                            <span class="block text-sm text-[color:var(--text-secondary)] mt-1">{{ t.blurb }}</span>
                          </span>
                        </a>
                        <ul class="flex flex-col gap-1.5 text-sm pl-12">
                          @for (a of articlesOf(t).slice(0, 3); track a.id) {
                            <li><a class="link-inline" [href]="'/docs#' + a.id" (click)="open($event, a.id)">{{ a.title }}</a></li>
                          }
                        </ul>
                        <a class="text-sm text-[color:var(--accent-text)] font-medium pl-12 mt-auto" [href]="'/docs#topic-' + t.id" (click)="go($event, 'topic-' + t.id)" data-test="topic-count">
                          All {{ countText(articlesOf(t).length) }} →</a>
                      </div>
                    }
                  </div>
                </section>

                @if (buildTopics().length) {
                  <section class="card p-8 help-hero !border" aria-labelledby="buildTitle" data-test="doc-build">
                    <p class="eyebrow">Build it yourself</p>
                    <h2 id="buildTitle" class="mt-1 text-xl font-semibold tracking-tight">Follow a recipe, then test it</h2>
                    <p class="mt-1 text-sm text-[color:var(--text-secondary)] max-w-3xl">Each recipe builds a worked example from an empty
                      workspace, with synthetic sample files to download; the test guide is a numbered checklist to try every part.</p>
                    <div class="mt-5 grid gap-4 lg:grid-cols-2">
                      @for (t of buildTopics(); track t.id) {
                        <div class="card p-4 min-w-0" [attr.data-topic]="t.id">
                          <a class="flex items-center gap-3" [href]="'/docs#topic-' + t.id" (click)="go($event, 'topic-' + t.id)">
                            <span class="ticon"><app-icon [name]="t.icon" size="1.1em" /></span>
                            <span class="font-semibold">{{ t.title }}</span>
                            <span class="ml-auto text-sm text-[color:var(--accent-text)] font-medium" data-test="topic-count">All {{ countText(articlesOf(t).length) }} →</span>
                          </a>
                          <ul class="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm leading-snug" data-test="doc-build-list">
                            @for (a of articlesOf(t).slice(0, 8); track a.id) {
                              <li class="min-w-0"><a class="link-inline !inline whitespace-normal" [href]="'/docs#' + a.id" (click)="open($event, a.id)">{{ a.title }}</a></li>
                            }
                          </ul>
                        </div>
                      }
                    </div>
                  </section>
                }
                <div class="grid gap-6 lg:grid-cols-2">
                  <section class="card overflow-hidden" aria-labelledby="howTitle">
                    <h2 id="howTitle" class="px-4 py-3 border-b border-subtle text-base font-semibold">Popular how-tos</h2>
                    @for (h of howTos().slice(0, 10); track h.id) {
                      <a class="row-link flex items-center gap-3 px-4 py-3" [href]="'/docs#' + h.id" (click)="open($event, h.id)" data-test="doc-howto">
                        <app-icon name="checkCircle" class="icon-muted shrink-0" />
                        <span class="text-sm flex-1 min-w-0">{{ h.popular }}</span>
                        <span class="text-xs text-[color:var(--text-muted)] hidden sm:inline">{{ topicOf(h)?.title }}</span>
                      </a>
                    }
                  </section>
                  <section class="card overflow-hidden" aria-labelledby="newTitle">
                    <div class="px-4 py-3 border-b border-subtle flex items-center gap-2">
                      <h2 id="newTitle" class="text-base font-semibold">What's new</h2>
                      @if (apiChangelog()) { <a routerLink="/developers/portal/changelog" class="link-inline text-sm ml-auto">API changelog</a> }
                    </div>
                    @for (n of whatsNew().slice(0, 8); track n.title) {
                      <a class="row-link flex items-start gap-3 px-4 py-3" [href]="'/docs#' + n.article" (click)="open($event, n.article)" data-test="doc-new">
                        <span class="text-xs mono text-[color:var(--text-muted)] whitespace-nowrap w-24 shrink-0 mt-0.5">{{ day(n.date) }}</span>
                        <span class="min-w-0"><span class="block text-sm font-semibold">{{ n.title }}</span><span class="block text-sm text-[color:var(--text-secondary)]">{{ n.text }}</span></span>
                      </a>
                    } @empty { <p class="px-4 py-3 text-sm text-[color:var(--text-muted)]">Nothing new for the pages you can open.</p> }
                  </section>
                </div>
              </div>
            }

            @case ('topic') {
              @let t = topicView()!;
              <nav class="text-sm text-[color:var(--text-muted)] flex items-center gap-1.5" aria-label="Breadcrumb">
                <a href="/docs" class="link-inline" (click)="go($event, '')">Help centre</a><app-icon name="chevronRight" size="0.8em" /><span>{{ t.title }}</span>
              </nav>
              <section class="card mt-4 p-8 help-hero !border" aria-labelledby="topicTitle" data-test="topic-hero">
                <div class="flex flex-col lg:flex-row lg:items-start gap-6">
                  <span class="ticon ticon-lg"><app-icon [name]="t.icon" size="1.4em" /></span>
                  <div class="min-w-0 flex-1">
                    <p class="eyebrow">Chapter {{ t.chapter }} · {{ t.part }}</p>
                    <h1 id="topicTitle" class="mt-1 text-3xl font-semibold tracking-tight">{{ t.title }}</h1>
                    <div class="mt-3 max-w-3xl text-[color:var(--text-secondary)]"><app-help-body [blocks]="summaryOf(t)" (go)="openId($event)" /></div>
                    <p class="mt-4 flex flex-wrap items-center gap-2">
                      <a class="btn btn-primary btn-sm" [href]="'/docs#chapter-' + t.id" (click)="go($event, 'chapter-' + t.id)" data-test="doc-chapter-link">
                        <app-icon name="list" />Read the whole chapter</a>
                      @if (consolePage(t); as p) { <a class="btn btn-default btn-sm" [routerLink]="p.path">Open {{ p.label }}<app-icon name="arrowRight" size="0.9em" /></a> }
                      <span class="text-sm text-[color:var(--text-muted)] ml-1">{{ countText(articlesOf(t).length) }} · about {{ minutesOf(t) }} minutes to read</span>
                    </p>
                  </div>
                  <nav class="lg:w-72 shrink-0 card p-4" aria-label="In this topic" data-test="topic-sections">
                    <p class="eyebrow mb-2">In this topic</p>
                    <ul class="flex flex-col gap-1.5 text-sm">
                      @for (sec of sectionsOf(t); track sec.name) {
                        <li class="flex items-center gap-2"><a class="link-inline" [href]="'/docs#' + sec.articles[0].id" (click)="open($event, sec.articles[0].id)">{{ sec.name }}</a>
                          <span class="ml-auto text-xs text-[color:var(--text-muted)]">{{ sec.articles.length }}</span></li>
                      }
                    </ul>
                  </nav>
                </div>
              </section>

              @if (t.start.length) {
                <section class="mt-10" aria-labelledby="startTitle" data-test="topic-start">
                  <h2 id="startTitle" class="text-lg font-semibold tracking-tight">Start here</h2>
                  <ol class="start-grid mt-4">
                    @for (s of t.start; track s.article; let i = $index) {
                      <li class="card lift overflow-hidden flex flex-col">
                        <a class="flex flex-col h-full" [href]="'/docs#' + s.article" (click)="open($event, s.article)">
                          @if (s.figure && figures()[s.figure]) {
                            <span class="thumb" [class.crop]="fullScreen(s.figure)"><img [src]="thumbSrc(s.figure)" alt="" loading="lazy" decoding="async" /></span>
                          }
                          <span class="p-4 flex gap-3">
                            <span class="num">{{ i + 1 }}</span>
                            <span class="min-w-0"><span class="block font-semibold leading-snug">{{ s.title }}</span>
                              <span class="block text-sm text-[color:var(--text-secondary)] mt-1">{{ s.text }}</span></span>
                          </span>
                        </a>
                      </li>
                    }
                  </ol>
                </section>
              }

              <div class="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem] items-start">
                <section aria-labelledby="canTitle" data-test="topic-articles">
                  <h2 id="canTitle" class="text-lg font-semibold tracking-tight">What you can do</h2>
                  <div class="sec-grid mt-4">
                    @for (sec of sectionsOf(t); track sec.name) {
                      <div class="card overflow-hidden" [attr.data-section]="sec.name">
                        <h3 class="px-4 py-3 border-b border-subtle flex items-center gap-2 font-semibold">{{ sec.name }}
                          <span class="ml-auto text-xs font-normal text-[color:var(--text-muted)]">{{ countText(sec.articles.length) }}</span></h3>
                        @for (a of sec.articles; track a.id) {
                          <a class="row-link flex items-start gap-3 px-4 py-3" [href]="'/docs#' + a.id" (click)="open($event, a.id)">
                            <span class="min-w-0 flex-1"><span class="block font-medium">{{ a.title }}</span>
                              <span class="block text-sm text-[color:var(--text-secondary)] mt-0.5">{{ a.summary }}</span></span>
                            <span class="text-xs text-[color:var(--text-muted)] whitespace-nowrap mt-1">{{ a.minutes }} min</span>
                          </a>
                        }
                      </div>
                    }
                  </div>
                </section>
                <aside class="flex flex-col gap-6">
                  @if (t.faq.length) {
                    <section class="card overflow-hidden" aria-labelledby="faqTitle" data-test="topic-faq">
                      <h2 id="faqTitle" class="px-4 py-3 border-b border-subtle text-base font-semibold">Popular questions</h2>
                      @for (q of t.faq; track q.q) {
                        <details class="faq px-4 py-3">
                          <summary class="flex items-start gap-2 text-sm font-medium"><app-icon name="chevronRight" size="0.9em" class="chev icon-muted mt-0.5 shrink-0 transition-transform" />{{ q.q }}</summary>
                          <div class="mt-2 pl-6 text-sm text-[color:var(--text-secondary)]"><app-help-body [blocks]="answerOf(q.md)" (go)="openId($event)" /></div>
                        </details>
                      }
                    </section>
                  }
                  @if (relatedTopics(t).length) {
                    <section class="card p-4" aria-labelledby="relTitle">
                      <h2 id="relTitle" class="text-base font-semibold">Related topics</h2>
                      <ul class="mt-3 flex flex-col gap-2">
                        @for (o of relatedTopics(t); track o.id) {
                          <li><a class="flex items-center gap-3 text-sm" [href]="'/docs#topic-' + o.id" (click)="go($event, 'topic-' + o.id)">
                            <span class="ticon !w-8 !h-8"><app-icon [name]="o.icon" size="0.95em" /></span>
                            <span class="min-w-0"><span class="block font-medium">{{ o.title }}</span><span class="block text-xs text-[color:var(--text-muted)] truncate">{{ o.blurb }}</span></span></a></li>
                        }
                      </ul>
                    </section>
                  }
                </aside>
              </div>
            }

            @default {
              <!-- One article, or a whole chapter: the topic's sections, the text, its own contents. -->
              @let t = navTopic();
              <div class="doc-grid">
                <nav class="doc-nav" aria-label="Articles">
                  <div class="sticky top-20 flex flex-col gap-0.5 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
                    <a href="/docs" class="nav-link flex items-center gap-2" (click)="go($event, '')"><app-icon name="arrowLeft" size="0.9em" />Help centre</a>
                    @if (t) {
                      <a class="nav-link !font-semibold !text-[color:var(--text-primary)] mt-2" [href]="'/docs#topic-' + t.id" (click)="go($event, 'topic-' + t.id)">{{ t.title }}</a>
                      @for (sec of sectionsOf(t); track sec.name) {
                        <p class="eyebrow mt-3 mb-0.5 px-2.5">{{ sec.name }}</p>
                        @for (a of sec.articles; track a.id) {
                          <a class="nav-link" [class.on]="currentArticle()?.id === a.id" [attr.aria-current]="currentArticle()?.id === a.id ? 'page' : null"
                             [href]="'/docs#' + a.id" (click)="open($event, a.id)">{{ a.title }}</a>
                        }
                      }
                      <a class="nav-link mt-3 flex items-center gap-2" [class.on]="view().kind === 'chapter'" [href]="'/docs#chapter-' + t.id" (click)="go($event, 'chapter-' + t.id)">
                        <app-icon name="list" size="0.9em" />Read the whole chapter</a>
                    }
                  </div>
                </nav>

                <main class="doc-article">
                  <details #navSmall class="nav-fold card p-4 mb-4 no-print">
                    <summary class="text-sm font-medium cursor-pointer">{{ t?.title ?? 'Articles' }}: all articles</summary>
                    <ul class="mt-3 flex flex-col gap-1.5 text-sm">
                      @if (t) { @for (a of articlesOf(t); track a.id) {
                        <li><a class="text-[color:var(--text-secondary)] hover:underline" [href]="'/docs#' + a.id" (click)="open($event, a.id); navSmall.open = false">{{ a.title }}</a></li>
                      } }
                    </ul>
                  </details>

                  <nav class="text-sm text-[color:var(--text-muted)] flex flex-wrap items-center gap-1.5" aria-label="Breadcrumb">
                    <a href="/docs" class="link-inline" (click)="go($event, '')">Help centre</a>
                    @if (t) { <app-icon name="chevronRight" size="0.8em" /><a [href]="'/docs#topic-' + t.id" class="link-inline" (click)="go($event, 'topic-' + t.id)">{{ t.title }}</a> }
                    @if (currentArticle(); as a) { <app-icon name="chevronRight" size="0.8em" /><span>{{ a.section }}</span> }
                  </nav>

                  <details #tocSmall class="toc-fold mt-4 card p-4 no-print">
                    <summary class="text-sm font-medium cursor-pointer">On this page</summary>
                    <ul class="mt-3 flex flex-col gap-1.5 text-sm">
                      @for (s of contents(); track s.id) {
                        <li><a class="text-[color:var(--text-secondary)] hover:underline" [href]="'/docs#' + s.id" (click)="jump($event, s.id); tocSmall.open = false">{{ s.title }}</a></li>
                      }
                    </ul>
                  </details>

                  @if (view().kind === 'chapter' && t) {
                    <p class="eyebrow mt-6">Chapter {{ t.chapter }} · {{ t.part }}</p>
                    <h1 class="mt-1 text-3xl font-semibold tracking-tight">{{ t.title }}</h1>
                    <div class="mt-3 text-lg text-[color:var(--text-secondary)]"><app-help-body [blocks]="summaryOf(t)" (go)="openId($event)" /></div>
                  }

                  @for (a of shownArticles(); track a.id) {
                    <article [attr.data-article]="a.id" [class.mt-14]="view().kind === 'chapter'" [class.mt-6]="view().kind !== 'chapter'">
                      @if (view().kind === 'chapter') {
                        <h2 [id]="a.id" class="text-2xl font-semibold tracking-tight scroll-mt-20">{{ a.title }}</h2>
                      } @else {
                        <h1 [id]="a.id" class="text-3xl font-semibold tracking-tight">{{ a.title }}</h1>
                      }
                      <p class="mt-3 text-lg text-[color:var(--text-secondary)]">{{ a.summary }}</p>
                      @if (a.who || a.where?.length) {
                        <dl class="mt-5 card p-4 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] gap-x-6 text-sm" data-test="doc-meta">
                          @if (a.who) { <dt class="eyebrow pt-0.5">Who</dt><dd class="text-[color:var(--text-secondary)]">{{ a.who }}</dd> }
                          @if (a.where?.length) {
                            <dt class="eyebrow pt-0.5">Where</dt>
                            <dd class="flex flex-wrap gap-x-4 gap-y-1" data-test="doc-where">
                              @for (w of a.where; track w.path) { <a class="link-inline" [routerLink]="w.path">{{ w.label }}</a> }
                            </dd>
                          }
                          <dt class="eyebrow pt-0.5">Reading</dt><dd class="text-[color:var(--text-secondary)]">about {{ a.minutes }} minute{{ a.minutes === 1 ? '' : 's' }}</dd>
                        </dl>
                      }
                      <div class="mt-6">
                        <app-help-body [blocks]="bodyOf(a)" [figures]="figures()" [shift]="view().kind === 'chapter' ? 1 : 0" [menu]="menuRows()"
                                       (go)="openId($event)" (zoom)="zoomed.set($event)" />
                      </div>
                    </article>
                  }

                  @if (currentArticle(); as a) {
                    @if (relatedOf(a).length) {
                      <section class="mt-12 no-print" aria-labelledby="relatedTitle" data-test="doc-related">
                        <h2 id="relatedTitle" class="text-base font-semibold">Related articles</h2>
                        <div class="mt-3 grid gap-3 sm:grid-cols-2">
                          @for (r of relatedOf(a); track r.id) {
                            <a class="card lift p-4 min-w-0" [href]="'/docs#' + r.id" (click)="open($event, r.id)">
                              <span class="block text-xs text-[color:var(--text-muted)]">{{ topicOf(r)?.title }}</span>
                              <span class="block font-semibold mt-0.5">{{ r.title }}</span>
                              <span class="block text-sm text-[color:var(--text-secondary)] mt-1 line-clamp-2">{{ r.summary }}</span>
                            </a>
                          }
                        </div>
                      </section>
                    }
                    @let near = neighbours();
                    <nav class="mt-10 grid gap-3 sm:grid-cols-2 no-print" aria-label="Previous and next article" data-test="doc-pager">
                      @if (near.prev; as p) {
                        <a class="card lift flex flex-col gap-0.5 p-4 min-w-0" [href]="'/docs#' + p.id" (click)="open($event, p.id)" data-test="doc-prev">
                          <span class="text-xs text-[color:var(--text-muted)] flex items-center gap-1"><app-icon name="arrowLeft" size="0.9em" />Previous</span>
                          <span class="font-semibold">{{ p.title }}</span></a>
                      } @else { <span></span> }
                      @if (near.next; as n) {
                        <a class="card lift flex flex-col gap-0.5 p-4 min-w-0 text-right items-end" [href]="'/docs#' + n.id" (click)="open($event, n.id)" data-test="doc-next">
                          <span class="text-xs text-[color:var(--text-muted)] flex items-center gap-1">Next<app-icon name="arrowRight" size="0.9em" /></span>
                          <span class="font-semibold">{{ n.title }}</span></a>
                      }
                    </nav>
                  }
                </main>

                <nav class="doc-aside" aria-label="Contents">
                  <div class="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
                    <p class="eyebrow mb-3">{{ view().kind === 'chapter' ? 'In this chapter' : 'On this page' }}</p>
                    <ul class="flex flex-col gap-1.5 text-sm border-l border-subtle">
                      @for (s of contents(); track s.id) {
                        <li><a class="toc-link text-[color:var(--text-secondary)] hover:underline block pl-3 -ml-px border-l border-transparent"
                               [class.on]="reading() === s.id" [attr.aria-current]="reading() === s.id ? 'location' : null"
                               [href]="'/docs#' + s.id" (click)="jump($event, s.id)">{{ s.title }}</a></li>
                      }
                    </ul>
                  </div>
                </nav>
              </div>
            }
          }
        }
      </div>

      @if (zoomed(); as z) {
        <div class="zoom" role="dialog" aria-modal="true" [attr.aria-label]="z.alt" (click)="zoomed.set(null)" (keydown.escape)="zoomed.set(null)" tabindex="-1" data-test="doc-zoom">
          <figure class="flex flex-col items-center gap-3">
            <img [src]="z.src" [alt]="z.alt" />
            @if (z.caption) { <figcaption class="text-sm text-[color:var(--btn-primary-fg)] max-w-3xl text-center">{{ z.caption }}</figcaption> }
          </figure>
        </div>
      }

      <footer class="mt-auto border-t border-subtle">
        <div class="mx-auto w-full max-w-[100rem] px-5 lg:px-8 py-6 flex flex-wrap items-center gap-3">
          <a routerLink="/" class="link-inline text-sm">← Back to the front page</a>
          <span class="text-sm text-[color:var(--text-muted)]">Every example in this help is fictional and its data synthetic.</span>
          @if (auth.isLoggedIn()) { <a routerLink="/dashboard" class="link-inline ml-auto text-sm">Back to console</a> }
          @else { <a routerLink="/login" class="link-inline ml-auto text-sm">Sign in</a> }
        </div>
      </footer>
    </div>
  `,
})
export class Docs {
  readonly theme = inject(ThemeService);
  readonly auth = inject(AuthService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly nav = inject(NavAccess);
  private readonly content = inject(HelpContent);
  private readonly title = inject(Title);

  readonly data = signal<HelpData | null>(null);
  readonly loadError = signal('');
  readonly current = signal('');
  readonly query = signal('');
  readonly zoomed = signal<{ src: string; alt: string; caption: string } | null>(null);
  /** The address's fragment: '' (the front), 'topic-<id>', 'chapter-<id>', an article's id or one of its parts' ids. */
  readonly hash = signal(Docs.hashNow());

  readonly figures = computed(() => this.data()?.figures ?? {});
  readonly figureCount = computed(() => Object.keys(this.figures()).length);
  private readonly byId = computed(() => {
    const m = new Map<string, HelpArticle>();
    for (const a of this.data()?.articles ?? []) { m.set(a.id, a); for (const al of a.aliases ?? []) if (!m.has(al)) m.set(al, a); }
    return m;
  });
  private readonly topicById = computed(() => new Map((this.data()?.topics ?? []).map(t => [t.id, t])));

  /** The topics and articles the reader is offered: signed in, those about a page their menu opens (or none); else all. */
  readonly topics = computed(() => (this.data()?.topics ?? []).filter(t => this.offered(t.paths)));
  readonly articles = computed(() => {
    const open = new Set(this.topics().map(t => t.id));
    return (this.data()?.articles ?? []).filter(a => open.has(a.topic) && this.offered(a.where?.map(w => w.path) ?? []));
  });
  /** The topics with articles for this reader: the book's chapters, then Build it yourself (recipes, the test guide). */
  private readonly withArticles = computed(() => this.topics().filter(t => this.articlesOf(t).length));
  readonly mainTopics = computed(() => this.withArticles().filter(t => !t.part.includes('Build it yourself')));
  readonly buildTopics = computed(() => this.withArticles().filter(t => t.part.includes('Build it yourself')));
  /** The popular how-tos, one topic after another so the front does not open on one topic's list. */
  readonly howTos = computed(() => {
    const per = this.mainTopics().map(t => this.articlesOf(t).filter(a => a.popular));
    const out: HelpArticle[] = [];
    for (let i = 0; per.some(l => l.length > i); i++) for (const l of per) if (l[i]) out.push(l[i]);
    return out;
  });
  readonly whatsNew = computed(() => (this.data()?.whatsNew ?? []).filter(n => this.articleFor(n.article) && this.articles().includes(this.articleFor(n.article)!)));
  readonly apiChangelog = computed(() => this.auth.isLoggedIn() && this.offered(['/developers/portal/changelog']));

  readonly view = computed<View>(() => {
    const h = this.hash();
    if (!this.data()) return { kind: 'home' };
    if (h.startsWith('topic-') || h.startsWith('chapter-')) {
      const topic = this.topicById().get(h.slice(h.indexOf('-') + 1));
      if (topic) return { kind: h.startsWith('topic-') ? 'topic' : 'chapter', topic };
    }
    const article = this.articleFor(h);
    return article ? { kind: 'article', article } : { kind: 'home' };
  });
  readonly topicView = computed(() => { const v = this.view(); return v.kind === 'topic' ? v.topic : null; });
  readonly currentArticle = computed(() => { const v = this.view(); return v.kind === 'article' ? v.article : null; });
  /** The topic whose sections the left side lists: the chapter's, or the article's. */
  readonly navTopic = computed(() => {
    const v = this.view();
    return v.kind === 'chapter' ? v.topic : v.kind === 'article' ? this.topicById().get(v.article.topic) ?? null : null;
  });
  /** One article, or (a chapter) every article of its topic the reader is offered -- a deep link still opens one. */
  readonly shownArticles = computed(() => {
    const v = this.view();
    return v.kind === 'article' ? [v.article] : v.kind === 'chapter' ? this.articlesOf(v.topic) : [];
  });
  readonly contents = computed<Part[]>(() => {
    const v = this.view();
    if (v.kind === 'article') return partsOf(this.bodyOf(v.article));
    return v.kind === 'chapter' ? this.articlesOf(v.topic).map(a => ({ id: a.id, title: a.title })) : [];
  });
  readonly reading = computed(() => this.current() || this.contents()[0]?.id || '');

  /** Previous and next in the book's order, across topics. */
  readonly neighbours = computed(() => {
    const list = this.topics().flatMap(t => this.articlesOf(t));
    const at = list.findIndex(a => a.id === this.currentArticle()?.id);
    return { prev: at > 0 ? list[at - 1] : null, next: at >= 0 && at < list.length - 1 ? list[at + 1] : null };
  });

  readonly hits = computed<SearchHit[]>(() => (this.query().trim().length > 1 ? search(this.articles(), this.query()) : []));

  /** The menu's groups, entries and tabs, from the menu's own tree, with whether the reader's menu links each. */
  readonly menuRows = computed<MenuRow[]>(() => NAV.flatMap((item): { group: string; entry: string; path: string; tabs: string; gate: NavGate & { tabs?: NavTab[] } }[] => item.children
    ? item.children.filter(c => !c.crumbOnly).map(c => ({ group: item.label, entry: c.label, path: c.path, tabs: (c.tabs ?? []).map(t => t.label).join(', '), gate: c }))
    : item.path ? [{ group: '', entry: item.label, path: item.path, tabs: (item.tabs ?? []).map(t => t.label).join(', '), gate: item }] : [])
    .map(m => {
      const role = roleOnly(m.gate);
      const linked = this.auth.isLoggedIn() ? this.nav.visible(m.gate) : !role;
      return { group: m.group, entry: m.entry, path: m.path, tabs: m.tabs, linked, why: role ? `for ${role}` : 'not in your page access' };
    }));

  constructor() {
    const onPop = () => this.apply(Docs.hashNow());
    window.addEventListener('popstate', onPop);
    const onScroll = () => this.spy();
    window.addEventListener('scroll', onScroll, { passive: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.zoomed.set(null); };
    window.addEventListener('keydown', onKey);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('popstate', onPop); window.removeEventListener('scroll', onScroll); window.removeEventListener('keydown', onKey);
    });
    // The tab names what is open: "<Article or Topic> · Help · ETL Console".
    effect(() => this.title.setTitle(`${this.pageName()}${this.pageName() ? ' · ' : ''}Help · ETL Console`));
    this.load();
    afterNextRender(() => this.land(this.hash()));
  }

  load(): void {
    this.loadError.set('');
    this.content.load().then(d => { this.data.set(d); setTimeout(() => this.land(this.hash())); })
      .catch((e: Error) => this.loadError.set(e.message || 'Try again in a moment.'));
  }

  private pageName(): string {
    if (this.query().trim().length > 1) return `Search: ${this.query().trim()}`;
    const v = this.view();
    switch (v.kind) {
      case 'article': return v.article.title;
      case 'topic': return v.topic.title;
      case 'chapter': return `${v.topic.title} (whole chapter)`;
      default: return '';
    }
  }

  private static hashNow(): string {
    const h = decodeURIComponent((typeof location !== 'undefined' ? location.hash : '').replace(/^#/, ''));
    return h === 'all' ? '' : h;
  }

  /** The article an id names: its own (or an older address it took over), or the one whose part it is. */
  private articleFor(id: string): HelpArticle | null {
    return id ? this.byId().get(id.split('--')[0]) ?? null : null;
  }

  /** Whether a signed-in reader's menu opens any of these pages (none named: yes); signed out, always. */
  private offered(paths: string[]): boolean {
    if (!this.auth.isLoggedIn() || !paths.length) return true;
    // Our team's activity is in the menu only while the workspace is managed; how the managed service works (and that
    // a self-managed workspace's data stays its own) is worth reading either way, so its gate does not hide help.
    return paths.some(p => { const gate = gateOf(p.split('?')[0]); return !gate || this.nav.visible(gate.teamOnly ? { ...gate, teamOnly: false } : gate); });
  }

  articlesOf(t: HelpTopic): HelpArticle[] {
    const offered = new Set(this.articles().map(a => a.id));
    return t.articles.filter(id => offered.has(id)).map(id => this.byId().get(id)!);
  }

  sectionsOf(t: HelpTopic): { name: string; articles: HelpArticle[] }[] {
    const list = this.articlesOf(t);
    return t.sections.map(name => ({ name, articles: list.filter(a => a.section === name) })).filter(s => s.articles.length);
  }

  topicOf(a: HelpArticle): HelpTopic | null { return this.topicById().get(a.topic) ?? null; }
  partName(t: HelpTopic): string { return `Chapter ${t.chapter} · ${t.part.replace(/^Part [IVX]+ · /, '')}`; }
  /** A full-screen shot shows its main area in a small picture (the menu cropped off); a panel or a dialog shows whole. */
  fullScreen(name: string | null): boolean { return !!name && (this.figures()[name]?.[0] ?? 0) >= 1900; }
  relatedTopics(t: HelpTopic): HelpTopic[] {
    const open = new Set(this.topics().map(x => x.id));
    return t.related.filter(id => open.has(id)).map(id => this.topicById().get(id)!).filter(Boolean);
  }
  relatedOf(a: HelpArticle): HelpArticle[] {
    const open = new Set(this.articles().map(x => x.id));
    return (a.related ?? []).filter(id => open.has(id)).map(id => this.byId().get(id)!).slice(0, 6);
  }
  /** The first console page of a topic the reader may open, to go and do it. */
  consolePage(t: HelpTopic): { label: string; path: string } | null {
    if (!this.auth.isLoggedIn()) return null;
    for (const p of t.paths) {
      const gate = gateOf(p);
      if (gate && this.nav.visible(gate)) return { label: (gate as { label?: string }).label ?? t.title, path: p };
    }
    return null;
  }
  minutesOf(t: HelpTopic): number { return this.articlesOf(t).reduce((n, a) => n + a.minutes, 0); }
  bodyOf(a: HelpArticle) { return blocksOf(a); }
  summaryOf(t: HelpTopic) { return blocksOfText(t.summary); }
  answerOf(md: string) { return blocksOfText(md); }
  src(name: string): string { return figureSrc(name); }
  thumbSrc(name: string): string { return figureSrc(name).replace(/\.webp$/, '.sm.webp'); }
  countText(n: number): string { return `${n} article${n === 1 ? '' : 's'}`; }
  day(iso: string): string { return dayText(iso); }
  spans(text: string) { return spansOf(text); }

  /** Goes to the front (''), a topic or a chapter as a page of its own: a new history entry, the top of the page. */
  go(event: Event, hash: string): void {
    event.preventDefault();
    this.query.set('');
    history.pushState(history.state, '', `${location.pathname}${location.search}${hash ? '#' + hash : ''}`);
    this.apply(hash);
  }

  /** Opens an article, at one of its parts when named. */
  open(event: Event, id: string): void { this.go(event, id); }
  openId(id: string): void { this.go(new Event('click'), id); }

  private apply(hash: string): void {
    this.hash.set(hash === 'all' ? '' : hash);
    this.current.set('');
    this.zoomed.set(null);
    setTimeout(() => this.land(hash));
  }

  /** After a view is drawn: scroll to the part named, or to the top. */
  private land(hash: string): void {
    const el = hash.includes('--') ? (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(`[id="${hash}"]`) : null;
    if (el?.scrollIntoView) el.scrollIntoView({ block: 'start' });
    else { try { window.scrollTo({ top: 0 }); } catch { /* not in a test's DOM */ } }
    this.spy();
  }

  /** Scrolls to a heading of the page being read; the address gains the fragment, so the heading can be linked to. */
  jump(event: Event, id: string): void {
    const target = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(`[id="${id}"]`);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(history.state, '', `${location.pathname}${location.search}#${id}`);
    this.current.set(id);
  }

  private spy(): void {
    const ids = this.contents().map(c => c.id);
    if (!ids.length) { this.current.set(''); return; }
    const root = this.host.nativeElement as HTMLElement;
    let reading = ids[0];
    for (const id of ids) {
      const heading = root.querySelector<HTMLElement>(`[id="${id}"]`);
      if (!heading || heading.getBoundingClientRect().top > 100) break;
      reading = id;
    }
    this.current.set(reading);
  }
}

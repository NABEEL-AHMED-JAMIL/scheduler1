import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../../shared/ui/brand-mark';
import { copyText } from '../../shared/ui/clipboard.util';
import { dayText } from '../../shared/ui/date-field';
import { ThemeService } from '../../core/theme.service';
import { AuthService } from '../../core/auth/auth.service';
import { NAV, NavGate, NavTab } from '../../core/nav/nav-tree';
import { NavAccess } from '../../core/nav/nav-access';
import { FREQUENCIES, HOW_TOS, OUTCOMES, REFERENCE, ROLES, STEPS, Step, TOPICS, Topic, WHATS_NEW } from './docs-content';

/** The menu as a map (Reference): every group, its entries and, for a hub, its tabs -- read from the menu's own tree. */
interface MapRow { group: string; entry: string; path: string; tabs: string; gate: NavGate & { tabs?: NavTab[] }; }

/** One article as the help centre lists it: the twelve tasks in the menu's order, then the Reference. */
export interface Article { id: string; title: string; intro: string; step: Step | null; }

/** A heading inside an article, for the article's own contents ("On this page"). */
interface Part { id: string; title: string; }

/** One search hit: the article, the part it is in, and the words around the match with the matched words marked. */
export interface SearchHit { article: Article; part: Part | null; snippet: { text: string; hit: boolean }[]; }

/** What the page shows: the help centre's front, a topic, one article, or every article on one page (to read or print). */
type View = { kind: 'home' } | { kind: 'topic'; topic: Topic } | { kind: 'article'; article: Article } | { kind: 'all' };

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

/** An article's headings: where it is done, the steps, the details, what is good to know (the Reference: its four tables). */
export function partsOf(article: Article): Part[] {
  const s = article.step;
  if (!s) {
    return [{ id: 'reference--menu', title: 'The menu' }, { id: 'reference--frequencies', title: 'Schedule frequencies' },
      { id: 'reference--roles', title: 'Roles' }, { id: 'reference--outcomes', title: 'Run outcomes' }];
  }
  return [
    ...(s.where?.length ? [{ id: `${s.id}--where`, title: 'Where it is done' }] : []),
    ...(s.todo?.length || s.code?.length ? [{ id: `${s.id}--steps`, title: 'Steps' }] : []),
    ...(s.fields?.length ? [{ id: `${s.id}--details`, title: 'Details' }] : []),
    ...(s.notes?.length || s.tip || s.warn ? [{ id: `${s.id}--know`, title: 'Good to know' }] : []),
  ];
}

const WORDS = (q: string) => q.toLowerCase().split(/\s+/).filter(w => w.length > 1);

/** The words around the first match, with every matched word marked, at most about 200 characters. */
function snippetOf(text: string, words: string[]): { text: string; hit: boolean }[] {
  const lower = text.toLowerCase();
  const first = Math.min(...words.map(w => lower.indexOf(w)).filter(i => i >= 0));
  const start = Math.max(0, first - 70);
  const end = Math.min(text.length, start + 200);
  const cut = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  const pattern = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return cut.split(pattern).filter(p => p).map(p => ({ text: p, hit: words.includes(p.toLowerCase()) }));
}

/**
 * The in-app guide as a help centre (owner 2026-10-26: "looks too simple").
 *
 * Public, like the landing page, so it can be linked to and read before signing in -- it describes the console's own
 * screens and carries nothing tenant-specific. The front page searches every article and groups them by topic (the
 * client book's chapters, docs/showcase/guide-outline.md); an article reads in two columns -- the articles on the left,
 * the article with its own contents on the right on a wide screen -- with tips, notes and warnings, samples to copy and
 * the previous and next article. The articles stay task-oriented and in the menu's order (docs-content.ts), and an
 * address with an article's id (/docs#review), as the one-page guide had, opens that article. Signed in, the front page,
 * the article list and the search offer only what the reader's menu opens (the menu's own rule, NavAccess); signed out,
 * everything. The menu map in the reference is read from the menu's own tree (core/nav/nav-tree.ts), so it cannot name
 * a menu that is gone.
 *
 * No "Was this helpful?": a vote kept in the browser tells nobody anything, and keeping it on the server needs a public
 * endpoint of its own; left out until one exists.
 */
@Component({
  selector: 'app-docs',
  imports: [RouterLink, NgTemplateOutlet, Icon, BrandMark],
  styles: [`
    :host { display: block; }
    .doc h2, .doc h3 { scroll-margin-top: 5rem; }
    .doc-body p, .doc-body li { line-height: 1.7; }
    .toc-link.is-current { color: var(--accent-text); font-weight: 600; border-color: var(--accent-mark); }
    .num {
      display: grid; place-items: center; flex: none;
      width: 1.6rem; height: 1.6rem; border-radius: 999px;
      font-size: .75rem; font-weight: 600;
      background: var(--surface-inset); color: var(--accent-text);
      border: 1px solid var(--border-subtle);
    }
    /* The front's band: the brand's tint fading into the page, in both themes. */
    .help-hero {
      border-bottom: 1px solid var(--border-subtle);
      background:
        radial-gradient(60rem 18rem at 15% 0%, color-mix(in oklab, var(--accent-mark) 12%, transparent), transparent 70%),
        linear-gradient(180deg, color-mix(in oklab, var(--accent-mark) 6%, var(--surface-raised)), var(--surface-page));
    }
    .help-search { position: relative; }
    .help-search > app-icon { position: absolute; left: 0.9rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
    .help-search > .input { padding-left: 2.6rem; }
    .topic-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(16.5rem, 1fr)); }
    .topic-card { transition: border-color .15s, box-shadow .15s; }
    .topic-card:hover { border-color: color-mix(in oklab, var(--accent-mark) 50%, var(--border-strong));
                        box-shadow: 0 1px 0 color-mix(in oklab, var(--accent-mark) 25%, transparent); }
    .topic-card:focus-visible, .list-link:focus-visible { outline: 2px solid var(--accent-mark); outline-offset: 2px; }
    .topic-icon {
      display: grid; place-items: center; width: 2.25rem; height: 2.25rem; flex: none; border-radius: var(--radius-md);
      background: color-mix(in oklab, var(--accent-mark) 12%, var(--surface-raised)); color: var(--accent-text);
    }
    .list-link + .list-link { border-top: 1px solid var(--border-subtle); }
    /* An article: the articles on the left from 1024, its own contents on the right from 1440 (the 1920 screens). */
    .doc-grid { display: grid; gap: 2.5rem; grid-template-columns: minmax(0, 1fr); }
    @media (min-width: 1024px) { .doc-grid { grid-template-columns: 15rem minmax(0, 1fr); } }
    @media (min-width: 1440px) { .doc-grid { grid-template-columns: 16rem minmax(0, 1fr) 14rem; } }
    .doc-aside { display: none; }
    @media (min-width: 1440px) { .doc-aside { display: block; } .toc-fold { display: none; } }
    .doc-nav { display: none; }
    @media (min-width: 1024px) { .doc-nav { display: block; } .nav-fold { display: none; } }
    .doc-nav-link { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem; border-radius: var(--radius-md);
                    color: var(--text-secondary); text-decoration: none; font-size: 0.875rem; line-height: 1.3; }
    .doc-nav-link:hover { background: var(--surface-inset); color: var(--text-primary); }
    .doc-nav-link.is-on { background: color-mix(in oklab, var(--accent-mark) 10%, var(--surface-raised)); color: var(--accent-text); font-weight: 600; }
    .doc-article { max-width: 50rem; min-width: 0; }
    /* Callouts: a tip, a note and a warning, each tinted in its own tone, the text in the page's own colour. */
    .callout { display: flex; gap: 0.65rem; align-items: flex-start; padding: 0.8rem 1rem; border-radius: var(--radius-md);
               border: 1px solid var(--border-subtle); font-size: 0.875rem; line-height: 1.6; color: var(--text-primary); }
    .callout-tip  { border-color: color-mix(in oklab, var(--ok-text) 50%, var(--border-subtle));
                    background: color-mix(in oklab, var(--ok-text) 8%, var(--surface-raised)); }
    .callout-tip > app-icon { color: var(--ok-text); }
    .callout-note { border-color: color-mix(in oklab, var(--info-mark) 45%, var(--border-subtle));
                    background: color-mix(in oklab, var(--info-mark) 8%, var(--surface-raised)); }
    .callout-note > app-icon { color: var(--info-text); }
    .callout-warn { border-color: color-mix(in oklab, var(--warn-text) 55%, var(--border-subtle));
                    background: color-mix(in oklab, var(--warn-text) 9%, var(--surface-raised)); }
    .callout-warn > app-icon { color: var(--warn-text); }
    .doc-code { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; background: var(--surface-inset); }
    .doc-code-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.5rem 0.4rem 0.8rem;
                     border-bottom: 1px solid var(--border-subtle); font-size: 0.75rem; color: var(--text-secondary); }
    .doc-code pre { margin: 0; padding: 0.7rem 0.8rem; overflow-x: auto; font-size: 0.8125rem; color: var(--text-primary); }
    .pager-link:hover { border-color: color-mix(in oklab, var(--accent-mark) 50%, var(--border-strong)); }
    mark.hit { background: color-mix(in oklab, var(--warn-text) 22%, transparent); color: inherit; border-radius: var(--radius-sm); padding: 0 1px; }
  `],
  template: `
    <div class="min-h-screen flex flex-col bg-page">

      <header class="sticky top-0 z-40 border-b bg-raised border-subtle">
        <div class="mx-auto w-full max-w-[90rem] px-5 lg:px-8 h-14 flex items-center gap-3">
          <a routerLink="/">
            <app-brand-mark />
          </a>
          <a href="/docs" class="text-sm text-[color:var(--text-muted)] hover:underline hidden sm:inline" (click)="go($event, '')">Help centre</a>
          @if (view().kind !== 'home') {
            <div class="help-search flex-1 max-w-md ml-4 hidden md:block">
              <app-icon name="search" size="0.95em" />
              <input class="input input-sm w-full" type="search" placeholder="Search the help" aria-label="Search the help"
                     [value]="query()" (input)="query.set($any($event.target).value)" data-test="doc-search-top" />
            </div>
          }
          <div class="ml-auto flex items-center gap-1.5">
            <button type="button" class="btn btn-ghost btn-icon btn-sm"
                    [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light' : 'Switch to dark'"
                    (click)="theme.toggle()">
              <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
            </button>
            <!-- The guide is linked from the console's account menu, so a reader may well be signed
                 in already; telling them to sign in again was wrong. -->
            @if (auth.isLoggedIn()) {
              <a routerLink="/dashboard" class="btn btn-primary btn-sm">Back to console</a>
            } @else {
              <a routerLink="/login" class="btn btn-primary btn-sm">Sign in</a>
            }
          </div>
        </div>
      </header>

      @if (view().kind === 'home') {
        <!-- The front: search, topics, popular how-tos and what is new. ------------------------------- -->
        <section class="help-hero" aria-labelledby="helpTitle">
          <div class="mx-auto w-full max-w-[90rem] px-5 lg:px-8 py-12 lg:py-14">
            <p class="text-xs font-semibold uppercase tracking-wider text-[color:var(--accent-text)]">Help centre</p>
            <h1 id="helpTitle" class="mt-2 text-3xl font-semibold tracking-tight">How can we help?</h1>
            <p class="mt-2 text-[color:var(--text-secondary)] max-w-2xl">
              Step-by-step help for the console, in the order of the work: get data in, build a pipeline, run and schedule
              it, review what it made, and read the results.
            </p>
            <div class="help-search help-search-lg mt-6 max-w-2xl">
              <app-icon name="search" size="1.1em" />
              <input class="input w-full !h-12 !text-base" type="search" placeholder="Search every article, for example “retry failed items”"
                     aria-label="Search the help" [value]="query()" (input)="query.set($any($event.target).value)" data-test="doc-search" />
            </div>
          </div>
        </section>
      }

      <div class="mx-auto w-full max-w-[90rem] px-5 lg:px-8 py-8 lg:py-10 flex-1">
        @if (query().trim().length > 1) {
          <!-- Search results, on any view. ---------------------------------------------------------- -->
          <section class="max-w-4xl" aria-labelledby="resultsTitle" data-test="doc-results">
            <div class="flex flex-wrap items-baseline gap-3">
              <h2 id="resultsTitle" class="text-xl font-semibold tracking-tight">Search results</h2>
              <p class="text-sm text-[color:var(--text-muted)]" aria-live="polite">
                {{ hits().length }} {{ hits().length === 1 ? 'match' : 'matches' }} for “{{ query().trim() }}”
              </p>
              <button type="button" class="btn btn-default btn-sm ml-auto" (click)="query.set('')">Clear search</button>
            </div>
            @if (hits().length) {
              <div class="card mt-4 overflow-hidden">
                @for (h of hits(); track $index) {
                  <a class="list-link flex items-start gap-3 px-4 py-3 hover:bg-[color:var(--surface-inset)]" [href]="'/docs#' + (h.part?.id ?? h.article.id)" (click)="open($event, h.article.id, h.part?.id)"
                     data-test="doc-hit">
                    <app-icon name="file" class="icon-muted mt-1 shrink-0" />
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold">{{ h.article.title }}@if (h.part) { <span class="font-normal text-[color:var(--text-muted)]"> › {{ h.part.title }}</span> }</span>
                      <span class="block mt-0.5 text-sm text-[color:var(--text-secondary)]">
                        @for (s of h.snippet; track $index) {@if (s.hit) {<mark class="hit">{{ s.text }}</mark>} @else {<span>{{ s.text }}</span>}}
                      </span>
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
              <div class="flex flex-col gap-10">
                <div class="callout callout-note" role="note">
                  <app-icon name="info" class="mt-0.5 shrink-0" />
                  <p>
                    Asking for a workspace needs no account. Adding people, connections, settings and pipelines needs a
                    workspace administrator; running, reviewing and reading results is for any member whose page access
                    includes the page. The examples here are made up — use synthetic or de-identified records while you
                    set things up and try them.
                  </p>
                </div>

                <section aria-labelledby="topicsTitle">
                  <div class="flex flex-wrap items-baseline gap-3">
                    <h2 id="topicsTitle" class="text-lg font-semibold tracking-tight">Browse by topic</h2>
                    @if (auth.isLoggedIn() && topics().length < allTopics) {
                      <p class="text-sm text-[color:var(--text-muted)]">The topics for the pages you can open.</p>
                    }
                    <a href="/docs#all" class="link-inline text-sm ml-auto" (click)="go($event, 'all')" data-test="doc-all-link">Read the whole guide</a>
                  </div>
                  <div class="topic-grid mt-4">
                    @for (t of topics(); track t.id) {
                      @if (t.id === 'getting-started') {
                        <!-- The first topic spans the row: where everyone starts, with its articles to hand. -->
                        <div class="card topic-card col-span-full p-4 flex flex-wrap items-center gap-x-8 gap-y-3" [attr.data-topic]="t.id">
                          <a class="flex items-center gap-3 min-w-0 flex-1 basis-80" [href]="'/docs#topic-' + t.id" (click)="go($event, 'topic-' + t.id)">
                            <span class="topic-icon"><app-icon [name]="t.icon" size="1.1em" /></span>
                            <span class="min-w-0">
                              <span class="block font-semibold leading-snug">{{ t.title }}</span>
                              <span class="block text-sm text-[color:var(--text-secondary)]">{{ t.blurb }}</span>
                              <span class="block mt-1 text-xs text-[color:var(--text-muted)]" data-test="topic-count">{{ countText(articlesOf(t).length) }}</span>
                            </span>
                          </a>
                          <span class="flex flex-wrap items-center gap-2">
                            @for (a of articlesOf(t); track a.id) {
                              <a class="btn btn-default btn-sm" [href]="'/docs#' + a.id" (click)="open($event, a.id)">{{ a.title }}</a>
                            }
                          </span>
                        </div>
                      } @else {
                      <a class="card topic-card flex flex-col gap-2 p-4 min-w-0" [href]="'/docs#topic-' + t.id" (click)="go($event, 'topic-' + t.id)" [attr.data-topic]="t.id">
                        <span class="flex items-center gap-3">
                          <span class="topic-icon"><app-icon [name]="t.icon" size="1.1em" /></span>
                          <span class="font-semibold leading-snug">{{ t.title }}</span>
                        </span>
                        <span class="text-sm text-[color:var(--text-secondary)] flex-1">{{ t.blurb }}</span>
                        <span class="text-xs text-[color:var(--text-muted)]" data-test="topic-count">{{ countText(articlesOf(t).length) }}</span>
                      </a>
                      }
                    }
                  </div>
                </section>

                <div class="grid gap-6 lg:grid-cols-2">
                  <section class="card overflow-hidden" aria-labelledby="howTitle">
                    <h2 id="howTitle" class="px-4 py-3 border-b border-subtle text-base font-semibold">Popular how-tos</h2>
                    @for (h of howTos(); track h.title) {
                      <a class="list-link flex items-center gap-3 px-4 py-3 hover:bg-[color:var(--surface-inset)]" [href]="'/docs#' + h.article + '--steps'" (click)="open($event, h.article, h.article + '--steps')" data-test="doc-howto">
                        <app-icon name="checkCircle" class="icon-muted shrink-0" />
                        <span class="text-sm flex-1 min-w-0">{{ h.title }}</span>
                        <app-icon name="chevronRight" size="0.9em" class="icon-muted shrink-0" />
                      </a>
                    }
                  </section>
                  <section class="card overflow-hidden" aria-labelledby="newTitle">
                    <div class="px-4 py-3 border-b border-subtle flex items-center gap-2">
                      <h2 id="newTitle" class="text-base font-semibold">What's new</h2>
                      @if (apiChangelog()) {
                        <a routerLink="/developers/portal/changelog" class="link-inline text-sm ml-auto">API changelog</a>
                      }
                    </div>
                    @for (n of whatsNew(); track n.title) {
                      <a class="list-link flex items-start gap-3 px-4 py-3 hover:bg-[color:var(--surface-inset)]" [href]="'/docs#' + n.article" (click)="open($event, n.article)" data-test="doc-new">
                        <span class="text-xs mono text-[color:var(--text-muted)] whitespace-nowrap w-24 shrink-0 mt-0.5">{{ day(n.date) }}</span>
                        <span class="min-w-0">
                          <span class="block text-sm font-semibold">{{ n.title }}</span>
                          <span class="block text-sm text-[color:var(--text-secondary)]">{{ n.text }}</span>
                        </span>
                      </a>
                    }
                  </section>
                </div>

                <ng-container *ngTemplateOutlet="ready" />
              </div>
            }

            @case ('topic') {
              @let t = topicOf();
              @if (t) {
                <div>
                  <nav class="text-sm text-[color:var(--text-muted)] flex items-center gap-1.5" aria-label="Breadcrumb">
                    <a href="/docs" class="link-inline" (click)="go($event, '')">Help centre</a>
                    <app-icon name="chevronRight" size="0.8em" /><span>{{ t.title }}</span>
                  </nav>
                  <div class="mt-4 flex items-start gap-4">
                    <span class="topic-icon"><app-icon [name]="t.icon" size="1.1em" /></span>
                    <div class="min-w-0">
                      <h1 class="page-title">{{ t.title }}</h1>
                      <p class="page-subtitle">{{ t.blurb }}</p>
                    </div>
                  </div>
                  <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] items-start">
                  <div class="card overflow-hidden" data-test="topic-articles">
                    <h2 class="px-4 py-3 border-b border-subtle text-base font-semibold">{{ countText(articlesOf(t).length) }}</h2>
                    @for (a of articlesOf(t); track a.id) {
                      <a class="list-link flex items-start gap-3 px-4 py-3 hover:bg-[color:var(--surface-inset)]" [href]="'/docs#' + a.id" (click)="open($event, a.id)">
                        <span class="num mt-0.5">{{ numberOf(a) }}</span>
                        <span class="min-w-0 flex-1">
                          <span class="block font-semibold">{{ a.title }}</span>
                          <span class="block text-sm text-[color:var(--text-secondary)]">{{ a.intro }}</span>
                        </span>
                        <app-icon name="chevronRight" size="0.9em" class="icon-muted shrink-0 mt-1" />
                      </a>
                    }
                  </div>
                  <div class="flex flex-col gap-6">
                    @if (howTosOf(t).length) {
                      <section class="card overflow-hidden" aria-labelledby="topicHowTitle">
                        <h2 id="topicHowTitle" class="px-4 py-3 border-b border-subtle text-base font-semibold">How-tos</h2>
                        @for (h of howTosOf(t); track h.title) {
                          <a class="list-link flex items-center gap-3 px-4 py-3 hover:bg-[color:var(--surface-inset)]" [href]="'/docs#' + h.article + '--steps'"
                             (click)="open($event, h.article, h.article + '--steps')">
                            <app-icon name="checkCircle" class="icon-muted shrink-0" /><span class="text-sm flex-1 min-w-0">{{ h.title }}</span>
                          </a>
                        }
                      </section>
                    }
                    <section class="card p-4" aria-labelledby="otherTopicsTitle">
                      <h2 id="otherTopicsTitle" class="text-base font-semibold">Other topics</h2>
                      <div class="mt-3 flex flex-wrap gap-2">
                        @for (o of topics(); track o.id) {
                          @if (o.id !== t.id) {
                            <a class="btn btn-default btn-sm" [href]="'/docs#topic-' + o.id" (click)="go($event, 'topic-' + o.id)"><app-icon [name]="o.icon" />{{ o.title }}</a>
                          }
                        }
                      </div>
                    </section>
                  </div>
                  </div>
                  <a href="/docs" class="btn btn-default btn-sm mt-6" (click)="go($event, '')"><app-icon name="arrowLeft" />All topics</a>
                </div>
              }
            }

            @default {
              <!-- One article, or every article on one page: the articles, the text, its own contents. --- -->
              <div class="doc-grid">
                <nav class="doc-nav" aria-label="Articles">
                  <div class="sticky top-20 flex flex-col gap-1">
                    <a href="/docs" class="doc-nav-link" (click)="go($event, '')"><app-icon name="arrowLeft" size="0.9em" />Help centre</a>
                    <p class="mt-3 mb-1 px-2.5 text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">Articles</p>
                    @for (a of articles(); track a.id) {
                      <a class="doc-nav-link" [class.is-on]="currentArticle()?.id === a.id" [attr.aria-current]="currentArticle()?.id === a.id ? 'page' : null"
                         [href]="'/docs#' + a.id" (click)="open($event, a.id)">
                        <span class="num !w-[1.35rem] !h-[1.35rem] !text-[0.7rem]">{{ numberOf(a) }}</span>{{ a.title }}
                      </a>
                    }
                    <a href="/docs#all" class="doc-nav-link mt-2" [class.is-on]="view().kind === 'all'" (click)="go($event, 'all')">
                      <app-icon name="list" size="0.9em" />The whole guide on one page
                    </a>
                  </div>
                </nav>

                <main class="doc doc-body doc-article">
                  <!-- Below 1024 the articles fold away here, and below 1440 the article's own contents. -->
                  <details #navSmall class="nav-fold card p-4 mb-4">
                    <summary class="text-sm font-medium cursor-pointer">All articles</summary>
                    <ul class="mt-3 flex flex-col gap-1.5 text-sm">
                      @for (a of articles(); track a.id) {
                        <li><a class="text-[color:var(--text-secondary)] hover:underline" [href]="'/docs#' + a.id"
                               (click)="open($event, a.id); navSmall.open = false">{{ numberOf(a) }}. {{ a.title }}</a></li>
                      }
                    </ul>
                  </details>

                  @if (view().kind === 'all') {
                    <h1 class="text-3xl font-semibold tracking-tight">Using the console</h1>
                    <p class="mt-3 text-[color:var(--text-secondary)] max-w-2xl">
                      The main flow, in the menu's order: get data in, build a pipeline, run and schedule it, review what
                      it made, and read the results — then the monitoring, the people and the bill around it. Each part
                      says where it is done; the links open that page in the console.
                    </p>
                  } @else {
                    <nav class="text-sm text-[color:var(--text-muted)] flex flex-wrap items-center gap-1.5" aria-label="Breadcrumb">
                      <a href="/docs" class="link-inline" (click)="go($event, '')">Help centre</a>
                      @if (topicFor(currentArticle()!); as t) {
                        <app-icon name="chevronRight" size="0.8em" />
                        <a [href]="'/docs#topic-' + t.id" class="link-inline" (click)="go($event, 'topic-' + t.id)">{{ t.title }}</a>
                      }
                    </nav>
                  }

                  <details #tocSmall class="toc-fold mt-6 card p-4">
                    <summary class="text-sm font-medium cursor-pointer">On this page</summary>
                    <ul class="mt-3 flex flex-col gap-1.5 text-sm">
                      @for (s of contents(); track s.id) {
                        <li>
                          <a class="text-[color:var(--text-secondary)] hover:underline"
                             [href]="'/docs#' + s.id" (click)="jump($event, s.id); tocSmall.open = false">{{ s.title }}</a>
                        </li>
                      }
                    </ul>
                  </details>

                  @for (a of shownArticles(); track a.id) {
                    <section [class.mt-12]="view().kind === 'all'" [class.mt-6]="view().kind !== 'all'" [attr.data-article]="a.id">
                      @if (view().kind === 'all') {
                        <h2 [id]="a.id" class="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
                          <span class="num">{{ numberOf(a) }}</span>{{ a.title }}
                        </h2>
                      } @else {
                        <h1 [id]="a.id" class="flex items-center gap-3 text-3xl font-semibold tracking-tight">
                          <span class="num">{{ numberOf(a) }}</span>{{ a.title }}
                        </h1>
                      }
                      <p class="mt-3 text-[color:var(--text-secondary)]" [class.text-lg]="view().kind !== 'all'">{{ a.intro }}</p>

                      @if (a.step; as step) {
                        @if (step.where?.length) {
                          <h3 [id]="step.id + '--where'" data-part class="mt-8 text-base font-semibold">Where it is done</h3>
                          <p class="mt-2 text-sm flex flex-wrap items-baseline gap-x-3 gap-y-1" data-test="doc-where">
                            <span class="text-[color:var(--text-muted)]">Where:</span>
                            @for (w of step.where; track w.path) {
                              <a class="link-inline" [routerLink]="w.path">{{ w.label }}</a>
                            }
                          </p>
                        }

                        @if (step.todo?.length || step.code?.length) {
                          <h3 [id]="step.id + '--steps'" data-part class="mt-8 text-base font-semibold">Steps</h3>
                          @if (step.todo?.length) {
                            <ol class="mt-3 flex flex-col gap-2 text-sm list-decimal pl-5">
                              @for (t of step.todo; track t) { <li class="pl-1">{{ t }}</li> }
                            </ol>
                          }
                          @for (c of step.code ?? []; track c.text) {
                            <div class="doc-code mt-4" data-test="doc-code">
                              <div class="doc-code-head">
                                <span class="min-w-0 flex-1 truncate">{{ c.label }}</span>
                                <button type="button" class="btn btn-default btn-xs" [attr.aria-label]="'Copy ' + c.label" (click)="copy(c.text)">
                                  <app-icon [name]="copied() === c.text ? 'check' : 'copy'" size="0.9em" />{{ copied() === c.text ? 'Copied' : 'Copy' }}
                                </button>
                              </div>
                              <pre class="mono"><code>{{ c.text }}</code></pre>
                            </div>
                          }
                        }

                        @if (step.fields?.length) {
                          <h3 [id]="step.id + '--details'" data-part class="mt-8 text-base font-semibold">Details</h3>
                          <div class="mt-3 overflow-x-auto scroll-table">
                            <table class="table-modern">
                              <thead><tr><th>Field</th><th>What to put in it</th></tr></thead>
                              <tbody>
                                @for (f of step.fields; track f.name) {
                                  <tr>
                                    <td class="mono text-xs whitespace-nowrap align-top">
                                      {{ f.name }}
                                      @if (f.required) { <span class="text-crit-500" title="Required">*</span> }
                                    </td>
                                    <td class="text-sm">{{ f.note }}</td>
                                  </tr>
                                }
                              </tbody>
                            </table>
                          </div>
                        }

                        @if (step.notes?.length || step.tip || step.warn) {
                          <h3 [id]="step.id + '--know'" data-part class="mt-8 text-base font-semibold">Good to know</h3>
                          @if (step.tip) {
                            <div class="callout callout-tip mt-3" role="note" data-test="doc-tip">
                              <app-icon name="zap" class="mt-0.5 shrink-0" /><p><span class="font-semibold mr-1">Tip.</span>{{ step.tip }}</p>
                            </div>
                          }
                          @for (note of step.notes ?? []; track note) {
                            <p class="mt-3 text-sm text-[color:var(--text-secondary)]">{{ note }}</p>
                          }
                          @if (step.warn) {
                            <div class="callout callout-warn mt-4" role="note" data-test="doc-warn">
                              <app-icon name="alert" class="mt-0.5 shrink-0" /><p><span class="font-semibold mr-1">Warning.</span>{{ step.warn }}</p>
                            </div>
                          }
                        }
                      } @else {
                        <ng-container *ngTemplateOutlet="reference" />
                      }
                    </section>
                  }

                  @if (view().kind === 'article') {
                    @let near = neighbours();
                    <nav class="mt-14 grid gap-3 sm:grid-cols-2" aria-label="Previous and next article" data-test="doc-pager">
                      @if (near.prev; as p) {
                        <a class="card pager-link flex flex-col gap-0.5 p-4 min-w-0" [href]="'/docs#' + p.id" (click)="open($event, p.id)" data-test="doc-prev">
                          <span class="text-xs text-[color:var(--text-muted)] flex items-center gap-1"><app-icon name="arrowLeft" size="0.9em" />Previous</span>
                          <span class="font-semibold">{{ p.title }}</span>
                        </a>
                      } @else { <span></span> }
                      @if (near.next; as n) {
                        <a class="card pager-link flex flex-col gap-0.5 p-4 min-w-0 text-right items-end" [href]="'/docs#' + n.id" (click)="open($event, n.id)" data-test="doc-next">
                          <span class="text-xs text-[color:var(--text-muted)] flex items-center gap-1">Next<app-icon name="arrowRight" size="0.9em" /></span>
                          <span class="font-semibold">{{ n.title }}</span>
                        </a>
                      }
                    </nav>
                  }

                  <div class="mt-14"><ng-container *ngTemplateOutlet="ready" /></div>
                </main>

                <nav class="doc-aside" aria-label="Contents">
                  <div class="sticky top-20">
                    <p class="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)] mb-3">On this page</p>
                    <ul class="flex flex-col gap-1.5 text-sm border-l border-subtle">
                      @for (s of contents(); track s.id) {
                        <li>
                          <a class="toc-link text-[color:var(--text-secondary)] hover:underline block pl-3 -ml-px border-l border-transparent"
                             [class.is-current]="reading() === s.id"
                             [attr.aria-current]="reading() === s.id ? 'location' : null"
                             [href]="'/docs#' + s.id" (click)="jump($event, s.id)">{{ s.title }}</a>
                        </li>
                      }
                    </ul>
                  </div>
                </nav>
              </div>
            }
          }
        }
      </div>

      <ng-template #reference>
        <h3 id="reference--menu" data-part class="mt-8 text-base font-semibold">The menu</h3>
        <p class="mt-1.5 text-sm text-[color:var(--text-secondary)]">
          Grouped by the work being done. An entry with tabs is one page with a tab per part; you see the
          entries and tabs your role and page access open, and a tab you may not open is not shown.
        </p>
        <div class="mt-3 overflow-x-auto scroll-table">
          <table class="table-modern" data-test="doc-menu">
            <thead><tr><th>Group</th><th>Entry</th><th>Tabs</th></tr></thead>
            <tbody>
              @for (m of menu; track m.path) {
                <tr>
                  <td class="text-sm whitespace-nowrap text-[color:var(--text-secondary)]">{{ m.group }}</td>
                  <td class="text-sm whitespace-nowrap">
                    @if (linked(m)) {
                      <a class="link-inline" [routerLink]="m.path">{{ m.entry }}</a>
                    } @else {
                      <span data-test="doc-menu-unlinked">{{ m.entry }}</span>
                      <span class="ml-1 text-xs text-[color:var(--text-muted)]">({{ notLinkedWhy(m) }})</span>
                    }
                  </td>
                  <td class="text-sm">{{ m.tabs || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <h3 id="reference--frequencies" data-part class="mt-8 text-base font-semibold">Schedule frequencies</h3>
        <p class="mt-1.5 text-sm text-[color:var(--text-secondary)]">
          The interval is how many of that unit to wait. Only these values are offered.
        </p>
        <div class="mt-3 overflow-x-auto scroll-table">
          <table class="table-modern">
            <thead><tr><th>Frequency</th><th>Means</th><th>Intervals</th></tr></thead>
            <tbody>
              @for (f of frequencies; track f.name) {
                <tr>
                  <td class="mono text-xs whitespace-nowrap">{{ f.name }}</td>
                  <td class="text-sm">{{ f.means }}</td>
                  <td class="mono text-xs">{{ f.intervals }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="mt-3 text-sm text-[color:var(--text-secondary)]">
          Weekly can name particular weekdays, and Monthly a particular date. A day of
          <span class="mono">0</span> means the last day of the month, so February resolves
          to the 28th or 29th on its own.
        </p>

        <h3 id="reference--roles" data-part class="mt-8 text-base font-semibold">Roles</h3>
        <div class="mt-3 overflow-x-auto scroll-table">
          <table class="table-modern">
            <thead><tr><th>Role</th><th>Can reach</th></tr></thead>
            <tbody>
              @for (r of roles; track r.name) {
                <tr>
                  <td class="mono text-xs whitespace-nowrap">{{ r.name }}</td>
                  <td class="text-sm">{{ r.note }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="mt-3 text-sm text-[color:var(--text-secondary)]">
          The roles nest: a workspace administrator has everything a workspace member has, and a
          platform administrator working in a workspace (Work in this workspace) is that workspace's
          administrator for the session. On their own sign-in a platform administrator reads no
          workspace's data. Page access then narrows a member to the pages their profile names. The
          server enforces all of it, whatever the screen shows.
        </p>
        <p class="mt-3 text-sm text-[color:var(--text-secondary)]" data-test="managed-session-record">
          In Work in this workspace every change is recorded, and so is every data read — opening, exporting or
          downloading a board, a query result, an export, a document's fields, page images, approved data and its
          CSV, a run's outputs, a report PDF, a file preview or a download. The workspace sees them in Administration ›
          Our team's activity, and the platform in Platform › Staff activity. Lists and counts are not recorded.
        </p>

        <h3 id="reference--outcomes" data-part class="mt-8 text-base font-semibold">Run outcomes</h3>
        <div class="mt-3 overflow-x-auto scroll-table">
          <table class="table-modern">
            <thead><tr><th>Status</th><th>Means</th></tr></thead>
            <tbody>
              @for (o of outcomes; track o.name) {
                <tr>
                  <td class="mono text-xs whitespace-nowrap">{{ o.name }}</td>
                  <td class="text-sm">{{ o.note }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </ng-template>

      <ng-template #ready>
        <section class="card p-4 flex flex-wrap items-center gap-5">
          <div class="min-w-0">
            <h2 class="text-base font-semibold">Ready to start</h2>
            <p class="mt-1 text-sm text-[color:var(--text-secondary)]">
              {{ auth.isLoggedIn() ? 'Open the console and follow the flow above.' : 'Sign in and follow the flow above.' }}
              Each screen says what it needs.
            </p>
          </div>
          @if (auth.isLoggedIn()) {
            <a routerLink="/dashboard" class="btn btn-primary ml-auto">
              Back to console<app-icon name="arrowRight" size="0.95em" />
            </a>
          } @else {
            <a routerLink="/login" class="btn btn-primary ml-auto">
              Sign in<app-icon name="arrowRight" size="0.95em" />
            </a>
          }
        </section>
      </ng-template>

      <footer class="mt-auto border-t border-subtle">
        <div class="mx-auto w-full max-w-[90rem] px-5 lg:px-8 py-6 flex flex-wrap items-center gap-3">
          <a routerLink="/" class="link-inline text-sm">← Back to the front page</a>
          @if (auth.isLoggedIn()) {
            <a routerLink="/dashboard" class="link-inline ml-auto text-sm">Back to console</a>
          } @else {
            <a routerLink="/login" class="link-inline ml-auto text-sm">Sign in</a>
          }
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

  readonly current = signal('');
  readonly query = signal('');
  readonly copied = signal('');
  /** The address's fragment: '' (the front), 'all', 'topic-<id>', an article's id or one of its parts' ids. */
  readonly hash = signal(Docs.hashNow());

  readonly frequencies = FREQUENCIES;
  readonly roles = ROLES;
  readonly outcomes = OUTCOMES;
  readonly allTopics = TOPICS.length;

  /** Every article, in the guide's order: the twelve tasks, then the Reference. */
  readonly allArticles: Article[] = [
    ...STEPS.map(s => ({ id: s.id, title: s.title, intro: s.intro, step: s })),
    { ...REFERENCE, step: null },
  ];

  /** The menu's groups, entries and tabs, from the menu's own tree: the guide's map never drifts from the menu. */
  readonly menu: MapRow[] = NAV.flatMap((item): MapRow[] => item.children
    ? item.children.filter(c => !c.crumbOnly).map(c => ({ group: item.label, entry: c.label, path: c.path, tabs: (c.tabs ?? []).map(t => t.label).join(', '), gate: c }))
    : item.path ? [{ group: '', entry: item.label, path: item.path, tabs: (item.tabs ?? []).map(t => t.label).join(', '), gate: item }] : []);

  /** The articles the reader is offered: signed in, those about a page their menu opens (or about none); signed out, all. */
  readonly articles = computed(() => this.allArticles.filter(a => this.offered(a.step?.where?.map(w => w.path) ?? [])));
  readonly topics = computed(() => TOPICS.filter(t => this.offered(t.paths) && this.articlesOf(t).length));
  readonly howTos = computed(() => HOW_TOS.filter(h => this.articles().some(a => a.id === h.article)));
  readonly whatsNew = computed(() => WHATS_NEW.filter(n => this.articles().some(a => a.id === n.article)));
  readonly apiChangelog = computed(() => this.auth.isLoggedIn() && this.offered(['/developers/portal/changelog']));

  readonly view = computed<View>(() => {
    const h = this.hash();
    if (h === 'all') return { kind: 'all' };
    if (h.startsWith('topic-')) {
      const topic = TOPICS.find(t => t.id === h.slice(6));
      if (topic) return { kind: 'topic', topic };
    }
    const article = this.articleFor(h);
    return article ? { kind: 'article', article } : { kind: 'home' };
  });

  readonly topicOf = computed(() => { const v = this.view(); return v.kind === 'topic' ? v.topic : null; });
  readonly currentArticle = computed(() => { const v = this.view(); return v.kind === 'article' ? v.article : null; });
  /** One article, or (the whole guide) every article -- a deep link still opens one the reader is not offered. */
  readonly shownArticles = computed(() => { const v = this.view(); return v.kind === 'article' ? [v.article] : v.kind === 'all' ? this.articles() : []; });
  /** The right-hand contents: the article's headings, or (the whole guide) the articles. */
  readonly contents = computed<Part[]>(() => {
    const v = this.view();
    if (v.kind === 'article') return partsOf(v.article);
    return v.kind === 'all' ? this.articles().map(a => ({ id: a.id, title: a.title })) : [];
  });

  /** The heading being read: the one scrolled past last, else the first. */
  readonly reading = computed(() => this.current() || this.contents()[0]?.id || '');

  readonly neighbours = computed(() => {
    const list = this.articles();
    const at = list.findIndex(a => a.id === this.currentArticle()?.id);
    return { prev: at > 0 ? list[at - 1] : null, next: at >= 0 && at < list.length - 1 ? list[at + 1] : null };
  });

  /** Every piece of every offered article, as one line of text each, to search. */
  private readonly index = computed(() => this.articles().flatMap(a => {
    const parts = partsOf(a);
    const part = (suffix: string) => parts.find(p => p.id === `${a.id}--${suffix}`) ?? null;
    const lines: { article: Article; part: Part | null; text: string }[] = [{ article: a, part: null, text: `${a.title}. ${a.intro}` }];
    const s = a.step;
    if (s) {
      for (const w of s.where ?? []) lines.push({ article: a, part: part('where'), text: w.label });
      for (const t of s.todo ?? []) lines.push({ article: a, part: part('steps'), text: t });
      for (const c of s.code ?? []) lines.push({ article: a, part: part('steps'), text: `${c.label}: ${c.text}` });
      for (const f of s.fields ?? []) lines.push({ article: a, part: part('details'), text: `${f.name}: ${f.note}` });
      for (const n of [s.tip, ...(s.notes ?? []), s.warn]) if (n) lines.push({ article: a, part: part('know'), text: n });
    } else {
      for (const m of this.menu) lines.push({ article: a, part: part('menu'), text: [m.group, m.entry, m.tabs].filter(x => x).join(' › ') });
      for (const f of FREQUENCIES) lines.push({ article: a, part: part('frequencies'), text: `${f.name}: ${f.means} (${f.intervals})` });
      for (const r of ROLES) lines.push({ article: a, part: part('roles'), text: `${r.name}: ${r.note}` });
      for (const o of OUTCOMES) lines.push({ article: a, part: part('outcomes'), text: `${o.name}: ${o.note}` });
    }
    return lines;
  }));

  /** Every line holding all the words typed, titles first, at most 40. */
  readonly hits = computed<SearchHit[]>(() => {
    const words = WORDS(this.query());
    if (!words.length) return [];
    const found = this.index().filter(l => { const t = l.text.toLowerCase(); return words.every(w => t.includes(w)); });
    found.sort((x, y) => Number(y.part === null) - Number(x.part === null));
    return found.slice(0, 40).map(l => ({ article: l.article, part: l.part, snippet: snippetOf(l.text, words) }));
  });

  constructor() {
    // Back and forward move between the front, a topic and an article as between pages.
    const onPop = () => this.apply(Docs.hashNow());
    window.addEventListener('popstate', onPop);
    // Marks the heading being read: the one that most recently passed the top (an IntersectionObserver lagged a
    // section behind when a heading jumped to landed exactly on its band's edge).
    const onScroll = () => this.spy();
    window.addEventListener('scroll', onScroll, { passive: true });
    this.destroyRef.onDestroy(() => { window.removeEventListener('popstate', onPop); window.removeEventListener('scroll', onScroll); });
    afterNextRender(() => this.land(this.hash()));
  }

  private static hashNow(): string {
    return decodeURIComponent((typeof location !== 'undefined' ? location.hash : '').replace(/^#/, ''));
  }

  /** The article an id names: its own, or the one whose part it is (start--steps is Get a workspace's). */
  private articleFor(id: string): Article | null {
    if (!id) return null;
    const own = id.split('--')[0];
    return this.allArticles.find(a => a.id === own) ?? null;
  }

  /** Whether a signed-in reader's menu opens any of these pages (none named: yes); signed out, always. */
  private offered(paths: string[]): boolean {
    if (!this.auth.isLoggedIn() || !paths.length) return true;
    return paths.some(p => { const gate = gateOf(p); return !gate || this.nav.visible(gate); });
  }

  articlesOf(t: Topic): Article[] {
    return t.articles.map(id => this.articles().find(a => a.id === id)).filter((a): a is Article => !!a);
  }

  howTosOf(t: Topic): { title: string; article: string }[] {
    return this.howTos().filter(h => t.articles.includes(h.article));
  }

  /** The topic an article leads (else the first it is in), for its breadcrumb. */
  topicFor(a: Article): Topic | null {
    return this.topics().find(t => t.articles[0] === a.id) ?? this.topics().find(t => t.articles.includes(a.id)) ?? null;
  }

  numberOf(a: Article): number {
    return this.allArticles.indexOf(a) + 1;
  }

  countText(n: number): string {
    return `${n} article${n === 1 ? '' : 's'}`;
  }

  day(iso: string): string {
    return dayText(iso);
  }

  /** Whether the map links an entry: by the menu's own rule (NavAccess) signed in; signed out, all but the role-only ones. */
  linked(m: MapRow): boolean {
    return this.auth.isLoggedIn() ? this.nav.visible(m.gate) : !roleOnly(m.gate);
  }

  /** Why an entry is not linked: the role it is for, or the reader's page access. */
  notLinkedWhy(m: MapRow): string {
    const role = roleOnly(m.gate);
    return role ? `for ${role}` : 'not in your page access';
  }

  /**
   * Goes to the front ('') , a topic or the whole guide, as a page of its own: a new history entry, the top of the page.
   * The href stays for a middle-click; a plain "#id" would resolve against <base href="/"> to the landing page.
   */
  go(event: Event, hash: string): void {
    event.preventDefault();
    this.query.set('');
    history.pushState(history.state, '', `${location.pathname}${location.search}${hash ? '#' + hash : ''}`);
    this.apply(hash);
  }

  /** Opens an article, at one of its parts when named. */
  open(event: Event, article: string, part?: string): void {
    this.go(event, part ?? article);
  }

  private apply(hash: string): void {
    this.hash.set(hash);
    this.current.set('');
    setTimeout(() => this.land(hash));
  }

  /** After a view is drawn: scroll to the part named, or to the top. */
  private land(hash: string): void {
    // A part (start--steps) is scrolled to; an article, a topic or the front opens at the top.
    const el = hash.includes('--') ? (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(`[id="${hash}"]`) : null;
    if (el?.scrollIntoView) el.scrollIntoView({ block: 'start' });
    else {
      try { window.scrollTo({ top: 0 }); } catch { /* not in a test's DOM */ }
    }
    this.spy();
  }

  /**
   * Scrolls to a heading of the page being read without leaving it. The address gains the fragment, so the heading can be
   * linked to.
   */
  jump(event: Event, id: string): void {
    const target = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(`[id="${id}"]`);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(history.state, '', `${location.pathname}${location.search}#${id}`);
    this.current.set(id);
  }

  async copy(text: string): Promise<void> {
    if (await copyText(text)) {
      this.copied.set(text);
      setTimeout(() => { if (this.copied() === text) this.copied.set(''); }, 2000);
    }
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

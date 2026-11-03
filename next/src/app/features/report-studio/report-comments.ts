import { Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Icon } from '../../shared/ui/icon';
import { AdvancedOption, AdvancedSelect } from '../../shared/ui/advanced-select';
import { ToastService } from '../../shared/ui/toast.service';
import { RsTimePipe } from './rs-time.pipe';
import { studioError } from './report-studio.api';
import { NewComment, ReportLibraryApi, ReviewComment, ReviewComments, ReviewMention } from './report-library.api';

/** Where a new thread is pinned: a point of a page (from the viewer), or a block of the version's template. */
export interface CommentAnchor { page: number; x: number; y: number; }

/** A thread's place, in words: "Page 2" or "Lab values". */
export function anchorWords(c: ReviewComment): string {
  if (c.componentId) return c.componentLabel || c.componentId;
  return c.page ? `Page ${c.page}` : 'The report';
}

/** The pins the viewer draws for a version's threads: numbered in order, open ones only unless resolved are shown. */
export function pinsOf(data: ReviewComments | null, showResolved: boolean): { id: string; n: number; page: number; x: number; y: number; open: boolean }[] {
  if (!data) return [];
  const out: { id: string; n: number; page: number; x: number; y: number; open: boolean }[] = [];
  data.threads.forEach((t, i) => {
    if (t.page != null && t.x != null && t.y != null && (showResolved || !t.resolvedAt)) {
      out.push({ id: t.commentId, n: i + 1, page: t.page, x: t.x, y: t.y, open: !t.resolvedAt });
    }
  });
  return out;
}

/**
 * Reports redesign, feature 16: comments while reviewing a report version -- the thread side panel. A comment is pinned
 * to a point of a page (picked on the viewer) or to a block of the version's template ("about the template" ones show in
 * the designer), mentions colleagues (they get a notice and a mail with a link, never the words), is replied to and
 * resolved. The words come from the server masked for a reader without See personal data; nothing here unmasks them.
 */
@Component({
  selector: 'app-report-comments',
  imports: [Icon, AdvancedSelect, RsTimePipe, NgTemplateOutlet],
  template: `
    <div class="rc" data-test="report-comments">
      @if (data(); as d) {
        @if (d.masked) {
          <p class="rc-note" data-comments-masked><app-icon name="lock" />Personal values are shown as •••: reading them needs See personal data.</p>
        }
        @if (d.may.comment) {
          <form class="rc-new" (submit)="$event.preventDefault(); post()" aria-label="Add a comment">
            <textarea class="input text-sm" rows="3" maxlength="2000" placeholder="What should change? Pin it to the page or a block."
                      aria-label="New comment" [value]="text()" (input)="text.set($any($event.target).value)"></textarea>
            <div class="seg" role="group" aria-label="Pin the comment to">
              <button type="button" class="seg-btn" [class.seg-on]="where() === 'page'" [attr.aria-pressed]="where() === 'page'" (click)="where.set('page')">On the page</button>
              <button type="button" class="seg-btn" [class.seg-on]="where() === 'block'" [attr.aria-pressed]="where() === 'block'" (click)="where.set('block')">On a block</button>
            </div>
            @if (where() === 'page') {
              @if (anchor(); as a) {
                <p class="text-xs flex items-center gap-1" data-comment-anchor><app-icon name="chat" />Page {{ a.page }}, where you clicked
                  <button type="button" class="link-inline" (click)="anchor.set(null)">Clear</button></p>
              } @else {
                <button type="button" class="btn btn-default btn-sm self-start" (click)="pick.emit()" data-pick-place><app-icon name="chat" />Pick a place on the page</button>
              }
            } @else {
              <app-advanced-select ariaLabel="Block" [options]="blockOptions()" [value]="block()" (valueChange)="block.set($event)"
                                   placeholder="Choose a block" searchLabel="Search the blocks" panelWidth="20rem" />
              <label class="rsd-check"><input type="checkbox" class="checkbox" [checked]="aboutTemplate()" (change)="aboutTemplate.set($any($event.target).checked)" />
                <span>About the template (shows in the designer)</span></label>
            }
            <div class="rc-mentions">
              @for (m of mentions(); track m.userId) {
                <span class="pill pill-neutral">{{ '@' + m.name }}<button type="button" class="rc-x" [attr.aria-label]="'Remove ' + m.name" (click)="unmention(m.userId)"><app-icon name="close" /></button></span>
              }
              @if (peopleOptions().length && mentions().length < 10) {
                <app-advanced-select class="rc-mention" ariaLabel="Mention someone" [options]="peopleOptions()" [resetOnPick]="true" (picked)="mention($event?.value ?? null)"
                                     placeholder="Mention someone" searchLabel="Search people" panelWidth="16rem" [compact]="true" />
              }
            </div>
            <p class="text-xs text-[color:var(--text-muted)]">Mentioned people get a notice and an email with a link; the comment stays here.</p>
            @if (error()) { <p class="text-xs text-[color:var(--crit-text)]" role="alert">{{ error() }}</p> }
            <button type="submit" class="btn btn-primary btn-sm self-start" [disabled]="busy() || !ready()"><app-icon name="send" />Comment</button>
          </form>
        } @else if (d.may.why) {
          <p class="text-xs text-[color:var(--text-muted)] py-2">{{ d.may.why }}</p>
        }
        <div class="rc-head">
          <div class="seg" role="group" aria-label="Show">
            <button type="button" class="seg-btn" [class.seg-on]="!resolvedShown()" [attr.aria-pressed]="!resolvedShown()" (click)="resolvedShown.set(false)">Open {{ d.open }}</button>
            <button type="button" class="seg-btn" [class.seg-on]="resolvedShown()" [attr.aria-pressed]="resolvedShown()" (click)="resolvedShown.set(true)">Resolved {{ d.total - d.open }}</button>
          </div>
        </div>
        <ol class="rc-list" aria-label="Comment threads">
          @for (t of shownThreads(); track t.commentId) {
            <li class="rc-thread" [class.is-on]="selected() === t.commentId" [attr.data-thread]="t.commentId">
              <div class="rc-top">
                <button type="button" class="rc-n" (click)="open(t)" [attr.aria-label]="'Go to comment ' + numberOf(t) + ', ' + where_(t)">{{ numberOf(t) }}</button>
                <button type="button" class="pill pill-neutral rc-where" (click)="open(t)" [title]="t.componentId ? 'A block of the template' : 'Go to the page'">
                  <app-icon [name]="t.componentId ? 'layers' : 'chat'" />{{ where_(t) }}</button>
                @if (t.about === 'TEMPLATE') { <span class="pill pill-info">Template</span> }
                @if (t.sentBackAt) { <span class="pill pill-warn">Sent back</span> }
              </div>
              <ng-container [ngTemplateOutlet]="one" [ngTemplateOutletContext]="{ $implicit: t }" />
              @for (r of t.replies ?? []; track r.commentId) {
                <div class="rc-reply"><ng-container [ngTemplateOutlet]="one" [ngTemplateOutletContext]="{ $implicit: r }" /></div>
              }
              @if (t.resolvedAt) {
                <p class="text-xs text-[color:var(--text-muted)]"><app-icon name="checkCircle" class="icon-ok" />Resolved by {{ t.resolvedByName }} · {{ t.resolvedAt | rsTime: 'recent' }}</p>
              } @else {
                <div class="rc-actions">
                  @if (replying() === t.commentId) {
                    <textarea class="input text-sm" rows="2" maxlength="2000" [attr.aria-label]="'Reply to comment ' + numberOf(t)" [value]="reply()"
                              (input)="reply.set($any($event.target).value)"></textarea>
                    <div class="flex gap-2">
                      <button type="button" class="btn btn-primary btn-sm" [disabled]="busy() || !reply().trim()" (click)="sendReply(t)">Reply</button>
                      <button type="button" class="btn btn-ghost btn-sm" (click)="replying.set(null)">Cancel</button>
                    </div>
                  } @else {
                    <div class="flex gap-2">
                      @if (d.may.comment) { <button type="button" class="btn btn-default btn-sm" (click)="replying.set(t.commentId); reply.set('')"><app-icon name="chat" />Reply</button> }
                      @if (t.mayResolve) { <button type="button" class="btn btn-default btn-sm" [disabled]="busy()" (click)="resolveThread(t)"><app-icon name="check" />Resolve</button> }
                    </div>
                  }
                </div>
              }
            </li>
          } @empty {
            <li class="text-sm text-[color:var(--text-muted)] py-3">{{ resolvedShown() ? 'No resolved comments.' : 'No open comments on this version.' }}</li>
          }
        </ol>
      } @else if (loadError()) {
        <p class="text-sm text-[color:var(--crit-text)] py-3" role="alert">{{ loadError() }} <button type="button" class="link-inline" (click)="load()">Try again</button></p>
      } @else {
        <p class="text-sm text-[color:var(--text-muted)] py-3">Reading the comments…</p>
      }
    </div>
    <ng-template #one let-c>
      <div class="rc-one">
        <p class="text-xs"><b class="text-[color:var(--text-primary)]">{{ c.authorName }}</b> <span class="text-[color:var(--text-muted)]">· {{ c.createdAt | rsTime: 'recent' }}</span></p>
        <p class="rc-text text-sm" [class.is-masked]="c.masked">{{ c.text }}@if (c.masked) { <app-icon name="lock" class="rc-lock" [attr.title]="maskedTitle" /> }</p>
        @if (c.mentions.length) { <p class="text-xs text-[color:var(--text-muted)]">Mentioned: @for (m of c.mentions; track m.userId; let last = $last) { {{ '@' + m.name }}@if (!last) {, } }</p> }
      </div>
    </ng-template>
  `,
  styles: `
    :host { display: block; }
    .rc { display: flex; flex-direction: column; gap: 0.75rem; padding-top: 0.75rem; }
    .rc-note { display: flex; gap: 0.375rem; align-items: center; font-size: 0.75rem; color: var(--text-muted); }
    .rc-new { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.625rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
      background: var(--surface-sunken); }
    .rc-mentions { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }
    .rc-mention { min-width: 10rem; }
    .rc-x { display: inline-flex; margin-left: 0.125rem; background: none; border: 0; padding: 0; cursor: pointer; color: inherit; }
    .rc-head { display: flex; justify-content: space-between; align-items: center; }
    .rc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .rc-thread { display: flex; flex-direction: column; gap: 0.375rem; padding: 0.625rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); }
    .rc-thread.is-on { border-color: var(--accent-mark-strong); box-shadow: inset 3px 0 0 var(--accent-mark-strong); }
    .rc-top { display: flex; flex-wrap: wrap; gap: 0.375rem; align-items: center; }
    .rc-n { width: 1.375rem; height: 1.375rem; border-radius: var(--radius-full); border: 0; display: grid; place-items: center; font-size: 0.6875rem;
      font-weight: 600; background: var(--accent-mark-strong); color: var(--on-solid); cursor: pointer; }
    .rc-where { cursor: pointer; }
    .rc-reply { margin-left: 0.875rem; padding-left: 0.625rem; border-left: 2px solid var(--border-subtle); }
    .rc-text { white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 0.125rem; }
    .rc-lock { margin-left: 0.25rem; color: var(--text-muted); }
    .rc-actions { display: flex; flex-direction: column; gap: 0.375rem; }
  `,
})
export class ReportComments {
  readonly reportId = input.required<string>();
  readonly version = input.required<number>();
  /** The version's comments (loaded here; the report page reads them for the viewer's pins and the tab's count). */
  readonly data = model<ReviewComments | null>(null);
  /** A point picked on the viewer for the next comment. */
  readonly anchor = model<CommentAnchor | null>(null);
  /** The thread shown as selected (picked here or on a pin). */
  readonly selected = model<string | null>(null);
  readonly resolvedShown = model(false);
  /** Asks the viewer to pick a place on the page. */
  readonly pick = output<void>();
  /** A thread was opened: the viewer goes to its page. */
  readonly opened = output<ReviewComment>();

  private readonly api = inject(ReportLibraryApi);
  private readonly toast = inject(ToastService);

  readonly text = signal('');
  readonly where = signal<'page' | 'block'>('page');
  readonly block = signal('');
  readonly aboutTemplate = signal(false);
  readonly mentions = signal<ReviewMention[]>([]);
  readonly people = signal<ReviewMention[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly loadError = signal('');
  readonly replying = signal<string | null>(null);
  readonly reply = signal('');
  readonly maskedTitle = 'Personal values are hidden: reading them needs See personal data.';
  private peopleFor = '';

  constructor() {
    effect(() => {
      const id = this.reportId();
      const v = this.version();
      // The report page reads them for the viewer's pins: read here only when it has not (or another version is shown).
      untracked(() => {
        const d = this.data();
        if (d?.reportId === id && d.version === v) this.loadPeople(id);
        else this.load(id, v);
      });
    });
    // A point picked on the page means the comment goes on the page.
    effect(() => {
      if (this.anchor()) untracked(() => this.where.set('page'));
    });
  }

  load(id = this.reportId(), v = this.version()): void {
    this.loadError.set('');
    this.api.comments(id, v).subscribe({
      next: d => this.data.set(d),
      error: e => { this.data.set(null); this.loadError.set(studioError(e, 'The comments could not be read.').message); },
    });
    this.loadPeople(id);
  }

  private loadPeople(id: string): void {
    if (this.peopleFor === id) return;
    this.peopleFor = id;
    this.api.commentPeople(id).subscribe({ next: p => this.people.set(p.people), error: () => this.people.set([]) });
  }

  readonly shownThreads = computed(() => (this.data()?.threads ?? []).filter(t => (this.resolvedShown() ? !!t.resolvedAt : !t.resolvedAt)));
  readonly blockOptions = computed<AdvancedOption[]>(() => (this.data()?.blocks ?? []).map(b => ({ value: b.id, label: b.label, sample: b.type })));
  readonly peopleOptions = computed<AdvancedOption[]>(() => this.people().filter(p => !this.mentions().some(m => m.userId === p.userId))
    .map(p => ({ value: String(p.userId), label: p.name })));
  readonly ready = computed(() => !!this.text().trim() && (this.where() === 'page' ? !!this.anchor() : !!this.block()));

  numberOf(t: ReviewComment): number {
    return (this.data()?.threads ?? []).indexOf(t) + 1;
  }

  where_(t: ReviewComment): string {
    return anchorWords(t);
  }

  open(t: ReviewComment): void {
    this.selected.set(t.commentId);
    this.opened.emit(t);
  }

  mention(id: string | null): void {
    const p = this.people().find(x => String(x.userId) === id);
    if (p && !this.mentions().some(m => m.userId === p.userId)) this.mentions.set([...this.mentions(), p]);
  }

  unmention(id: number): void {
    this.mentions.set(this.mentions().filter(m => m.userId !== id));
  }

  post(): void {
    if (!this.ready() || this.busy()) return;
    const a = this.anchor();
    const body: NewComment = { reportId: this.reportId(), version: this.version(), text: this.text().trim(), mentions: this.mentions().map(m => m.userId) };
    if (this.where() === 'page' && a) Object.assign(body, { page: a.page, x: a.x, y: a.y });
    else { body.componentId = this.block(); if (this.aboutTemplate()) body.about = 'TEMPLATE'; }
    this.send(body, () => {
      this.text.set('');
      this.mentions.set([]);
      this.anchor.set(null);
      this.aboutTemplate.set(false);
      const d = this.data();
      if (d?.threads.length) this.selected.set(d.threads[d.threads.length - 1].commentId);
      if (body.mentions?.length) this.toast.success(`Comment added; ${body.mentions.length === 1 ? 'the person you mentioned is' : 'the people you mentioned are'} told.`);
    });
  }

  sendReply(t: ReviewComment): void {
    this.send({ reportId: this.reportId(), version: this.version(), text: this.reply().trim(), replyTo: t.commentId }, () => {
      this.replying.set(null);
      this.reply.set('');
    });
  }

  resolveThread(t: ReviewComment): void {
    this.busy.set(true);
    this.api.resolveComment(t.commentId).subscribe({
      next: d => { this.busy.set(false); this.data.set(d); },
      error: e => { this.busy.set(false); this.toast.error(studioError(e, 'The thread could not be resolved.').message); },
    });
  }

  private send(body: NewComment, done: () => void): void {
    this.busy.set(true);
    this.error.set('');
    this.api.addComment(body).subscribe({
      next: d => { this.busy.set(false); this.data.set(d); done(); },
      error: e => { this.busy.set(false); this.error.set(studioError(e, 'The comment could not be added.').message); },
    });
  }
}

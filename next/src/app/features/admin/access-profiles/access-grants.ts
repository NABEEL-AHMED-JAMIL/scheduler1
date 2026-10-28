import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { API_SUCCESS } from '../../../core/api/api.config';
import { instantOf } from '../../../core/instant';
import { AccessDelegation } from '../../../core/auth/access-delegation';
import { Icon } from '../../../shared/ui/icon';
import { codeWords } from '../../../shared/ui/plain-words';
import { PAGE_LABELS, isPageKey } from '../../../core/auth/page-keys';
import { NAV } from '../../../core/nav/nav-tree';
import { ToastService } from '../../../shared/ui/toast.service';
import { AccessChange, AccessPerson, AccessProfilesService, Delegation, EffectiveAccess } from './access-profiles.service';

type GrantsView = 'person' | 'delegates' | 'changes';

/** A change log row's action, as people say it. */
export function actionLabel(action: string): string {
  switch (action) {
    case 'PAGE_GRANTED': return 'Opened a page';
    case 'PAGE_WITHHELD': return 'Withheld a page';
    case 'TAB_GRANTED': return 'Opened a tab';
    case 'TAB_WITHHELD': return 'Withheld a tab';
    case 'PROFILE_ASSIGNED': return 'Moved to a profile';
    case 'EXCEPTIONS_CLEARED': return 'Back to their profile';
    case 'DELEGATION_GRANTED': return 'Delegated access';
    case 'DELEGATION_REVOKED': return 'Ended a delegation';
    // MIG-424: two-factor required (or not) of a profile's people, or of the whole workspace.
    case 'PROFILE_TWO_FACTOR': return 'Changed a profile\'s two-factor rule';
    case 'WORKSPACE_TWO_FACTOR': return 'Changed the workspace\'s two-factor rule';
    // ZT-U8: a team's changes are in the same log, and read as words too.
    case 'TEAM_CREATED': return 'Made a team';
    case 'TEAM_CHANGED': return 'Changed a team';
    case 'TEAM_ARCHIVED': return 'Archived a team';
    case 'TEAM_MEMBER_ADDED': return 'Added to a team';
    case 'TEAM_MEMBER_REMOVED': return 'Removed from a team';
    // Anything newer: its code read as words (SOME_NEW_THING -> "Some new thing", page.granted -> "Page granted"), never the code.
    default: return codeWords(action);
  }
}

/**
 * A change's detail: a page by its name ("task-inbox" reads "Task inbox"), a tab as page › tab ("queue:by-date" reads
 * "Queue › By date"), a team role (LEAD, MEMBER) as a word -- never the key's code.
 */
export function changeDetail(c: { action: string; key: string | null; after: string | null }): string {
  const role: Record<string, string> = { LEAD: 'Lead', MEMBER: 'Member' };
  if (c.action.startsWith('TEAM_')) return [c.key, c.after ? role[c.after] ?? c.after : null].filter(Boolean).join(' · ');
  const key = c.key || (c.after ?? '');
  const [page, tab] = key.split(':');
  const pageName = isPageKey(page) ? PAGE_LABELS[page] : codeWords(page);
  return tab ? `${pageName} › ${tabLabel(key) ?? codeWords(tab)}` : isPageKey(key) ? PAGE_LABELS[key] : key;
}

/** A tab's label on the menu ("queue:by-date" is "By date"), or null when the menu has none. */
function tabLabel(tabKey: string): string | null {
  for (const item of NAV) {
    for (const child of item.children ?? []) {
      const found = (child.tabs ?? []).find(t => t.tabKey === tabKey);
      if (found) return found.label;
    }
    const found = (item.tabs ?? []).find(t => t.tabKey === tabKey);
    if (found) return found.label;
  }
  return null;
}

/** "21 Oct 2026, 20:45" in the browser's own zone, 24-hour. */
function stamp(value: string | null | undefined): string {
  const at = instantOf(value ?? null);
  return at ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(at) : '';
}

/**
 * F3 (MIG-400; owner backlog 2026-10-19): grant pages and tabs to one person, delegate granting to a member (the owner's
 * "main account, for example a CEO"), and read the access change log. An administrator sees all three; an access delegate
 * sees the people they reach -- with only the keys they may grant -- and their own changes. The server holds every rule
 * (identity's PageAccessServiceImpl and AccessDelegationService); this only offers what it will accept.
 */
@Component({
  selector: 'app-access-grants',
  imports: [Icon],
  template: `
    <section class="card p-4 flex flex-col gap-4" data-testid="access-grants" aria-labelledby="grants-title">
      <div class="flex flex-wrap items-center gap-3">
        <div class="min-w-0">
          <h2 id="grants-title" class="section-title">{{ delegate() ? 'Grant access for the people you manage' : 'Grant pages and tabs' }}</h2>
          <p class="text-xs text-[color:var(--text-muted)]">
            A page's tabs can be opened one by one. A page with none chosen opens every tab. Tabs marked “hides the tab” have no data of their own.
          </p>
        </div>
        <div class="seg ml-auto" role="group" aria-label="Show">
          <button type="button" class="seg-btn" [class.seg-on]="view() === 'person'" [attr.aria-pressed]="view() === 'person'" (click)="view.set('person')">A person</button>
          @if (!delegate()) {
            <button type="button" class="seg-btn" [class.seg-on]="view() === 'delegates'" [attr.aria-pressed]="view() === 'delegates'" (click)="show('delegates')" data-testid="view-delegates">Delegates</button>
          }
          <button type="button" class="seg-btn" [class.seg-on]="view() === 'changes'" [attr.aria-pressed]="view() === 'changes'" (click)="show('changes')" data-testid="view-changes">Changes</button>
        </div>
      </div>

      @if (view() === 'person') {
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium">Person</span>
            <select class="input input-sm min-w-64" data-testid="grant-person" (focus)="needPeople.emit()" (pointerdown)="needPeople.emit()" (change)="pick(+$any($event.target).value || null)">
              <option value="">{{ people().length ? 'Choose a member' : 'No member to choose' }}</option>
              @for (p of people(); track p.appUserId) {
                <option [value]="p.appUserId" [selected]="personId() === p.appUserId">{{ p.fullName || p.username }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="font-medium">For</span>
            <select class="input input-sm" data-testid="grant-days" (change)="days.set(+$any($event.target).value || null)">
              <option value="">Until removed</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm flex-1 min-w-56">
            <span class="font-medium">Reason <span class="text-xs text-[color:var(--text-muted)]">(kept in the change log)</span></span>
            <input class="input input-sm" maxlength="400" [value]="reason()" (input)="reason.set($any($event.target).value)"
                   placeholder="Covering month-end close" data-testid="grant-reason" />
          </label>
        </div>
        @if (loadingAccess()) {
          <p class="text-sm text-[color:var(--text-muted)]">Reading their access…</p>
        } @else if (access(); as a) {
          <div class="flex flex-col divide-y divide-[color:var(--border-subtle)] border border-[color:var(--border-subtle)] rounded-md" data-testid="grant-tree">
            @for (page of visiblePages(); track page.key) {
              <div class="p-3 flex flex-col gap-2" [attr.data-page]="page.key">
                <div class="flex items-center gap-3">
                  <span class="text-sm font-medium flex-1 min-w-0">{{ page.label }}</span>
                  <span class="pill" [class.pill-ok]="page.open" [class.pill-neutral]="!page.open">{{ page.open ? (restricted(page) ? 'Some tabs' : 'Open') : 'Closed' }}</span>
                  @if (mayGrant(page.key)) {
                    <button type="button" class="btn btn-default btn-xs" [disabled]="busy()" (click)="set(page.key, !(page.open && !restricted(page)))"
                            [attr.data-toggle]="page.key">{{ page.open && !restricted(page) ? 'Withhold' : page.tabs.length ? 'Open every tab' : 'Open' }}</button>
                  }
                </div>
                @if (page.tabs.length) {
                  <div class="flex flex-wrap gap-2 pl-3">
                    @for (tab of page.tabs; track tab.key) {
                      <label class="inline-flex items-center gap-1.5 text-xs border border-[color:var(--border-subtle)] rounded px-2 py-1"
                             [title]="tab.apiGated ? 'Its data is refused when closed' : 'Hides the tab; its data is the page\\'s'">
                        <input type="checkbox" class="checkbox" [checked]="tab.open" [disabled]="busy() || !mayGrant(tab.key)"
                               (change)="set(tab.key, !tab.open)" [attr.data-tab]="tab.key" />
                        {{ tab.label }}@if (!tab.apiGated) { <span class="text-[color:var(--text-muted)]">· hides the tab</span> }
                      </label>
                    }
                  </div>
                }
              </div>
            }
          </div>
        } @else if (personId()) {
          <p class="text-sm text-crit-500">{{ accessError() }}</p>
        }
      }

      @if (view() === 'delegates') {
        <div class="flex flex-col gap-3" data-testid="delegates">
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4 items-end">
            <label class="flex flex-col gap-1 text-sm">
              <span class="font-medium">Member who may grant</span>
              <select class="input input-sm" (focus)="needPeople.emit()" (pointerdown)="needPeople.emit()" (change)="draftDelegate.set(+$any($event.target).value || null)" data-testid="delegate-person">
                <option value="">Choose a member</option>
                @for (p of people(); track p.appUserId) { <option [value]="p.appUserId">{{ p.fullName || p.username }}</option> }
              </select>
            </label>
            <label class="flex flex-col gap-1 text-sm">
              <span class="font-medium">To whom</span>
              <select class="input input-sm" (change)="draftScope.set($any($event.target).value)" data-testid="delegate-scope">
                <option value="ALL_MEMBERS">Every member</option>
                <option value="LISTED">Only people I choose</option>
              </select>
            </label>
            <label class="flex flex-col gap-1 text-sm">
              <span class="font-medium">For</span>
              <select class="input input-sm" (change)="draftDays.set(+$any($event.target).value || 90)" data-testid="delegate-days">
                <option value="90">90 days</option><option value="30">30 days</option><option value="180">180 days</option><option value="366">A year</option>
              </select>
            </label>
            <label class="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" class="checkbox" [checked]="draftProfiles()" (change)="draftProfiles.set(!draftProfiles())" />
              May move people between existing profiles
            </label>
          </div>
          @if (draftScope() === 'LISTED') {
            <div class="flex flex-wrap gap-2" data-testid="delegate-people">
              @for (p of people(); track p.appUserId) {
                @if (p.appUserId !== draftDelegate()) {
                  <label class="inline-flex items-center gap-1.5 text-xs border border-[color:var(--border-subtle)] rounded px-2 py-1">
                    <input type="checkbox" class="checkbox" [checked]="draftPeople().includes(p.appUserId)" (change)="togglePerson(p.appUserId)" />
                    {{ p.fullName || p.username }}
                  </label>
                }
              }
            </div>
          }
          <div class="flex flex-wrap items-end gap-3">
            <label class="flex flex-col gap-1 text-sm flex-1 min-w-64">
              <span class="font-medium">Why <span class="text-xs text-[color:var(--text-muted)]">(the access review reads it)</span></span>
              <input class="input input-sm" maxlength="400" [value]="draftReason()" (input)="draftReason.set($any($event.target).value)"
                     placeholder="The director grants their team's pages" data-testid="delegate-reason" />
            </label>
            <button type="button" class="btn btn-primary btn-sm" [disabled]="busy() || !draftDelegate() || !draftReason().trim()" (click)="delegateNow()" data-testid="delegate-grant">
              <app-icon name="plus" />Delegate
            </button>
          </div>
          <p class="text-xs text-[color:var(--text-muted)]">A delegate grants only pages and tabs they hold themselves, never to an administrator or to themselves, and never creates profiles.</p>
          <table class="table-modern text-sm" data-testid="delegate-list">
            <thead><tr><th>Member</th><th>To whom</th><th>Until</th><th>State</th><th>Why</th><th></th></tr></thead>
            <tbody>
              @for (d of delegations(); track d.delegateId) {
                <tr [attr.data-delegation]="d.delegateId">
                  <td class="font-medium">{{ d.delegateName || 'Member ' + d.delegateUserId }}</td>
                  <td>{{ d.scopePeople === 'ALL_MEMBERS' ? 'Every member' : d.people.length + ' people' }}{{ d.canAssignProfiles ? ' · profiles' : '' }}</td>
                  <td class="whitespace-nowrap">{{ when(d.expiresAt) }}</td>
                  <td><span class="pill" [class.pill-ok]="d.status === 'ACTIVE'" [class.pill-neutral]="d.status !== 'ACTIVE'">{{ d.status === 'ACTIVE' ? 'Active' : d.status === 'EXPIRED' ? 'Expired' : 'Ended' }}</span></td>
                  <td class="text-xs">{{ d.reason }}</td>
                  <td class="text-right">
                    @if (d.status === 'ACTIVE') { <button type="button" class="btn btn-default btn-intent-crit btn-xs" [disabled]="busy()" (click)="revoke(d)" [attr.data-revoke]="d.delegateId">End</button> }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="text-center text-[color:var(--text-muted)] py-6">No delegation yet. Administrators manage access by role.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (view() === 'changes') {
        <table class="table-modern text-sm" data-testid="change-log">
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Person</th><th>Page or tab</th><th>Until</th><th>Why</th></tr></thead>
          <tbody>
            @for (c of changes(); track c.changeId) {
              <tr>
                <td class="whitespace-nowrap">{{ when(c.at) }}</td>
                <td>{{ c.actorName || '—' }}@if (c.delegateId) { <span class="pill pill-neutral ml-1">Delegate</span> }</td>
                <td>{{ label(c.action) }}</td>
                <td>{{ c.targetName || '—' }}</td>
                <td class="text-xs" [title]="c.key || ''">{{ detail(c) }}</td>
                <td class="whitespace-nowrap">{{ c.expiresAt ? when(c.expiresAt) : '' }}</td>
                <td class="text-xs">{{ c.reason }}</td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="text-center text-[color:var(--text-muted)] py-6">No access change yet.</td></tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
})
export class AccessGrants {
  private readonly api = inject(AccessProfilesService);
  private readonly toast = inject(ToastService);
  private readonly delegation = inject(AccessDelegation);

  /** The people the caller may grant to (the page's own list: a delegate's is already only those in reach). */
  readonly people = input<AccessPerson[]>([]);
  /** A platform administrator's chosen workspace. */
  readonly tenantId = input<number | null>(null);
  /** Asked the first time a person is to be chosen: the page reads its people then, not before (a big workspace's list). */
  readonly needPeople = output<void>();

  readonly view = signal<GrantsView>('person');
  readonly delegate = computed(() => this.delegation.isDelegate() ? this.delegation.mine() : null);
  readonly personId = signal<number | null>(null);
  readonly access = signal<EffectiveAccess | null>(null);
  readonly loadingAccess = signal(false);
  readonly accessError = signal('');
  readonly busy = signal(false);
  readonly days = signal<number | null>(null);
  readonly reason = signal('');
  readonly delegations = signal<Delegation[]>([]);
  readonly changes = signal<AccessChange[]>([]);

  readonly draftDelegate = signal<number | null>(null);
  readonly draftScope = signal<'ALL_MEMBERS' | 'LISTED'>('ALL_MEMBERS');
  readonly draftPeople = signal<number[]>([]);
  readonly draftDays = signal(90);
  readonly draftProfiles = signal(true);
  readonly draftReason = signal('');

  /** A delegate sees only the pages they may grant; an administrator every page. */
  readonly visiblePages = computed(() => {
    const pages = this.access()?.pages ?? [];
    const d = this.delegate();
    if (!d) return pages;
    const keys = new Set(d.grantableKeys);
    return pages.filter(p => keys.has(p.key) || p.tabs.some(t => keys.has(t.key)));
  });

  constructor() {
    effect(() => {
      this.tenantId();
      untracked(() => { this.access.set(null); this.personId.set(null); if (this.view() !== 'person') this.show(this.view()); });
    });
  }

  mayGrant(key: string): boolean {
    const d = this.delegate();
    return !d || d.grantableKeys.includes(key);
  }

  restricted(page: { open: boolean; tabs: { open: boolean }[] }): boolean {
    return page.open && page.tabs.length > 0 && page.tabs.some(t => !t.open);
  }

  label(action: string): string { return actionLabel(action); }
  detail(c: AccessChange): string { return changeDetail(c); }
  when(value: string | null | undefined): string { return stamp(value); }

  show(view: GrantsView): void {
    this.view.set(view);
    if (view === 'delegates') {
      this.needPeople.emit();
      this.api.delegates(this.tenantId()).subscribe({ next: r => this.delegations.set(r.status === API_SUCCESS ? r.data ?? [] : []) });
    }
    if (view === 'changes') {
      this.api.changes({ tenantId: this.tenantId() }).subscribe({ next: r => this.changes.set(r.status === API_SUCCESS ? r.data ?? [] : []) });
    }
  }

  pick(appUserId: number | null): void {
    this.personId.set(appUserId);
    this.access.set(null);
    if (!appUserId) return;
    this.loadingAccess.set(true);
    this.accessError.set('');
    this.api.effective(appUserId).subscribe({
      next: r => {
        this.loadingAccess.set(false);
        if (r.status === API_SUCCESS) this.access.set(r.data ?? null);
        else this.accessError.set(r.message || 'Their access could not be read.');
      },
      error: err => { this.loadingAccess.set(false); this.accessError.set(err?.error?.message || 'Their access could not be read.'); },
    });
  }

  /** Opens or withholds a page or a tab for the chosen person, then reads their access again. */
  set(key: string, allowed: boolean): void {
    const person = this.personId();
    if (!person || this.busy()) return;
    this.busy.set(true);
    this.api.grant(person, key, allowed, this.days(), this.reason()).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status === API_SUCCESS) { this.toast.success(r.message || 'Access changed.'); this.pick(person); }
        else this.toast.error(r.message || 'Access could not be changed.');
      },
      error: err => { this.busy.set(false); this.toast.error(err?.error?.message || 'Access could not be changed.'); },
    });
  }

  togglePerson(id: number): void {
    const now = this.draftPeople();
    this.draftPeople.set(now.includes(id) ? now.filter(x => x !== id) : [...now, id]);
  }

  delegateNow(): void {
    const who = this.draftDelegate();
    if (!who) return;
    this.busy.set(true);
    this.api.grantDelegation({ tenantId: this.tenantId(), delegateUserId: who, scopePeople: this.draftScope(),
      people: this.draftScope() === 'LISTED' ? this.draftPeople() : [], scopeKeys: null, canAssignProfiles: this.draftProfiles(),
      days: this.draftDays(), reason: this.draftReason().trim() }).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status === API_SUCCESS) { this.toast.success(r.message || 'Delegated.'); this.draftReason.set(''); this.show('delegates'); }
        else this.toast.error(r.message || 'The delegation could not be made.');
      },
      error: err => { this.busy.set(false); this.toast.error(err?.error?.message || 'The delegation could not be made.'); },
    });
  }

  revoke(d: Delegation): void {
    this.busy.set(true);
    this.api.revokeDelegation(d.delegateId, 'Ended on Page access', this.tenantId()).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status === API_SUCCESS) { this.toast.success(r.message || 'Delegation ended.'); this.show('delegates'); }
        else this.toast.error(r.message || 'The delegation could not be ended.');
      },
      error: err => { this.busy.set(false); this.toast.error(err?.error?.message || 'The delegation could not be ended.'); },
    });
  }
}

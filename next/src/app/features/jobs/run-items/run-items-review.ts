import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Team, TeamsApi } from '../../../core/teams/teams.api';
import { plural } from '../run-steps/run-page.model';
import { Reviewers } from './run-items.model';
import { InlineStatus, loadErrorText } from '../../../shared/ui/loading';

/** What the dialog asks about: how many items are going, and their first names. */
export interface ReviewDialogData { count: number; labels: string[]; }

/** What it answers: who reviews, and a note for them; null when cancelled. */
export interface ReviewChoice { reviewers: Reviewers; note: string; }

/** The roles a review may go to (PipelineDefinition.Reviewers.ROLES). */
export const ROLES: { value: string; label: string }[] = [
  { value: 'TENANT_ADMIN', label: 'The workspace\'s administrators' },
  { value: 'TENANT_USER', label: 'Everyone in the workspace' },
];

/**
 * MIG-421: "Send to review" -- the selected items go to a team (one of the workspace's own) or a role as one task in
 * Review › Approvals naming them, with a note. Teams are {kind: team}; the old "group" is gone.
 */
@Component({
  selector: 'app-run-items-review',
  imports: [InlineStatus],
  template: `
    <div class="card shadow-2xl w-[30rem] max-w-[calc(100vw-2rem)] overflow-hidden" role="dialog" aria-labelledby="rir-title" data-test="items-review-dialog">
      <div class="px-5 pt-4 pb-3 flex flex-col gap-3">
        <div>
          <h2 id="rir-title" class="text-base font-semibold">Send {{ countText() }} to review</h2>
          <p class="text-sm text-[color:var(--text-secondary)] mt-1">A task in Review › Approvals names {{ data.count === 1 ? 'it' : 'them' }}
            and opens the run's Items tab showing {{ data.count === 1 ? 'it' : 'exactly them' }}@if (data.labels.length) {: <span class="mono">{{ labelsText() }}</span>}.</p>
        </div>
        <fieldset class="flex flex-col gap-2 border-0 p-0 m-0">
          <legend class="text-sm font-medium mb-1">Who reviews</legend>
          <label class="flex items-center gap-2 text-sm"><input type="radio" name="rir-kind" [checked]="kind() === 'team'" (change)="kind.set('team')" data-test="review-kind-team" />A team</label>
          <label class="flex items-center gap-2 text-sm"><input type="radio" name="rir-kind" [checked]="kind() === 'role'" (change)="kind.set('role')" data-test="review-kind-role" />A role</label>
        </fieldset>
        @if (kind() === 'team') {
          <label class="flex flex-col gap-1.5 text-sm"><span class="font-medium">Team</span>
            <select class="select" [value]="team()" (change)="team.set($any($event.target).value)" data-test="review-team">
              <option value="">{{ teamsLoading() ? 'Loading teams…' : teamsError() ? 'The teams could not be read' : teams().length ? 'Pick a team' : 'This workspace has no team' }}</option>
              @for (t of teams(); track t.teamId) { <option [value]="t.teamId">{{ t.name }} ({{ t.memberCount }})</option> }
            </select>
            <!-- Owner 2026-10-27: loading, why the teams could not be read (Try again), or that there is none. -->
            <app-inline-status [loading]="teamsLoading()" [error]="teamsError()" [empty]="!teamsLoading() && !teamsError() && !teams().length"
                               label="Loading teams…" emptyText="This workspace has no team yet: send it to a role instead." (retry)="loadTeams()" />
          </label>
        } @else {
          <label class="flex flex-col gap-1.5 text-sm"><span class="font-medium">Role</span>
            <select class="select" [value]="role()" (change)="role.set($any($event.target).value)" data-test="review-role">
              @for (r of roles; track r.value) { <option [value]="r.value">{{ r.label }}</option> }
            </select>
          </label>
        }
        <label class="flex flex-col gap-1.5 text-sm"><span class="font-medium">Note for the reviewers <span class="text-[color:var(--text-muted)] font-normal">(optional)</span></span>
          <textarea class="input min-h-[4.5rem]" maxlength="500" [value]="note()" (input)="note.set($any($event.target).value)"
                    placeholder="What to check" data-test="review-note"></textarea>
        </label>
      </div>
      <div class="flex justify-end gap-2 px-5 py-3 border-t border-subtle">
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close(null)">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" [disabled]="!ready()" (click)="send()" data-test="review-send">Send to review</button>
      </div>
    </div>
  `,
})
export class RunItemsReview implements OnInit {
  readonly ref = inject<DialogRef<ReviewChoice | null>>(DialogRef);
  readonly data = inject<ReviewDialogData>(DIALOG_DATA);
  private readonly teamsApi = inject(TeamsApi);

  readonly roles = ROLES;
  readonly kind = signal<'team' | 'role'>('team');
  readonly team = signal('');
  readonly role = signal('TENANT_ADMIN');
  readonly note = signal('');
  readonly teams = signal<Team[]>([]);
  readonly teamsLoading = signal(true);
  /** Why the teams could not be read: a failure is not "This workspace has no team" (owner 2026-10-27). */
  readonly teamsError = signal('');

  readonly countText = computed(() => plural(this.data.count, 'item'));
  readonly labelsText = computed(() => {
    const shown = this.data.labels.slice(0, 3).join(', ');
    return this.data.count > 3 ? `${shown} and ${this.data.count - 3} more` : shown;
  });
  readonly ready = computed(() => this.kind() === 'role' ? !!this.role() : !!this.team());

  ngOnInit(): void { this.loadTeams(); }

  loadTeams(): void {
    this.teamsLoading.set(true);
    this.teamsError.set('');
    this.teamsApi.list().subscribe({
      next: r => {
        this.teamsLoading.set(false);
        if (r?.status !== API_SUCCESS || !Array.isArray(r.data)) { this.teamsError.set(loadErrorText(r, 'The teams could not be read.')); return; }
        const teams = r.data.filter(t => t.status === 'ACTIVE');
        this.teams.set(teams);
        if (!teams.length) this.kind.set('role');
      },
      // The team choice stays, saying why it is empty; a role can still be picked.
      error: err => { this.teamsLoading.set(false); this.teamsError.set(loadErrorText(err, 'The teams could not be read.')); },
    });
  }

  send(): void {
    if (!this.ready()) return;
    const reviewers: Reviewers = this.kind() === 'team' ? { kind: 'team', value: this.team() } : { kind: 'role', value: this.role() };
    this.ref.close({ reviewers, note: this.note().trim() });
  }
}

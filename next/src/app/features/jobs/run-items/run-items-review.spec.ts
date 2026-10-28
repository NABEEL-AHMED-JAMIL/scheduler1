import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { TeamsApi } from '../../../core/teams/teams.api';
import { RunItemsReview } from './run-items-review';

/** Owner 2026-10-27: Send to review's team list says it is loading, that there is none, or why it could not be read. */
function dialog(list: () => Observable<unknown>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: DialogRef, useValue: { close: () => {} } },
    { provide: DIALOG_DATA, useValue: { count: 2, labels: ['a.pdf', 'b.pdf'] } },
    { provide: TeamsApi, useValue: { list } },
  ] });
  const screen = TestBed.runInInjectionContext(() => new RunItemsReview());
  screen.ngOnInit();
  return screen;
}

describe('Send to review -- the teams (owner 2026-10-27)', () => {
  it('is loading until the teams answer', () => {
    const screen = dialog(() => NEVER);
    expect(screen.teamsLoading()).toBe(true);
    expect(screen.teamsError()).toBe('');
  });

  it('has no team once an empty list answers, and offers a role instead', () => {
    const screen = dialog(() => of({ status: 'SUCCESS', message: '', data: [] }));
    expect(screen.teamsLoading()).toBe(false);
    expect(screen.teams()).toEqual([]);
    expect(screen.kind()).toBe('role');
  });

  it('says the teams could not be read rather than that there is none, and reads them again', () => {
    let answer: () => Observable<unknown> = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    const screen = dialog(() => answer());
    expect(screen.teamsLoading()).toBe(false);
    expect(screen.teamsError()).toBe('The teams could not be read.');
    expect(screen.kind()).toBe('team');
    answer = () => of({ status: 'SUCCESS', message: '', data: [{ teamId: 6, name: 'Wound care', status: 'ACTIVE', memberCount: 3 }] });
    screen.loadTeams();
    expect(screen.teamsError()).toBe('');
    expect(screen.teams().map(t => t.name)).toEqual(['Wound care']);
  });
});

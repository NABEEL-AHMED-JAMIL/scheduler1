import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { TeamsApi } from '../../../core/teams/teams.api';
import { SchemaForm } from './schema-form';
import { JsonSchema } from './steps.model';

/**
 * Owner 2026-10-27: a who-reviews setting's Team list said "No team yet" while the teams were still on their way, and the
 * same when they could not be read. It now says it is loading, says the failure with Try again, and "No team yet" only
 * after an answer with none.
 */
const SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    reviewers: { type: 'object', properties: { kind: { type: 'string', enum: ['role', 'team'] }, value: { type: 'string' } } },
  },
};

function form(list: () => Observable<unknown>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SchemaForm],
    providers: [provideZonelessChangeDetection(), { provide: TeamsApi, useValue: { list: vi.fn(list) } }],
  });
  const fixture = TestBed.createComponent(SchemaForm);
  fixture.componentRef.setInput('schema', SCHEMA);
  fixture.componentRef.setInput('value', { reviewers: { kind: 'team', value: '' } });
  fixture.detectChanges();
  TestBed.tick();
  fixture.detectChanges();
  return { fixture, form: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('SchemaForm -- the reviewers\' team list', () => {
  it('is loading, and says no "No team yet", until the teams answer', () => {
    const { form: f, el } = form(() => NEVER);
    expect(f.teamsState.loading()).toBe(true);
    expect(el.textContent).not.toContain('No team yet');
  });

  it('says "No team yet" once the answer has none', () => {
    const { form: f, el } = form(() => of({ status: 'SUCCESS', message: '', data: [] }));
    expect(f.teamsState.loaded()).toBe(true);
    expect(el.textContent).toContain('No team yet');
  });

  it('says the teams could not be read, with Try again', () => {
    const { form: f, el } = form(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(f.teamsState.error()).toBe('The teams could not be read.');
    expect(el.textContent).not.toContain('No team yet');
    expect(el.querySelector('app-inline-status [role="alert"]')).not.toBeNull();
  });
});

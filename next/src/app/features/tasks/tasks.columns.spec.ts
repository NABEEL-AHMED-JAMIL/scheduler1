import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { Tasks } from './tasks';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthService } from '../../core/auth/auth.service';

/**
 * UX review 2026-10-12 (B2, P1): the Pipelines list says what a user needs -- its steps and outputs, schedules, last run
 * and the data's sensitivity -- from the fields Core's listSourceTask adds; an older Core's rows read "—".
 */
function screen() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: () => of({}), post: () => of({}), put: () => of({}) } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
      { provide: Dialog, useValue: { open: () => ({ closed: of(undefined) }) } },
      { provide: AuthService, useValue: { user: () => null, canManageTasks: () => true } },
    ],
  });
  return TestBed.runInInjectionContext(() => new Tasks());
}

const row = (over: object) => ({ taskDetailId: 1928, taskName: 'Brain tumour MRI grading', taskStatus: 'Active', ...over });

describe('Pipelines list -- the columns a user needs (B2)', () => {
  it('says how many steps and outputs a pipeline has, or that it runs as its legacy step', () => {
    const tasks = screen();
    expect(tasks.stepsText(row({ stepCount: 12, outputCount: 3 }))).toBe('12 steps, 3 outputs');
    expect(tasks.stepsText(row({ stepCount: 1, outputCount: 1 }))).toBe('1 step, 1 output');
    expect(tasks.stepsText(row({ stepCount: 4, outputCount: 0 }))).toBe('4 steps');
    expect(tasks.stepsText(row({ stepCount: 0 }))).toBe('Runs as its legacy step');
    expect(tasks.stepsText(row({}))).toBe('—');
  });

  it('names the data\'s sensitivity in words', () => {
    const tasks = screen();
    expect(tasks.sensitivityText('sensitive')).toMatch(/Sensitive/);
  });
});

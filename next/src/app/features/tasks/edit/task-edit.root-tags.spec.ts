import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { TaskEdit } from './task-edit';
import { ToastService } from '../../../shared/ui/toast.service';

/**
 * UI review, 2026-09-24 (verified, high): a task created through the API stores its settings under the payload's root
 * element -- tags like {csvCheck/csvCheck} and {inputKey, parent csvCheck} -- while the pipeline form's fields have
 * no parent. The editor matched name AND parent exactly, so every field opened blank or on its default, and a save
 * pushed a second, parentless copy of each setting beside the original: an ambiguous payload for the worker.
 */
function editor(tags: { tagKey: string; tagParent: string; tagValue: string }[]) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', data: [] }), post: () => of({}) } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
    { provide: Router, useValue: { navigate: () => {} } },
  ] });
  const component = TestBed.runInInjectionContext(() => new TaskEdit()) as any;
  for (const t of tags) component.tags.push(component.fb.group({ tagKey: [t.tagKey], tagParent: [t.tagParent], tagValue: [t.tagValue] }));
  return component;
}

const field = (tagKey: string) => ({ tagKey, tagParent: null, label: tagKey, fieldType: 'text', required: true, position: 0 });

describe('TaskEdit with a root-wrapped payload', () => {
  const wrapped = [
    { tagKey: 'csvCheck', tagParent: 'csvCheck', tagValue: '' },
    { tagKey: 'inputKey', tagParent: 'csvCheck', tagValue: 'ui-review/inputs/ledger.csv' },
    { tagKey: 'outputPrefix', tagParent: 'csvCheck', tagValue: 'ui-review/output/ledger' },
  ];

  it('opens each field on its saved value', () => {
    const c = editor(wrapped);
    expect(c.findTag(field('inputKey'))).toBe('ui-review/inputs/ledger.csv');
    expect(c.findTag(field('outputPrefix'))).toBe('ui-review/output/ledger');
  });

  it('updates the saved row in place instead of adding a parentless copy', () => {
    const c = editor(wrapped);
    const row = c.tagRowFor(field('inputKey'));
    expect(row.getRawValue()).toEqual({ tagKey: 'inputKey', tagParent: 'csvCheck', tagValue: 'ui-review/inputs/ledger.csv' });
  });

  it('never treats the root row itself as a setting', () => {
    expect(editor(wrapped).findTag(field('csvCheck'))).toBeNull();
  });

  it('still matches a flat payload exactly as before', () => {
    const c = editor([{ tagKey: 'search_term', tagParent: '', tagValue: 'hurricanes' }]);
    expect(c.findTag(field('search_term'))).toBe('hurricanes');
  });
});

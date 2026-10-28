import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { NEVER, Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Pipeline } from '../pipelines/pipeline.model';
import { RegistryTaskEditor } from './registry-task-editor';
import { ToastService } from '../../../shared/ui/toast.service';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { unsavedChangesGuard } from '../../../shared/ui/unsaved-changes.guard';
import { DUPLICATE_DATA, EDIT_DATA, SAVE_REQUEST } from './legacy-save.golden';

/**
 * The authoring side of a select. Two things are being held in place here.
 *
 * The first is that opening a form must not change it. The Choices textarea became a pair of
 * boxes per choice, which means every existing form is parsed on open and written back out on
 * save -- so a form whose choices were plain lines and were never touched has to serialize to
 * the same bytes it arrived as, or an unrelated edit silently rewrites the column for every
 * pipeline in the tenant.
 *
 * The second is that a form which saves happily and misbehaves elsewhere is not a valid form.
 * A dropdown with no choices, two choices sharing a value, and a default that matches none of
 * them all saved without complaint before this and produced a blank <select> on somebody else's
 * screen, hours later, with nothing pointing back at the form that caused it.
 */
function dialogFor(form?: Pipeline, topics: unknown[] = [], opts: { copyOf?: number; confirm?: boolean } = {}) {
  const post = vi.fn((_url: string, _body?: unknown) => of({ status: API_SUCCESS, message: 'saved' }));
  const get = vi.fn((url: string, _options?: unknown) => {
    if (url.endsWith('/pipeline.json/get')) return of({ status: API_SUCCESS, data: structuredClone(form) });
    if (url.endsWith('/pipeline.json/steps/tasks/pipelines')) return of({ status: API_SUCCESS, data: [] });
    return of({ status: API_SUCCESS, data: topics });
  });
  const toast = { success: vi.fn(), error: vi.fn(), info: () => {} };
  const navigate = vi.fn();
  const opened: any[] = [];
  const key = opts.copyOf ? null : form?.pipelineKey ?? null;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { post, get } },
      { provide: ToastService, useValue: toast },
      { provide: Router, useValue: { navigate } },
      { provide: Dialog, useValue: { open: (component: unknown, config: any) => { opened.push({ component, config }); return { closed: of(opts.confirm) }; } } },
      { provide: AuthService, useValue: { isPlatformAdmin: () => false, isTenantAdmin: () => true, user: () => null, builderLocked: () => false } },
      { provide: WorkspaceDirectory, useValue: { names: () => new Map() } },
      { provide: ActivatedRoute, useValue: { snapshot: {
        paramMap: { get: (k: string) => (k === 'pipelineKey' && key ? String(key) : null) },
        queryParamMap: { get: (k: string) => (k === 'copyOf' && opts.copyOf ? String(opts.copyOf) : null) },
      } } },
    ],
  });
  const dialog = TestBed.runInInjectionContext(() => new RegistryTaskEditor());
  dialog.ngOnInit();
  return { dialog, post, get, toast, navigate, opened };
}

/**
 * MIG-324: in a new workspace the topic box was empty and only said "No matches" -- a dead end for an administrator
 * who did not yet know topics are added under Kafka & Topics. A new pipeline asks once whether the workspace has any.
 */
describe('Registry task page -- a workspace with no topic yet', () => {
  it('says where a topic is added when the workspace has none', () => {
    const { dialog, get } = dialogFor();
    expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/setting\.json\/topics$/), { params: { q: '', limit: 1 } });
    expect(dialog.noTopicsYet()).toBe(true);
    expect(dialog.topicHint()).toContain('Kafka & Topics');
  });

  it('keeps the usual hint when the workspace has a topic', () => {
    const { dialog } = dialogFor(undefined, [{ sourceTaskTypeId: 1, serviceName: 'Orders intake' }]);
    expect(dialog.noTopicsYet()).toBe(false);
    expect(dialog.topicHint()).not.toContain('Kafka & Topics');
  });

  it('does not ask when an existing pipeline is edited: it reads the row, which has its topic', () => {
    const { dialog, get } = dialogFor(selectForm(null));
    expect(get.mock.calls.map(c => c[0])).not.toContainEqual(expect.stringMatching(/\/setting\.json\/topics$/));
    expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/pipeline\.json\/get$/), { params: { pipelineKey: 7 } });
    expect(dialog.noTopicsYet()).toBe(false);
  });
});

function selectForm(fieldOptions: string | null, defaultValue: string | null = null): Pipeline {
  return {
    pipelineKey: 7, pipelineId: 'F768930', pipelineName: 'CSV to JSON demo',
    fields: [{
      pipelineFieldId: 71, tagKey: 'format', tagParent: null, label: 'JSON shape',
      fieldType: 'select', required: false, defaultValue, helpText: null,
      fieldOptions, position: 0,
    }],
  };
}

/** The field list the dialog would POST, without going through save()'s validation. */
function payloadFields(dialog: RegistryTaskEditor): any[] {
  return (dialog as any).rows();
}

describe('Registry task page -- choices are edited as value and label', () => {
  it('splits an existing value/label choice into its two boxes', () => {
    const { dialog } = dialogFor(selectForm('records=JSON array\nlines=JSON Lines', 'records'));
    expect(dialog.choicesArray(0).getRawValue()).toEqual([
      { value: 'records', label: 'JSON array' },
      { value: 'lines', label: 'JSON Lines' },
    ]);
  });

  it('shows a legacy choice as the same string in both boxes', () => {
    const { dialog } = dialogFor(selectForm('records\nlines'));
    expect(dialog.choicesArray(0).getRawValue()).toEqual([
      { value: 'records', label: 'records' },
      { value: 'lines', label: 'lines' },
    ]);
  });

  it('writes a legacy form back byte for byte when nothing is edited', () => {
    // An author opening a form to read it, or to fix a typo in a different field, must not
    // rewrite the choices column of every select on the way past.
    const { dialog } = dialogFor(selectForm('records\nlines', 'records'));
    expect(payloadFields(dialog)[0].fieldOptions).toBe('records\nlines');
  });

  it('writes an edited label as value=label and leaves untouched choices bare', () => {
    const { dialog } = dialogFor(selectForm('records\nlines'));
    dialog.choicesArray(0).at(1).get('label')!.setValue('JSON Lines (one object per line)');
    expect(payloadFields(dialog)[0].fieldOptions)
      .toBe('records\nlines=JSON Lines (one object per line)');
  });

  it('adds and removes a choice row', () => {
    const { dialog } = dialogFor(selectForm('records'));
    dialog.addChoice(0);
    dialog.choicesArray(0).at(1).patchValue({ value: 'lines', label: 'JSON Lines' });
    expect(payloadFields(dialog)[0].fieldOptions).toBe('records\nlines=JSON Lines');
    dialog.removeChoice(0, 0);
    expect(payloadFields(dialog)[0].fieldOptions).toBe('lines=JSON Lines');
  });

  it('normalises the seeder\'s comma-separated options on the first real save', () => {
    const { dialog } = dialogFor(selectForm('records,lines', 'records'));
    expect(payloadFields(dialog)[0].fieldOptions).toBe('records\nlines');
  });
});

describe('Registry task page -- the Default value dropdown', () => {
  it('offers the parsed choices, showing labels and storing values', () => {
    const { dialog } = dialogFor(selectForm('records=JSON array\nlines=JSON Lines'));
    expect(dialog.defaultValueOptions(0)).toEqual([
      { value: 'records', label: 'JSON array' },
      { value: 'lines', label: 'JSON Lines' },
    ]);
  });

  it('carries a default that matches no choice as a labelled last entry', () => {
    // Otherwise the box renders blank and reads as a deliberate "(none)", which is exactly how
    // a renamed choice goes unnoticed until every new task on the pipeline is already wrong.
    const { dialog } = dialogFor(selectForm('records\nlines', 'daily'));
    expect(dialog.defaultValueOptions(0)).toEqual([
      { value: 'records', label: 'records' },
      { value: 'lines', label: 'lines' },
      { value: 'daily', label: 'daily (not one of the choices)' },
    ]);
  });

  it('follows the choices as they are edited', () => {
    const { dialog } = dialogFor(selectForm('records'));
    dialog.addChoice(0);
    dialog.choicesArray(0).at(1).patchValue({ value: 'lines', label: 'JSON Lines' });
    expect(dialog.defaultValueOptions(0).map(c => c.value)).toEqual(['records', 'lines']);
  });
});

describe('Registry task page -- choices survive a save made while the type is not select', () => {
  it('keeps the choices when the field is saved as text', () => {
    /*
     * The payload used to null fieldOptions for anything but a select, and saveForm replaces
     * the field list wholesale -- it clears the rows and rebuilds them, with orphanRemoval
     * deleting the originals. So an author who flipped a field to `text` while exploring, then
     * made an unrelated edit elsewhere in the same dialog and pressed Save, lost eleven
     * carefully written choices with no warning and no undo, while the choices editor was
     * hidden the whole time.
     */
    const { dialog } = dialogFor(selectForm('eq\nne\ngt\ngte\nlt\nlte'));
    dialog.fields.at(0).get('fieldType')!.setValue('text');
    expect(payloadFields(dialog)[0].fieldOptions).toBe('eq\nne\ngt\ngte\nlt\nlte');
  });

  it('sends null for a field that never had any choices', () => {
    const { dialog } = dialogFor();
    dialog.addField();
    expect(payloadFields(dialog)[0].fieldOptions).toBeNull();
  });
});

describe('Registry task page -- what save() refuses', () => {
  function readyToSave(dialog: RegistryTaskEditor): void {
    dialog.form.patchValue({ pipelineId: 'F768930', pipelineName: 'CSV to JSON demo' });
  }

  it('saves a well-formed select', () => {
    const { dialog, post, toast } = dialogFor(
      selectForm('records=JSON array\nlines=JSON Lines', 'records'));
    readyToSave(dialog);
    dialog.save();
    expect(toast.error).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalled();
  });

  it('refuses a select with no choices', () => {
    const { dialog, post, toast } = dialogFor(selectForm(null));
    readyToSave(dialog);
    dialog.save();
    expect(post).not.toHaveBeenCalled();
    expect(toast.error.mock.calls[0][0]).toContain('no choices');
  });

  it('refuses a default that is not one of the choices', () => {
    const { dialog, post, toast } = dialogFor(selectForm('records\nlines', 'daily'));
    readyToSave(dialog);
    dialog.save();
    expect(post).not.toHaveBeenCalled();
    expect(toast.error.mock.calls[0][0]).toContain('not one of its choices');
  });

  it('refuses two choices with the same stored value', () => {
    const { dialog, post, toast } = dialogFor(selectForm('records=JSON array\nrecords=Records'));
    readyToSave(dialog);
    dialog.save();
    expect(post).not.toHaveBeenCalled();
    expect(toast.error.mock.calls[0][0]).toContain('twice');
  });

  it('refuses a "=" inside a choice\'s value, by name rather than by truncating it', () => {
    // The format has no escape character on purpose, so this is the one input it cannot carry.
    // Checked against the boxes, because serializing turns `a=b` into value `a`, label `b` --
    // by the time the shared rule sees the text, the mistake looks like a valid choice.
    const { dialog, post, toast } = dialogFor(selectForm('records'));
    readyToSave(dialog);
    dialog.choicesArray(0).at(0).patchValue({ value: 'a=b', label: 'A or B' });
    dialog.save();
    expect(post).not.toHaveBeenCalled();
    expect(toast.error.mock.calls[0][0]).toContain('"=" in its value');
  });
});

/** Owner #18: New / Edit registry task is a page with its own address -- it reads its row, saves the same request, and asks before leaving unsaved changes. */
describe('Registry task page -- its own page', () => {
  it('reads the row by its key, and a save untouched POSTs the request the dialog did, byte for byte', () => {
    const { dialog, post, toast, navigate } = dialogFor(EDIT_DATA.form as unknown as Pipeline);
    expect(dialog.isEdit()).toBe(true);
    expect(dialog.heading()).toBe(EDIT_DATA.form.pipelineName);
    expect(dialog.hasUnsavedChanges()).toBe(false);
    dialog.save();
    expect(toast.error).not.toHaveBeenCalled();
    expect(post.mock.calls[0][0]).toBe(SAVE_REQUEST.url);
    expect(JSON.stringify(post.mock.calls[0][1])).toBe(JSON.stringify(SAVE_REQUEST.body));
    expect(navigate).toHaveBeenCalledWith(['/settings/task-registry']);
  });

  it(`opens a duplicate as the list's Duplicate did: no key, no id, "(copy)", no field ids`, () => {
    const { dialog } = dialogFor(EDIT_DATA.form as unknown as Pipeline, [], { copyOf: EDIT_DATA.form.pipelineKey });
    expect(dialog.isEdit()).toBe(false);
    expect(dialog.heading()).toBe('Duplicate registry task');
    const v = dialog.form.getRawValue();
    expect(v.pipelineKey).toBeNull();
    expect(v.pipelineId).toBe(DUPLICATE_DATA.form.pipelineId);
    expect(v.pipelineName).toBe(DUPLICATE_DATA.form.pipelineName);
    expect(payloadFields(dialog).every(f => f.pipelineFieldId === undefined)).toBe(true);
  });

  it('knows when what is on screen is not saved, and the guard asks before leaving', async () => {
    const { dialog, opened } = dialogFor(selectForm('records\nlines', 'records'), [], { confirm: false });
    expect(dialog.changeState()).toBe('No changes');
    expect(TestBed.runInInjectionContext(() => unsavedChangesGuard(dialog, null as any, null as any, null as any))).toBe(true);
    dialog.form.patchValue({ pipelineName: 'Renamed' });
    expect(dialog.hasUnsavedChanges()).toBe(true);
    expect(dialog.changeState()).toBe('Unsaved changes');
    const stay = await TestBed.runInInjectionContext(() => unsavedChangesGuard(dialog, null as any, null as any, null as any));
    expect(stay).toBe(false);
    expect(opened[0].config.data.confirmLabel).toBe('Leave without saving');
    dialog.form.patchValue({ pipelineName: 'CSV to JSON demo' });
    expect(dialog.hasUnsavedChanges()).toBe(false);
  });

  it('a new one starts empty, with nothing to lose', () => {
    const { dialog } = dialogFor(undefined);
    expect(dialog.ready()).toBe(true);
    expect(dialog.heading()).toBe('New registry task');
    expect(dialog.hasUnsavedChanges()).toBe(false);
  });
});

describe('Registry task page -- loading and errors (owner 2026-10-27)', () => {
  function editorWith(answers: { get: () => Observable<unknown>; users: () => Observable<unknown> }) {
    const get = vi.fn((url: string) => url.endsWith('/pipeline.json/steps/tasks/pipelines') ? answers.users() : answers.get());
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: { post: vi.fn(), get } },
        { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: () => {} } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: Dialog, useValue: { open: () => ({ closed: of(false) }) } },
        { provide: AuthService, useValue: { isPlatformAdmin: () => false, isTenantAdmin: () => true, user: () => null, builderLocked: () => false } },
        { provide: WorkspaceDirectory, useValue: { names: () => new Map() } },
        { provide: ActivatedRoute, useValue: { snapshot: {
          paramMap: { get: (k: string) => (k === 'pipelineKey' ? '7' : null) }, queryParamMap: { get: () => null } } } },
      ],
    });
    const page = TestBed.runInInjectionContext(() => new RegistryTaskEditor());
    page.ngOnInit();
    return { page, get };
  }

  it('is loading until the record answers', () => {
    const { page } = editorWith({ get: () => NEVER, users: () => NEVER });
    expect(page.loading()).toBe(true);
    expect(page.error()).toBe('');
  });

  it('a failed read says so in plain words and reads again on Try again', () => {
    let answer: () => Observable<unknown> = () => throwError(() => new HttpErrorResponse({ status: 500, error: 'Internal Server Error' }));
    const { page, get } = editorWith({ get: () => answer(), users: () => of({ status: API_SUCCESS, data: [] }) });
    expect(page.loading()).toBe(false);
    expect(page.error()).toBe('The pipeline could not be read.');
    expect(page.errorRetryable()).toBe(true);
    answer = () => of({ status: API_SUCCESS, data: selectForm(null) });
    page.retry();
    expect(page.error()).toBe('');
    expect(page.ready()).toBe(true);
    expect(get.mock.calls.filter(c => String(c[0]).endsWith('/pipeline.json/get')).length).toBe(2);
  });

  it('a pipeline that no longer exists offers no Try again', () => {
    const { page } = editorWith({ get: () => of({ status: 'ERROR', message: 'That pipeline no longer exists.' }), users: () => NEVER });
    expect(page.error()).toBe('That pipeline no longer exists.');
    expect(page.errorRetryable()).toBe(false);
  });

  it('Used by is loading, then empty, or says it could not be read', () => {
    let users: () => Observable<unknown> = () => NEVER;
    const { page } = editorWith({ get: () => of({ status: API_SUCCESS, data: selectForm(null) }), users: () => users() });
    expect(page.usersLoading()).toBe(true);
    users = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    page.loadUsers();
    expect(page.usersLoading()).toBe(false);
    expect(page.usersError()).toBe('The pipelines that use it could not be read.');
    users = () => of({ status: API_SUCCESS, data: [] });
    page.loadUsers();
    expect(page.usersError()).toBe('');
    expect(page.users()).toEqual([]);
  });
});

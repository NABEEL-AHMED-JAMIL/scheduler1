import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { Pipeline, PipelineDialog } from './pipeline-dialog';
import { ToastService } from '../../../shared/ui/toast.service';
import { API_SUCCESS } from '../../../core/api/api.config';

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
function dialogFor(form?: Pipeline) {
  const post = vi.fn(() => of({ status: API_SUCCESS, message: 'saved' }));
  const toast = { success: vi.fn(), error: vi.fn(), info: () => {} };
  const close = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DIALOG_DATA, useValue: form ? { form } : {} },
      { provide: DialogRef, useValue: { close } },
      { provide: HttpClient, useValue: { post } },
      { provide: ToastService, useValue: toast },
    ],
  });
  const dialog = TestBed.runInInjectionContext(() => new PipelineDialog());
  return { dialog, post, toast, close };
}

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
function payloadFields(dialog: PipelineDialog): any[] {
  return (dialog as any).rows();
}

describe('PipelineDialog -- choices are edited as value and label', () => {
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

describe('PipelineDialog -- the Default value dropdown', () => {
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

describe('PipelineDialog -- choices survive a save made while the type is not select', () => {
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

describe('PipelineDialog -- what save() refuses', () => {
  function readyToSave(dialog: PipelineDialog): void {
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

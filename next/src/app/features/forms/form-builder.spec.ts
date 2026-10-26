import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { FormBuilder } from './form-builder';
import { FormsApi } from './forms.service';
import { FormField, FormSummary } from './forms.model';

/**
 * Wave 5 Forms (lite), the builder: an administrator creates and edits forms -- fields added, reordered and removed,
 * keys following their labels until saved -- links a job and activates or archives; a member sees the Active forms to
 * fill in and nothing that builds; in a MANAGED workspace the administrator's editor is read-only inside a .form-lock.
 */
const FIELDS: FormField[] = [
  { key: 'patient_id', label: 'Patient ID', type: 'text', required: true },
  { key: 'wound_location', label: 'Wound location', type: 'choice', required: true, options: ['Sacrum', 'Heel'] },
];
const FORMS: FormSummary[] = [
  { formId: 1000, name: 'Wound intake', status: 'Active', version: 3, fieldCount: 2, startsJob: true, jobId: 2833,
    jobName: 'Wound triage', submissions: 4, dateUpdated: '2026-10-01T15:00:00Z' },
  { formId: 1001, name: 'Discharge checklist', status: 'Draft', version: 1, fieldCount: 0, startsJob: false, submissions: 0 },
  { formId: 1003, name: 'Visit log', status: 'Active', version: 1, fieldCount: 1, startsJob: false, submissions: 3,
    dataset: { analyticsDatasetId: 77, name: 'Form: Visit log', connection: 'clinic-inbox', path: 'datasets/forms/form-1003/*.json' } },
];

function screenWith(opts: { admin?: boolean; locked?: boolean; confirm?: boolean } = {}) {
  const admin = opts.admin ?? true;
  const asked: { title: string; body: string }[] = [];
  const dialog = { open: vi.fn((_c: unknown, config: { data: { title: string; body: string } }) => {
    asked.push(config.data);
    return { closed: of(opts.confirm ?? true) };
  }) };
  const api = {
    list: vi.fn(() => of({ status: 'SUCCESS', message: '', data: admin ? FORMS : FORMS.filter(f => f.status === 'Active') })),
    fetch: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { ...FORMS[0], fields: FIELDS } })),
    linkableJobs: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ jobId: 2833, jobName: 'Wound triage', jobStatus: 'Active' }] })),
    save: vi.fn(() => of({ status: 'SUCCESS', message: 'Form created.', data: { ...FORMS[1], formId: 1002 } })),
    setStatus: vi.fn(() => of({ status: 'SUCCESS', message: 'The form is archived.', data: FORMS[0] })),
    shareLinks: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { enabled: false, shareable: true, links: [] } })),
    rebuildDataset: vi.fn(() => of({ status: 'SUCCESS', message: 'Rebuilt 3 of 3 submission file(s); no answers changed.', data: null })),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: FormsApi, useValue: api },
      { provide: ToastService, useValue: toast },
      { provide: Dialog, useValue: dialog },
      { provide: AuthService, useValue: {
        isTenantAdmin: () => admin, canBuild: () => admin && !opts.locked, builderLocked: () => !!opts.locked, canOpen: () => true,
        user: signal({ appUserId: 4537 }),
      } },
    ],
  });
  const fixture = TestBed.createComponent(FormBuilder);
  fixture.detectChanges();
  return { api, toast, asked, fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

const labels = (el: HTMLElement) => Array.from(el.querySelectorAll('button, a'))
  .map(b => (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim());

/**
 * UX review 2026-10-12 (A6, G8): a row's actions are in its ⋮ menu. Every row's menu is opened in turn and what it
 * offers is read, with the page's own buttons and links.
 */
function offered(el: HTMLElement, fixture: { detectChanges(): void }): string[] {
  const found = labels(el);
  for (const trigger of Array.from(el.querySelectorAll<HTMLElement>('button[aria-label^="Actions for "]'))) {
    trigger.click();
    fixture.detectChanges();
    const menu = document.querySelector('.cdk-overlay-container [cdkmenu], .cdk-overlay-container .cdk-menu');
    found.push(...Array.from(menu?.querySelectorAll('button, a') ?? [])
      .map(b => (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim()));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.querySelector('.cdk-overlay-container')?.replaceChildren();
    fixture.detectChanges();
  }
  return found;
}

describe('Form builder -- the list', () => {
  it('shows an administrator every form with its job and the actions that build it', () => {
    const { api, el, fixture } = screenWith();
    expect(api.list).toHaveBeenCalledWith(false);
    expect(api.linkableJobs).toHaveBeenCalled();
    expect(el.textContent).toContain('Wound triage');
    const names = offered(el, fixture);
    expect(names).toEqual(expect.arrayContaining(['New form', 'Fill in Wound intake', 'Edit Wound intake', 'Archive Wound intake',
      'Activate Discharge checklist', 'Submissions of Wound intake']));
    expect(names).not.toContain('Fill in Discharge checklist');
  });

  it('shows a member the Active forms to fill in, and nothing that builds or names the job', () => {
    const { api, el, fixture } = screenWith({ admin: false });
    expect(api.linkableJobs).not.toHaveBeenCalled();
    const names = offered(el, fixture);
    expect(names).toContain('Fill in Wound intake');
    expect(names.some(n => n === 'New form' || n.startsWith('Edit') || n.startsWith('Archive'))).toBe(false);
    const heads = Array.from(el.querySelectorAll('thead th')).map(th => th.textContent!.trim());
    expect(heads).toEqual(['Form', 'Status', 'Fields', 'Actions']); // Actions as a screen reader's heading over the ⋮
  });

  it('offers an administrator "Rebuild dataset files" on a dataset form only, in a MANAGED workspace too', () => {
    const { el, fixture } = screenWith();
    const names = offered(el, fixture);
    expect(names).toContain('Rebuild dataset files of Visit log');
    expect(names.filter(n => n.startsWith('Rebuild dataset files'))).toHaveLength(1);
    const locked = screenWith({ locked: true });
    expect(offered(locked.el, locked.fixture)).toContain('Rebuild dataset files of Visit log');
    const member = screenWith({ admin: false });
    expect(offered(member.el, member.fixture).some(n => n.startsWith('Rebuild'))).toBe(false);
  });

  it('rebuilds a dataset form\'s files after saying what it does, and shows the answer', async () => {
    const { api, toast, asked, screen } = screenWith();
    await screen.rebuildDataset(FORMS[2]);
    expect(asked).toHaveLength(1);
    expect(asked[0].title).toBe('Rebuild the dataset files of Visit log?');
    expect(asked[0].body).toContain('clinic-inbox / datasets/forms/form-1003/*.json');
    expect(asked[0].body).toContain('No answers change.');
    expect(api.rebuildDataset).toHaveBeenCalledWith(1003);
    expect(toast.success).toHaveBeenCalledWith('Rebuilt 3 of 3 submission file(s); no answers changed.');
    expect(screen.rebuilding()).toBeNull();

    await screen.rebuildDataset(FORMS[0]);
    expect(api.rebuildDataset).toHaveBeenCalledTimes(1); // not a dataset: nothing to rebuild
  });

  it('sends nothing when the rebuild is cancelled, and shows a refusal or a failure as an error', async () => {
    const cancelled = screenWith({ confirm: false });
    await cancelled.screen.rebuildDataset(FORMS[2]);
    expect(cancelled.api.rebuildDataset).not.toHaveBeenCalled();

    const refused = screenWith();
    refused.api.rebuildDataset.mockReturnValueOnce(of({ status: 'ERROR', message: 'Rebuilt 2 of 3 submission file(s); no answers '
      + 'changed. 1 could not be written; try again.', data: null }));
    await refused.screen.rebuildDataset(FORMS[2]);
    expect(refused.toast.error).toHaveBeenCalledWith(expect.stringContaining('1 could not be written'));

    refused.api.rebuildDataset.mockReturnValueOnce(throwError(() => ({ error: {} })));
    await refused.screen.rebuildDataset(FORMS[2]);
    expect(refused.toast.error).toHaveBeenLastCalledWith('The dataset files were not rebuilt. Try again.');
    expect(refused.screen.rebuilding()).toBeNull();
  });

  it('archives a form and reads the list again', () => {
    const { api, toast, screen } = screenWith();
    screen.setStatus(FORMS[0], 'Archived');
    expect(api.setStatus).toHaveBeenCalledWith(1000, 'Archived');
    expect(toast.success).toHaveBeenCalledWith('The form is archived.');
    expect(api.list).toHaveBeenCalledTimes(2);
  });
});

describe('Form builder -- the editor', () => {
  it('lays the form out as palette, canvas and the chosen field\'s properties, with Logic and Settings tabs (MIG-280)', () => {
    const { screen, fixture, el } = screenWith();
    screen.edit(FORMS[0]);
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-add-type]').length).toBe(11);
    expect(Array.from(el.querySelectorAll('[data-field-row]')).length).toBe(2);
    expect(el.querySelector('[data-field-row="0"]')!.classList).toContain('is-on');
    expect(el.querySelector('[data-field-props]')!.textContent).toContain('Field · Patient ID');

    (el.querySelector('[data-field-row="1"] .builder-field-pick') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-field-props]')!.textContent).toContain('Field · Wound location');

    (el.querySelector('[data-add-type="date"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(screen.draft()!.fields.map(f => f.type)).toEqual(['text', 'choice', 'date']);
    expect(screen.selected()).toBe(2);

    screen.tab.set('logic');
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-logic-field]').length).toBe(2);
    screen.tab.set('settings');
    fixture.detectChanges();
    expect(el.querySelector('[data-settings] #formName')).not.toBeNull();
  });

  it('publishes a draft as Active, and leaves it a draft when a field is wrong', () => {
    const { api, screen } = screenWith();
    screen.newForm();
    screen.publish();
    expect(api.save).not.toHaveBeenCalled();
    expect(screen.draft()!.status).toBe('Draft');
    screen.patch({ name: 'Visit' });
    screen.publish();
    const sent = (api.save.mock.calls[0] as unknown[])[0] as { status: string };
    expect(sent.status).toBe('Active');
  });

  it('builds a new form: keys follow labels, fields move and go, and it saves what the server takes', () => {
    const { api, screen } = screenWith();
    screen.newForm();
    screen.patch({ name: ' Wound intake 2 ', jobId: 2833 });
    screen.setField(0, { label: 'Patient ID' });
    screen.newType.set('choice');
    screen.addField();
    screen.setField(1, { label: 'Wound location' });
    screen.setOptions(1, 'Sacrum\n\nHeel ');
    screen.newType.set('yesNo');
    screen.addField();
    screen.setField(2, { label: 'Signs of infection', required: true });
    screen.moveField(2, -1);
    screen.addField();
    screen.removeField(3);

    const d = screen.draft()!;
    expect(d.fields.map(f => f.key)).toEqual(['patient_id', 'signs_of_infection', 'wound_location']);
    expect(d.fields[2].options).toEqual(['Sacrum', 'Heel']);

    screen.save();
    expect(api.save).toHaveBeenCalledTimes(1);
    const sent = (api.save.mock.calls[0] as unknown[])[0] as { name: string; jobId: number; fields: { key: string; options: unknown }[] };
    expect(sent.name).toBe('Wound intake 2');
    expect(sent.jobId).toBe(2833);
    expect(sent.fields.map(f => f.key)).toEqual(['patient_id', 'signs_of_infection', 'wound_location']);
    expect(sent.fields[0].options).toBeNull();
    expect(screen.draft()?.formId).toBe(1002);
  });

  it('keeps a saved key when its label changes, and a typed key as typed', () => {
    const { screen } = screenWith();
    screen.edit(FORMS[0]);
    screen.setField(0, { label: 'Patient number' });
    expect(screen.draft()!.fields[0].key).toBe('patient_id');
    screen.addField();
    screen.setField(2, { key: 'mine' });
    screen.setField(2, { label: 'Something else' });
    expect(screen.draft()!.fields[2].key).toBe('mine');
  });

  it('saves nothing while a field is wrong, and says so', () => {
    const { api, screen } = screenWith();
    screen.newForm();
    screen.save();
    expect(api.save).not.toHaveBeenCalled();
    expect(screen.saveError()).toBe('Fix the problems marked below, then save.');
    expect(screen.problems()['form']).toBe('Give the form a name.');
  });

  it('is read-only in a MANAGED workspace: a form-lock fieldset, no Save and no changes', () => {
    const { api, screen, fixture, el } = screenWith({ locked: true });
    screen.edit(FORMS[0]);
    fixture.detectChanges();
    const lock = el.querySelector('fieldset.form-lock') as HTMLFieldSetElement;
    expect(lock).not.toBeNull();
    expect(lock.disabled).toBe(true);
    expect(el.querySelector('[data-save-form]')).toBeNull();
    screen.setField(0, { label: 'Changed' });
    screen.addField();
    screen.save();
    expect(screen.draft()!.fields.map(f => f.label)).toEqual(['Patient ID', 'Wound location']);
    expect(api.save).not.toHaveBeenCalled();
    expect(labels(el)).not.toContain('New form');
  });

  it('previews the fields as the fill-in page draws them', () => {
    const { screen, fixture, el } = screenWith();
    screen.edit(FORMS[0]);
    screen.togglePreview();
    fixture.detectChanges();
    const preview = el.querySelector('[aria-labelledby="formPreviewHeading"]')!;
    expect(Array.from(preview.querySelectorAll('[data-field]')).map(e => e.getAttribute('data-field'))).toEqual(['patient_id', 'wound_location']);
    screen.previewChange({ key: 'patient_id', value: 'P-1' });
    expect(screen.previewAnswers()).toEqual({ patient_id: 'P-1' });
  });

  it('UX2: sets a field\'s placeholder and help text in its settings, and the canvas shows them as the person will', () => {
    const { api, screen, fixture, el } = screenWith();
    screen.edit(FORMS[0]);
    fixture.detectChanges();
    const props = el.querySelector('[data-field-props]')!;
    const placeholder = props.querySelector<HTMLInputElement>('#fieldPlaceholder0')!;
    const help = props.querySelector<HTMLTextAreaElement>('#fieldHelp0')!;
    expect(placeholder).not.toBeNull();
    expect(placeholder.getAttribute('maxlength')).toBe('120');
    expect(help.getAttribute('maxlength')).toBe('500');
    expect(props.querySelector('label[for="fieldPlaceholder0"]')?.textContent).toContain('Placeholder');

    placeholder.value = 'e.g. P-00017';
    placeholder.dispatchEvent(new Event('input'));
    help.value = 'As on the wristband';
    help.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(props.textContent).toContain('12/120');
    expect(props.textContent).toContain('19/500');

    // The live canvas: the placeholder inside the empty box, the help under it, the label kept.
    const canvas = el.querySelector('[data-field-row="0"]')!;
    const box = canvas.querySelector<HTMLInputElement>('#canvas-0-patient_id')!;
    expect(box.getAttribute('placeholder')).toBe('e.g. P-00017');
    expect(canvas.querySelector('label')?.textContent).toContain('Patient ID');
    const note = canvas.querySelector('.field-note')!;
    expect(note.textContent).toContain('As on the wristband');
    expect(box.getAttribute('aria-describedby')).toContain(note.id);

    screen.select(1);
    fixture.detectChanges();
    const choice = el.querySelector<HTMLInputElement>('#fieldPlaceholder1')!;
    choice.value = 'Choose a site';
    choice.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.querySelector('#canvas-1-wound_location option')?.textContent?.trim()).toBe('Choose a site');

    screen.save();
    const sent = (api.save.mock.calls[0] as unknown[])[0] as { fields: FormField[] };
    expect(sent.fields[0]).toMatchObject({ placeholder: 'e.g. P-00017', help: 'As on the wristband' });
    expect(sent.fields[1].placeholder).toBe('Choose a site');
  });

  it('UX2: offers no placeholder where no empty box shows one, and refuses one too long before saving', () => {
    const { api, screen, fixture, el } = screenWith();
    screen.newForm();
    screen.patch({ name: 'Visit' });
    screen.setField(0, { type: 'yesNo', placeholder: 'kept from text' });
    screen.select(0);
    fixture.detectChanges();
    expect(el.querySelector('[data-placeholder-setting]')).toBeNull();
    expect(el.querySelector('[data-help-setting]')).not.toBeNull();
    screen.save();
    const sent = (api.save.mock.calls[0] as unknown[])[0] as { fields: FormField[] };
    expect('placeholder' in sent.fields[0]).toBe(false);

    screen.setField(0, { type: 'text', placeholder: 'x'.repeat(121) });
    screen.save();
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(screen.problems()['0']).toBe('Its placeholder is longer than 120 characters.');
  });
});

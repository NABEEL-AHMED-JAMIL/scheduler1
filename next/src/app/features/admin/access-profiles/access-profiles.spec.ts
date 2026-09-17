import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { PageCatalogueEntry } from '../../../core/auth/page-keys';
import { AccessProfile, AccessProfileDraft, AccessProfilesService } from './access-profiles.service';
import { AccessProfileDialog } from './access-profile-dialog';
import { AccessProfiles } from './access-profiles';

const PAGES: PageCatalogueEntry[] = [
  { key: 'jobs', label: 'Source Jobs', section: 'Pipelines', route: '/jobs' },
  { key: 'tasks', label: 'Source Tasks', section: 'Pipelines', route: '/tasks' },
  { key: 'queue', label: 'Queue', section: 'Pipelines', route: '/queue' },
  { key: 'reports', label: 'Reports', section: 'Pipelines', route: '/reports' },
  { key: 'objects', label: 'Browse files', section: 'Object Browser', route: '/objects' },
  { key: 'analytics', label: 'Analytics Studio', section: 'Object Browser', route: '/analytics' },
  { key: 'tools-converter', label: 'Document Converter', section: 'Tools', route: '/tools/converter' },
];

function profile(id: number, name: string, keys: string[], isDefault = false, userCount = 0): AccessProfile {
  return { pageAccessProfileId: id, profileName: name, defaultProfile: isDefault, pageKeys: keys as any, userCount, userNames: [] };
}

function dialogFor(data: { profile?: AccessProfile; first: boolean }, save = vi.fn(() => of({ status: 'SUCCESS', message: 'ok', data: {} }))) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DIALOG_DATA, useValue: { ...data, pages: PAGES } },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: AccessProfilesService, useValue: { save } },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
    ],
  });
  return { dialog: TestBed.runInInjectionContext(() => new AccessProfileDialog()), save };
}

/**
 * The profile editor: the pages are a set of checkboxes grouped as the menu groups them, and
 * what is sent is the catalogue's order, not the order somebody clicked in.
 */
describe('AccessProfileDialog', () => {
  it('groups the catalogue by menu section, in catalogue order', () => {
    const { dialog } = dialogFor({ first: true });
    expect(dialog.sections().map(s => s.section)).toEqual(['Pipelines', 'Object Browser', 'Tools']);
    expect(dialog.sections()[0].pages.map(p => p.key)).toEqual(['jobs', 'tasks', 'queue', 'reports']);
  });

  it('starts from the profile being edited', () => {
    const { dialog } = dialogFor({ profile: profile(1, 'Operator', ['jobs', 'queue']), first: false });
    expect(dialog.isEdit()).toBe(true);
    expect([...dialog.selected()]).toEqual(['jobs', 'queue']);
    expect(dialog.form.get('profileName')!.value).toBe('Operator');
  });

  it('toggles a page and a whole section', () => {
    const { dialog } = dialogFor({ first: true });
    dialog.toggle('reports');
    expect(dialog.selected().has('reports')).toBe(true);
    dialog.toggle('reports');
    expect(dialog.selected().has('reports')).toBe(false);

    const pipelines = dialog.sections()[0];
    dialog.toggleSection(pipelines);
    expect(dialog.allOn(pipelines)).toBe(true);
    dialog.toggleSection(pipelines);
    expect(dialog.allOn(pipelines)).toBe(false);
  });

  it('refuses to save without a name and never calls the server', () => {
    const { dialog, save } = dialogFor({ first: true });
    dialog.save();
    expect(save).not.toHaveBeenCalled();
    expect(dialog.submitted()).toBe(true);
  });

  it('sends the pages in catalogue order whatever order they were ticked, with the first profile as default', () => {
    const { dialog, save } = dialogFor({ first: true });
    dialog.form.patchValue({ profileName: '  Analyst ', description: ' Reads reports ' });
    dialog.toggle('reports');
    dialog.toggle('jobs');
    dialog.toggle('analytics');
    dialog.save();

    expect(save).toHaveBeenCalledTimes(1);
    const draft = (save.mock.calls[0] as any)[0] as AccessProfileDraft;
    expect(draft.profileName).toBe('Analyst');
    expect(draft.description).toBe('Reads reports');
    expect(draft.pageKeys).toEqual(['jobs', 'reports', 'analytics']);
    expect(draft.defaultProfile).toBe(true);
    expect(draft.pageAccessProfileId).toBeUndefined();
  });

  it('carries the id on an edit and keeps the default flag it came with', () => {
    const { dialog, save } = dialogFor({ profile: profile(7, 'Operator', ['jobs'], false), first: false });
    dialog.save();
    const draft = (save.mock.calls[0] as any)[0] as AccessProfileDraft;
    expect(draft.pageAccessProfileId).toBe(7);
    expect(draft.defaultProfile).toBe(false);
  });
});

function screenWith(profiles: AccessProfile[], api: Partial<AccessProfilesService> = {}) {
  TestBed.resetTestingModule();
  const service = {
    pages: () => of({ status: 'SUCCESS', message: '', data: PAGES }),
    list: () => of({ status: 'SUCCESS', message: '', data: profiles }),
    setDefault: vi.fn(() => of({ status: 'SUCCESS', message: 'default set', data: {} })),
    delete: vi.fn(() => of({ status: 'ERROR', message: '"Operator" is still held by 2 people. Move them to another profile first.' })),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AccessProfilesService, useValue: service },
      { provide: Dialog, useValue: { open: vi.fn(() => ({ closed: of(false) })) } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new AccessProfiles());
  screen.ngOnInit();
  return { screen, service, toast: TestBed.inject(ToastService) as any };
}

describe('AccessProfiles screen', () => {
  it('loads the catalogue and the profiles together and sums the people on them', () => {
    const { screen } = screenWith([profile(1, 'Operator', ['jobs'], true, 3), profile(2, 'Analyst', ['jobs', 'reports'], false, 1)]);
    expect(screen.loading()).toBe(false);
    expect(screen.profiles().map(p => p.profileName)).toEqual(['Operator', 'Analyst']);
    expect(screen.stats()).toEqual({ profiles: 2, assigned: 4, defaultName: 'Operator', pages: 7 });
  });

  it('names what a profile opens and what it withholds, in catalogue order', () => {
    const { screen } = screenWith([profile(2, 'Analyst', ['reports', 'jobs'])]);
    expect(screen.labelsFor(screen.profiles()[0])).toEqual(['Source Jobs', 'Reports']);
    expect(screen.missingFor(screen.profiles()[0])).toEqual(['Source Tasks', 'Queue', 'Browse files', 'Analytics Studio', 'Document Converter']);
  });

  it('tells the first dialog it is the first profile, so it becomes the default', () => {
    const { screen } = screenWith([]);
    const dialog = TestBed.inject(Dialog) as any;
    screen.add();
    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(dialog.open.mock.calls[0][1].data.first).toBe(true);
    expect(dialog.open.mock.calls[0][1].data.pages).toEqual(PAGES);
  });

  it('shows the server\'s refusal when a held profile is deleted', async () => {
    const { screen, service, toast } = screenWith([profile(1, 'Operator', ['jobs'], true, 2)]);
    // confirmWith opens the shared Confirm through Dialog; make it say yes.
    (TestBed.inject(Dialog) as any).open = vi.fn(() => ({ closed: of(true) }));
    await screen.remove(screen.profiles()[0]);
    expect(service.delete).toHaveBeenCalledWith(1);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('still held by 2 people'));
  });
});

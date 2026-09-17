import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
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

function screenWith(profiles: AccessProfile[], api: Record<string, unknown> = {}, platformAdmin = false) {
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
      { provide: AuthService, useValue: { isPlatformAdmin: () => platformAdmin } },
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', message: '', data: [{ tenantId: 5, tenantName: 'Acme' }] }) } },
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

  it('lays a card\'s pages out by menu section, opened and withheld, in catalogue order', () => {
    const { screen } = screenWith([profile(2, 'Analyst', ['reports', 'jobs'])]);
    const card = screen.cards()[0];
    expect(card.opened).toBe(2);
    expect(card.sections.map(s => [s.section, s.opens, s.withholds])).toEqual([
      ['Pipelines', ['Source Jobs', 'Reports'], ['Source Tasks', 'Queue']],
      ['Object Browser', [], ['Browse files', 'Analytics Studio']],
      ['Tools', [], ['Document Converter']],
    ]);
  });

  it('moves the holder counts locally when a person is reassigned from the grid', () => {
    const operator = profile(1, 'Operator', ['jobs'], true, 2);
    const analyst = profile(2, 'Analyst', ['jobs', 'reports'], false, 0);
    const assign = vi.fn(() => of({ status: 'SUCCESS', message: 'moved', data: { appUserId: 44, pageAccessProfileId: 2, pageAccessProfileName: 'Analyst', pageKeys: ['jobs', 'reports'] } }));
    const list = vi.fn(() => of({ status: 'SUCCESS', message: '', data: [operator, analyst] }));
    const { screen } = screenWith([operator, analyst], { assign, list, people: () => of({ status: 'SUCCESS', message: '', data: [
      { appUserId: 44, fullName: 'Olivia Bennett', username: 'o@a', status: 'Active', pageAccessProfileId: 1, pageAccessProfileName: 'Operator', pageKeys: ['jobs'] }] }) });
    screen.showPeople();
    list.mockClear();
    screen.assign({ person: screen.people()[0], profile: analyst });
    expect(assign).toHaveBeenCalledWith(44, 2);
    expect(screen.people()[0].pageAccessProfileName).toBe('Analyst');
    expect(screen.profiles().map(p => p.userCount)).toEqual([1, 1]);
    expect(list).not.toHaveBeenCalled();
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

  /** A platform admin has no workspace of its own: nothing lists until one is picked, and the pick travels to the dialog. */
  it('makes a platform admin choose a workspace first, and hands it to the dialog', () => {
    const list = vi.fn(() => of({ status: 'SUCCESS', message: '', data: [profile(1, 'Operator', ['jobs'], true)] }));
    const { screen } = screenWith([], { list }, true);
    expect(screen.canPickTenant()).toBe(true);
    expect(screen.tenants().map(t => t.tenantName)).toEqual(['Acme']);
    expect(list).not.toHaveBeenCalled();

    screen.pickTenant('5');
    expect(list).toHaveBeenCalledWith(5);
    expect(screen.profiles().map(p => p.profileName)).toEqual(['Operator']);

    const dialog = TestBed.inject(Dialog) as any;
    screen.add();
    expect(dialog.open.mock.calls[0][1].data.tenantId).toBe(5);
  });

  it('never shows a tenant admin the picker, and lists its own workspace at once', () => {
    const list = vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] }));
    const { screen } = screenWith([], { list }, false);
    expect(screen.canPickTenant()).toBe(false);
    expect(list).toHaveBeenCalledWith(null);
  });
});

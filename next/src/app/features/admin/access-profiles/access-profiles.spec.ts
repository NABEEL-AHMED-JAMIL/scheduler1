import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { of, throwError } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ActivatedRoute, Router } from '@angular/router';
import { PageCatalogueEntry } from '../../../core/auth/page-keys';
import { AccessProfile, AccessProfilesService } from './access-profiles.service';
import { AccessProfiles } from './access-profiles';

const PAGES: PageCatalogueEntry[] = [
  { key: 'jobs', label: 'Source Jobs', section: 'Pipelines', route: '/operations/jobs' },
  { key: 'tasks', label: 'Source Tasks', section: 'Pipelines', route: '/operations/tasks' },
  { key: 'queue', label: 'Queue', section: 'Pipelines', route: '/operations/queue' },
  { key: 'reports', label: 'Reports', section: 'Pipelines', route: '/operations/reports' },
  { key: 'objects', label: 'Browse files', section: 'Object Browser', route: '/objects/files' },
  { key: 'analytics', label: 'Analytics Studio', section: 'Object Browser', route: '/objects/analytics' },
  { key: 'tools-converter', label: 'Document Converter', section: 'Tools', route: '/tools/converter' },
];

function profile(id: number, name: string, keys: string[], isDefault = false, userCount = 0): AccessProfile {
  return { pageAccessProfileId: id, profileName: name, defaultProfile: isDefault, pageKeys: keys as any, userCount, userNames: [] };
}

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
      { provide: AuthService, useValue: { isPlatformAdmin: () => platformAdmin, isTenantAdmin: () => true, hasAtLeast: () => true } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
      { provide: HttpClient, useValue: { get: () => of({ status: 'SUCCESS', message: '', data: [{ tenantId: 5, tenantName: 'Acme' }] }) } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new AccessProfiles());
  screen.ngOnInit();
  return { screen, service, toast: TestBed.inject(ToastService) as any };
}

describe('AccessProfiles screen', () => {
  it('counts the people the default covers, not only the ones assigned to it', () => {
    const operator = { ...profile(1, 'Operator', ['jobs'], true, 1), userNames: ['Olivia Bennett'], defaultUserCount: 4, defaultUserNames: ['Alex Morgan', 'Ava Patel', 'Liam Foster', 'Noah Kim'] };
    const analyst = profile(2, 'Analyst', ['jobs', 'reports'], false, 0);
    const { screen } = screenWith([operator, analyst]);
    const [op, an] = screen.cards();
    expect(op.coverage).toEqual({ total: 5, assigned: 1, byDefault: 4, names: ['Olivia Bennett', 'Alex Morgan', 'Ava Patel', 'Liam Foster', 'Noah Kim'] });
    expect(an.coverage.total).toBe(0);
    expect(screen.stats().onDefault).toBe(4);
  });

  it('loads the catalogue and the profiles together and sums the people on them', () => {
    const { screen } = screenWith([profile(1, 'Operator', ['jobs'], true, 3), profile(2, 'Analyst', ['jobs', 'reports'], false, 1)]);
    expect(screen.loading()).toBe(false);
    expect(screen.profiles().map(p => p.profileName)).toEqual(['Operator', 'Analyst']);
    expect(screen.stats()).toEqual({ profiles: 2, assigned: 4, onDefault: 0, defaultName: 'Operator', pages: 7 });
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

  it('opens New access profile as a page of its own, and a profile\'s pages on its page (owner 2026-10-19 #3)', () => {
    const { screen } = screenWith([profile(3, 'Viewer', ['jobs'])]);
    const router = TestBed.inject(Router) as any;
    screen.add();
    expect(router.navigate).toHaveBeenCalledWith(['/administration/access-profiles/new'], { queryParams: {} });
    screen.edit(screen.profiles()[0]);
    expect(router.navigate).toHaveBeenCalledWith(['/administration/access-profiles', 3], { queryParams: {} });
    expect((TestBed.inject(Dialog) as any).open).not.toHaveBeenCalled();
  });

  it('shows the server\'s refusal when a held profile is deleted', async () => {
    const { screen, service, toast } = screenWith([profile(1, 'Operator', ['jobs'], true, 2)]);
    // confirmWith opens the shared Confirm through Dialog; make it say yes.
    (TestBed.inject(Dialog) as any).open = vi.fn(() => ({ closed: of(true) }));
    await screen.remove(screen.profiles()[0]);
    expect(service.delete).toHaveBeenCalledWith(1);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('still held by 2 people'));
  });

  /** A platform administrator has no workspace of its own: nothing lists until one is picked, and the pick travels to the dialog. */
  it('makes a platform administrator choose a workspace first, and takes it to the editor', () => {
    const list = vi.fn(() => of({ status: 'SUCCESS', message: '', data: [profile(1, 'Operator', ['jobs'], true)] }));
    const { screen } = screenWith([], { list }, true);
    expect(screen.canPickTenant()).toBe(true);
    expect(list).not.toHaveBeenCalled();

    screen.pickTenant('5');
    expect(list).toHaveBeenCalledWith(5);
    expect(screen.profiles().map(p => p.profileName)).toEqual(['Operator']);

    screen.add();
    expect((TestBed.inject(Router) as any).navigate).toHaveBeenCalledWith(['/administration/access-profiles/new'], { queryParams: { tenantId: 5 } });
  });

  it('never shows a tenant administrator the picker, and lists its own workspace at once', () => {
    const list = vi.fn(() => of({ status: 'SUCCESS', message: '', data: [] }));
    const { screen } = screenWith([], { list }, false);
    expect(screen.canPickTenant()).toBe(false);
    expect(list).toHaveBeenCalledWith(null);
  });

  it('applies the server\'s answer after a checkbox toggle, and reverts the box on a refusal', () => {
    const operator = profile(1, 'Operator', ['jobs'], true, 1);
    const olivia = { appUserId: 44, fullName: 'Olivia Bennett', username: 'o@a', status: 'Active', pageAccessProfileId: 1, pageAccessProfileName: 'Operator', pageKeys: ['jobs'] as any };
    const setPageAccess = vi.fn((_id: number, key: string, _allowed: boolean) => of(key === 'reports'
      ? { status: 'SUCCESS', message: 'Reports is now open for Olivia Bennett (an exception to their profile).', data: { ...olivia, pageKeys: ['jobs', 'reports'], allowedExceptions: ['reports'], withheldExceptions: [] } }
      : { status: 'ERROR', message: 'Unknown page.' }));
    const { screen, toast } = screenWith([operator], { setPageAccess, people: () => of({ status: 'SUCCESS', message: '', data: [olivia] }) });
    screen.showPeople();

    screen.toggle({ person: screen.people()[0], page: PAGES[3], allowed: true });
    expect(setPageAccess).toHaveBeenCalledWith(44, 'reports', true);
    expect(screen.people()[0].pageKeys).toEqual(['jobs', 'reports']);
    expect(screen.people()[0].allowedExceptions).toEqual(['reports']);

    screen.toggle({ person: screen.people()[0], page: PAGES[0], allowed: false });
    expect(toast.error).toHaveBeenCalledWith('Unknown page.');
    expect(screen.people()[0].pageKeys).toEqual(['jobs', 'reports']);
  });
});

describe('AccessProfiles -- audit fixes', () => {
  const person = (id: number, profileId: number | null) => ({ appUserId: id, fullName: `P${id}`, username: `p${id}@a`, status: 'Active',
    pageAccessProfileId: profileId, pageAccessProfileName: profileId ? 'Analyst' : null, pageKeys: ['jobs'] });

  it('moves the default\'s own count when a person leaves or joins the default', () => {
    const operator = { ...profile(1, 'Operator', ['jobs'], true, 0), defaultUserCount: 3 };
    const analyst = profile(2, 'Analyst', ['jobs', 'reports'], false, 1);
    let answer: any = { appUserId: 44, pageAccessProfileId: 2, pageAccessProfileName: 'Analyst', pageKeys: ['jobs'] };
    const assign = vi.fn(() => of({ status: 'SUCCESS', message: 'moved', data: answer }));
    const { screen } = screenWith([operator, analyst], { assign, people: () => of({ status: 'SUCCESS', message: '', data: [person(44, null)] }) });
    screen.showPeople();

    screen.assign({ person: screen.people()[0] as any, profile: analyst });
    expect(screen.profiles().find(p => p.pageAccessProfileId === 1)!.defaultUserCount).toBe(2);
    expect(screen.profiles().find(p => p.pageAccessProfileId === 2)!.userCount).toBe(2);
    expect(screen.stats().onDefault).toBe(2);

    answer = { appUserId: 44, pageAccessProfileId: null, pageAccessProfileName: null, pageKeys: ['jobs'] };
    screen.assign({ person: screen.people()[0] as any, profile: null });
    expect(screen.profiles().find(p => p.pageAccessProfileId === 1)!.defaultUserCount).toBe(3);
    expect(screen.profiles().find(p => p.pageAccessProfileId === 2)!.userCount).toBe(1);
  });

  it('keeps a failed people load as an error with a retry, not an empty workspace', () => {
    let fail = true;
    const people = vi.fn(() => fail ? throwError(() => ({ error: {} })) : of({ status: 'SUCCESS', message: '', data: [person(1, null)] }));
    const { screen } = screenWith([profile(1, 'Operator', ['jobs'], true)], { people });
    screen.showPeople();
    expect(screen.peopleError()).toBe('People could not be loaded.');
    fail = false;
    screen.loadPeople();
    expect(screen.peopleError()).toBe('');
    expect(screen.people()).toHaveLength(1);
  });

  it('keeps a refused people load as an error too', () => {
    const people = () => of({ status: 'ERROR', message: 'Not allowed.' });
    const { screen } = screenWith([profile(1, 'Operator', ['jobs'], true)], { people });
    screen.showPeople();
    expect(screen.peopleError()).toBe('Not allowed.');
  });

  it('names what the delete button deletes', async () => {
    const { screen } = screenWith([profile(1, 'Operator', ['jobs'], true)]);
    const open = vi.fn(() => ({ closed: of(false) }));
    (TestBed.inject(Dialog) as any).open = open;
    await screen.remove(screen.profiles()[0]);
    expect((open.mock.calls[0] as any)[1].data.confirmLabel).toBe('Delete profile');
  });

  // Owner #5: the workspace list is the shared selector's now; the page catalogue is still this page's.
  it('says so when a platform administrator\'s page catalogue cannot be read', () => {
    TestBed.resetTestingModule();
    const toast = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: AccessProfilesService, useValue: { pages: () => throwError(() => ({ error: {} })), list: () => of({ status: 'SUCCESS', data: [] }) } },
        { provide: Dialog, useValue: {} },
        { provide: ToastService, useValue: toast },
        { provide: AuthService, useValue: { isPlatformAdmin: () => true, isTenantAdmin: () => true, hasAtLeast: () => true } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
        { provide: HttpClient, useValue: { get: () => throwError(() => ({ error: {} })) } },
      ],
    });
    TestBed.runInInjectionContext(() => new AccessProfiles()).ngOnInit();
    expect(toast.error).toHaveBeenCalledWith('The page catalogue could not be loaded.');
  });
});

/** UX review B8 (AP1): how a role and Page access combine, and one member's pages, worked out as the server does. */
describe('AccessProfiles: who can open what', () => {
  it('reads the people only when asked, and shows one member\'s pages by menu section, their own extras marked', () => {
    const operator = profile(1, 'Operator', ['jobs', 'queue'], true, 1);
    const people = vi.fn(() => of({ status: 'SUCCESS', message: '', data: [
      { appUserId: 44, fullName: 'Olivia Bennett', username: 'olivia', status: 'Active', pageAccessProfileId: null, pageAccessProfileName: null,
        pageKeys: ['jobs', 'queue', 'objects'], allowedExceptions: ['objects'], withheldExceptions: ['reports'] }] }));
    const { screen } = screenWith([operator], { people });
    expect(people).not.toHaveBeenCalled();
    screen.openPreview();
    expect(people).toHaveBeenCalledTimes(1);
    screen.previewId.set(44);
    const v = screen.preview()!;
    expect(v.profile).toBe('the default, Operator');
    expect(v.sections.map(s => [s.section, s.pages.map(p => p.label)])).toEqual([['Pipelines', ['Source Jobs', 'Queue']], ['Object Browser', ['Browse files']]]);
    expect(v.pages.find(p => p.key === 'objects')?.extra).toBe(true);
    expect(v.withheld).toEqual(['Reports']);
  });
});

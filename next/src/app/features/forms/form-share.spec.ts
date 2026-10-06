import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ToastService } from '../../shared/ui/toast.service';
import { FormShare } from './form-share';
import { FormsApi } from './forms.service';
import { ShareLinks, shareUrl } from './forms.model';

/**
 * MIG-278, Form builder › Settings › Share by link: off until an administrator turns it on; a new link's address is
 * shown once; a link can be revoked.
 */
const ON: ShareLinks = { enabled: true, shareable: true, whyNot: null, links: [
  { linkId: 1001, formId: 1000, label: 'Front desk', status: 'Active', expiresAt: '2026-10-19T15:00:00Z', maxSubmissions: null,
    usedCount: 3, requireSignIn: false },
  { linkId: 1000, formId: 1000, label: null, status: 'Revoked', expiresAt: '2026-10-10T15:00:00Z', maxSubmissions: 1,
    usedCount: 0, requireSignIn: true },
] };

function render(state: ShareLinks = ON) {
  const api = {
    shareLinks: vi.fn(() => of({ status: 'SUCCESS', message: '', data: state })),
    setSharePolicy: vi.fn(() => of({ status: 'SUCCESS', message: '', data: { enabled: true, canChange: true } })),
    createShareLink: vi.fn(() => of({ status: 'SUCCESS', message: 'Link made.', data: { ...ON.links[0], linkId: 1002, token: 'tok_new' } })),
    revokeShareLink: vi.fn(() => of({ status: 'SUCCESS', message: 'Link revoked: it opens nothing now.', data: ON.links[0] })),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: FormsApi, useValue: api }, { provide: ToastService, useValue: toast }],
  });
  const fixture = TestBed.createComponent(FormShare);
  fixture.componentRef.setInput('formId', 1000);
  fixture.detectChanges();
  return { api, toast, fixture, screen: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('Form share by link', () => {
  it('says sharing is off and offers no link form until it is turned on', () => {
    const { el, api } = render({ enabled: false, shareable: true, links: [] });
    expect(api.shareLinks).toHaveBeenCalledWith(1000);
    expect(el.textContent).toContain('Sharing by link is off for this workspace');
    expect(el.querySelector('[data-share-new]')).toBeNull();
  });

  it('turns the workspace setting on', () => {
    const { el, api } = render({ enabled: false, shareable: true, links: [] });
    const box = el.querySelector<HTMLInputElement>('[data-share-policy]')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(api.setSharePolicy).toHaveBeenCalledWith(true);
  });

  it('says why a form cannot be shared', () => {
    const { el } = render({ enabled: true, shareable: false, whyNot: 'Only an Active form can be shared.', links: [] });
    expect(el.textContent).toContain('Only an Active form can be shared.');
    expect(el.querySelector('[data-share-new]')).toBeNull();
  });

  it('lists the links with their use and offers Revoke only on an active one', () => {
    const { el } = render();
    const rows = el.querySelectorAll('[data-share-links] tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Front desk');
    expect(rows[0].textContent).toContain('3');
    expect(rows[0].querySelector('button')?.textContent).toContain('Revoke');
    expect(rows[1].textContent).toContain('Link #1000');
    expect(rows[1].textContent).toContain('Members only');
    expect(rows[1].querySelector('button')).toBeNull();
  });

  it('makes a link and shows its address once', () => {
    const { screen, api, fixture, el } = render();
    screen.label.set('  Lobby  ');
    screen.days.set(7);
    screen.maxSubmissions.set(1);
    screen.create();
    expect(api.createShareLink).toHaveBeenCalledWith({ formId: 1000, label: 'Lobby', days: 7, maxSubmissions: 1, requireSignIn: false });
    fixture.detectChanges();
    const shown = el.querySelector<HTMLInputElement>('[data-share-made] input')!;
    expect(shown.value).toBe(shareUrl(location.origin, 'tok_new'));
    expect(el.textContent).toContain('it is not shown again');
  });

  it('revokes a link', () => {
    const { screen, api, toast } = render();
    screen.revoke(ON.links[0]);
    expect(api.revokeShareLink).toHaveBeenCalledWith(1001);
    expect(toast.success).toHaveBeenCalledWith('Link revoked: it opens nothing now.');
  });

  it('does nothing while locked (a MANAGED workspace\'s customer)', () => {
    const { screen, api, fixture } = render();
    fixture.componentRef.setInput('locked', true);
    screen.create();
    screen.revoke(ON.links[0]);
    screen.setPolicy(false);
    expect(api.createShareLink).not.toHaveBeenCalled();
    expect(api.revokeShareLink).not.toHaveBeenCalled();
    expect(api.setSharePolicy).not.toHaveBeenCalled();
  });

  it('builds the address from the origin and the token', () => {
    expect(shareUrl('https://etl.example/', 'abc')).toBe('https://etl.example/f/abc');
  });
});

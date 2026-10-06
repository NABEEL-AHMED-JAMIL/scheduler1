import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { Tenants } from './tenants';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { useMemoryStorage } from '../../../shared/testing/memory-storage';

const ROWS = [
  { tenantId: 2946, tenantName: 'Northwind', tenantCode: 'NW', status: 'Active', sandboxOf: null, userCount: 2 },
  { tenantId: 2950, tenantName: 'Northwind (sandbox)', tenantCode: 'NWSBX', status: 'Active', sandboxOf: 2946, userCount: 1 },
  { tenantId: 2947, tenantName: 'Harbor', tenantCode: 'HB', status: 'Active', userCount: 1 },
];
const MADE = { tenantId: 2951, tenantName: 'Harbor (sandbox)', tenantCode: 'HBSBX', status: 'Active', sandboxOf: 2947 };

function setup(confirm = true, post = vi.fn(() => of({ status: 'SUCCESS', message: 'Sandbox made: Harbor (sandbox).', data: MADE }))) {
  const asked: any[] = [];
  const toasts: string[] = [];
  const get = vi.fn(() => of({ status: 'SUCCESS', data: ROWS }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: HttpClient, useValue: { get, post, put: vi.fn() } },
      { provide: Dialog, useValue: { open: (_: unknown, config: { data: unknown }) => { asked.push(config.data); return { closed: of(confirm) }; } } },
      { provide: ToastService, useValue: { success: (m: string) => toasts.push(m), error: (m: string) => toasts.push('!' + m), info: () => {} } },
      { provide: Router, useValue: { navigate: () => {} } },
      { provide: AuthService, useValue: { user: () => null } },
    ],
  });
  return { post, get, asked, toasts };
}

const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

describe('MIG-336: a workspace\'s sandbox on the Tenants page', () => {
  useMemoryStorage();

  it('marks a sandbox row with the workspace it belongs to, and offers Create sandbox only where none exists', () => {
    setup();
    const fixture = TestBed.createComponent(Tenants);
    fixture.componentInstance.view.set('table');
    fixture.detectChanges();
    const page = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    const marks = [...el.querySelectorAll('[data-sandbox-of]')].map(m => [...m.children].map(c => c.textContent!.trim()).join(' '));
    expect(marks).toEqual(['Sandbox of Northwind']);
    expect(page.canMakeSandbox(ROWS[0] as any)).toBe(false);
    expect(page.canMakeSandbox(ROWS[1] as any)).toBe(false);
    expect(page.canMakeSandbox(ROWS[2] as any)).toBe(true);
    expect(page.sandboxParent({ sandboxOf: 9999 } as any)).toBe('workspace 9999');
    page.view.set('cards');
    fixture.detectChanges();
    expect(el.querySelectorAll('button[data-create-sandbox]').length).toBe(1);
    expect(el.querySelectorAll('[data-sandbox-of]').length).toBe(1);
  });

  it('asks first, saying what it makes, then makes it and reads the list again', async () => {
    const { post, get, asked, toasts } = setup();
    const page = TestBed.runInInjectionContext(() => new Tenants());
    await page.createSandbox(ROWS[2] as any);
    await settle();
    expect(asked[0].title).toBe('Create a sandbox for Harbor?');
    expect(asked[0].body).toContain('Harbor (sandbox)');
    expect(asked[0].body).toContain('never billed');
    expect(asked[0].body).toContain('scripts/sandbox-setup.py');
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/tenant.json/addSandbox'), null, { params: { tenantId: '2947' } });
    expect(toasts).toEqual(['Sandbox made: Harbor (sandbox).']);
    expect(get).toHaveBeenCalled();
    expect(page.busy()).toBe(null);
  });

  it('makes nothing when the confirmation is declined, and says what the server refused', async () => {
    const { post } = setup(false);
    await TestBed.runInInjectionContext(() => new Tenants()).createSandbox(ROWS[2] as any);
    expect(post).not.toHaveBeenCalled();
    const refused = vi.fn(() => of({ status: 'ERROR', message: 'Harbor already has a sandbox.' }));
    const { toasts } = setup(true, refused as any);
    await TestBed.runInInjectionContext(() => new Tenants()).createSandbox(ROWS[2] as any);
    await settle();
    expect(toasts).toEqual(['!Harbor already has a sandbox.']);
    expect(refused).toHaveBeenCalledTimes(1);
  });
});

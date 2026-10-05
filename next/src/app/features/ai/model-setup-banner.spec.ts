import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ModelSetupBanner, hasWorkspaceDefault } from './model-setup-banner';

function render(admin: boolean, data: unknown[]) {
  let asked = 0;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]),
    { provide: AuthService, useValue: { user: signal({ tenantId: 2924 }), isTenantAdmin: () => admin } },
    { provide: HttpClient, useValue: { get: () => { asked++; return of({ status: 'SUCCESS', data }); } } }] });
  const fixture = TestBed.createComponent(ModelSetupBanner);
  fixture.componentRef.setInput('what', 'Ask your data');
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, asked: () => asked };
}

describe('P2 #50: the first-run hint when no model connection exists', () => {
  it('tells a workspace administrator with no default connection, with the link to add one', () => {
    const { el } = render(true, []);
    expect(el.querySelector('[data-model-setup]')?.textContent).toContain('Ask your data needs a model');
    expect(el.querySelector('a[href="/ai/connections"]')).not.toBeNull();
  });

  it('says nothing once the workspace has an active default, and never asks for a tenant user', () => {
    expect(render(true, [{ connectionId: 1, tenantId: 2924, isDefault: true, status: 'Active' }]).el.querySelector('[data-model-setup]')).toBeNull();
    const user = render(false, []);
    expect(user.asked()).toBe(0);
    expect(user.el.querySelector('[data-model-setup]')).toBeNull();
    expect(hasWorkspaceDefault([{ tenantId: null, isDefault: true, status: 'Active' } as never], 2924)).toBe(false);
  });
});

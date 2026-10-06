import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { Unauthorized } from './unauthorized';

/**
 * Tenant-user review, 2026-09-24: "Go back" in a freshly opened tab went to about:blank, out of the console.
 * With nothing to go back to, it goes to the Dashboard instead.
 */
function page(historyLength: number) {
  const back = vi.fn();
  const navigateByUrl = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: AuthService, useValue: { user: signal(null), role: () => 'TENANT_USER' } },
    { provide: Location, useValue: { back } },
    { provide: Router, useValue: { navigateByUrl } },
    { provide: HttpClient, useValue: { post: () => of({}) } },
    { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
    { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
  ] });
  const component = TestBed.runInInjectionContext(() => new Unauthorized());
  (component as any).historyLength = () => historyLength;
  return { component, back, navigateByUrl };
}

describe('Unauthorized "Go back"', () => {
  it('goes back when there is a page to go back to', () => {
    const { component, back, navigateByUrl } = page(3);
    component.back();
    expect(back).toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('goes to the Dashboard in a fresh tab instead of leaving the console', () => {
    const { component, back, navigateByUrl } = page(1);
    component.back();
    expect(back).not.toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith('/');
  });
});

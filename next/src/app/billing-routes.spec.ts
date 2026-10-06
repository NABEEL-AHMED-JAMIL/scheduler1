import { describe, it, expect } from 'vitest';
import { Route } from '@angular/router';
import { routes } from './app.routes';

/**
 * Billing is role-gated only: Identity retired the 'billing' page key (MIG-34; an access profile could never
 * withhold it from an admin). The routes still asked for it, so a tenant user landed on "not part of your
 * access -- Request access", and requesting it failed with "Unknown page.". Without the key they get the plain
 * role refusal (tenant-user review, 2026-09-24).
 */
function flatten(list: Route[]): Route[] {
  return list.flatMap(r => [r, ...flatten(r.children ?? [])]);
}

describe('billing routes', () => {
  const billing = flatten(routes).filter(r => r.path?.startsWith('billing/') && !r.redirectTo);

  it('exist', () => expect(billing.length).toBeGreaterThan(0));

  it('are gated by role only, never by the retired page key', () => {
    for (const route of billing) {
      expect(route.data?.['pageKey'], route.path).toBeUndefined();
      expect(route.data?.['minRole'], route.path).toBeTruthy();
    }
  });
});

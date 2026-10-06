import { describe, it, expect } from 'vitest';
import { Route } from '@angular/router';
import { routes } from './app.routes';
import { NotFound } from './features/not-found/not-found';

/**
 * Tenant-user review, 2026-09-24: an address that matches nothing (a typo, a stale bookmark) silently landed on the
 * Dashboard, so a reader never learned the link was wrong. Inside the signed-in layout it now shows "Page not found".
 */
describe('an unknown address', () => {
  it('shows a not-found page inside the console layout', async () => {
    const shell = routes.find(r => r.children?.some(c => c.path === 'unauthorized')) as Route;
    const last = shell.children![shell.children!.length - 1];
    expect(last.path).toBe('**');
    const component = await (last.loadComponent as () => Promise<unknown>)();
    expect(component).toBe(NotFound);
  });
});

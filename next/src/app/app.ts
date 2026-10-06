import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHost } from './shared/ui/toast-host';
import { RouteProgress } from './shared/ui/route-progress';

/** MIG-335: the embeddable run view sits in a portal's frame: no console progress bar across the top of someone else's page. */
export function isEmbedded(path: string): boolean {
  return path.startsWith('/embed/');
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHost, RouteProgress],
  template: `
    @if (!embedded) { <app-route-progress /> }
    <router-outlet />
    <app-toast-host />
  `,
})
export class App {
  readonly embedded = isEmbedded(window.location.pathname);
}

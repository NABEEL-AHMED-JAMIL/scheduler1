import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHost } from './shared/ui/toast-host';
import { RouteProgress } from './shared/ui/route-progress';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHost, RouteProgress],
  template: `
    <app-route-progress />
    <router-outlet />
    <app-toast-host />
  `,
})
export class App {}

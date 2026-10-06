// sockjs-client predates ES modules and reaches for Node's `global`, which no longer exists
// under this build -- it threw "global is not defined" during bootstrap and took the whole
// app down with it. Angular 8's webpack shimmed this automatically; nothing does now.
(globalThis as any).global ??= globalThis;

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));

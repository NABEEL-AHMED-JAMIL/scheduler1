import { Routes } from '@angular/router';
import { DeveloperChangelog } from './changelog';
import { DeveloperLayout } from './developer-layout';
import { guideTitle } from './developer-docs';
import { DeveloperGuide } from './guide';
import { DeveloperOverview } from './overview';
import { DeveloperReference } from './reference';

/**
 * MIG-336: the developer portal's pages, under /integration/developer (app.routes.ts holds its page key and guard). Lazy
 * as one chunk with the bundled contract: every page reads it.
 */
export const DEVELOPER_ROUTES: Routes = [
  {
    path: '',
    component: DeveloperLayout,
    children: [
      { path: '', title: 'Developer portal', component: DeveloperOverview },
      { path: 'reference', title: 'API reference', component: DeveloperReference },
      { path: 'guides/:slug', title: route => guideTitle(route.paramMap.get('slug')), component: DeveloperGuide },
      { path: 'changelog', title: 'API changelog', component: DeveloperChangelog },
    ],
  },
];

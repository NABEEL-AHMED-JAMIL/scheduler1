import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { Shell } from './features/shell/shell';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then(m => m.Login),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard),
      },
      {
        path: 'jobs',
        loadComponent: () => import('./features/jobs/jobs').then(m => m.Jobs),
      },
      {
        path: 'jobs/new',
        loadComponent: () => import('./features/jobs/edit/job-edit').then(m => m.JobEdit),
      },
      {
        path: 'jobs/:jobId/edit',
        loadComponent: () => import('./features/jobs/edit/job-edit').then(m => m.JobEdit),
      },
      {
        path: 'jobs/:jobId/history',
        loadComponent: () =>
          import('./features/jobs/history/job-history').then(m => m.JobHistory),
      },
      {
        path: 'tasks/new',
        loadComponent: () => import('./features/tasks/edit/task-edit').then(m => m.TaskEdit),
      },
      {
        path: 'tasks/:taskDetailId/edit',
        loadComponent: () => import('./features/tasks/edit/task-edit').then(m => m.TaskEdit),
      },
      {
        path: 'tasks',
        loadComponent: () => import('./features/tasks/tasks').then(m => m.Tasks),
      },
      {
        path: 'admin/storage',
        loadComponent: () =>
          import('./features/admin/storage/storage-connections').then(m => m.StorageConnections),
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] },
      },
      {
        path: 'ai/agents',
        loadComponent: () => import('./features/ai/agents/agents').then(m => m.Agents),
      },
      {
        path: 'admin/users',
        loadComponent: () => import('./features/admin/users/users').then(m => m.Users),
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] },
      },
      {
        path: 'admin/tenants',
        loadComponent: () => import('./features/admin/tenants/tenants').then(m => m.Tenants),
        data: { roles: ['PLATFORM_ADMIN'] },
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/notifications/notifications').then(m => m.Notifications),
      },
      {
        path: 'ai/models',
        loadComponent: () => import('./features/ai/models/models').then(m => m.Models),
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] },
      },
      {
        path: 'tools/converter',
        loadComponent: () => import('./features/tools/converter/converter').then(m => m.Converter),
      },
      {
        path: 'tools/transcript',
        loadComponent: () => import('./features/tools/transcript/transcript').then(m => m.Transcript),
      },
      {
        path: 'tools/cleaner',
        loadComponent: () => import('./features/tools/cleaner/cleaner').then(m => m.Cleaner),
      },
      {
        path: 'settings/task-types',
        loadComponent: () =>
          import('./features/settings/task-types/task-types').then(m => m.TaskTypes),
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] },
      },
      {
        path: 'settings/lookup',
        loadComponent: () => import('./features/settings/lookup/lookup').then(m => m.Lookup),
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] },
      },
      {
        path: 'objects',
        loadComponent: () => import('./features/objects/objects').then(m => m.Objects),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/auth/auth.guard';
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
        path: 'jobs/:jobId/assistant',
        loadComponent: () =>
          import('./features/jobs/assistant/job-assistant').then(m => m.JobAssistant),
      },
      {
        path: 'jobs/:jobId/runs/:jobQueueId/logs',
        loadComponent: () => import('./features/jobs/logs/job-logs').then(m => m.JobLogs),
      },
      {
        path: 'queue',
        loadComponent: () => import('./features/queue/queue').then(m => m.Queue),
      },
      {
        // Same screen without a job: the dashboard's TOTAL row drills into an hour across
        // every job, which has no single id to put in the path.
        path: 'jobs/history',
        loadComponent: () =>
          import('./features/jobs/history/job-history').then(m => m.JobHistory),
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
        canActivate: [roleGuard],
      },
      {
        path: 'ai/agents',
        loadComponent: () => import('./features/ai/agents/agents').then(m => m.Agents),
      },
      {
        path: 'admin/users',
        loadComponent: () => import('./features/admin/users/users').then(m => m.Users),
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] },
        canActivate: [roleGuard],
      },
      {
        path: 'admin/tenants',
        loadComponent: () => import('./features/admin/tenants/tenants').then(m => m.Tenants),
        data: { roles: ['PLATFORM_ADMIN'] },
        canActivate: [roleGuard],
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile').then(m => m.Profile),
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
        canActivate: [roleGuard],
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
        canActivate: [roleGuard],
      },
      {
        path: 'settings/forms',
        loadComponent: () =>
          import('./features/settings/forms/task-forms').then(m => m.TaskForms),
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] },
        canActivate: [roleGuard],
      },
      {
        path: 'unauthorized',
        loadComponent: () =>
          import('./features/unauthorized/unauthorized').then(m => m.Unauthorized),
      },
      {
        path: 'jobs/bulk',
        loadComponent: () => import('./features/bulk/bulk-transfer').then(m => m.BulkTransfer),
        data: { kind: 'job' },
      },
      {
        path: 'tasks/bulk',
        loadComponent: () => import('./features/bulk/bulk-transfer').then(m => m.BulkTransfer),
        data: { kind: 'task' },
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports').then(m => m.Reports),
      },
      {
        path: 'tools/query',
        loadComponent: () =>
          import('./features/tools/query-engine/query-engine').then(m => m.QueryEngine),
      },
      {
        path: 'admin/settings',
        loadComponent: () =>
          import('./features/settings/hub/settings-hub').then(m => m.SettingsHub),
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] },
        canActivate: [roleGuard],
      },
      {
        path: 'settings/kafka',
        loadComponent: () =>
          import('./features/settings/kafka/kafka-connections').then(m => m.KafkaConnections),
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] },
        canActivate: [roleGuard],
      },
      {
        path: 'settings/lookup',
        loadComponent: () => import('./features/settings/lookup/lookup').then(m => m.Lookup),
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] },
        canActivate: [roleGuard],
      },
      {
        path: 'tools/search',
        loadComponent: () =>
          import('./features/tools/search-engine/search-engine').then(m => m.SearchEngine),
        data: { roles: ['PLATFORM_ADMIN'] },
        canActivate: [roleGuard],
      },
      {
        path: 'settings/xml',
        loadComponent: () =>
          import('./features/settings/xml-builder/xml-builder').then(m => m.XmlBuilder),
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] },
        canActivate: [roleGuard],
      },
      {
        path: 'objects',
        loadComponent: () => import('./features/objects/objects').then(m => m.Objects),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

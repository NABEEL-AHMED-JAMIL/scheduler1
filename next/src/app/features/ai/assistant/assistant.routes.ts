import { Routes } from '@angular/router';

/**
 * The AI Assistant's pages, under ai/assistant (its page key and guard are the parent's, in app.routes.ts): the assistant,
 * and All conversations (2026-10-12) -- kept here so a page of its own costs the first load nothing.
 */
export const routes: Routes = [
  { path: '', title: 'AI Assistant', loadComponent: () => import('./assistant').then(m => m.Assistant) },
  { path: 'conversations', title: 'All conversations', loadComponent: () => import('./conversations-page').then(m => m.ConversationsPage) },
];

import { inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CanDeactivateFn } from '@angular/router';
import { confirmWith } from './confirm';

/** A page that edits something and knows whether what is on screen is saved. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Owner #18 (2026-10-19): leaving an editor page with unsaved changes asks first -- a link, the menu, the breadcrumb or the
 * browser's back button (the page itself warns on reload and close, `beforeunload`). Nothing changed: it just leaves.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = component => {
  if (!component?.hasUnsavedChanges?.()) return true;
  return confirmWith(inject(Dialog), {
    title: 'Leave without saving?',
    body: 'Your changes on this page are not saved. Leave and they are lost; Cancel stays here so you can save them.',
    confirmLabel: 'Leave without saving',
    danger: true,
  });
};

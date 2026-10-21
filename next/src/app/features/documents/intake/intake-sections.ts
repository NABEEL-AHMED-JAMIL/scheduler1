import { inject } from '@angular/core';
import { RedirectFunction, Router } from '@angular/router';
import { NavAccess } from '../../../core/nav/nav-access';
import { NavGate } from '../../../core/nav/nav-tree';

/** One way files reach the workspace: a section of Documents › Intake, at its own address with its own page key. */
export interface IntakeSection extends NavGate {
  id: 'upload' | 'email-in' | 'file-drop';
  label: string;
  path: string;
  icon: string;
  /** What the section does, in a sentence: shown under the section strip. */
  what: string;
}

/**
 * Owner 2026-10-20 (§0.1): Upload, Email-in and File drop are one tab of Documents, Intake, as three sections. Upload and
 * Email-in are Document Intelligence's (page document-intelligence): a file becomes a document read against its type. File
 * drop is the inbox (MIG-239, page objects): a file is stored and starts schedules. Each keeps its own route and guard.
 */
export const INTAKE_SECTIONS: IntakeSection[] = [
  {
    id: 'upload', label: 'Upload', path: '/documents/intake/upload', pageKey: 'document-intelligence', icon: 'upload',
    what: 'Upload PDFs or images from your computer. Each file becomes one document: it is read, split into fields against its '
      + 'document type, and values it is unsure of go to Review › Documents. A file this workspace already has is kept once.',
  },
  {
    id: 'email-in', label: 'Email-in', path: '/documents/intake/email-in', pageKey: 'document-intelligence', icon: 'mail',
    what: 'Mail attachments to the workspace\'s own address. Each attachment becomes a document, read and extracted as an '
      + 'upload is; the same file mailed again is kept once.',
  },
  {
    id: 'file-drop', label: 'File drop', path: '/documents/intake/file-drop', pageKey: 'objects', icon: 'inbox',
    what: 'Drop files for pipelines. Each file is checked and stored in the workspace\'s bucket, and starts every schedule set '
      + 'to start when a matching file arrives. It is not read as a document.',
  },
];

/** The address of the Intake tab itself: it opens the first section the reader may open. */
export const INTAKE_PATH = '/documents/intake';

/**
 * /documents/intake opens the first section the reader may open (the same reader the menu sees, core/nav/nav-access.ts),
 * keeping the query and fragment; with none, the console's 403 page names the first section's page. The section it lands
 * on is guarded like any other route, so this redirect grants nothing.
 */
export const toFirstSection: RedirectFunction = redirect => {
  const router = inject(Router);
  const access = inject(NavAccess);
  const section = INTAKE_SECTIONS.find(s => access.passes(s));
  if (section) return router.createUrlTree([section.path], { queryParams: redirect.queryParams, fragment: redirect.fragment ?? undefined });
  return router.createUrlTree(['/unauthorized'], { queryParams: { page: INTAKE_SECTIONS[0].pageKey, title: 'Intake' } });
};

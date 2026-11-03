import { Dialog } from '@angular/cdk/dialog';
import { firstValueFrom } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { confirmWith } from '../../../shared/ui/confirm';
import { askReason } from '../../../shared/ui/reason';
import { ToastService } from '../../../shared/ui/toast.service';
import { ApiClientRow, ApiClientsApi, FILES_SENSITIVE } from './api-clients.api';

/**
 * MIG-456: files:sensitive on an API client's (or a sandbox test key's) menu -- Allow sensitive files asks why (10 characters
 * at least), Stop sensitive files asks to confirm; both end the client's tokens. Only the workspace's own administrator
 * allows it (the page offers it only then, and Identity refuses anyone else); anyone who manages the client may stop it.
 */
export const MIN_REASON = 10;

export function holdsSensitive(client: ApiClientRow): boolean {
  return client.scopes.includes(FILES_SENSITIVE);
}

/** Whether Allow sensitive files is offered: an active client holding files:read, not yet holding it, and a caller who may grant. */
export function canAllowSensitive(client: ApiClientRow, mayGrant: boolean): boolean {
  return mayGrant && client.status === 'Active' && !holdsSensitive(client) && client.scopes.includes('files:read');
}

export interface SensitiveDeps { dialog: Dialog; api: ApiClientsApi; toast: ToastService }

export async function allowSensitive(deps: SensitiveDeps, client: ApiClientRow, sandbox: boolean): Promise<boolean> {
  const reason = await askReason(deps.dialog, {
    title: `Let ${client.name} download sensitive files?`,
    subtitle: 'The files of pipelines marked sensitive, often signed reports with personal health information. Every link and '
      + 'download is audited. The client\'s tokens end: its system asks for a new one.',
    label: 'Why does this client need them?',
    hint: `At least ${MIN_REASON} characters. Kept with the grant and in the client's history.`,
    placeholder: 'e.g. The referral portal shows patients their signed discharge reports',
    confirmLabel: 'Allow sensitive files',
    required: true,
  });
  if (reason === null) return false;
  if (reason.length < MIN_REASON) {
    deps.toast.error(`Say why in at least ${MIN_REASON} characters.`);
    return false;
  }
  try {
    const r = await firstValueFrom(deps.api.grantSensitiveFiles(client.clientId, reason, sandbox));
    if (r.status === API_SUCCESS) {
      deps.toast.success(r.message || 'The client may now download sensitive files.');
      return true;
    }
    deps.toast.error(r.message || 'Sensitive files could not be allowed.');
  } catch (err) {
    deps.toast.error((err as { error?: { message?: string } })?.error?.message || 'Sensitive files could not be allowed.');
  }
  return false;
}

export async function stopSensitive(deps: SensitiveDeps, client: ApiClientRow, sandbox: boolean, tenantId: number | null): Promise<boolean> {
  const ok = await confirmWith(deps.dialog, {
    title: `Stop sensitive files for ${client.name}?`,
    body: 'The client can no longer download the files of pipelines marked sensitive. Its tokens end now, and links to such files '
      + 'it was already given stop working.',
    confirmLabel: 'Stop sensitive files',
    danger: true,
  });
  if (!ok) return false;
  try {
    const r = await firstValueFrom(deps.api.revokeSensitiveFiles(client.clientId, sandbox, tenantId));
    if (r.status === API_SUCCESS) {
      deps.toast.success(r.message || 'The client may no longer download sensitive files.');
      return true;
    }
    deps.toast.error(r.message || 'Sensitive files could not be stopped.');
  } catch (err) {
    deps.toast.error((err as { error?: { message?: string } })?.error?.message || 'Sensitive files could not be stopped.');
  }
  return false;
}

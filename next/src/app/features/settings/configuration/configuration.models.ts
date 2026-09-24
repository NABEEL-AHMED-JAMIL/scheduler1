import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * MIG-167: the typed screens that replaced the generic Lookups screen. One lookup table used to
 * hold three different things -- a workspace's pipeline configuration, the engine's own knobs and
 * watermarks, and the home pages and groups a task points at -- and one screen edited all of them
 * alike, secrets included. Each now has its own endpoint, its own rules and its own screen.
 */

/** A workspace's configuration entry. A SECRET never carries its value, on any answer. */
export interface PipelineConfig {
  id: number;
  tenantId: number;
  key: string;
  kind: 'VALUE' | 'SECRET';
  /** VALUE only. The screen drops it from a SECRET row even if one ever arrives. */
  value?: string;
  /** SECRET only: true once a secret is stored. */
  secretSet?: boolean;
  description?: string;
  /** When the value or secret was last written. */
  setAt?: string;
  setByName?: string;
  createdAt?: string;
  createdByName?: string;
  /** Live tasks of that workspace whose payload references the key; delete is refused above 0. */
  usedByTasks: number;
}

/** An engine setting: QUEUE_FETCH_LIMIT is editable, the two watermarks are the crons' own. */
export interface EngineSetting {
  key: string;
  value: string;
  description?: string;
  editable: boolean;
  updatedAt?: string;
  updatedByName?: string;
}

export type TaskReferenceKind = 'HOME_PAGE' | 'TASK_GROUP';

/** A home page or a task group; its id is what a task stores as homePageId / groupId. */
export interface TaskReference {
  id: number;
  tenantId: number;
  kind: TaskReferenceKind;
  name: string;
  value?: string;
  description?: string;
  createdAt?: string;
  createdByName?: string;
  updatedAt?: string;
  updatedByName?: string;
  usedByTasks: number;
}

export interface TenantOption { tenantId: number; tenantName: string; tenantCode?: string; }

/** The server's own rule for a key: UPPER_SNAKE, a letter first, at most 64 characters. */
export const CONFIG_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

/** What a key would be once upper-cased and its spaces and hyphens made underscores, or null when that still does not fit. */
export function suggestedKey(raw: string | null | undefined): string | null {
  const typed = (raw ?? '').trim();
  if (!typed || CONFIG_KEY_PATTERN.test(typed)) return null;
  const upper = typed.toUpperCase().replace(/[\s-]+/g, '_');
  return CONFIG_KEY_PATTERN.test(upper) ? upper : null;
}

/** How a task's payload names an entry. Kept out of the templates: a bare "{" there opens an ICU block. */
export function configReference(kind: 'VALUE' | 'SECRET', key: string): string {
  return kind === 'SECRET' ? '${secret:' + key + '}' : '${config:' + key + '}';
}

/** A non-blank value: a box holding only spaces is refused by the server, so it is refused here first. */
export const notBlank: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  (control.value ?? '').toString().trim() ? null : { required: true };

/** A home page is an http:// or https:// address and nothing else. */
export const HTTP_URL_PATTERN = /^https?:\/\/[^\s/$.?#][^\s]*$/i;

export const httpUrl: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = (control.value ?? '').toString().trim();
  if (!value) return null;
  return HTTP_URL_PATTERN.test(value) ? null : { url: true };
};

export const FETCH_LIMIT_MAX = 1_000_000;

/**
 * Why a queue fetch limit cannot be saved, or null when it can. Digits only: "5,000", " 50" and
 * "1e3" are all refused rather than guessed at, because the server refuses them too.
 */
export function fetchLimitError(raw: string | null | undefined): string | null {
  const text = raw ?? '';
  if (!text.trim()) return 'Enter a whole number from 1 to 1,000,000.';
  if (!/^\d+$/.test(text)) return 'Digits only: no commas, spaces, signs or decimals.';
  const n = Number(text);
  if (n < 1 || n > FETCH_LIMIT_MAX) return 'Enter a whole number from 1 to 1,000,000.';
  return null;
}

/** Names each workspace; the id stands in when listTenants did not return it. */
export function workspaceLabel(tenants: TenantOption[], tenantId: number | null | undefined): string {
  if (tenantId == null) return '';
  return tenants.find(t => t.tenantId === tenantId)?.tenantName ?? `Workspace ${tenantId}`;
}

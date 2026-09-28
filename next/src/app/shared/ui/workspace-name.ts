import { ComboboxOption } from './combobox';

/**
 * A row the server tagged with the workspace it belongs to (MIG-296). Every row carries the id;
 * only a platform administrator's rows carry the name, because only a platform administrator sees more than one
 * workspace at a time.
 */
export interface WorkspaceTagged {
  tenantId?: number | null;
  tenantName?: string | null;
}

/**
 * The workspace as a person reads it. The name is missing when the server could not ask identity
 * for it; the id still tells two workspaces apart, so it stands in rather than a blank cell.
 */
export function workspaceName(row: WorkspaceTagged): string {
  const name = row.tenantName?.trim();
  if (name) return name;
  return row.tenantId != null ? `Workspace #${row.tenantId}` : '';
}

/**
 * One filter option per workspace in the loaded rows, by name. Taken from the rows rather than
 * a second call for every workspace, so the list offers only workspaces that have something here.
 * The id rides along as the hint: two workspaces may share a name.
 */
export function workspaceOptions(rows: readonly WorkspaceTagged[]): ComboboxOption[] {
  const seen = new Map<number, string>();
  for (const row of rows) {
    if (row.tenantId != null && !seen.has(row.tenantId)) seen.set(row.tenantId, workspaceName(row));
  }
  return [...seen]
    .map(([id, label]) => ({ value: String(id), label, hint: `#${id}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Whether a row passes the Workspace filter; an empty pick is "All workspaces". */
export function matchesWorkspace(row: WorkspaceTagged, picked: string): boolean {
  return !picked || (row.tenantId != null && String(row.tenantId) === picked);
}

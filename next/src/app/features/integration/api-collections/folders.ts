import { FolderRow } from './api-collections.model';
import { AdvancedOption } from '../../../shared/ui/advanced-select';

/** Each folder by its path ("Patients / Search"), in path order: what a folder picker and the Folder column show. */
export function folderOptions(folders: readonly FolderRow[]): { id: number; label: string }[] {
  const byId = new Map(folders.map(f => [f.folderId, f]));
  const pathOf = (f: FolderRow): string => {
    const names: string[] = [];
    const seen = new Set<number>();
    for (let at: FolderRow | undefined = f; at && !seen.has(at.folderId); at = at.parentFolderId == null ? undefined : byId.get(at.parentFolderId)) {
      seen.add(at.folderId);
      names.unshift(at.name);
    }
    return names.join(' / ');
  };
  return folders.map(f => ({ id: f.folderId, label: pathOf(f) })).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The folders as an advanced select lists them (owner 2026-10-27, "all select should be advance"): each by its path, how
 * many APIs it holds under it when the caller counts them.
 */
export function folderPickOptions(folders: readonly { id: number; label: string }[], apis?: ReadonlyMap<number, number>): AdvancedOption[] {
  return folders.map(f => {
    const n = apis?.get(f.id) ?? 0;
    return { value: String(f.id), label: f.label, description: apis ? `${n} API${n === 1 ? '' : 's'}` : undefined };
  });
}

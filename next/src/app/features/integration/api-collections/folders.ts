import { FolderRow } from './api-collections.model';

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

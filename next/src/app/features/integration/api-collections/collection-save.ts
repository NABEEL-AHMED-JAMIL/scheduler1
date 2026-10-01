import { Observable } from 'rxjs';
import { ApiResponse } from '../../../core/api/api.config';
import { CollectionRow, Saved, sensitivityWord } from './api-collections.model';
import { ApiCollectionsApi } from './api-collections.service';

/** What a collection's save may change beside what the row already says. */
export interface CollectionChanges {
  name?: string;
  description?: string | null;
  sensitivity?: string | null;
  status?: string;
  /** Given: replaces the default auth. Left out: the one the collection has now is kept. */
  defaultAuth?: unknown;
}

/**
 * A collection's save replaces its head; a save that leaves defaultAuth out keeps the auth the collection has
 * (MIG-310), so a change that is not about auth (a rename, Activate) sends none, and needs no read first.
 */
export function saveCollectionKeepingAuth(api: ApiCollectionsApi, row: CollectionRow, changes: CollectionChanges): Observable<ApiResponse<Saved>> {
  const body: Record<string, unknown> = {
    collectionId: row.collectionId,
    name: changes.name ?? row.name,
    description: 'description' in changes ? changes.description : (row.description ?? null),
    sensitivity: 'sensitivity' in changes ? changes.sensitivity : sensitivityWord(row),
    status: changes.status ?? row.status ?? 'Active',
  };
  if ('defaultAuth' in changes) body['defaultAuth'] = changes.defaultAuth ?? null;
  return api.saveCollection(body);
}

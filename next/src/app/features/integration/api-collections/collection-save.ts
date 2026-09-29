import { Observable, map, of, switchMap } from 'rxjs';
import { API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { CollectionRow, Saved } from './api-collections.model';
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
 * The collection's default auth as its current version holds it (only {{variable}} references -- the service
 * refuses a literal secret there), or null when it has none. The list and /get do not carry it.
 */
export function currentDefaultAuth(api: ApiCollectionsApi, row: CollectionRow): Observable<{ auth: unknown } | { error: string }> {
  if (!row.currentVersion) return of({ auth: null });
  return api.version(row.collectionId, row.currentVersion).pipe(map(r => r.status === API_SUCCESS
    ? { auth: r.data?.snapshot?.collection?.defaultAuth ?? null }
    : { error: r.message }));
}

/**
 * A collection's save replaces its whole head, default auth included, and a save without it clears it. So a
 * change that is not about auth (a rename, Activate) reads the auth back first and sends it unchanged -- and
 * when it cannot be read, nothing is saved.
 */
export function saveCollectionKeepingAuth(api: ApiCollectionsApi, row: CollectionRow, changes: CollectionChanges): Observable<ApiResponse<Saved>> {
  const auth: Observable<{ auth: unknown } | { error: string }> = 'defaultAuth' in changes ? of({ auth: changes.defaultAuth ?? null }) : currentDefaultAuth(api, row);
  return auth.pipe(switchMap(read => 'error' in read
    ? of({ status: 'ERROR' as const, message: `Nothing was changed: the collection's auth could not be read (${read.error})` })
    : api.saveCollection({
      collectionId: row.collectionId,
      name: changes.name ?? row.name,
      description: 'description' in changes ? changes.description : (row.description ?? null),
      sensitivity: 'sensitivity' in changes ? changes.sensitivity : (row.sensitivity ?? null),
      status: changes.status ?? row.status ?? 'Active',
      defaultAuth: read.auth,
    })));
}

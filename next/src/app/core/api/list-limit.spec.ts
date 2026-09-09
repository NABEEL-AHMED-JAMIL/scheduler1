import { describe, it, expect } from 'vitest';
import { LIST_LIMIT, isProbablyTruncated } from './list-limit';

/**
 * The backend's PagingUtil defaults an absent `limit` to ten. Screens that post to a paged
 * endpoint with no paging, meaning "everything", therefore received the first ten rows: the
 * Tasks screen listed 10 of 21, and the job editor's task dropdown offered 10, so a job could
 * not be attached to the eleventh task at all.
 */
describe('list limit', () => {
  it('asks for far more than the backend default of ten', () => {
    expect(LIST_LIMIT).toBeGreaterThan(10);
  });

  it('treats an exactly-full page as truncated, because the two are indistinguishable', () => {
    expect(isProbablyTruncated(LIST_LIMIT)).toBe(true);
    expect(isProbablyTruncated(LIST_LIMIT + 1)).toBe(true);
  });

  it('says nothing for a list that plainly fits', () => {
    expect(isProbablyTruncated(0)).toBe(false);
    expect(isProbablyTruncated(21)).toBe(false);
    expect(isProbablyTruncated(LIST_LIMIT - 1)).toBe(false);
  });
});

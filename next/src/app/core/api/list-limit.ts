/**
 * How many rows a screen asks for when it means "all of them".
 *
 * PagingUtil.ApplyPaging on the backend defaults an absent `limit` to TEN
 * (process/src/main/java/process/util/PagingUtil.java:19). Several screens post to a paged
 * endpoint with no paging at all, meaning "everything", and silently received the first ten
 * rows instead: the Tasks screen listed 10 of 21 tasks, and the job editor's task dropdown
 * offered only 10 -- so a job simply could not be attached to the eleventh task, with nothing
 * on screen to say why. These screens filter, sort and page on the client, so they genuinely
 * want the whole set.
 *
 * A ceiling rather than "no limit" because an unbounded list is how a screen dies on real data.
 * A caller that receives exactly this many rows should assume it was truncated and say so --
 * see `isProbablyTruncated`.
 */
export const LIST_LIMIT = 1000;

/**
 * Whether a response of this size might have been cut off.
 *
 * Exactly-at-the-limit is indistinguishable from truncated-at-the-limit, so it is treated as
 * truncated. Better to warn on the rare exact hit than to quietly show a partial list, which is
 * the failure this whole module exists to prevent.
 */
export function isProbablyTruncated(count: number): boolean {
  return count >= LIST_LIMIT;
}

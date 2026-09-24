/** A piece of a log line: plain text, or a path the run read or wrote. */
export interface LogSegment {
  text: string;
  /** The folder to open in the Object Browser; `bucket` is null when the run names none. */
  path?: { bucket: string | null; prefix: string };
}

/**
 * A path in a worker's message: two or more names joined by slashes, at least one of them with a
 * letter in it. A URL, a ratio ("3/4") and a date ("2026/09/20") are not paths.
 */
const PATH = /(?<![\w.:/-])(?:[\w.-]+\/)+[\w.-]*/g;

/**
 * A log line split into its text and the paths it names, each linked to its folder. A path that
 * begins with the task's bucket is read as that bucket's folder; any other is taken to be inside it.
 */
export function logSegments(message: string, bucket: string | null): LogSegment[] {
  const out: LogSegment[] = [];
  let from = 0;
  for (const match of message.matchAll(PATH)) {
    let token = match[0];
    // A sentence may end on a path: its full stop is the sentence's, not the path's.
    while (token.endsWith('.')) token = token.slice(0, -1);
    const names = token.split('/').filter(Boolean);
    if (names.length < 2 && !token.endsWith('/')) continue;
    if (!names.some(n => /[A-Za-z]/.test(n)) || /^\d+$/.test(names[0])) continue;
    if (match.index! > from) out.push({ text: message.slice(from, match.index) });
    out.push({ text: token, path: { bucket, prefix: folderOf(token, bucket) } });
    from = match.index! + token.length;
  }
  if (from < message.length) out.push({ text: message.slice(from) });
  return out;
}

/** The folder a path lives in, relative to the bucket: a file's parent, or the folder itself. */
function folderOf(token: string, bucket: string | null): string {
  let path = bucket && token.startsWith(bucket + '/') ? token.slice(bucket.length + 1) : token;
  const last = path.split('/').pop() ?? '';
  if (!path.endsWith('/') && /\.[A-Za-z0-9]+$/.test(last)) path = path.slice(0, path.length - last.length);
  return path.endsWith('/') || !path ? path : path + '/';
}

/** A path cut after each slash, so a long one wraps between names rather than inside one. */
export function pathParts(path: string): string[] {
  return path.match(/[^/]*\//g)?.concat(path.slice(path.lastIndexOf('/') + 1) || []).filter(Boolean) ?? [path];
}

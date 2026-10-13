/** A piece of a log line: plain text, or a path the run read or wrote. */
export interface LogSegment {
  text: string;
  /** The folder to open in the Object Browser; `bucket` is null when the run names none. */
  path?: { bucket: string | null; prefix: string };
  /** An id the line names, as a link to its page (a request, to the reader's Review inbox task). */
  link?: { url: string; query?: Record<string, string>; title: string };
}

/** What the reader may put to the ids a run's lines name (run page polish 2026-10-12). */
export interface LogNames {
  /** An access profile's id to its name: "the group 1063" reads "the Reviewer group". */
  groups: ReadonlyMap<string, string>;
  /** An approval request's id to the reader's Task inbox task about it: "request 1006" opens that task. */
  requests: ReadonlyMap<string, { taskId: number }>;
}

/** The ids Core writes into an Approval step's lines: "the group 1063", "the role TENANT_USER", "request 1006". */
const IDS = /\bthe group (\d+)\b|\bthe role (TENANT_USER|TENANT_ADMIN)\b|\brequest (\d+)\b/g;

/**
 * The ids in a line's text put as the reader knows them: a group by its name, a role as the people it names, a request
 * as a link to the reader's task about it. An id with no name stays as written, so an old line reads as it always did.
 * Paths (and links) already found are left alone.
 */
export function nameIds(segments: LogSegment[], names: LogNames | null | undefined): LogSegment[] {
  if (!names) return segments;
  const out: LogSegment[] = [];
  for (const segment of segments) {
    if (segment.path || segment.link) { out.push(segment); continue; }
    let from = 0;
    let text = '';
    for (const match of segment.text.matchAll(IDS)) {
      const [whole, group, role, request] = match;
      let said: string | null = null;
      if (group && names.groups.has(group)) said = `the ${names.groups.get(group)} group`;
      else if (role) said = role === 'TENANT_USER' ? 'the workspace users' : 'the workspace administrators';
      else if (request && names.requests.has(request)) {
        out.push({ text: text + segment.text.slice(from, match.index) });
        text = '';
        out.push({ text: whole, link: { url: '/workflows/inbox', query: { task: String(names.requests.get(request)!.taskId) },
          title: 'Open this request in your Review inbox' } });
        from = match.index! + whole.length;
        continue;
      }
      if (said === null) continue;
      text += segment.text.slice(from, match.index) + said;
      from = match.index! + whole.length;
    }
    text += segment.text.slice(from);
    if (text) out.push({ text });
  }
  return out.filter(s => s.text || s.link || s.path);
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

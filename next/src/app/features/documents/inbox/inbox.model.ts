import { formatSize } from '../../../shared/ui/format-size';

/**
 * MIG-239 console: the workspace inbox as storage-service answers it (GET /storage.json/inbox and
 * /storage.json/inbox/files), and the sentences the page builds from it. Every refusal is the service's; the page
 * only words the limits and names who uploaded.
 */

export interface InboxSettings {
  configured: boolean;
  /** The storage connection the inbox writes to; absent when not configured. */
  alias?: string | null;
  connectionName?: string | null;
  connectionActive?: boolean | null;
  /** The cap that applies: the workspace's own when set, else the platform's. */
  maxBytes: number;
  /** The workspace administrator's lower cap; absent when none was set. */
  workspaceMaxBytes?: number | null;
  platformMaxBytes: number;
}

/** One file that arrived in the inbox. Timestamps are server wall-clock, like every other. */
export interface InboxFile {
  arrivalId: string;
  alias?: string;
  key?: string;
  fileName: string;
  bytes?: number | null;
  contentType?: string | null;
  sha256?: string | null;
  /** The app user who uploaded it. */
  uploadedBy?: number | null;
  uploadedAt?: string | null;
}

/**
 * The kinds the inbox takes, grouped for reading. Mirrors storage-service's InboxFileCheck (MIG-239, 2026-09-29):
 * the service has no endpoint that lists them, so this is the page's copy and the service stays the judge -- a kind
 * it drops is refused with its reason, a kind it adds is accepted whatever this list says.
 */
export const ACCEPTED_KINDS: { label: string; extensions: string[] }[] = [
  { label: 'Data', extensions: ['.csv', '.tsv', '.txt', '.json', '.jsonl', '.ndjson', '.xml', '.yaml', '.yml', '.parquet'] },
  { label: 'Documents', extensions: ['.pdf', '.md', '.docx', '.doc', '.xlsx', '.xls', '.pptx'] },
  { label: 'Images', extensions: ['.png', '.jpg', '.jpeg', '.gif', '.tif', '.tiff'] },
  { label: 'Audio and video', extensions: ['.mp3', '.wav', '.m4a', '.mp4'] },
  { label: 'Archives', extensions: ['.zip', '.gz'] },
];

const MB = 1048576;

/** The settings, or null when the answer is not one. */
export function inboxOf(data: unknown): InboxSettings | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as InboxSettings;
}

/** Only the rows that are arrivals: anything else in the answer is dropped rather than drawn. */
export function filesOf(data: unknown): InboxFile[] {
  return Array.isArray(data)
    ? data.filter(f => f && typeof f === 'object' && typeof f.fileName === 'string' && typeof f.arrivalId === 'string')
    : [];
}

/** A limit as a person reads it: whole megabytes stay whole ("100 MB", not "100.0 MB"). */
export function limitText(bytes: number | null | undefined): string {
  if (bytes && bytes % MB === 0) return `${bytes / MB} MB`;
  return formatSize(bytes);
}

export function megabytes(bytes: number | null | undefined): number | null {
  return bytes ? Math.floor(bytes / MB) : null;
}

export function capSentence(settings: InboxSettings): string {
  const lower = !!settings.workspaceMaxBytes && settings.workspaceMaxBytes < settings.platformMaxBytes;
  return lower
    ? `Up to ${limitText(settings.maxBytes)} a file (a workspace limit; the platform allows ${limitText(settings.platformMaxBytes)}).`
    : `Up to ${limitText(settings.maxBytes)} a file.`;
}

/** The lower-cap field, checked before the round trip. Empty is valid: the platform's limit applies. */
export function capProblem(value: string, platformMaxBytes: number): string {
  const text = value.trim();
  if (!text) return '';
  if (!/^\d+$/.test(text)) return 'Enter a whole number of MB.';
  const mb = Number(text);
  if (mb <= 0) return 'Enter a limit above 0 MB, or leave it empty for the platform\'s.';
  if (mb * MB > platformMaxBytes) return `The platform allows at most ${limitText(platformMaxBytes)} a file.`;
  return '';
}

/** A file over the cap is not worth sending: the service would refuse it after the whole upload. */
export function oversizeReason(name: string, bytes: number, maxBytes: number): string {
  return bytes > maxBytes ? `'${name}' is ${limitText(bytes)}; the inbox takes files up to ${limitText(maxBytes)}.` : '';
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 12) : '—';
}

/** "You", a member's name when the directory could be read (an administrator's), else the user number. */
export function uploaderName(userId: number | null | undefined, me: number | null | undefined, names: Map<number, string>): string {
  if (userId === null || userId === undefined) return '—';
  if (me !== null && me !== undefined && userId === me) return 'You';
  return names.get(userId) ?? `User ${userId}`;
}

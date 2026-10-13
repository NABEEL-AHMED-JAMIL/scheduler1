/** The largest picture the server takes (appUser.json/avatar), checked here first so nobody waits for a refusal. */
export const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

export type PictureKind = 'png' | 'jpeg' | 'webp' | 'svg' | 'other';

/**
 * What a file's first bytes say it is -- never its name or the type the browser guessed from the name. The server checks
 * again; this is so a wrong file is refused at once, with a reason, rather than after a crop and an upload.
 */
export function pictureKind(head: Uint8Array): PictureKind {
  const at = (i: number, ...bytes: number[]) => bytes.every((b, k) => head[i + k] === b);
  const text = (i: number, s: string) => at(i, ...[...s].map(c => c.charCodeAt(0)));
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'jpeg';
  if (text(0, 'RIFF') && text(8, 'WEBP')) return 'webp';
  const start = new TextDecoder('latin1').decode(head.subarray(0, 512)).replace(/^ï»¿/, '').trim().toLowerCase();
  if (start.startsWith('<') && start.includes('<svg')) return 'svg';
  return 'other';
}

/** Why this file cannot be a profile picture, or null when it can. */
export async function pictureProblem(file: Blob): Promise<string | null> {
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_PICTURE_BYTES) return 'That picture is over 5 MB. Pick a smaller one.';
  const kind = pictureKind(new Uint8Array(await file.slice(0, 512).arrayBuffer()));
  if (kind === 'svg') return 'SVG pictures are not accepted. Pick a PNG, JPEG or WebP picture.';
  if (kind === 'other') return 'That file is not a PNG, JPEG or WebP picture.';
  return null;
}

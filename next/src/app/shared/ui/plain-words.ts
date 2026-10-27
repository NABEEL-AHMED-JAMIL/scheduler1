/**
 * ZT-U8: a text the platform wrote, as a customer reads it. Step hints name the platform's own parts ("(storage-service)")
 * and a few menus by their old names, and a report's page-limit message names "Report Studio › Settings"; on screen they
 * read as the console's menu names them.
 */
const OLD_PLACES: [RegExp, string][] = [
  [/\bAI\s*[>›]\s*Prompts\b/g, 'Build › Pipelines › Prompts'],
  [/\bDocuments\s*[>›]\s*Converter\b/g, 'Tools › Document Converter'],
  [/\bReport Studio\s*[>›]\s*Settings\b/g, 'Reports › Settings'],
  [/\b(?<!Build › )Pipelines\s*[>›]\s*Schedules\b(?! &)/g, 'Build › Pipelines › Schedules & triggers'],
];
export function plainHint(text: string): string {
  let out = text.replace(/\s*\([a-z]+(?:-[a-z]+)*-service\)/gi, '');
  for (const [from, to] of OLD_PLACES) out = out.replace(from, to);
  return out.replace(/\s{2,}/g, ' ').trim();
}

const ACRONYMS: Record<string, string> = { api: 'API', s3: 'S3', pdf: 'PDF', ai: 'AI', ocr: 'OCR', csv: 'CSV', json: 'JSON', id: 'ID',
  ftp: 'FTP', sql: 'SQL', html: 'HTML', url: 'URL', top: 'top' };
/** A step's code as words when no name came with it: call_api -> "Call API", read_s3 -> "Read S3"; anything else as it is. */
export function codeName(code: string | null | undefined): string {
  const c = (code ?? '').trim();
  if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(c)) return c;
  const words = c.split('_').map(w => ACRONYMS[w] ?? w);
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? ' ' + words.slice(1).join(' ') : '');
}

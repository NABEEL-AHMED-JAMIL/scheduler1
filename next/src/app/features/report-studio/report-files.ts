/** A JSON document saved as a file the reader picks where to keep (a template's export). */
export function downloadJson(doc: unknown, fileName: string): void {
  saveBlob(new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' }), fileName);
}

/** A blob saved through a temporary link; the object URL is released straight after. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace(/[\\/:*?"<>|]+/g, '_');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The file name a Content-Disposition header gives (filename*=UTF-8''... or filename="..."), or a fallback. */
export function fileNameOf(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (star) return decodeURIComponent(star[1]);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1] : fallback;
}

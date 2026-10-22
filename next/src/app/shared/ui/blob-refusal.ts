/**
 * The server's reason for a refused download. The request asks for a blob, so a refusal's body
 * arrives as a Blob too, and `err.error.message` was always undefined: it has to be read and
 * parsed. Anything that is not a JSON envelope with a message (an HTML error page) gives ''.
 */
export async function refusalOf(err: any): Promise<string> {
  const body = err?.error;
  if (!(body instanceof Blob)) return body?.message ?? '';
  try {
    const parsed = JSON.parse(await body.text());
    return typeof parsed?.message === 'string' ? parsed.message : '';
  } catch {
    return '';
  }
}

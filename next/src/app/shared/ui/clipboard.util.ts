/**
 * Copies text, preferring the async Clipboard API and falling back to a hidden textarea.
 *
 * The modern API refuses in more situations than people expect -- an unfocused document, a
 * non-secure context, or a missing permission all throw -- and the fallback keeps working in
 * all of them. Returns whether the copy actually happened so callers can tell the truth
 * rather than claim success unconditionally.
 */
export async function copyText(value: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through to the legacy path rather than giving up
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    // Kept off-screen rather than hidden: a display:none element can't be selected.
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

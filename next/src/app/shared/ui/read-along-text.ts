import { Component, computed, input } from '@angular/core';

/**
 * A passage of text with the word currently being read aloud marked in it.
 *
 * A component rather than three copies of the same split, because the transcript screen shows
 * the same passages three ways -- timeline, table and console -- and the reading has to be
 * followable in whichever one is open. Angular has no way to share a fragment of template
 * without one.
 *
 * Renders the text untouched when `at` is null, so it is a drop-in replacement for the plain
 * interpolation it took over from and costs nothing when nothing is being read.
 */
@Component({
  selector: 'app-read-along-text',
  template: `@if (split(); as parts) {<span>{{ parts.before }}</span><mark
      class="read-mark">{{ parts.word }}</mark><span>{{ parts.after }}</span>} @else {{{ text() }}}`,
})
export class ReadAlongText {
  readonly text = input.required<string>();

  /**
   * The word to mark, as an offset and length into `text`, or null for no marking.
   *
   * An offset rather than the word itself: the same word usually appears several times in a
   * passage, and matching by content would mark the first occurrence rather than the one being
   * spoken.
   */
  readonly at = input<{ charIndex: number; charLength: number } | null>(null);

  readonly split = computed(() => {
    const text = this.text();
    const at = this.at();
    if (!at || !text) return null;
    // An offset past the end arrives from engines that count the trailing silence of a passage
    // as a boundary. Marking nothing is right; clamping into range would park the highlight on
    // the last word for as long as that silence lasts.
    if (at.charIndex < 0 || at.charIndex >= text.length) return null;
    const end = Math.min(text.length, at.charIndex + Math.max(1, at.charLength));
    return {
      before: text.slice(0, at.charIndex),
      word: text.slice(at.charIndex, end),
      after: text.slice(end),
    };
  });
}

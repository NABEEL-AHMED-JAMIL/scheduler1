import { Component, computed, input } from '@angular/core';
import { parseSpans } from './guide-markdown';

/**
 * MIG-336: one line of the contract's own prose (a response's or a header's description) with its `code` spans drawn as
 * code -- through the template, never innerHTML. Links and emphasis stay text: the contract's descriptions carry none.
 */
@Component({
  selector: 'app-inline-text',
  template: `@for (span of spans(); track $index) {@if (span.code) {<code class="md-inline-code">{{ span.text }}</code>} @else {{{ span.text }}}}`,
})
export class InlineText {
  readonly text = input<string | null | undefined>('');
  readonly spans = computed(() => parseSpans(this.text() ?? ''));
}

import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CUSTOMER_API_BASE } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { DevCode } from './code-block';
import { DOCS, scrollToFragments } from './developer-docs';
import { GuideBody } from './guide-body';
import { InlineText } from './inline-text';
import { PORTAL } from './guide-markdown';
import { matchesFilter } from './openapi';
import { referenceModel } from './reference-model';
import { SchemaFields } from './schema-fields';

/**
 * MIG-336: Integration › Developer portal › API reference -- every operation of the bundled OpenAPI document by tag,
 * then its schemas, the event types webhooks send, the problem types and the rate-limit headers. Each has an anchor
 * (#op-<operationId>, #tag-<tag>, #schema-<Name>, #events, #problems) to link to. The filter narrows the operations.
 */
@Component({
  selector: 'app-developer-reference',
  imports: [RouterLink, Icon, DevCode, GuideBody, InlineText, SchemaFields],
  templateUrl: './reference.html',
  // From 1536px the examples take a column of their own beside the operation's details.
  styles: [`@media (min-width: 1536px) { .op-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 30rem); } }`],
})
export class DeveloperReference {
  readonly base = CUSTOMER_API_BASE;
  readonly reference = `${PORTAL}/reference`;
  readonly model = referenceModel(DOCS.spec, DOCS.eventTypes, CUSTOMER_API_BASE);
  readonly filter = signal('');

  readonly total = this.model.tags.reduce((n, t) => n + t.operations.length, 0);
  readonly tags = computed(() => {
    const term = this.filter();
    return this.model.tags
      .map(t => ({ ...t, operations: t.operations.filter(o => matchesFilter(o.op, term)) }))
      .filter(t => t.operations.length);
  });
  readonly shown = computed(() => this.tags().reduce((n, t) => n + t.operations.length, 0));

  constructor() {
    scrollToFragments();
  }

  accessText(kind: string): string {
    return kind === 'signed' ? 'No token: a signed link' : 'No token needed';
  }
}

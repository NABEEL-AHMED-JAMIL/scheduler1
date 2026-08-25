import { Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';

/**
 * Who made a thing, and who last changed it.
 *
 * One component rather than the same two lines written out on every screen, so the wording and
 * the emphasis stay identical wherever it appears -- a person scanning several screens should
 * not have to work out that "Added by" and "Created by" mean the same thing.
 *
 * Rows created before the audit columns existed genuinely have no author, and rows written by
 * the scheduler or a Kafka callback have no human one. Both come through as null and render
 * nothing at all, because "Added by —" invites the reader to wonder what went wrong.
 */
@Component({
  selector: 'app-audit-line',
  imports: [DatePipe],
  template: `
    @if (createdByName() || updatedByName()) {
      <p class="text-[11px] leading-relaxed text-[color:var(--text-muted)]">
        @if (createdByName()) {
          <span>Added by <span class="text-[color:var(--text-secondary)]">{{ createdByName() }}</span></span>
          @if (dateCreated()) { <span> · {{ dateCreated() | date: 'd MMM y' }}</span> }
        }
        <!-- Only worth saying when somebody other than the author touched it, or when the
             author came back to it later; otherwise it repeats the line above. -->
        @if (updatedByName() && updatedByName() !== createdByName()) {
          @if (createdByName()) { <br /> }
          <span>Last changed by <span class="text-[color:var(--text-secondary)]">{{ updatedByName() }}</span></span>
        }
      </p>
    }
  `,
})
export class AuditLine {
  readonly createdByName = input<string | null | undefined>();
  readonly updatedByName = input<string | null | undefined>();
  readonly dateCreated = input<string | Date | null | undefined>();
}

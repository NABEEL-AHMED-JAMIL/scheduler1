import { Component, input } from '@angular/core';
import { ReadableField } from './task-registry.model';

/**
 * A task's settings to read (MIG-250), from its config schema as the step builder reads it: each setting's label, its
 * name in the definition, what kind of value it takes, whether it is required, its help, its default, choices and
 * bounds; a group's own settings under it. The step builder's form, disabled, would show empty boxes and hide a
 * repeatable group's settings until a row was added -- this lists them all.
 */
@Component({
  selector: 'app-schema-fields',
  template: `
    <ul class="flex flex-col min-w-0">
      @for (f of fields(); track f.name) {
        <li class="py-2 min-w-0 border-[color:var(--border-subtle)]" [class.border-t]="!$first" [attr.data-setting]="f.name">
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
            <span class="text-sm font-medium">{{ f.label }}</span>
            <span class="mono text-[color:var(--text-muted)] [overflow-wrap:anywhere]">{{ f.name }}</span>
            @if (f.required) { <span class="pill pill-neutral">Required</span> }
            <span class="ml-auto text-xs text-[color:var(--text-secondary)]">{{ f.type }}</span>
          </div>
          @if (f.description) { <p class="text-xs text-[color:var(--text-secondary)] mt-0.5 [overflow-wrap:anywhere]">{{ f.description }}</p> }
          @for (note of f.notes; track $index) {
            <p class="text-xs text-[color:var(--text-muted)] mt-0.5 [overflow-wrap:anywhere]">{{ note }}</p>
          }
          @if (f.children.length) {
            <div class="mt-2 pl-3 border-l-2 border-[color:var(--border-subtle)]">
              <app-schema-fields [fields]="f.children" />
            </div>
          }
        </li>
      } @empty {
        <li class="text-sm text-[color:var(--text-muted)]">{{ empty() }}</li>
      }
    </ul>
  `,
})
export class SchemaFields {
  readonly fields = input.required<ReadableField[]>();
  readonly empty = input('No settings.');
}

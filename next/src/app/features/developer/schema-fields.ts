import { Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FieldNode } from './openapi';
import { PORTAL } from './guide-markdown';

/**
 * MIG-336: a schema's fields as a nested list -- name, type, required, null allowed, description, the values it takes,
 * its pattern, default and range -- each object's fields indented under it, and a link to a named schema's own entry.
 */
@Component({
  selector: 'app-schema-fields',
  imports: [NgTemplateOutlet, RouterLink],
  template: `
    @if (root().children.length || root().variants.length) {
      <ng-container [ngTemplateOutlet]="fields" [ngTemplateOutletContext]="{ $implicit: root() }" />
    } @else {
      <p class="text-sm text-[color:var(--text-muted)]" data-schema-plain>
        {{ root().type }}@if (root().ref) { · <a class="md-link" [routerLink]="reference" [fragment]="'schema-' + root().ref">{{ root().ref }}</a>}
        @if (root().description) { · {{ root().description }} }
      </p>
    }

    <ng-template #fields let-node>
      @if (node.children.length) {
        <ul class="flex flex-col divide-y divide-[color:var(--border-subtle)]" data-schema-fields>
          @for (f of node.children; track f.name) {
            <li class="py-1.5 min-w-0">
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span class="mono text-sm font-medium break-all">{{ f.name }}</span>
                <span class="text-xs text-[color:var(--text-muted)]">{{ f.type }}{{ f.nullable ? ' or null' : '' }}{{ f.format ? ' · ' + f.format : '' }}</span>
                @if (f.ref) {
                  <a class="md-link text-xs" [routerLink]="reference" [fragment]="'schema-' + f.ref">{{ f.ref }}</a>
                }
                @if (f.required) { <span class="text-xs font-medium text-[color:var(--crit-text)]">required</span> }
              </div>
              @if (f.description) { <p class="text-sm text-[color:var(--text-secondary)] mt-0.5">{{ f.description }}</p> }
              @if (f.constValue || f.enumValues.length || f.pattern || f.defaultValue || f.range) {
                <div class="flex flex-wrap items-center gap-1 mt-1 text-xs text-[color:var(--text-muted)]">
                  @if (f.constValue) { Always <span class="pill pill-neutral mono">{{ f.constValue }}</span> }
                  @if (f.enumValues.length) {
                    One of @for (v of f.enumValues; track v) { <span class="pill pill-neutral mono">{{ v }}</span> }
                  }
                  @if (f.pattern) { <span>Pattern <code class="md-inline-code break-all">{{ f.pattern }}</code></span> }
                  @if (f.defaultValue) { <span>Default <code class="md-inline-code">{{ f.defaultValue }}</code></span> }
                  @if (f.range) { <span>{{ f.range }}</span> }
                </div>
              }
              @if (f.children.length || f.variants.length) {
                <div class="mt-1.5 ml-1 pl-3 border-l border-subtle">
                  <ng-container [ngTemplateOutlet]="fields" [ngTemplateOutletContext]="{ $implicit: f }" />
                </div>
              }
            </li>
          }
        </ul>
      }
      @for (v of node.variants ?? []; track $index) {
        <div class="mt-1.5">
          <p class="text-xs font-medium text-[color:var(--text-secondary)]">{{ $index ? 'Or' : 'One of' }}: {{ v.label }}</p>
          @if (v.children.length) {
            <div class="ml-1 pl-3 border-l border-subtle">
              <ng-container [ngTemplateOutlet]="fields" [ngTemplateOutletContext]="{ $implicit: v }" />
            </div>
          }
        </div>
      }
    </ng-template>
  `,
})
export class SchemaFields {
  readonly root = input.required<FieldNode>();
  readonly reference = `${PORTAL}/reference`;
}

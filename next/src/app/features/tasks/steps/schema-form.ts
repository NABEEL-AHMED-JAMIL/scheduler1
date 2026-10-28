import { Component, Injector, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';
import { TeamsApi } from '../../../core/teams/teams.api';
import { Field } from '../../../shared/ui/field';
import { Icon } from '../../../shared/ui/icon';
import { InlineStatus, createLoadState } from '../../../shared/ui/loading';
import {
  ApiRequestChoice, BucketChoice, DocumentTypeChoice, FieldKind, FieldSpec, JsonSchema, PromptChoice, ScheduleChoice, StepProblem, WebhookChoice, coerce, fieldsOf, isMapSchema, mapValueKind, parseJson, withValue,
} from './steps.model';
import { AdvancedOption, AdvancedSelect } from '../../../shared/ui/advanced-select';

interface MapRow { key: string; value: unknown; }

/**
 * A step's settings as a form, drawn from its task's configSchema (MIG-249 on MIG-231's Task Registry): text and long
 * text (sql, template, multiline), whole and decimal numbers, a switch, a choice from an enum, a value that may be
 * text, a number or true/false, a column (suggested from the columns the step before makes, and free to type), an
 * earlier step, a list of plain values (one per line), a list of columns, a nested object, a repeatable group (a
 * list of objects, rows with Add and Remove), a map (rows of name and value) -- and a raw-JSON box for a setting the
 * schema says in a way a form cannot. Nested objects and each group row are this same form, one level down; a schema
 * with no properties and an additionalProperties schema is drawn as a map.
 *
 * A document-type setting (MIG-364) is a choice of the workspace's document types, stored as the type's id.
 *
 * The registry's other widget hints -- api-request, api-environment, data-contract, db-connection, bucket, pipeline,
 * user -- are text boxes for now (TODO(MIG-249): their pickers).
 *
 * It keeps what it last handed back, so a parent that does not feed each change straight back still sees every edit
 * build on the one before. A problem from the server is shown at the setting its path names.
 */
@Component({
  selector: 'app-schema-form',
  imports: [Field, Icon, InlineStatus, AdvancedSelect],
  template: `
    @if (isMap()) {
      <div class="flex flex-col gap-2 min-w-0">
        @for (row of mapRows(); track $index; let i = $index) {
          <div class="flex items-start gap-2 min-w-0">
            <input class="input mono text-xs flex-1 min-w-0" [id]="idPrefix() + '-key-' + i" [value]="row.key" placeholder="Name"
                   [attr.aria-label]="'Name ' + (i + 1) + ' in ' + (label() || 'the map')" [disabled]="disabled()"
                   (input)="setMapKey(i, $any($event.target).value)" />
            @if (mapKind() === 'json') {
              <textarea class="input mono text-xs flex-1 min-w-0" rows="1" [id]="idPrefix() + '-value-' + i" [value]="mapJson(row)"
                        [attr.aria-label]="'Value of ' + (row.key || 'entry ' + (i + 1))" [disabled]="disabled()"
                        (input)="setMapJson(i, $any($event.target).value)"></textarea>
            } @else if (mapKind() === 'boolean') {
              <label class="flex items-center gap-2 text-sm flex-1">
                <input type="checkbox" class="checkbox" [id]="idPrefix() + '-value-' + i" [checked]="row.value === true" [disabled]="disabled()"
                       (change)="setMapValue(i, $any($event.target).checked)" />Yes
              </label>
            } @else {
              <input class="input flex-1 min-w-0" [id]="idPrefix() + '-value-' + i" [value]="scalarText(row.value)"
                     [type]="mapKind() === 'number' || mapKind() === 'integer' ? 'number' : 'text'" placeholder="Value"
                     [attr.aria-label]="'Value of ' + (row.key || 'entry ' + (i + 1))" [disabled]="disabled()"
                     (input)="setMapValue(i, mapCoerce($any($event.target).value))" />
            }
            @if (!disabled()) {
              <button type="button" class="btn btn-ghost btn-icon btn-sm shrink-0" [attr.aria-label]="'Remove ' + (row.key || 'entry ' + (i + 1)) + ' from ' + (label() || 'the map')"
                      (click)="removeMapRow(i)"><app-icon name="trash" class="icon-crit" /></button>
            }
          </div>
        } @empty {
          <p class="text-xs text-[color:var(--text-muted)]">No entries.</p>
        }
        @if (!disabled()) {
          <div><button type="button" class="btn btn-default btn-sm" [attr.aria-label]="'Add an entry to ' + (label() || 'the map')" (click)="addMapRow()">
            <app-icon name="plus" />Add
          </button></div>
        }
        @for (p of problems(); track $index) { <p class="field-note text-crit-500" role="alert">{{ p.field ? p.field + ': ' : '' }}{{ p.message }}</p> }
      </div>
    } @else {
    <div class="flex flex-col gap-3 min-w-0">
      @for (f of fields(); track f.name) {
        @switch (f.kind) {
          @case ('boolean') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [hint]="f.description" [error]="errorOf(f)">
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" class="checkbox" [id]="idOf(f)" [checked]="current()[f.name] === true" [disabled]="disabled()"
                       (change)="set(f.name, $any($event.target).checked)" />
                Yes
              </label>
            </app-field>
          }
          @case ('enum') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [hint]="f.description" [error]="errorOf(f)">
              <app-advanced-select [id]="idOf(f)" [options]="pickOptions()[f.name] ?? []" [value]="choiceIndex(f)" [disabled]="disabled()"
                                   (valueChange)="pick(f, $event)" [allowClear]="!f.required" clearLabel="None" [placeholder]="f.required ? 'Choose…' : 'None'"
                                   [ariaLabel]="f.label" [searchLabel]="'Search ' + f.label" />
            </app-field>
          }
          @case ('multi') {
            <!-- UX review 2026-10-12: a list of fixed choices, one checkbox each, in the schema's order. -->
            <app-field [label]="f.label" [for]="idOf(f) + '-0'" [required]="f.required" [hint]="f.description" [error]="errorOf(f)">
              <div class="flex flex-wrap gap-x-4 gap-y-1.5" role="group" [attr.aria-label]="f.label" [attr.data-multi]="f.name">
                @for (option of f.options; track $index) {
                  <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" class="checkbox" [id]="idOf(f) + '-' + $index" [checked]="multiHas(f, option)" [disabled]="disabled()"
                           (change)="toggleMulti(f, option, $any($event.target).checked)" />{{ optionLabel(f, $index, option) }}
                  </label>
                }
              </div>
            </app-field>
          }
          @case ('step') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [hint]="f.description" [error]="errorOf(f)">
              <app-advanced-select [id]="idOf(f)" [options]="pickOptions()[f.name] ?? []" [value]="textOf(f)" [disabled]="disabled()"
                                   (valueChange)="set(f.name, $event || undefined)" [allowClear]="!f.required" clearLabel="None"
                                   [placeholder]="f.required ? 'Choose…' : 'None'" [ariaLabel]="f.label" searchLabel="Search the earlier steps"
                                   emptyText="No earlier step: this is the first." />
            </app-field>
          }
          @case ('prompt') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [hint]="f.description" [error]="errorOf(f)">
              <app-advanced-select [id]="idOf(f)" [options]="pickOptions()[f.name] ?? []" [value]="textOf(f)" [disabled]="disabled()"
                                   (valueChange)="set(f.name, $event === '' ? undefined : +$event)" [allowClear]="!f.required" clearLabel="None"
                                   [placeholder]="f.required ? 'Choose a prompt…' : 'None'" [ariaLabel]="f.label" searchLabel="Search the prompts"
                                   emptyText="No active prompt in this workspace yet (AI › Prompts)." />
            </app-field>
          }
          @case ('webhook') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [error]="errorOf(f)"
                       [hint]="f.description || webhookHint">
              <app-advanced-select [id]="idOf(f)" [options]="pickOptions()[f.name] ?? []" [value]="textOf(f)" [disabled]="disabled()"
                                   (valueChange)="set(f.name, $event === '' ? undefined : +$event)" [allowClear]="!f.required" clearLabel="None"
                                   [placeholder]="f.required ? 'Choose a webhook…' : 'None'" [ariaLabel]="f.label" searchLabel="Search the webhooks"
                                   emptyText="No webhook in this workspace yet (Developers › API Clients)." />
            </app-field>
          }
          @case ('api-request') {
            <!-- Owner #25: one of the workspace's saved API requests, grouped by collection, with its method. -->
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [error]="errorOf(f)"
                       [hint]="f.description || apiRequestHint">
              <app-advanced-select [id]="idOf(f)" [options]="pickOptions()[f.name] ?? []" [value]="textOf(f)" [disabled]="disabled()"
                                   data-test="api-request-select" (valueChange)="set(f.name, $event === '' ? undefined : +$event)" [allowClear]="!f.required" clearLabel="None"
                                   [placeholder]="f.required ? 'Choose an API request…' : 'None'" [ariaLabel]="f.label"
                                   searchLabel="Search the API requests" searchPlaceholder="Search by name, collection or method"
                                   emptyText="No saved API request in this workspace yet (Connections › API collections)." />
            </app-field>
          }
          @case ('api-environment') {
            <!-- Owner #25: an environment of the chosen request's collection; none is the collection's default. -->
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [error]="errorOf(f)" [hint]="f.description || ''">
              <app-advanced-select [id]="idOf(f)" [options]="pickOptions()[f.name] ?? []" [value]="textOf(f)" [disabled]="disabled()"
                                   (valueChange)="set(f.name, $event === '' ? undefined : +$event)" [allowClear]="true" clearLabel="The collection's default"
                                   placeholder="The collection's default" [ariaLabel]="f.label" searchLabel="Search the environments"
                                   emptyText="The request's collection has no environments." />
            </app-field>
          }
          @case ('schedule') {
            <!-- MIG-424: one of the workspace's schedules (a pipeline to call), stored as its id. -->
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [error]="errorOf(f)"
                       [hint]="f.description || scheduleHint">
              <app-advanced-select [id]="idOf(f)" [options]="pickOptions()[f.name] ?? []" [value]="textOf(f)" [disabled]="disabled()"
                                   data-test="schedule-select" (valueChange)="set(f.name, $event === '' ? undefined : +$event)" [allowClear]="!f.required" clearLabel="None"
                                   [placeholder]="f.required ? 'Choose a pipeline…' : 'None'" [ariaLabel]="f.label" searchLabel="Search the pipelines"
                                   emptyText="No pipeline schedule in this workspace yet." />
            </app-field>
          }
          @case ('document-type') {
            <!-- MIG-364: one of the workspace's document types, stored as its id; empty is the documents that started the run. -->
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [error]="errorOf(f)"
                       [hint]="f.description || documentTypeHint">
              <app-advanced-select [id]="idOf(f)" [options]="pickOptions()[f.name] ?? []" [value]="textOf(f)" [disabled]="disabled()"
                                   (valueChange)="set(f.name, $event === '' ? undefined : +$event)" [allowClear]="!f.required" clearLabel="The documents that started the run"
                                   [placeholder]="f.required ? 'Choose a document type…' : 'The documents that started the run'" [ariaLabel]="f.label"
                                   searchLabel="Search the document types" emptyText="No document type in this workspace yet (Documents › Document types)." />
            </app-field>
          }
          @case ('column') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [error]="errorOf(f)"
                       [hint]="f.description || (columns().length ? 'A column of the rows this step reads: pick one, or type it.' : '')">
              <input [id]="idOf(f)" class="input mono" [value]="textOf(f)" [disabled]="disabled()" autocomplete="off"
                     [attr.list]="idOf(f) + '-columns'" [attr.maxlength]="f.schema.maxLength ?? null" [attr.minlength]="f.schema.minLength ?? null"
                     (input)="set(f.name, coerceText(f, $any($event.target).value))" />
              <datalist [id]="idOf(f) + '-columns'">
                @for (c of columns(); track c) { <option [value]="c"></option> }
              </datalist>
            </app-field>
          }
          @case ('bucket') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [error]="errorOf(f)"
                       [hint]="f.description || (buckets().length ? 'A bucket of this workspace: pick one, or type its alias.' : '')">
              <input [id]="idOf(f)" class="input mono" [value]="textOf(f)" [disabled]="disabled()" autocomplete="off"
                     [attr.list]="idOf(f) + '-buckets'" [attr.maxlength]="f.schema.maxLength ?? null"
                     (input)="set(f.name, coerceText(f, $any($event.target).value))" />
              <datalist [id]="idOf(f) + '-buckets'">
                @for (b of buckets(); track b.alias) { <option [value]="b.alias">{{ b.label }}</option> }
              </datalist>
            </app-field>
          }
          @case ('textarea') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [hint]="f.description" [error]="errorOf(f)">
              <textarea [id]="idOf(f)" class="input" rows="4" [class.mono]="f.schema.format === 'sql'" [class.text-xs]="f.schema.format === 'sql'"
                        [value]="textOf(f)" [disabled]="disabled()" spellcheck="false"
                        [attr.maxlength]="f.schema.maxLength ?? null" [attr.minlength]="f.schema.minLength ?? null"
                        (input)="set(f.name, coerceText(f, $any($event.target).value))"></textarea>
            </app-field>
          }
          @case ('list') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [error]="errorOf(f)"
                       [hint]="(f.description ? f.description + ' ' : '') + 'One per line.'">
              <textarea [id]="idOf(f)" class="input mono text-xs" rows="4" [value]="listText(f)" [disabled]="disabled()"
                        (input)="typeList(f, $any($event.target).value)"></textarea>
            </app-field>
          }
          @case ('columns') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [error]="errorOf(f)"
                       [hint]="(f.description ? f.description + ' ' : '') + 'One column per line.'">
              <textarea [id]="idOf(f)" class="input mono text-xs" rows="3" [value]="listText(f)" [disabled]="disabled()"
                        (input)="typeList(f, $any($event.target).value)"></textarea>
              @if (!disabled() && unusedColumns(f).length) {
                <div class="flex flex-wrap gap-1 mt-1.5">
                  @for (c of unusedColumns(f); track c) {
                    <button type="button" class="btn btn-default btn-sm mono text-xs" [attr.aria-label]="'Add column ' + c + ' to ' + f.label"
                            (click)="addColumn(f, c)"><app-icon name="plus" />{{ c }}</button>
                  }
                </div>
              }
            </app-field>
          }
          @case ('reviewers') {
            <!-- ZT-U8: who reviews, picked by name -- a team's id was asked for but never shown anywhere. -->
            <fieldset class="schema-group min-w-0" [attr.data-reviewers]="f.name">
              <p class="label">{{ f.label }}</p>
              @if (f.description) { <p class="field-note text-[color:var(--text-muted)] -mt-1 mb-2">{{ f.description }}</p> }
              <div class="grid gap-3 sm:grid-cols-2">
                <app-field label="Who" [for]="idOf(f) + '-who'">
                  <select [id]="idOf(f) + '-who'" class="input" [disabled]="disabled()" (change)="pickReviewers(f, $any($event.target).value)">
                    <option value="" [selected]="reviewersChoice(f) === ''">As the pipeline says (else the administrators)</option>
                    <option value="role:TENANT_ADMIN" [selected]="reviewersChoice(f) === 'role:TENANT_ADMIN'">The workspace administrators</option>
                    <option value="role:TENANT_USER" [selected]="reviewersChoice(f) === 'role:TENANT_USER'">Every member of the workspace</option>
                    <option value="team" [selected]="reviewersChoice(f) === 'team'">A team</option>
                  </select>
                </app-field>
                @if (reviewersChoice(f) === 'team') {
                  <!-- Owner 2026-10-27: "No team yet" only once the teams have answered; loading and a failed read say so. -->
                  <app-field label="Team" [for]="idOf(f) + '-team'" [hint]="teamsState.loaded() && !teamChoices().length ? 'No team yet: make one in Administration › Teams.' : ''">
                    <app-advanced-select [id]="idOf(f) + '-team'" [options]="pickOptions()[f.name + ':team'] ?? []" [value]="reviewersTeam(f)"
                                         [disabled]="disabled()" (valueChange)="pickTeam(f, $event)" placeholder="Choose a team…" ariaLabel="Team"
                                         searchLabel="Search the teams" [loading]="teamsState.loading()" loadingText="Loading teams…"
                                         emptyText="No team yet: make one in Administration › Teams." />
                    <app-inline-status [loading]="teamsState.loading()" [error]="teamsState.error()" label="Loading teams…" (retry)="loadTeams()" />
                  </app-field>
                }
              </div>
            </fieldset>
          }
          @case ('object') {
            <fieldset class="schema-group min-w-0">
              <p class="label">{{ f.label }}@if (f.required) { <span class="text-crit-500 ml-0.5" aria-hidden="true">*</span> }</p>
              @if (f.description) { <p class="field-note text-[color:var(--text-muted)] -mt-1 mb-2">{{ f.description }}</p> }
              <app-schema-form [schema]="f.schema" [value]="objectOf(f)" [problems]="problemsUnder(f.name)" [idPrefix]="idOf(f)"
                               [label]="f.label" [columns]="columns()" [steps]="steps()" [prompts]="prompts()" [buckets]="buckets()" [webhooks]="webhooks()" [documentTypes]="documentTypes()" [apiRequests]="apiRequests()" [disabled]="disabled()" (valueChange)="set(f.name, $event)" />
            </fieldset>
          }
          @case ('objects') {
            <fieldset class="schema-group min-w-0">
              <div class="flex items-center gap-2">
                <p class="label mb-0">{{ f.label }}@if (f.required) { <span class="text-crit-500 ml-0.5" aria-hidden="true">*</span> }</p>
                @if (!disabled()) {
                  <button type="button" class="btn btn-default btn-sm ml-auto" [attr.aria-label]="'Add a row to ' + f.label" (click)="addRow(f)">
                    <app-icon name="plus" />Add
                  </button>
                }
              </div>
              @if (f.description) { <p class="field-note text-[color:var(--text-muted)] mb-2">{{ f.description }}</p> }
              @for (row of rowsOf(f); track $index; let i = $index) {
                <div class="schema-row">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs text-[color:var(--text-muted)] mono">#{{ i + 1 }}</span>
                    @if (!disabled()) {
                      <button type="button" class="btn btn-ghost btn-icon btn-sm ml-auto" [attr.aria-label]="'Remove row ' + (i + 1) + ' of ' + f.label"
                              (click)="removeRow(f, i)"><app-icon name="trash" class="icon-crit" /></button>
                    }
                  </div>
                  <app-schema-form [schema]="f.schema.items!" [value]="row" [problems]="problemsUnder(f.name + '[' + i + ']')"
                                   [idPrefix]="idOf(f) + '-' + i" [label]="f.label + ' row ' + (i + 1)" [columns]="columns()" [steps]="steps()" [prompts]="prompts()" [buckets]="buckets()" [webhooks]="webhooks()" [documentTypes]="documentTypes()" [apiRequests]="apiRequests()"
                                   [disabled]="disabled()" (valueChange)="setRow(f, i, $event)" />
                </div>
              } @empty {
                <p class="text-xs text-[color:var(--text-muted)]">None yet.</p>
              }
              @for (message of ownProblems(f.name); track $index) {
                <p class="field-note text-crit-500" role="alert">{{ message }}</p>
              }
            </fieldset>
          }
          @case ('json') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [error]="errorOf(f)"
                       [hint]="(f.description ? f.description + ' ' : '') + 'As JSON: this setting takes a shape the form cannot draw.'">
              <textarea [id]="idOf(f)" class="input mono text-xs" rows="3" [value]="jsonText(f)" [disabled]="disabled()"
                        (input)="typeJson(f, $any($event.target).value)"></textarea>
            </app-field>
          }
          @case ('scalar') {
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [error]="errorOf(f)"
                       [hint]="(f.description ? f.description + ' ' : '') + 'Text, a number, true or false.'">
              <input [id]="idOf(f)" class="input" [value]="scalarText(current()[f.name])" [disabled]="disabled()"
                     (input)="set(f.name, coerceText(f, $any($event.target).value))" />
            </app-field>
          }
          @default {
            <!-- text, number, integer -- and the widget hints with no picker yet (api-request, bucket, user, ...). -->
            <app-field [label]="f.label" [for]="idOf(f)" [required]="f.required" [hint]="f.description" [error]="errorOf(f)">
              <input [id]="idOf(f)" class="input" [type]="f.kind === 'number' || f.kind === 'integer' ? 'number' : 'text'"
                     [attr.step]="f.kind === 'integer' ? 1 : null" [value]="textOf(f)" [disabled]="disabled()"
                     [attr.pattern]="f.schema.pattern ?? null" [attr.maxlength]="f.schema.maxLength ?? null" [attr.minlength]="f.schema.minLength ?? null"
                     [attr.min]="f.schema.minimum ?? null" [attr.max]="f.schema.maximum ?? null"
                     (input)="set(f.name, coerceText(f, $any($event.target).value))" />
            </app-field>
          }
        }
      }
    </div>
    }
  `,
})
export class SchemaForm {
  readonly schema = input.required<JsonSchema>();
  readonly value = input<Record<string, unknown> | null | undefined>(null);
  /** The server's problems below this object, each at a path relative to it ("columns", "rows[0].id"). */
  readonly problems = input<StepProblem[]>([]);
  /** Prefixes every control's id, so a nested form's ids stay unique and a label's `for` finds its box. */
  readonly idPrefix = input('cfg');
  /** What this object is called, for the names of a map's buttons. */
  readonly label = input('');
  /** The columns the step reads, when they can be told: what a column setting suggests. */
  readonly columns = input<string[]>([]);
  /** The keys of the steps before this one: what a step setting offers. */
  readonly steps = input<string[]>([]);
  /** MIG-245: the workspace's active prompts, what a prompt setting offers. */
  readonly prompts = input<PromptChoice[]>([]);
  /** MIG-346: what a webhook setting says when its schema says nothing. */
  readonly webhookHint = 'One of this workspace’s webhooks (Developers › API Clients).';
  /** MIG-346: the workspace's webhooks, what a webhook setting offers (those that cannot take a step's delivery disabled). */
  readonly webhooks = input<WebhookChoice[]>([]);
  /** MIG-321: the workspace's buckets, what a bucket setting offers. */
  readonly buckets = input<BucketChoice[]>([]);
  /** MIG-364: the workspace's document types, what a document-type setting offers. */
  readonly documentTypes = input<DocumentTypeChoice[]>([]);
  /** Owner #25: the workspace's saved API requests, what an api-request setting offers. */
  readonly apiRequests = input<ApiRequestChoice[]>([]);
  readonly apiRequestHint = 'One of this workspace’s saved API requests (Connections › API collections).';
  /** The requests by collection, in the order they came. */
  readonly apiRequestGroups = computed(() => {
    const groups: { collection: string; requests: ApiRequestChoice[] }[] = [];
    for (const r of this.apiRequests()) {
      const group = groups.find(g => g.collection === r.collection);
      if (group) group.requests.push(r); else groups.push({ collection: r.collection, requests: [r] });
    }
    return groups;
  });
  /** The environments of the request this form's requestId names: what an api-environment setting offers. */
  readonly environmentChoices = computed(() =>
    this.apiRequests().find(r => '' + r.id === '' + (this.current()['requestId'] ?? ''))?.environments ?? []);
  /** MIG-424: the workspace's schedules, what a schedule setting (Run pipeline's pipeline) offers. */
  readonly schedules = input<ScheduleChoice[]>([]);
  readonly scheduleHint = 'One of this workspace’s pipelines, by its schedule (Build › Pipelines › Schedules & triggers).';
  /** MIG-364: what a document-type setting says when its schema says nothing. */
  readonly documentTypeHint = 'One of this workspace’s document types (Documents › Document types).';
  readonly disabled = input(false);
  readonly valueChange = output<Record<string, unknown>>();

  readonly fields = computed(() => fieldsOf(this.schema()));
  /**
   * Each picker's options, by field name (owner 2026-10-27, "all select should be advance"): one stable list per select.
   * A saved value the lists do not hold is kept as an option and says why ("not an earlier step"), as the old select did.
   */
  readonly pickOptions = computed<Record<string, AdvancedOption[]>>(() => {
    const out: Record<string, AdvancedOption[]> = {};
    const kept = (list: AdvancedOption[], value: string, label: string, why: string): AdvancedOption[] =>
      value && !list.some(o => o.value === value) ? [...list, { value, label, description: why, badge: 'Not found', badgeTone: 'warn' }] : list;
    for (const f of this.fields()) {
      const now = this.textOf(f);
      switch (f.kind) {
        case 'enum':
          out[f.name] = f.options.map((o, i) => ({ value: String(i), label: this.optionLabel(f, i, o),
            description: f.optionLabels?.[i] && this.optionText(o) !== f.optionLabels[i] ? this.optionText(o) : undefined }));
          break;
        case 'step':
          out[f.name] = kept(this.steps().map(k => ({ value: k, label: k, mono: true })), now, now, 'Not an earlier step');
          break;
        case 'prompt':
          out[f.name] = kept(this.prompts().map(x => ({ value: '' + x.id, label: x.label, keywords: '' + x.id })), now, `Prompt ${now}`, 'Not an active prompt here');
          break;
        case 'webhook':
          out[f.name] = kept(this.webhooks().map(w => ({ value: '' + w.id, label: w.label, keywords: '' + w.id, disabled: !w.ready && now !== '' + w.id,
            badge: w.ready ? undefined : 'Not ready', badgeTone: 'warn' as const,
            description: w.ready ? undefined : 'Inactive, or not subscribed to run.step.sent' })), now, `Webhook ${now}`, 'Not one of this workspace\'s webhooks');
          break;
        case 'api-request':
          out[f.name] = kept(this.apiRequests().map(r => ({ value: '' + r.id, label: r.label.slice(r.collection.length + 3) || r.label, group: r.collection,
            sample: r.method, keywords: `${r.collection} ${r.method} ${r.id}`, disabled: !r.enabled && now !== '' + r.id,
            badge: r.enabled ? undefined : 'Disabled', badgeTone: 'neutral' as const })), now, `Request ${now}`, 'Not one of this workspace\'s saved requests');
          break;
        case 'api-environment':
          out[f.name] = kept(this.environmentChoices().map(e => ({ value: '' + e.id, label: e.label })), now, `Environment ${now}`, 'Not in the request\'s collection');
          break;
        case 'schedule':
          out[f.name] = kept(this.schedules().map(j => ({ value: '' + j.id, label: j.label, keywords: '' + j.id })), now, `Schedule ${now}`, 'Not one of this workspace\'s');
          break;
        case 'document-type':
          out[f.name] = kept(this.documentTypes().map(t => ({ value: '' + t.id, label: t.label, keywords: '' + t.id })), now, `Document type ${now}`, 'Not in this workspace');
          break;
        case 'reviewers': {
          const team = this.reviewersTeam(f);
          out[f.name + ':team'] = kept(this.teamChoices().map(t => ({ value: '' + t.teamId, label: t.name })), this.teamsState.loading() ? '' : team, `Team ${team}`,
            this.teamsState.loaded() ? 'Not in this workspace\'s list' : '');
          break;
        }
      }
    }
    return out;
  });
  private readonly injector = inject(Injector);
  /** The workspace's teams by name, read only when a form asks who reviews. */
  readonly teamChoices = signal<{ teamId: number; name: string }[]>([]);
  /** Owner 2026-10-27: the teams' read, so "No team yet" waits for an answer and a failure is said. */
  readonly teamsState = createLoadState(false);
  private teamsAsked = false;
  /** Reads the teams the first time a who-reviews setting is drawn. */
  readonly askTeams = effect(() => {
    if (this.teamsAsked || !this.fields().some(f => f.kind === 'reviewers')) return;
    this.teamsAsked = true;
    this.loadTeams();
  });

  loadTeams(): void {
    let api: TeamsApi;
    // A form drawn where no HTTP is provided (a test, a read-only preview) simply offers no teams.
    try { api = this.injector.get(TeamsApi); } catch { return; }
    this.teamsState.start();
    api.list().subscribe({
      next: r => {
        if (r.status && r.status !== 'SUCCESS') { this.teamsState.fail(r, 'The teams could not be read.'); return; }
        this.teamChoices.set((r.data ?? []).filter(t => t.status !== 'ARCHIVED').map(t => ({ teamId: t.teamId, name: t.name }))
          .sort((a, b) => a.name.localeCompare(b.name)));
        this.teamsState.done();
      },
      error: err => this.teamsState.fail(err, 'The teams could not be read.'),
    });
  }
  readonly isMap = computed(() => isMapSchema(this.schema()));
  readonly mapKind = computed<FieldKind>(() => mapValueKind(this.schema()));
  /** What this form last handed back, until the parent hands it a new value. */
  readonly current = linkedSignal<Record<string, unknown>>(() => ({ ...(this.value() ?? {}) }));
  /** A map's rows, in order, a half-typed name included (an object cannot hold two blank names). */
  readonly mapRows = linkedSignal<Record<string, unknown> | null | undefined, MapRow[]>({
    source: this.value,
    // The parent hands back what this form just emitted: the rows stay as they are, a blank new one included.
    computation: (value, previous) => previous && JSON.stringify(value ?? {}) === this.lastMap
      ? previous.value
      : Object.entries(value ?? {}).map(([key, v]) => ({ key, value: v })),
  });
  private lastMap = '';
  /** What a raw-JSON or list box holds as typed: a half-typed value is not reformatted under the cursor. */
  private readonly typed = signal<Record<string, string>>({});
  private readonly jsonErrors = signal<Record<string, string>>({});

  idOf(f: FieldSpec): string { return `${this.idPrefix()}-${f.name}`; }

  set(name: string, value: unknown): void {
    const next = withValue(this.current(), name, value);
    this.current.set(next);
    this.valueChange.emit(next);
  }

  /** UX review 2026-10-12: whether a list of fixed choices holds this one. */
  multiHas(f: FieldSpec, option: unknown): boolean {
    const value = this.current()[f.name];
    return Array.isArray(value) && value.includes(option);
  }

  /** A choice ticked or cleared: the list keeps the schema's order, and an empty list leaves the setting out (its default). */
  toggleMulti(f: FieldSpec, option: unknown, on: boolean): void {
    const value = this.current()[f.name];
    const held = new Set(Array.isArray(value) ? value : []);
    if (on) held.add(option); else held.delete(option);
    const next = f.options.filter(o => held.has(o));
    this.set(f.name, next.length ? next : undefined);
  }

  apiRequestListed(f: FieldSpec): boolean {
    return this.apiRequests().some(r => '' + r.id === this.textOf(f));
  }

  environmentListed(f: FieldSpec): boolean {
    return this.environmentChoices().some(e => '' + e.id === this.textOf(f));
  }

  scheduleListed(f: FieldSpec): boolean {
    return this.schedules().some(j => '' + j.id === this.textOf(f));
  }

  webhookListed(f: FieldSpec): boolean {
    return this.webhooks().some(w => '' + w.id === this.textOf(f));
  }

  documentTypeListed(f: FieldSpec): boolean {
    return this.documentTypes().some(t => '' + t.id === this.textOf(f));
  }

  promptListed(f: FieldSpec): boolean {
    return this.prompts().some(p => '' + p.id === this.textOf(f));
  }

  textOf(f: FieldSpec): string {
    const v = this.current()[f.name];
    return v === undefined || v === null ? '' : String(v);
  }

  scalarText(value: unknown): string {
    return value === undefined ? '' : value === null ? 'null' : String(value);
  }

  coerceText(f: FieldSpec, raw: string): unknown { return coerce(f.kind === 'column' || f.kind === 'bucket' ? 'text' : f.kind, raw); }

  optionText(option: unknown): string { return typeof option === 'string' ? option : JSON.stringify(option); }
  /** ZT-U8: an option as the screen says it (FAIL_TASK reads as "The step fails"); the value saved is the code. */
  optionLabel(f: FieldSpec, index: number, option: unknown): string { return f.optionLabels?.[index] ?? this.optionText(option); }

  private reviewersOf(f: FieldSpec): { kind?: string; value?: string } {
    const v = this.current()[f.name];
    return v && typeof v === 'object' ? (v as { kind?: string; value?: string }) : {};
  }
  /** '', 'role:TENANT_ADMIN', 'role:TENANT_USER' or 'team'. */
  reviewersChoice(f: FieldSpec): string {
    const r = this.reviewersOf(f);
    return r.kind === 'team' ? 'team' : r.kind === 'role' && r.value ? `role:${r.value}` : '';
  }
  reviewersTeam(f: FieldSpec): string {
    const r = this.reviewersOf(f);
    return r.kind === 'team' && r.value ? '' + r.value : '';
  }
  knownTeam(f: FieldSpec): boolean { return this.teamChoices().some(t => '' + t.teamId === this.reviewersTeam(f)); }
  pickReviewers(f: FieldSpec, choice: string): void {
    if (!choice) this.set(f.name, undefined);
    else if (choice === 'team') this.set(f.name, { kind: 'team', value: this.reviewersTeam(f) || '' });
    else this.set(f.name, { kind: 'role', value: choice.slice(5) });
  }
  pickTeam(f: FieldSpec, teamId: string): void { this.set(f.name, { kind: 'team', value: teamId }); }

  /** The enum's options are bound by index: a choice may be a number or true, which a <select> would turn into text. */
  choiceIndex(f: FieldSpec): string {
    const v = this.current()[f.name];
    const at = f.options.findIndex(o => JSON.stringify(o) === JSON.stringify(v));
    return at < 0 ? '' : String(at);
  }

  pick(f: FieldSpec, index: string): void {
    this.set(f.name, index === '' ? undefined : structuredClone(f.options[Number(index)]));
  }

  listText(f: FieldSpec): string {
    const typed = this.typed()[f.name];
    if (typed !== undefined) return typed;
    const v = this.current()[f.name];
    return Array.isArray(v) ? v.map(x => this.scalarText(x)).join('\n') : '';
  }

  typeList(f: FieldSpec, text: string): void {
    this.typed.update(t => ({ ...t, [f.name]: text }));
    const itemKind = f.kind === 'columns' ? 'text' : f.itemKind;
    const items = text.split('\n').map(line => line.trim()).filter(Boolean).map(line => coerce(itemKind, line));
    this.set(f.name, items);
  }

  /** The upstream columns a list of columns does not name yet. */
  unusedColumns(f: FieldSpec): string[] {
    const v = this.current()[f.name];
    const have = Array.isArray(v) ? v : [];
    return this.columns().filter(c => !have.includes(c));
  }

  addColumn(f: FieldSpec, column: string): void {
    const v = this.current()[f.name];
    const next = [...(Array.isArray(v) ? v : []), column];
    this.typed.update(t => ({ ...t, [f.name]: next.map(x => this.scalarText(x)).join('\n') }));
    this.set(f.name, next);
  }

  jsonText(f: FieldSpec): string {
    const typed = this.typed()[f.name];
    if (typed !== undefined) return typed;
    const v = this.current()[f.name];
    return v === undefined ? '' : JSON.stringify(v, null, 2);
  }

  typeJson(f: FieldSpec, text: string): void {
    this.typed.update(t => ({ ...t, [f.name]: text }));
    const parsed = parseJson(text);
    if (parsed.error) {
      this.jsonErrors.update(e => ({ ...e, [f.name]: `Not JSON: ${parsed.error}` }));
      return;
    }
    this.jsonErrors.update(e => { const { [f.name]: _gone, ...rest } = e; return rest; });
    this.set(f.name, parsed.value);
  }

  objectOf(f: FieldSpec): Record<string, unknown> {
    const v = this.current()[f.name];
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  }

  rowsOf(f: FieldSpec): Record<string, unknown>[] {
    const v = this.current()[f.name];
    return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  }

  /** A new row starts from its settings' defaults. */
  addRow(f: FieldSpec): void {
    const seed: Record<string, unknown> = {};
    for (const [name, property] of Object.entries(f.schema.items?.properties ?? {})) {
      if ('default' in property) seed[name] = structuredClone(property.default);
    }
    this.set(f.name, [...this.rowsOf(f), seed]);
  }

  removeRow(f: FieldSpec, index: number): void { this.set(f.name, this.rowsOf(f).filter((_, i) => i !== index)); }

  setRow(f: FieldSpec, index: number, row: Record<string, unknown>): void {
    this.set(f.name, this.rowsOf(f).map((r, i) => (i === index ? row : r)));
  }

  // ------------------------------------------------------------------------------------------ a map

  private emitMap(rows: MapRow[]): void {
    this.mapRows.set(rows);
    const out: Record<string, unknown> = {};
    for (const row of rows) if (row.key.trim() && row.value !== undefined) out[row.key.trim()] = row.value;
    this.lastMap = JSON.stringify(out);
    this.current.set(out);
    this.valueChange.emit(out);
  }

  setMapKey(index: number, key: string): void {
    this.emitMap(this.mapRows().map((r, i) => (i === index ? { ...r, key } : r)));
  }

  setMapValue(index: number, value: unknown): void {
    this.emitMap(this.mapRows().map((r, i) => (i === index ? { ...r, value } : r)));
  }

  mapCoerce(raw: string): unknown {
    const kind = this.mapKind();
    return kind === 'text' || kind === 'textarea' || kind === 'column' || kind === 'bucket' ? raw : coerce(kind, raw);
  }

  mapJson(row: MapRow): string { return row.value === undefined ? '' : JSON.stringify(row.value); }

  setMapJson(index: number, text: string): void {
    const parsed = parseJson(text);
    if (!parsed.error) this.setMapValue(index, parsed.value);
  }

  addMapRow(): void { this.emitMap([...this.mapRows(), { key: '', value: this.mapKind() === 'boolean' ? false : '' }]); }

  removeMapRow(index: number): void { this.emitMap(this.mapRows().filter((_, i) => i !== index)); }

  // ------------------------------------------------------------------------------------------ problems

  /** The problems at this very setting. */
  ownProblems(name: string): string[] {
    return this.problems().filter(p => p.field === name).map(p => p.message);
  }

  /** The problems below a setting, re-pathed for the form one level down. */
  problemsUnder(prefix: string): StepProblem[] {
    return this.problems()
      .filter(p => p.field.startsWith(`${prefix}.`) || p.field.startsWith(`${prefix}[`))
      .map(p => ({ field: p.field.slice(prefix.length).replace(/^\./, ''), message: p.message }));
  }

  /** The note under a box: a JSON box's own parse error first, then what the server said about it and below it. */
  errorOf(f: FieldSpec): string {
    const own = this.jsonErrors()[f.name];
    if (own) return own;
    const below = this.problemsUnder(f.name).map(p => `${p.field}: ${p.message}`);
    return [...this.ownProblems(f.name), ...below].join(' · ');
  }
}

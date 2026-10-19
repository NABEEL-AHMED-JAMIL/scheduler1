/**
 * A registry pipeline (a Legacy task of the Task Registry) and its payload fields, as Core's pipeline.json answers and
 * takes them, and the rules its select fields' choices keep. Owner #18 (2026-10-19): New / Edit registry task is a page
 * (task-registry/registry-task-editor.ts), not a dialog; the dialog that held this is gone and its model lives here.
 */

export interface PipelineField {
  pipelineFieldId?: number;
  /** An AI step (fieldType "ai"): the prompt, which earlier fields feed its variables, what a failure does. */
  promptId?: number | null;
  promptName?: string | null;
  variableMap?: string | null;
  onError?: 'fail' | 'continue' | null;
  runIn?: 'server' | 'worker' | null;
  tagKey: string;
  tagParent?: string | null;
  label: string;
  fieldType: string;
  required: boolean;
  defaultValue?: string | null;
  helpText?: string | null;
  fieldOptions?: string | null;
  position: number;
}

export interface Pipeline {
  /** The editor's name; the author was already carried. */
  updatedByName?: string | null;

  pipelineKey?: number;
  pipelineId: string;
  pipelineName: string;
  /** The topic (source task type) it publishes on; the server names it on the way out. */
  sourceTaskTypeId?: number | null;
  topicName?: string | null;
  kafkaTopic?: string | null;
  /** The Kafka profile the topic lives on: what the topic link opens. */
  kafkaConnectionProfileId?: number | null;
  description?: string | null;
  status?: string;
  dateCreated?: string;
  createdBy?: number;
  createdByName?: string | null;
  /**
   * Absent, not null, when the server has nothing: its DTOs omit null fields. A list row
   * arrives without them and with the two counts instead; the fields are fetched when the
   * row is opened (pipeline.json/fields) and kept on the row from then on.
   */
  fields?: PipelineField[];
  fieldCount?: number;
  requiredCount?: number;
}

/** The set the server accepts; anything else is silently stored as text. */
export const FIELD_TYPES = ['text', 'textarea', 'number', 'url', 'select', 'checkbox', 'date', 'ai'];

/**
 * One entry in a select: what the task stores, and what the operator reads.
 *
 * These were the same string until 2026-09-14. A dropdown's only storage is the free-text
 * `field_options` column, one choice per line, and `<option [value]="choice">{{ choice }}</option>`
 * bound that one line to both halves -- so an author had to choose between a cryptic dropdown
 * (type the worker's token) and an unparseable payload (type the human label). Nothing else in
 * the platform reads the column, which is why the split could be made here rather than in a new
 * table or a new column.
 */
export interface FieldChoice {
  /** What lands in the task's XML tag, and what the worker receives. */
  value: string;
  /** What the operator picks from. Falls back to the value when the author wrote only one. */
  label: string;
}

/**
 * Splits the stored text into one trimmed line per choice.
 *
 * The comma branch is a read-side tolerance for data the ETL demo seeder wrote
 * (`etl_demo_catalogue.py`, nine select fields, e.g. `options="records,lines"`). That string was
 * posted verbatim and stored verbatim, and a newline-only split turned the whole thing into a
 * single choice reading "records,lines" -- which no default ever matched, so the dropdown opened
 * blank and the only thing in it was junk. The guard is deliberately narrow so it cannot eat a
 * legitimate single choice: it needs exactly one line, no `=` on it (an author writing the
 * value/label form is not writing a comma list), and no whitespace anywhere in it. That last
 * condition is what keeps a real one-line choice like `Doe, John` intact -- machine-written token
 * lists never carry a space, and human labels almost always do.
 */
function choiceLines(raw: string): string[] {
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 1 && !lines[0].includes('=') && lines[0].includes(',')
      && !/\s/.test(lines[0])) {
    return lines[0].split(',').map(line => line.trim()).filter(Boolean);
  }
  return lines;
}

/**
 * Reads the stored choices for a select.
 *
 * The format is one choice per line, and on each line the FIRST `=` optionally separates the
 * stored value from the displayed label. Two properties made that the format worth having over a
 * JSON array or a second column:
 *
 * It is a strict superset of what is already in the database, so nothing had to be migrated. A
 * line with no `=` is the legacy case and is returned exactly as it was read, as both halves --
 * which is not a nicety but a hard requirement: `task-edit.ts` seeds a select from the task's
 * already-saved tag and deletes that tag when the control comes back blank, so the day a legacy
 * option stops resolving to itself is the day every existing task on that pipeline opens blank
 * and silently drops its answer on save.
 *
 * And splitting at the first `=` only, with the whole remainder taken as the label, means a label
 * may contain `=`, `:` or `,` freely -- `eq=Equals (a = b)` reads correctly with no escaping. The
 * one thing the format cannot represent is a `=` inside a *value*; rather than invent an escape
 * character (which would have to reinterpret backslashes already sitting in legacy rows, trading
 * a rare break for a rarer one), the dialog refuses that input by name and the restriction is
 * written down in V36's column comment.
 */
export function parseFieldChoices(fieldOptions: string | null | undefined): FieldChoice[] {
  return choiceLines(fieldOptions ?? '').map(line => {
    const separator = line.indexOf('=');
    // Legacy branch: no separator at all, or a line starting with one (an empty value is not a
    // value). Either way the whole line is what it has always been -- value and label alike.
    if (separator <= 0) return { value: line, label: line };
    const value = line.slice(0, separator).trim();
    const label = line.slice(separator + 1).trim();
    return { value, label: label || value };
  });
}

/**
 * Writes choices back in the format above.
 *
 * A choice whose label equals its value is written as a bare line rather than `x=x`, so a form
 * whose options were plain before and were never edited round-trips to byte-identical text. That
 * matters more than it looks: the alternative rewrites every legacy row on the first unrelated
 * save, which would make a diff of the column useless for telling apart "somebody changed the
 * choices" from "somebody opened the form".
 */
export function serializeFieldChoices(choices: FieldChoice[]): string {
  return choices
    .map(choice => ({
      value: String(choice?.value ?? '').trim(),
      label: String(choice?.label ?? '').trim(),
    }))
    .filter(choice => choice.value || choice.label)
    .map(choice => {
      // Either half alone is a complete choice; the missing one is the other.
      const value = choice.value || choice.label;
      const label = choice.label || choice.value;
      return label === value ? value : `${value}=${label}`;
    })
    .join('\n');
}

/**
 * The rules a select's choices have to satisfy, mirroring PipelineServiceImpl.validate.
 *
 * All three describe a form that saves happily today and then misbehaves on somebody else's
 * screen, which is why they are rules and not hints. A select with no choices offers the operator
 * nothing but "None", and if it is also required the task can never be made valid. Two choices
 * sharing a value mean the second is unreachable -- and the task screen tracks its options by
 * index precisely because this used to collide. A default that is not among the values is the
 * quiet one: the control is seeded with it, `required` passes because a non-empty string is
 * non-empty, no <option> matches so the dropdown paints blank, and the operator saves a value
 * they were never shown.
 *
 * Takes the wire shape rather than the form group so both sides check the same bytes.
 */
export function validateSelectChoices(rows: PipelineField[]): string | null {
  for (const field of rows) {
    if (field.fieldType !== 'select') continue;
    const name = field.label?.trim() || field.tagKey?.trim() || 'dropdown';
    const choices = parseFieldChoices(field.fieldOptions);
    if (!choices.length) {
      return `The "${name}" dropdown has no choices. Add at least one, or change its type.`;
    }
    const values = new Set<string>();
    for (const choice of choices) {
      if (values.has(choice.value)) {
        return `"${name}" offers "${choice.value}" twice. Each choice needs its own value.`;
      }
      values.add(choice.value);
    }
    const fallback = (field.defaultValue ?? '').trim();
    if (fallback && !values.has(fallback)) {
      return `"${name}" defaults to "${fallback}", which is not one of its choices. `
        + 'A task would open on a blank dropdown and still send that value.';
    }
  }
  return null;
}


/**
 * MIG-347: a pipeline's run parameters as Core declares them (PipelineDefinition.parameters) -- what "Run with…", a
 * backfill and the customer API give a run, and what its steps read as {{param.name}}. The checks here are the server's
 * (RunParameters), so a person sees a mistake before sending; the server checks again.
 */
export type ParameterType = 'date' | 'datetime' | 'text' | 'number' | 'boolean' | 'choice';

export const PARAMETER_TYPES: { id: ParameterType; label: string }[] = [
  { id: 'date', label: 'Date' }, { id: 'datetime', label: 'Date and time' }, { id: 'text', label: 'Text' },
  { id: 'number', label: 'Number' }, { id: 'boolean', label: 'Yes or no' }, { id: 'choice', label: 'Choice' },
];

export interface RunParameter {
  name: string;
  type: ParameterType;
  label?: string | null;
  description?: string | null;
  required?: boolean | null;
  default?: unknown;
  choices?: string[] | null;
}

/** A run's values by parameter name, as the inputs hold them (text). */
export type ParameterValues = Record<string, string>;

const NAME = /^[a-z][a-z0-9_]{0,39}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const WALL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
export const MAX_TEXT = 500;

/** The declared parameters in an answer (aiModelChoice's, a backfill preview's); none when it has none. */
export function parametersOf(data: unknown): RunParameter[] {
  const list = data && typeof data === 'object' ? (data as { parameters?: unknown }).parameters : null;
  if (!Array.isArray(list)) return [];
  return list.filter((p): p is RunParameter => !!p && typeof p === 'object' && typeof (p as RunParameter).name === 'string'
    && NAME.test((p as RunParameter).name));
}

/** How a parameter is named to a person: its label, else its name. */
export function parameterLabel(p: RunParameter): string {
  return (p.label ?? '').trim() || p.name;
}

/** The default as an input holds it ('' for none). */
export function defaultText(p: RunParameter): string {
  if (p.default === null || p.default === undefined) return '';
  if (p.type === 'datetime') return String(p.default).slice(0, 16);
  return String(p.default);
}

/** Each parameter's starting value: its default. */
export function initialValues(params: RunParameter[]): ParameterValues {
  const out: ParameterValues = {};
  for (const p of params) out[p.name] = defaultText(p);
  return out;
}

/** What is wrong with one value, in the server's words; '' when it stands. A blank value takes the default. */
export function valueProblem(p: RunParameter, raw: string | null | undefined): string {
  const text = String(raw ?? '');
  const value = p.type === 'text' ? text : text.trim();
  if (!value && p.type !== 'text') {
    return p.required && defaultText(p) === '' ? 'Required.' : '';
  }
  if (p.type === 'text' && !text && p.required && defaultText(p) === '') return 'Required.';
  switch (p.type) {
    case 'date': return DAY.test(value) && !Number.isNaN(Date.parse(value)) ? '' : 'A date, as 2026-10-01.';
    case 'datetime': return WALL.test(value) ? '' : 'A date and time, as 2026-10-01T09:30.';
    case 'number': return value !== '' && Number.isFinite(Number(value)) ? '' : 'A number.';
    case 'boolean': return value === 'true' || value === 'false' ? '' : 'Yes or no.';
    case 'choice': return (p.choices ?? []).includes(value) ? '' : `One of ${(p.choices ?? []).join(', ')}.`;
    default:
      if (text.length > MAX_TEXT) return `At most ${MAX_TEXT} characters.`;
      if (text.includes('{{')) return "Text without '{{'.";
      return /[\u0000-\u0008\u000a-\u001f]/.test(text) ? 'One line of text.' : '';
  }
}

/** Every value's problem by name; empty when all stand. */
export function valueProblems(params: RunParameter[], values: ParameterValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of params) {
    const problem = valueProblem(p, values[p.name]);
    if (problem) out[p.name] = problem;
  }
  return out;
}

/**
 * What a request sends: only values that differ from the default (a blank one takes it), as text -- the server normalises
 * each to its type. Null when nothing differs, so a run with the defaults sends none.
 */
export function valuesBody(params: RunParameter[], values: ParameterValues): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const p of params) {
    const raw = values[p.name] ?? '';
    const value = p.type === 'text' ? raw : raw.trim();
    if (value === '' && p.type !== 'text') continue;
    if (value === defaultText(p)) continue;
    out[p.name] = p.type === 'datetime' && value.length === 16 ? `${value}:00` : value;
  }
  return Object.keys(out).length ? out : null;
}

/** "region = south, since = 2026-10-01": a run's values in a sentence (the backfill list, a toast). */
export function valuesText(values: Record<string, unknown> | null | undefined): string {
  if (!values) return '';
  return Object.entries(values).map(([k, v]) => `${k} = ${v}`).join(', ');
}

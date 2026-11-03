/**
 * Reports redesign, feature 14: the designer's rule builder for "Show only when". The builder edits rows of
 * field · test · value, joined by all or any, and writes the same safe expression media-service parses
 * (`reportstudio/figures/expr`, the conditional's `when`), so neither the template schema nor the renderer changes.
 *
 * Text to rows goes through a parser of the server's grammar (recursive descent, the same precedence, the same closed list of
 * functions). Only expressions whose every part is a row the builder can show come back as rows; anything else (arithmetic,
 * not, a mix of and/or without brackets, a function other than contains/starts_with/ends_with) is refused, so the builder
 * never rewrites a hand-written expression it does not understand: it stays editable as text.
 *
 * The evaluator mirrors the server's three-valued rules (`Node`, `Values`) for what the builder writes, so the designer can
 * say "shows for 4 of 14 test records" from the test sample; the server stays the judge when the report is made.
 */

/** A parsed expression (the server's Node kinds). `paren` marks a part written in brackets. */
export type Expr =
  | { k: 'lit'; v: string | number | boolean | null; paren?: boolean }
  | { k: 'path'; steps: (string | number)[]; text: string; paren?: boolean }
  | { k: 'not'; e: Expr; paren?: boolean }
  | { k: 'neg'; e: Expr; paren?: boolean }
  | { k: 'logic'; and: boolean; l: Expr; r: Expr; paren?: boolean }
  | { k: 'cmp'; op: '=' | '!=' | '<' | '<=' | '>' | '>='; l: Expr; r: Expr; paren?: boolean }
  | { k: 'null'; e: Expr; negated: boolean; paren?: boolean }
  | { k: 'in'; e: Expr; options: Expr[]; negated: boolean; paren?: boolean }
  | { k: 'arith'; op: string; l: Expr; r: Expr; paren?: boolean }
  | { k: 'call'; fn: string; args: Expr[]; paren?: boolean };

export class ExprError extends Error {
  constructor(message: string, readonly at: number) { super(message); }
}

/** The functions an expression may call, with their least and most arguments (media's Functions.Fn). */
const FUNCTIONS: Record<string, [number, number]> = {
  is_null: [1, 1], coalesce: [1, 16], if: [3, 3], abs: [1, 1], round: [1, 2], min: [1, 16], max: [1, 16], lower: [1, 1],
  upper: [1, 1], len: [1, 1], contains: [2, 2], starts_with: [2, 2], ends_with: [2, 2], number: [1, 1], text: [1, 1], date: [1, 1],
  days_between: [2, 2],
};
const MAX_LENGTH = 2000;
const MAX_DEPTH = 32;
const MAX_PATH_STEPS = 16;
const MAX_LIST = 100;
const NUMBER_TEXT = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d{1,3})?$/;

const nameStart = (c: string) => c === '_' || /^[A-Za-z]$/.test(c);
const namePart = (c: string) => nameStart(c) || /^[0-9]$/.test(c);

/** Text to an expression tree, refusing what media-service refuses; throws ExprError with the character it stopped at. */
export function parseExpression(text: string): Expr {
  if (text == null || !text.trim()) throw new ExprError('The expression is empty.', 0);
  if (text.length > MAX_LENGTH) throw new ExprError(`The expression is ${text.length} characters; the most is ${MAX_LENGTH}.`, MAX_LENGTH);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code < 32 || (code >= 127 && code < 160)) && text[i] !== '\n' && text[i] !== '\r' && text[i] !== '\t') {
      throw new ExprError(`The expression has a control character at character ${i + 1}.`, i);
    }
  }
  const p = new ExprParser(text);
  const node = p.or();
  p.space();
  if (p.pos < text.length) throw p.error(`Unexpected '${p.snippet()}'`);
  return node;
}

class ExprParser {
  pos = 0;
  private depth = 0;
  constructor(private readonly text: string) {}

  or(): Expr {
    let left = this.and();
    while (this.word('or') || this.symbol('||')) left = { k: 'logic', and: false, l: left, r: this.and() };
    return left;
  }

  private and(): Expr {
    let left = this.not();
    while (this.word('and') || this.symbol('&&')) left = { k: 'logic', and: true, l: left, r: this.not() };
    return left;
  }

  private not(): Expr {
    if (this.word('not') || (this.peekSymbol('!') && !this.peekSymbol('!=') && this.symbol('!'))) {
      this.enter();
      const e = this.not();
      this.leave();
      return { k: 'not', e };
    }
    return this.compare();
  }

  private compare(): Expr {
    const left = this.sum();
    let result: Expr = left;
    if (this.word('is')) {
      const negated = this.word('not');
      if (!this.word('null')) throw this.error("Expected 'null' after 'is'");
      result = { k: 'null', e: left, negated };
    } else if (this.peekWord('not') || this.peekWord('in')) {
      const save = this.pos;
      const negated = this.word('not');
      if (this.word('in')) result = { k: 'in', e: left, options: this.list(), negated };
      else this.pos = save;
    } else {
      const op = this.comparison();
      if (op) {
        const right = this.sum();
        result = right.k === 'lit' && right.v === null && (op === '=' || op === '!=')
          ? { k: 'null', e: left, negated: op === '!=' }
          : { k: 'cmp', op, l: left, r: right };
      }
    }
    if (result !== left && this.comparison()) throw this.error("Comparisons cannot be chained; join them with 'and'");
    return result;
  }

  private comparison(): '=' | '!=' | '<' | '<=' | '>' | '>=' | null {
    this.space();
    for (const op of ['==', '!=', '<>', '<=', '>=', '=', '<', '>']) {
      if (this.text.startsWith(op, this.pos)) {
        this.pos += op.length;
        return op === '==' ? '=' : op === '<>' ? '!=' : (op as '=' | '!=' | '<' | '<=' | '>' | '>=');
      }
    }
    return null;
  }

  private list(): Expr[] {
    if (!this.symbol('(')) throw this.error("Expected '(' after 'in'");
    this.enter();
    const options: Expr[] = [];
    do {
      if (options.length >= MAX_LIST) throw this.error(`An 'in' list has at most ${MAX_LIST} values`);
      options.push(this.or());
    } while (this.symbol(','));
    if (!this.symbol(')')) throw this.error("Expected ')' to close the 'in' list");
    this.leave();
    return options;
  }

  private sum(): Expr {
    let left = this.product();
    for (;;) {
      if (this.symbol('+')) left = { k: 'arith', op: '+', l: left, r: this.product() };
      else if (this.symbol('-')) left = { k: 'arith', op: '-', l: left, r: this.product() };
      else return left;
    }
  }

  private product(): Expr {
    let left = this.unary();
    for (;;) {
      const op = this.symbol('*') ? '*' : this.symbol('/') ? '/' : this.symbol('%') ? '%' : null;
      if (!op) return left;
      left = { k: 'arith', op, l: left, r: this.unary() };
    }
  }

  private unary(): Expr {
    if (this.symbol('-')) {
      this.enter();
      const e = this.unary();
      this.leave();
      return { k: 'neg', e };
    }
    return this.primary();
  }

  private primary(): Expr {
    this.space();
    const at = this.pos;
    if (this.pos >= this.text.length) throw this.error('The expression ends too early');
    const c = this.text[this.pos];
    if (c === '(') {
      this.pos++;
      this.enter();
      const inner = this.or();
      this.leave();
      if (!this.symbol(')')) throw this.error("Expected ')'");
      return { ...inner, paren: true };
    }
    if (c === "'" || c === '"') return { k: 'lit', v: this.string() };
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(this.text[this.pos + 1] ?? ''))) return { k: 'lit', v: this.number() };
    if (nameStart(c)) {
      const name = this.name();
      const lower = name.toLowerCase();
      this.space();
      const call = this.text[this.pos] === '(';
      if (!call) {
        if (lower === 'true') return { k: 'lit', v: true };
        if (lower === 'false') return { k: 'lit', v: false };
        if (lower === 'null') return { k: 'lit', v: null };
        return this.path(at, name);
      }
      const fn = FUNCTIONS[lower];
      if (!fn) throw new ExprError(`'${name}' is not a function an expression may call.`, at);
      return { k: 'call', fn: lower, args: this.args(lower, fn, at) };
    }
    throw this.error(`Unexpected '${this.snippet()}'`);
  }

  private args(id: string, [min, max]: [number, number], at: number): Expr[] {
    this.pos++;
    this.enter();
    const args: Expr[] = [];
    if (!this.symbol(')')) {
      do {
        if (args.length >= max) throw new ExprError(`${id}() takes at most ${max} values.`, at);
        args.push(this.or());
      } while (this.symbol(','));
      if (!this.symbol(')')) throw this.error(`Expected ')' to close ${id}(`);
    }
    this.leave();
    if (args.length < min) throw new ExprError(`${id}() needs at least ${min} value${min === 1 ? '' : 's'}.`, at);
    return args;
  }

  private path(at: number, first: string): Expr {
    const steps: (string | number)[] = [first];
    while (this.pos < this.text.length) {
      const c = this.text[this.pos];
      if (c === '.') {
        this.pos++;
        if (this.pos >= this.text.length || !nameStart(this.text[this.pos])) throw this.error("Expected a name after '.'");
        steps.push(this.name());
      } else if (c === '[') {
        this.pos++;
        this.space();
        if (this.text[this.pos] === "'" || this.text[this.pos] === '"') steps.push(this.string());
        else {
          const start = this.pos;
          while (this.pos < this.text.length && /[0-9]/.test(this.text[this.pos])) this.pos++;
          if (start === this.pos || this.pos - start > 6) throw this.error('Expected a list position or a quoted name inside [ ]');
          steps.push(Number(this.text.slice(start, this.pos)));
        }
        if (!this.symbol(']')) throw this.error("Expected ']'");
      } else break;
      if (steps.length > MAX_PATH_STEPS) throw new ExprError(`A path has at most ${MAX_PATH_STEPS} steps.`, at);
    }
    const end = this.pos;
    this.space();
    if (this.text[this.pos] === '(') {
      throw new ExprError(`Only the listed functions can be called; '${this.text.slice(at, this.pos).trim()}' is a path.`, at);
    }
    return { k: 'path', steps, text: this.text.slice(at, end).trim() };
  }

  private string(): string {
    const quote = this.text[this.pos];
    const start = this.pos;
    this.pos++;
    let out = '';
    while (this.pos < this.text.length) {
      const c = this.text[this.pos++];
      if (c === quote) return out;
      if (c === '\\') {
        if (this.pos >= this.text.length) break;
        const e = this.text[this.pos++];
        if (e === '\\' || e === "'" || e === '"') out += e;
        else if (e === 'n') out += '\n';
        else if (e === 't') out += '\t';
        else throw new ExprError(`Unknown escape '\\${e}' in a text.`, this.pos - 2);
      } else out += c;
    }
    throw new ExprError(`A text is not closed: it starts at character ${start + 1}.`, start);
  }

  private number(): number {
    const start = this.pos;
    const digits = () => { while (this.pos < this.text.length && /[0-9]/.test(this.text[this.pos])) this.pos++; };
    digits();
    if (this.text[this.pos] === '.') { this.pos++; digits(); }
    if (this.text[this.pos] === 'e' || this.text[this.pos] === 'E') {
      let e = this.pos + 1;
      if (this.text[e] === '+' || this.text[e] === '-') e++;
      const d = e;
      while (e < this.text.length && /[0-9]/.test(this.text[e])) e++;
      if (e > d) this.pos = e;
    }
    if (this.pos < this.text.length && nameStart(this.text[this.pos])) throw this.error('A number runs into a name');
    const literal = this.text.slice(start, this.pos);
    const n = Number(literal);
    if (!NUMBER_TEXT.test(literal) || !Number.isFinite(n)) throw new ExprError(`'${literal}' is not a number this language reads.`, start);
    return n;
  }

  private name(): string {
    const start = this.pos;
    while (this.pos < this.text.length && namePart(this.text[this.pos])) this.pos++;
    if (this.pos - start > 128) throw new ExprError('A name is longer than 128 characters.', start);
    return this.text.slice(start, this.pos);
  }

  private word(keyword: string): boolean {
    if (!this.peekWord(keyword)) return false;
    this.pos += keyword.length;
    return true;
  }

  private peekWord(keyword: string): boolean {
    this.space();
    const end = this.pos + keyword.length;
    return end <= this.text.length && this.text.slice(this.pos, end).toLowerCase() === keyword
      && (end === this.text.length || !namePart(this.text[end]));
  }

  private symbol(s: string): boolean {
    if (!this.peekSymbol(s)) return false;
    this.pos += s.length;
    return true;
  }

  private peekSymbol(s: string): boolean {
    this.space();
    return this.text.startsWith(s, this.pos);
  }

  space(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos])) this.pos++;
  }

  private enter(): void {
    if (++this.depth > MAX_DEPTH) throw new ExprError(`The expression is nested more than ${MAX_DEPTH} deep.`, this.pos);
  }

  private leave(): void { this.depth--; }

  snippet(): string { return this.text.slice(this.pos, this.pos + 12); }

  error(message: string): ExprError { return new ExprError(`${message} at character ${this.pos + 1}.`, this.pos); }
}

// ---------------------------------------------------------------------------------------------------------------- rows

export type RuleTest = 'eq' | 'ne' | 'in' | 'notIn' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'empty' | 'notEmpty' | 'contains'
  | 'startsWith' | 'endsWith';
export type RuleValue = string | number | boolean;
export interface RuleRow { field: string; test: RuleTest; values: RuleValue[]; }
export interface RuleSet { join: 'all' | 'any'; rows: RuleRow[]; }

/** The tests, in the order the builder offers them, with their words and how many values each takes (-1: one or more). */
export const RULE_TESTS: { id: RuleTest; label: string; values: number; kinds: ('number' | 'text' | 'boolean' | 'date')[] }[] = [
  { id: 'eq', label: 'is', values: 1, kinds: ['number', 'text', 'boolean', 'date'] },
  { id: 'ne', label: 'is not', values: 1, kinds: ['number', 'text', 'boolean', 'date'] },
  { id: 'in', label: 'is one of', values: -1, kinds: ['number', 'text', 'date'] },
  { id: 'notIn', label: 'is none of', values: -1, kinds: ['number', 'text', 'date'] },
  { id: 'gt', label: 'is above', values: 1, kinds: ['number', 'date'] },
  { id: 'gte', label: 'is at least', values: 1, kinds: ['number', 'date'] },
  { id: 'lt', label: 'is below', values: 1, kinds: ['number', 'date'] },
  { id: 'lte', label: 'is at most', values: 1, kinds: ['number', 'date'] },
  { id: 'between', label: 'is between', values: 2, kinds: ['number', 'date'] },
  { id: 'empty', label: 'is empty', values: 0, kinds: ['number', 'text', 'boolean', 'date'] },
  { id: 'notEmpty', label: 'is not empty', values: 0, kinds: ['number', 'text', 'boolean', 'date'] },
  { id: 'contains', label: 'contains', values: 1, kinds: ['text'] },
  { id: 'startsWith', label: 'starts with', values: 1, kinds: ['text'] },
  { id: 'endsWith', label: 'ends with', values: 1, kinds: ['text'] },
];
const CMP: Record<string, RuleTest> = { '=': 'eq', '!=': 'ne', '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte' };
const CMP_OUT: Partial<Record<RuleTest, string>> = { eq: '=', ne: '!=', lt: '<', lte: '<=', gt: '>', gte: '>=' };
const CALLS: Record<string, RuleTest> = { contains: 'contains', starts_with: 'startsWith', ends_with: 'endsWith' };
const CALLS_OUT: Partial<Record<RuleTest, string>> = { contains: 'contains', startsWith: 'starts_with', endsWith: 'ends_with' };
/** A field the builder writes: a path the server reads as a path and nothing else. */
const FIELD = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*|\[[0-9]{1,6}\]|\['([^'\\]|\\.){1,100}'\])*$/;

/** True when the text is a data path the builder may write as a field (primary.summary.rate, item.stage, rows[0].x). */
export function isRuleField(field: string): boolean {
  if (!FIELD.test(field)) return false;
  try {
    const e = parseExpression(field);
    return e.k === 'path' && e.text === field;
  } catch {
    return false;
  }
}

/** A value as the language writes it: numbers plainly, true/false, texts in single quotes with \\ and \' escaped. */
export function literal(v: RuleValue): string {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new ExprError('A value is not a finite number.', -1);
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\t/g, '\\t')}'`;
}

/** The problem with a row, or null when the builder can write it. */
export function rowProblem(r: RuleRow): string | null {
  if (!r.field.trim()) return 'Choose a field.';
  if (!isRuleField(r.field)) return `${r.field} is not a data path (letters, digits and _ joined by dots).`;
  const t = RULE_TESTS.find(x => x.id === r.test);
  if (!t) return 'Choose a test.';
  if (t.values === 0) return null;
  if (t.values === -1 ? r.values.length < 1 : r.values.length !== t.values) return t.values === -1 ? 'Give at least one value.' : 'Give the value.';
  for (let k = 0; k < r.values.length; k++) if (r.values[k] === undefined || r.values[k] === null) return 'Give the value.';
  if (r.values.length > MAX_LIST) return `At most ${MAX_LIST} values.`;
  if (r.values.some(v => typeof v === 'string' && v.length > 1000)) return 'A value is longer than 1,000 characters.';
  if (['contains', 'startsWith', 'endsWith'].includes(r.test) && typeof r.values[0] !== 'string') return 'Contains compares texts.';
  if (r.values.some(v => typeof v === 'number' && !Number.isFinite(v))) return 'A value is not a number.';
  return null;
}

function rowText(r: RuleRow): string {
  const op = CMP_OUT[r.test];
  if (op) return `${r.field} ${op} ${literal(r.values[0])}`;
  switch (r.test) {
    case 'in': case 'notIn': return `${r.field} ${r.test === 'notIn' ? 'not in' : 'in'} (${r.values.map(literal).join(', ')})`;
    case 'between': return `(${r.field} >= ${literal(r.values[0])} and ${r.field} <= ${literal(r.values[1])})`;
    case 'empty': return `${r.field} is null`;
    case 'notEmpty': return `${r.field} is not null`;
    default: return `${CALLS_OUT[r.test]}(${r.field}, ${literal(r.values[0])})`;
  }
}

/** The rows as one expression; throws ExprError when a row is not complete. */
export function toExpression(set: RuleSet): string {
  if (!set.rows.length) throw new ExprError('Add a rule.', -1);
  for (const r of set.rows) {
    const p = rowProblem(r);
    if (p) throw new ExprError(p, -1);
  }
  const text = set.rows.map(rowText).join(set.join === 'any' ? ' or ' : ' and ');
  if (text.length > MAX_LENGTH) throw new ExprError(`The rules are ${text.length} characters as an expression; the most is ${MAX_LENGTH}.`, -1);
  return text;
}

function literalValue(e: Expr): RuleValue | undefined {
  if (e.k === 'lit' && e.v !== null && !e.paren) return e.v;
  if (e.k === 'neg' && !e.paren && e.e.k === 'lit' && typeof e.e.v === 'number' && !e.e.paren) return -e.e.v;
  return undefined;
}

function fieldOf(e: Expr): string | null {
  return e.k === 'path' && !e.paren ? e.text : null;
}

function rowOf(e: Expr): RuleRow | null {
  if (e.k === 'cmp' && !e.paren) {
    const field = fieldOf(e.l);
    const v = literalValue(e.r);
    return field && v !== undefined ? { field, test: CMP[e.op], values: [v] } : null;
  }
  if (e.k === 'null' && !e.paren) {
    const field = fieldOf(e.e);
    return field ? { field, test: e.negated ? 'notEmpty' : 'empty', values: [] } : null;
  }
  if (e.k === 'in' && !e.paren) {
    const field = fieldOf(e.e);
    const values = e.options.map(literalValue);
    return field && values.every(v => v !== undefined) ? { field, test: e.negated ? 'notIn' : 'in', values: values as RuleValue[] } : null;
  }
  if (e.k === 'call' && !e.paren && CALLS[e.fn]) {
    const field = fieldOf(e.args[0]);
    const v = literalValue(e.args[1]);
    return field && typeof v === 'string' ? { field, test: CALLS[e.fn], values: [v] } : null;
  }
  // (f >= a and f <= b): between, only as the builder writes it -- in brackets, one field, at least then at most.
  if (e.k === 'logic' && e.paren && e.and && e.l.k === 'cmp' && e.r.k === 'cmp' && !e.l.paren && !e.r.paren
      && e.l.op === '>=' && e.r.op === '<=') {
    const a = fieldOf(e.l.l);
    const b = fieldOf(e.r.l);
    const lo = literalValue(e.l.r);
    const hi = literalValue(e.r.r);
    return a && a === b && lo !== undefined && hi !== undefined ? { field: a, test: 'between', values: [lo, hi] } : null;
  }
  return null;
}

function chain(e: Expr, and: boolean): Expr[] {
  return e.k === 'logic' && !e.paren && e.and === and ? [...chain(e.l, and), ...chain(e.r, and)] : [e];
}

/** The rows an expression is, or null when any part of it is not a row the builder can show (it then stays as text). */
export function toRules(e: Expr): RuleSet | null {
  const single = rowOf(e);
  if (single) return { join: 'all', rows: [single] };
  // A whole expression in brackets that is not a between reads as the same rows.
  const root: Expr = e.k === 'logic' && e.paren ? { ...e, paren: false } : e;
  if (root.k !== 'logic') return null;
  const rows = chain(root, root.and).map(rowOf);
  return rows.every(r => r !== null) ? { join: root.and ? 'all' : 'any', rows: rows as RuleRow[] } : null;
}

/** An expression's text as rows, or null (it does not parse, or it is not made of rows). */
export function rulesOf(text: string): RuleSet | null {
  try {
    return toRules(parseExpression(text));
  } catch {
    return null;
  }
}

/** The structured condition ({left, operator, right}) of a conditional as rows, or null. */
export function rulesOfCondition(c: { left?: string; operator?: string; right?: unknown } | null | undefined): RuleSet | null {
  if (!c || typeof c.left !== 'string' || !isRuleField(c.left)) return null;
  const right = c.right;
  const scalar = (v: unknown): v is RuleValue => typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
  // A condition not finished yet (no value) is a row waiting for its value.
  const one = (test: RuleTest): RuleSet | null => (scalar(right) ? { join: 'all', rows: [{ field: c.left!, test, values: [right] }] }
    : right === undefined ? { join: 'all', rows: [{ field: c.left!, test, values: [] }] } : null);
  switch ((c.operator ?? '').toLowerCase()) {
    case 'eq': return right === null || right === undefined ? { join: 'all', rows: [{ field: c.left, test: 'empty', values: [] }] } : one('eq');
    case 'ne': return right === null || right === undefined ? { join: 'all', rows: [{ field: c.left, test: 'notEmpty', values: [] }] } : one('ne');
    case 'lt': return one('lt');
    case 'lte': return one('lte');
    case 'gt': return one('gt');
    case 'gte': return one('gte');
    case 'isnull': return { join: 'all', rows: [{ field: c.left, test: 'empty', values: [] }] };
    case 'isnotnull': return { join: 'all', rows: [{ field: c.left, test: 'notEmpty', values: [] }] };
    case 'in': case 'notin':
      if (right === undefined) return { join: 'all', rows: [{ field: c.left, test: c.operator!.toLowerCase() === 'in' ? 'in' : 'notIn', values: [] }] };
      return Array.isArray(right) && right.length && right.every(scalar)
        ? { join: 'all', rows: [{ field: c.left, test: c.operator!.toLowerCase() === 'in' ? 'in' : 'notIn', values: right }] } : null;
    case 'contains': return typeof right === 'string' || right === undefined ? one('contains') : null;
    case 'startswith': return typeof right === 'string' || right === undefined ? one('startsWith') : null;
    case 'endswith': return typeof right === 'string' || right === undefined ? one('endsWith') : null;
    default: return null;
  }
}

// ---------------------------------------------------------------------------------------------------------- evaluation

/** Reads a path's value for the evaluator: the steps as parsed (names and list positions). */
export type PathReader = (steps: (string | number)[]) => unknown;

/** Thrown for a part of an expression the designer does not evaluate (arithmetic, most functions): no count is shown. */
export class NotEvaluated extends Error {}

type V = string | number | boolean | null;

function normalise(raw: unknown): V {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' || typeof raw === 'boolean') return raw;
  return null;
}

function num(v: V): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = v.trim();
    return t && t.length <= 80 && NUMBER_TEXT.test(t) ? Number(t) : null;
  }
  return null;
}

/** media's Values.order: numbers by value (a numeric text counts), texts as Java orders them, true/false; else not comparable. */
function order(a: V, b: V): number | null {
  if (a === null || b === null) return null;
  if (typeof a === 'number' || typeof b === 'number') {
    const x = num(a);
    const y = num(b);
    return x === null || y === null ? null : Math.sign(x - y);
  }
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;
  return null;
}

function equal(a: V, b: V): boolean {
  if (a === null || b === null) return a === null && b === null;
  const o = order(a, b);
  return o !== null ? o === 0 : a === b;
}

const truth = (v: V): boolean | null => (typeof v === 'boolean' ? v : null);

/** The expression's value for one record, by media's rules (null is unknown); throws NotEvaluated for what it does not read. */
export function evaluate(e: Expr, read: PathReader): V {
  switch (e.k) {
    case 'lit': return e.v;
    case 'path': return normalise(read(e.steps));
    case 'not': { const t = truth(evaluate(e.e, read)); return t === null ? null : !t; }
    case 'neg': { const n = num(evaluate(e.e, read)); return n === null ? null : -n; }
    case 'logic': {
      const l = truth(evaluate(e.l, read));
      if (e.and && l === false) return false;
      if (!e.and && l === true) return true;
      const r = truth(evaluate(e.r, read));
      if (e.and) return r === false ? false : l === null || r === null ? null : true;
      return r === true ? true : l === null || r === null ? null : false;
    }
    case 'cmp': {
      const l = evaluate(e.l, read);
      const r = evaluate(e.r, read);
      if (e.op === '=') return l === null || r === null ? null : equal(l, r);
      if (e.op === '!=') return l === null || r === null ? null : !equal(l, r);
      const o = order(l, r);
      if (o === null) return null;
      return e.op === '<' ? o < 0 : e.op === '<=' ? o <= 0 : e.op === '>' ? o > 0 : o >= 0;
    }
    case 'null': {
      const v = evaluate(e.e, read);
      const isNull = v === null || (typeof v === 'string' && !v.trim());
      return e.negated !== isNull;
    }
    case 'in': {
      const v = evaluate(e.e, read);
      if (v === null) return null;
      for (const o of e.options) {
        const x = evaluate(o, read);
        if (x !== null && equal(v, x)) return !e.negated;
      }
      return e.negated;
    }
    case 'call': {
      if (CALLS[e.fn]) {
        const a = evaluate(e.args[0], read);
        const b = evaluate(e.args[1], read);
        if (typeof a !== 'string' || typeof b !== 'string') return null;
        const s = a.length > 10_000 ? a.slice(0, 10_000) : a;
        return e.fn === 'contains' ? s.includes(b) : e.fn === 'starts_with' ? s.startsWith(b) : s.endsWith(b);
      }
      if (e.fn === 'is_null') return evaluate(e.args[0], read) === null;
      throw new NotEvaluated(e.fn);
    }
    default: throw new NotEvaluated(e.k);
  }
}

/** True only when the expression holds (media: a condition is met only when it is true). */
export function holds(e: Expr, read: PathReader): boolean {
  return evaluate(e, read) === true;
}

/** Walks a value along parsed steps (a name reads an object's key, a number a list's position). */
export function walkSteps(start: unknown, steps: (string | number)[]): unknown {
  let at: unknown = start;
  for (const s of steps) {
    if (at === null || at === undefined || typeof at !== 'object') return undefined;
    at = typeof s === 'number' ? (Array.isArray(at) ? at[s] : undefined) : Array.isArray(at) ? undefined : (at as Record<string, unknown>)[s];
  }
  return at;
}

/**
 * media's resolver (JsonValues.datasets): a path whose first name is a dataset (the primary's names, a repeat's item) reads
 * from it, any other path from the primary record.
 */
export function readerFor(record: unknown, names: string[], scopes: Record<string, unknown> = {}): PathReader {
  return steps => {
    const first = steps[0];
    if (typeof first !== 'string') return undefined;
    if (first in scopes) return walkSteps(scopes[first], steps.slice(1));
    if (names.includes(first)) return walkSteps(record, steps.slice(1));
    return walkSteps(record, steps);
  };
}

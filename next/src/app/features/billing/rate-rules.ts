import { RateRule, RuleKind } from './billing.service';

/**
 * Owner #23: a rate card version's pricing rules, as Billing settings shows and edits them -- the same model and the same
 * checks as billing-service's PricingRules (the server checks again and answers in sentences; these only spare a round trip).
 *
 * Which price applies to a piece of usage: a PIPELINE rule for its pipeline, else the lowest-numbered TAG rule for one of
 * its pipeline's tags, else a CLASS rule for its pipeline's data class, else the card's own price. A rule changes only the
 * unit price: the item's unit, per, allowance and tiers stay the card's.
 */
export const RULE_KINDS: RuleKind[] = ['PIPELINE', 'TAG', 'CLASS'];
export const DATA_CLASSES = ['public', 'internal', 'sensitive'];
/** rate_card_rule.match_value is varchar(120), note varchar(200). */
export const RULE_VALUE_MAX = 120;
export const RULE_NOTE_MAX = 200;
export const MAX_RULES = 500;

export function kindText(kind: RuleKind): string {
  return kind === 'PIPELINE' ? 'Pipeline' : kind === 'TAG' ? 'Tag' : 'Data class';
}

/** What a rule matches, in words: "Pipeline X-ray triage (#1933)", "Tag research", "Data class sensitive". */
export function matchText(rule: Pick<RateRule, 'match_kind' | 'match_value'>, pipelineName?: string | null): string {
  if (rule.match_kind === 'PIPELINE') return pipelineName ? `Pipeline ${pipelineName} (#${rule.match_value})` : `Pipeline #${rule.match_value}`;
  return `${kindText(rule.match_kind)} ${rule.match_value}`;
}

/** The rules in the order they are tried: pipelines, then tags, then classes; the lower number first within a kind. */
export function byPrecedence<T extends Pick<RateRule, 'match_kind' | 'rule_no'>>(rules: T[]): T[] {
  return [...rules].sort((a, b) => RULE_KINDS.indexOf(a.match_kind) - RULE_KINDS.indexOf(b.match_kind) || a.rule_no - b.rule_no);
}

/** The rules' problems, one sentence each, as the server words them; empty when they may be saved with these items. */
export function ruleProblems(rules: RateRule[], itemNames: string[]): string[] {
  const out: string[] = [];
  if (rules.length > MAX_RULES) out.push(`A card carries at most ${MAX_RULES} rules; this one has ${rules.length}.`);
  const numbers = new Set<number>(), matches = new Set<string>();
  for (const r of rules) {
    const at = `Rule ${r.rule_no}`;
    if (!Number.isInteger(r.rule_no) || r.rule_no < 1) out.push(`${at}: rules are numbered from 1.`);
    if (numbers.has(r.rule_no)) out.push(`${at} is numbered twice.`);
    numbers.add(r.rule_no);
    if (!r.meter) out.push(`${at} needs a meter.`);
    else if (!itemNames.includes(r.meter)) out.push(`${at} prices ${r.meter}, which this card has no price for; add the meter's price first.`);
    const value = String(r.match_value ?? '');
    const what = r.match_kind === 'PIPELINE' ? 'pipeline' : r.match_kind === 'TAG' ? 'tag' : 'data class';
    if (!value.trim() || value.length > RULE_VALUE_MAX || value !== value.trim()) {
      out.push(`${at} needs a ${what} of 1 to ${RULE_VALUE_MAX} characters, with no space at either end.`);
    } else if (r.match_kind === 'CLASS' && !DATA_CLASSES.includes(value)) {
      out.push(`${at}: a data class is one of ${DATA_CLASSES.join(', ')}.`);
    }
    const price = String(r.unit_price ?? '').trim();
    if (price === '' || Number.isNaN(Number(price)) || Number(price) < 0) out.push(`${at} needs a unit price of 0 or more.`);
    else if (!/^\d{1,10}(\.\d{1,8})?$/.test(price.replace(/^0+(?=\d)/, '0'))) out.push(`${at}: a price has at most 10 digits before the point and 8 after.`);
    if ((r.note ?? '').length > RULE_NOTE_MAX) out.push(`${at}: a note is at most ${RULE_NOTE_MAX} characters.`);
    const key = `${r.meter}|${r.match_kind}|${value}`;
    if (matches.has(key)) out.push(`${at} repeats another rule's meter and ${what}.`);
    matches.add(key);
  }
  return out;
}

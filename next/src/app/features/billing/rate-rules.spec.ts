import { describe, it, expect } from 'vitest';
import { RateRule } from './billing.service';
import { byPrecedence, matchText, ruleProblems } from './rate-rules';

/**
 * Owner #23: the console's copy of PricingRules' checks and order -- the server checks again and answers in the same
 * sentences; these spare a round trip and show the order usage is matched in.
 */
const rule = (rule_no: number, match_kind: RateRule['match_kind'], match_value: string, unit_price: string | number = '0.001', meter = 'pipeline.runs'): RateRule =>
  ({ rule_no, meter, match_kind, match_value, unit_price, note: null });

describe('pricing rules', () => {
  it('orders pipelines before tags before data classes, the lower number first within a kind', () => {
    const ordered = byPrecedence([rule(1, 'CLASS', 'sensitive'), rule(4, 'TAG', 'pilot'), rule(2, 'TAG', 'research'), rule(3, 'PIPELINE', '1933')]);
    expect(ordered.map(r => r.rule_no)).toEqual([3, 2, 4, 1]);
  });

  it('words what a rule matches', () => {
    expect(matchText(rule(1, 'PIPELINE', '1933'), 'X-ray triage')).toBe('Pipeline X-ray triage (#1933)');
    expect(matchText(rule(1, 'PIPELINE', '1933'))).toBe('Pipeline #1933');
    expect(matchText(rule(2, 'TAG', 'research'))).toBe('Tag research');
    expect(matchText(rule(3, 'CLASS', 'sensitive'))).toBe('Data class sensitive');
  });

  it('refuses what the server would, in its words', () => {
    expect(ruleProblems([rule(1, 'PIPELINE', '1933'), rule(2, 'CLASS', 'public', 0)], ['pipeline.runs'])).toEqual([]);
    const problems = ruleProblems([
      rule(1, 'CLASS', 'secret'), rule(1, 'TAG', ' padded'), rule(3, 'TAG', 'x', '-1'), rule(4, 'TAG', 'x', '0.1', 'api.calls'),
      rule(5, 'PIPELINE', '1933'), rule(6, 'PIPELINE', '1933'), rule(0, 'TAG', 'y', '0.123456789'),
    ], ['pipeline.runs']);
    expect(problems).toContain('Rule 1: a data class is one of public, internal, sensitive.');
    expect(problems).toContain('Rule 1 is numbered twice.');
    expect(problems).toContain('Rule 1 needs a tag of 1 to 120 characters, with no space at either end.');
    expect(problems).toContain('Rule 3 needs a unit price of 0 or more.');
    expect(problems).toContain("Rule 4 prices api.calls, which this card has no price for; add the meter's price first.");
    expect(problems).toContain("Rule 6 repeats another rule's meter and pipeline.");
    expect(problems).toContain('Rule 0: rules are numbered from 1.');
    expect(problems).toContain('Rule 0: a price has at most 10 digits before the point and 8 after.');
  });
});

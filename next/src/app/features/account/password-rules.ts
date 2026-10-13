import { Component, computed, input } from '@angular/core';
import { CdkMenu, CdkMenuTrigger } from '@angular/cdk/menu';
import { Icon } from '../../shared/ui/icon';
import { PasswordRules } from './account-security.api';

/** One rule beside a password field: met (ticked), not yet, or one the server checks (no tick either way). */
export interface RuleLine {
  text: string;
  state: 'met' | 'unmet' | 'server';
}

/**
 * MIG-353: the workspace's password rules beside the field that sets one, ticked as they are met. The length and
 * character classes are checked here as the person types; "not a common password", "not your name" and "not a recent
 * one" only the server can say, and its refusal names which -- shown by the form the same way as any other error.
 *
 * Owner 10-12: one small info chip under the field rather than the whole list -- it says how many of the rules the
 * console can check are met, and a click opens them all. While typing, the first rule still missing is named beside it.
 */
@Component({
  selector: 'app-password-rules',
  imports: [Icon, CdkMenu, CdkMenuTrigger],
  template: `
    @if (rules()) {
      <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-test="password-rules">
        <button type="button" class="rules-chip" [class.rules-chip-ok]="typed() && allMet()"
                [cdkMenuTriggerFor]="rulesPanel" aria-haspopup="dialog" [attr.aria-label]="'Password rules: ' + summary()"
                data-test="password-rules-chip">
          <app-icon [name]="typed() && allMet() ? 'check' : 'info'" size="0.95em" class="shrink-0" />
          <span>{{ summary() }}</span>
        </button>
        @if (typed() && firstUnmet(); as missing) {
          <span class="text-[color:var(--text-muted)]" data-test="password-rules-missing">Still needs: {{ missing }}</span>
        }
      </div>
      <ng-template #rulesPanel>
        <div cdkMenu class="card shadow-xl p-4 w-72 text-xs" role="dialog" aria-label="Password rules">
          <p class="font-semibold text-sm mb-2">Password rules</p>
          <ul class="space-y-1.5" aria-label="Password rules" data-test="password-rules-list">
            @for (line of lines(); track line.text) {
              <li class="flex items-start gap-1.5"
                  [class]="line.state === 'met' ? 'flex items-start gap-1.5 text-ok-500' : 'flex items-start gap-1.5 text-[color:var(--text-secondary)]'">
                <app-icon [name]="line.state === 'met' ? 'check' : line.state === 'server' ? 'shield' : 'minus'" size="0.95em" class="mt-px shrink-0" />
                <span>{{ line.text }}<span class="sr-only">{{ line.state === 'met' ? ' (met)' : '' }}</span></span>
              </li>
            }
          </ul>
          @if (hasServerRules()) {
            <p class="mt-2 pt-2 border-t border-subtle text-[color:var(--text-muted)]">
              Rules with a shield are checked when you save.
            </p>
          }
        </div>
      </ng-template>
    }
  `,
})
export class PasswordRulesHint {
  readonly rules = input<PasswordRules | null>(null);
  readonly password = input('');
  /** Whose password the field sets: the person's own ("your") or, in an administrator's reset, somebody else's ("their"). */
  readonly subject = input<'own' | 'theirs'>('own');

  readonly typed = computed(() => this.password().length > 0);

  readonly lines = computed<RuleLine[]>(() => ruleLines(this.rules(), this.password(), this.subject()));

  /** Whether everything the console can check is met (the server checks the rest). */
  readonly allMet = computed(() => this.lines().every(line => line.state !== 'unmet'));

  private readonly checkable = computed(() => this.lines().filter(line => line.state !== 'server'));

  readonly hasServerRules = computed(() => this.lines().some(line => line.state === 'server'));

  /** The chip's words: the rule count before typing, then how many are met, then that they all are. */
  readonly summary = computed(() => {
    const checkable = this.checkable();
    if (!this.typed()) return `Password rules (${this.lines().length})`;
    if (this.allMet()) return 'Meets the rules';
    return `${checkable.filter(line => line.state === 'met').length} of ${checkable.length} rules met`;
  });

  /** The first rule still missing, lower-cased to read after "Still needs:". */
  readonly firstUnmet = computed(() => {
    const line = this.lines().find(l => l.state === 'unmet');
    return line ? line.text.charAt(0).toLowerCase() + line.text.slice(1) : '';
  });
}

/** The rules beside a password field, each met, not yet, or the server's to check. */
export function ruleLines(r: PasswordRules | null, pw: string, subject: 'own' | 'theirs' = 'own'): RuleLine[] {
  if (!r) return [];
  const typed = pw.length > 0;
  const whose = subject === 'own' ? 'your' : 'their';
  const out: RuleLine[] = [];
  const min = r.passwordMinLength ?? 12;
  out.push({ text: `At least ${min} characters`, state: typed && pw.length >= min ? 'met' : 'unmet' });
  const classes: [boolean | null, string, RegExp][] = [
    [r.passwordRequireUpper, 'An upper-case letter', /\p{Lu}/u],
    [r.passwordRequireLower, 'A lower-case letter', /\p{Ll}/u],
    [r.passwordRequireDigit, 'A digit', /\p{Nd}/u],
    [r.passwordRequireSymbol, 'A symbol such as ! # or %', /[^\p{L}\p{Nd}]/u],
  ];
  for (const [needed, text, test] of classes) {
    if (needed) out.push({ text, state: typed && test.test(pw) ? 'met' : 'unmet' });
  }
  out.push({ text: `Not a commonly used password, and not ${whose} sign-in name`, state: 'server' });
  const history = r.passwordHistory ?? 0;
  if (history > 0) {
    out.push({
      text: history === 1 ? `Not the password ${subject === 'own' ? 'you have' : 'they have'} now` : `Not any of ${whose} last ${history} passwords`,
      state: 'server',
    });
  }
  return out;
}

/**
 * The first rule the console can check that this password does not meet yet ("at least 12 characters"), lower-cased to
 * read after "Still needs:", or '' when every one it can check is met. The server's own (common, name, recent) are not
 * among them: those it says on save.
 */
export function firstUnmetRule(rules: PasswordRules | null, pw: string): string {
  const line = ruleLines(rules, pw).find(l => l.state === 'unmet');
  return line ? line.text.charAt(0).toLowerCase() + line.text.slice(1) : '';
}

/** The placeholder of a field that sets a new password: the length the workspace asks for, before anything is typed. */
export function newPasswordPlaceholder(rules: PasswordRules | null): string {
  return `At least ${rules?.passwordMinLength ?? 12} characters`;
}

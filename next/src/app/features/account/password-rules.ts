import { Component, computed, input } from '@angular/core';
import { Icon } from '../../shared/ui/icon';
import { PasswordRules } from './account-security.api';

/** One rule beside a password field: met (ticked), not yet, or one the server checks (no tick either way). */
interface RuleLine {
  text: string;
  state: 'met' | 'unmet' | 'server';
}

/**
 * MIG-353: the workspace's password rules beside the field that sets one, ticked as they are met. The length and
 * character classes are checked here as the person types; "not a common password", "not your name" and "not a recent
 * one" only the server can say, and its refusal names which -- shown by the form the same way as any other error.
 */
@Component({
  selector: 'app-password-rules',
  imports: [Icon],
  template: `
    @if (rules(); as r) {
      <ul class="mt-2 space-y-1 text-xs" aria-label="Password rules" data-test="password-rules">
        @for (line of lines(); track line.text) {
          <li [class]="line.state === 'met' ? 'flex items-start gap-1.5 text-ok-500' : 'flex items-start gap-1.5 text-[color:var(--text-muted)]'">
            <app-icon [name]="line.state === 'met' ? 'check' : 'minus'" size="0.95em" class="mt-px shrink-0" />
            <span>{{ line.text }}<span class="sr-only">{{ line.state === 'met' ? ' (met)' : '' }}</span></span>
          </li>
        }
      </ul>
    }
  `,
})
export class PasswordRulesHint {
  readonly rules = input<PasswordRules | null>(null);
  readonly password = input('');

  readonly lines = computed<RuleLine[]>(() => {
    const r = this.rules();
    if (!r) return [];
    const pw = this.password();
    const typed = pw.length > 0;
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
    out.push({ text: 'Not a commonly used password, and not your sign-in name', state: 'server' });
    const history = r.passwordHistory ?? 0;
    if (history > 0) {
      out.push({ text: history === 1 ? 'Not the password you have now' : `Not any of your last ${history} passwords`, state: 'server' });
    }
    return out;
  });

  /** Whether everything the console can check is met (the server checks the rest). */
  readonly allMet = computed(() => this.lines().every(line => line.state !== 'unmet'));
}

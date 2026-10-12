import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PasswordRulesHint } from './password-rules';
import { PasswordRules } from './account-security.api';

const RULES: PasswordRules = {
  passwordMinLength: 12, passwordRequireUpper: true, passwordRequireLower: true, passwordRequireDigit: true,
  passwordRequireSymbol: false, passwordHistory: 3, passwordMaxAgeDays: 0, lockoutThreshold: 5, lockoutMinutes: 15,
  idleMinutes: 30, requireMfa: false, rules: [],
};

function hint(password: string, rules: PasswordRules | null = RULES) {
  const fixture = TestBed.createComponent(PasswordRulesHint);
  fixture.componentRef.setInput('rules', rules);
  fixture.componentRef.setInput('password', password);
  fixture.detectChanges();
  return fixture;
}

/** MIG-353: the workspace's rules beside a password field, ticked as they are met; the server says the rest. */
describe('PasswordRulesHint', () => {
  it('lists the rules in force, and only those', () => {
    const lines = hint('').componentInstance.lines().map(l => l.text);
    expect(lines).toEqual([
      'At least 12 characters', 'An upper-case letter', 'A lower-case letter', 'A digit',
      'Not a commonly used password, and not your sign-in name', 'Not any of your last 3 passwords',
    ]);
  });

  it('ticks what is met as the person types, and leaves the server\'s checks unticked', () => {
    const c = hint('Short1').componentInstance;
    expect(c.lines().map(l => l.state)).toEqual(['unmet', 'met', 'met', 'met', 'server', 'server']);
    expect(c.allMet()).toBe(false);
    const ok = hint('Long enough 12').componentInstance;
    expect(ok.allMet()).toBe(true);
  });

  it('shows nothing until the rules are known', () => {
    const fixture = hint('anything', null);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-test="password-rules"]')).toBeNull();
  });
});

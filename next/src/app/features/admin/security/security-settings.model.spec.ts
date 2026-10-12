import { describe, expect, it } from 'vitest';
import { draftOf, draftProblem, platformText, settingsOf } from './security-settings.model';
import { SecuritySettings } from '../../account/account-security.api';

const WORKSPACE: SecuritySettings = {
  passwordMinLength: 14, passwordRequireUpper: true, passwordRequireLower: null, passwordRequireDigit: false,
  passwordRequireSymbol: null, passwordHistory: 5, passwordMaxAgeDays: null, lockoutThreshold: 5, lockoutMinutes: 15,
  idleMinutes: 20, requireMfa: true,
};

/** MIG-353: Administration › Security's rules form -- an empty field is the platform's default, never a zero. */
describe('security settings form', () => {
  it('round-trips a workspace\'s settings, nulls staying "the platform\'s default"', () => {
    expect(settingsOf(draftOf(WORKSPACE))).toEqual(WORKSPACE);
    const draft = draftOf(WORKSPACE);
    expect(draft.passwordRequireLower).toBe('');
    expect(draft.passwordRequireDigit).toBe('no');
    expect(draft.passwordMaxAgeDays).toBe('');
  });

  it('starts empty with nothing set, and saves every field as null', () => {
    const body = settingsOf(draftOf(null));
    expect(Object.values(body).every(v => v === null)).toBe(true);
  });

  it('names the first number out of the server\'s range', () => {
    expect(draftProblem(draftOf(WORKSPACE))).toBeNull();
    expect(draftProblem({ ...draftOf(WORKSPACE), passwordMinLength: '6' })).toEqual({ field: 'passwordMinLength', message: 'Between 8 and 128.' });
    expect(draftProblem({ ...draftOf(WORKSPACE), idleMinutes: '2' })?.field).toBe('idleMinutes');
    expect(draftProblem({ ...draftOf(WORKSPACE), lockoutThreshold: '4.5' })?.field).toBe('lockoutThreshold');
    expect(draftProblem({ ...draftOf(WORKSPACE), lockoutMinutes: '' })).toBeNull();
  });

  it('says the platform\'s value as a placeholder does', () => {
    expect(platformText(WORKSPACE, 'passwordMinLength')).toBe('14');
    expect(platformText(WORKSPACE, 'requireMfa')).toBe('yes');
    expect(platformText(WORKSPACE, 'passwordRequireLower')).toBe('');
    expect(platformText(null, 'idleMinutes')).toBe('');
  });
});

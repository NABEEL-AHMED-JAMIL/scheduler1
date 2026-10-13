import { SecuritySettings } from '../../account/account-security.api';

/**
 * MIG-353: Administration › Security's rules form. Every field is text in the form (an empty one is "the platform's
 * default" for a workspace), turned into the settings body on save. Kept apart from the component so it is tested on
 * its own.
 */
export type FlagChoice = '' | 'yes' | 'no';

export interface RulesDraft {
  passwordMinLength: string;
  passwordRequireUpper: FlagChoice;
  passwordRequireLower: FlagChoice;
  passwordRequireDigit: FlagChoice;
  passwordRequireSymbol: FlagChoice;
  passwordHistory: string;
  passwordMaxAgeDays: string;
  lockoutThreshold: string;
  lockoutMinutes: string;
  idleMinutes: string;
  requireMfa: FlagChoice;
}

export const NUMBER_FIELDS = ['passwordMinLength', 'passwordHistory', 'passwordMaxAgeDays', 'lockoutThreshold', 'lockoutMinutes',
  'idleMinutes'] as const;
export const FLAG_FIELDS = ['passwordRequireUpper', 'passwordRequireLower', 'passwordRequireDigit', 'passwordRequireSymbol',
  'requireMfa'] as const;

/** Each number's range, as the server holds it, for the form's own check and its hint. */
export const RANGES: Record<(typeof NUMBER_FIELDS)[number], [number, number]> = {
  passwordMinLength: [8, 128], passwordHistory: [0, 24], passwordMaxAgeDays: [0, 3650], lockoutThreshold: [3, 20],
  lockoutMinutes: [1, 1440], idleMinutes: [5, 720],
};

export function draftOf(settings: SecuritySettings | null | undefined): RulesDraft {
  const s = settings ?? ({} as Partial<SecuritySettings>);
  const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  const flag = (v: boolean | null | undefined): FlagChoice => (v === null || v === undefined ? '' : v ? 'yes' : 'no');
  return {
    passwordMinLength: num(s.passwordMinLength), passwordRequireUpper: flag(s.passwordRequireUpper),
    passwordRequireLower: flag(s.passwordRequireLower), passwordRequireDigit: flag(s.passwordRequireDigit),
    passwordRequireSymbol: flag(s.passwordRequireSymbol), passwordHistory: num(s.passwordHistory),
    passwordMaxAgeDays: num(s.passwordMaxAgeDays), lockoutThreshold: num(s.lockoutThreshold), lockoutMinutes: num(s.lockoutMinutes),
    idleMinutes: num(s.idleMinutes), requireMfa: flag(s.requireMfa),
  };
}

/** The first field out of its range, with what to say; null when every filled field is a whole number in range. */
export function draftProblem(draft: RulesDraft): { field: string; message: string } | null {
  for (const field of NUMBER_FIELDS) {
    const text = draft[field].trim();
    if (!text) continue;
    const [min, max] = RANGES[field];
    const value = Number(text);
    if (!/^\d+$/.test(text) || value < min || value > max) return { field, message: `Between ${min} and ${max}.` };
  }
  return null;
}

/** The body the server takes: an empty field is null (the platform's default). */
export function settingsOf(draft: RulesDraft): SecuritySettings {
  const num = (text: string) => (text.trim() === '' ? null : Number(text.trim()));
  const flag = (choice: FlagChoice) => (choice === '' ? null : choice === 'yes');
  return {
    passwordMinLength: num(draft.passwordMinLength), passwordRequireUpper: flag(draft.passwordRequireUpper),
    passwordRequireLower: flag(draft.passwordRequireLower), passwordRequireDigit: flag(draft.passwordRequireDigit),
    passwordRequireSymbol: flag(draft.passwordRequireSymbol), passwordHistory: num(draft.passwordHistory),
    passwordMaxAgeDays: num(draft.passwordMaxAgeDays), lockoutThreshold: num(draft.lockoutThreshold),
    lockoutMinutes: num(draft.lockoutMinutes), idleMinutes: num(draft.idleMinutes), requireMfa: flag(draft.requireMfa),
  };
}

/** "12" for a number, "required" / "not required" for a flag: the platform's value, as a placeholder says it. */
export function platformText(platform: SecuritySettings | null | undefined, field: keyof SecuritySettings): string {
  const value = platform?.[field];
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

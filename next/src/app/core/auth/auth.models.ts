export type UserRole = 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER';

/**
 * The server's hierarchy as a number, so "at least this role" is a comparison rather than a
 * list. MethodSecurityConfig installs ROLE_PLATFORM_ADMIN > ROLE_TENANT_ADMIN > ROLE_TENANT_USER,
 * which means hasRole('TENANT_ADMIN') already admits a platform administrator. Comparing role strings
 * for equality does not, so every page guarded that way had to spell the pair out by hand and
 * the one that forgot would lock the platform administrator out of a page the API serves them.
 */
export const ROLE_RANK: Record<UserRole, number> = {
  TENANT_USER: 0,
  TENANT_ADMIN: 1,
  PLATFORM_ADMIN: 2,
};

/** True when `role` is one of the three the server issues, rather than any string at all. */
export function isUserRole(role: string | null | undefined): role is UserRole {
  return !!role && role in ROLE_RANK;
}

/**
 * How each role is named and coloured. One table rather than a switch per screen: the pill, the
 * card rule and the dialog's picker all say the same thing about the same role, and a fourth
 * role is added here instead of being chased through the templates.
 *
 * Written user-first so the picker offers the least privilege at the top.
 */
export const ROLE_META: Record<UserRole, { label: string; hint: string; pill: string; accent: string }> = {
  TENANT_USER: {
    label: 'Tenant user',
    hint: 'Runs and monitors work.',
    pill: 'pill pill-neutral',
    accent: 'var(--border-subtle)',
  },
  TENANT_ADMIN: {
    label: 'Tenant administrator',
    hint: 'Also configures tasks, connections and users.',
    pill: 'pill pill-brand',
    // The flipping mark token: brand-500 is the dark card's own colour, so the rule vanished there.
    accent: 'var(--accent-mark)',
  },
  PLATFORM_ADMIN: {
    label: 'Platform administrator',
    hint: 'Operates across every tenant.',
    pill: 'pill pill-crit',
    accent: 'var(--color-crit-500)',
  },
};

/**
 * A role as a person reads it: the label from ROLE_META, sentence case. A role the table does not
 * know yet still comes out as words, never as its enum name.
 */
export function roleLabel(role: string | null | undefined): string {
  if (!role) {
    return 'Unknown role';
  }
  const known = ROLE_META[role as UserRole];
  if (known) {
    return known.label;
  }
  const words = role.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface AuthUser {
  username: string;
  fullName?: string;
  email?: string;
  userRole: UserRole;
  appUserId: number;
  tenantId?: number;
  accessToken: string;
  refreshToken: string;
  /** Where the profile picture lives, when one has been set. */
  avatarBucket?: string | null;
  avatarKey?: string | null;
  /**
   * The account was opened with, or reset to, a one-time password and still owes its owner's
   * own. Sign-in is what reports it; the profile screen alone knew about it before, so a
   * one-time password stayed usable for as long as nobody opened that screen.
   */
  mustChangePassword?: boolean;
  /**
   * The pages this person may open, as the server resolved them at sign-in: their access
   * profile, else the workspace default, else every page. Absent on a session stored before
   * profiles existed, which reads as "every page" until the next sign-in or token refresh --
   * the server refuses anything it should not have served anyway.
   */
  pageKeys?: string[];
  /** The access profile's name, for the header and the profile screen; null when on the default. */
  pageAccessProfileName?: string | null;
}

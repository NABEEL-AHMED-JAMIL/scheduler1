export type UserRole = 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER';

/**
 * The server's hierarchy as a number, so "at least this role" is a comparison rather than a
 * list. MethodSecurityConfig installs ROLE_PLATFORM_ADMIN > ROLE_TENANT_ADMIN > ROLE_TENANT_USER,
 * which means hasRole('TENANT_ADMIN') already admits a platform admin. Comparing role strings
 * for equality does not, so every page guarded that way had to spell the pair out by hand and
 * the one that forgot would lock the platform admin out of a page the API serves them.
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
    label: 'Tenant admin',
    hint: 'Also configures tasks, connections and users.',
    pill: 'pill pill-brand',
    accent: 'var(--color-brand-500)',
  },
  PLATFORM_ADMIN: {
    label: 'Platform admin',
    hint: 'Operates across every tenant.',
    pill: 'pill pill-crit',
    accent: 'var(--color-crit-500)',
  },
};

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
}

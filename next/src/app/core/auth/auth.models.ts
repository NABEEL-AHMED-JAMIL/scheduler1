export type UserRole = 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER';

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
}

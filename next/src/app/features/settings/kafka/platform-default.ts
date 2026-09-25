/**
 * The platform default Kafka connection: the platform's own profile (no workspace) marked default.
 * A workspace with no Kafka profile of its own sends its runs through it (KafkaConnectionResolver,
 * MIG-45), and fetchAllProfiles lists it to that workspace's admin read-only.
 */
export interface ProfileLike {
  profileName: string;
  tenantId?: number | null;
  isDefault?: boolean;
}

/** `tenantId` is absent, not null, on the wire (the DTO is NON_NULL), hence `== null`. */
export function isPlatformDefault(p: ProfileLike): boolean {
  return p.tenantId == null && !!p.isDefault;
}

/** A profile's name as a picker shows it, saying so when it is the platform default. */
export function profileLabel(p: ProfileLike): string {
  return isPlatformDefault(p) ? `${p.profileName} (platform default)` : p.profileName;
}

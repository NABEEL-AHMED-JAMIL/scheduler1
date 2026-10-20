import { ActivityRow } from './report-studio.model';

/** Report Studio's asset library and brand profiles (MIG-406), as media-service's reportAsset.json answers them. */
export type AssetKind = 'LOGO' | 'IMAGE' | 'SIGNATURE' | 'STAMP';
export type AssetState = 'APPROVED' | 'IN_REVIEW' | 'REJECTED' | 'RETIRED';

export interface AssetCard {
  assetId: string;
  tenantId: number;
  assetNo: number;
  label: string;
  kind: AssetKind;
  name: string;
  description?: string | null;
  category?: string | null;
  restricted: boolean;
  status: 'ACTIVE' | 'RETIRED';
  currentVersion?: number | null;
  ownerUserId?: number | null;
  ownerTitle?: string | null;
  ownerName?: string | null;
  rowVersion: number;
  createdBy?: number | null;
  updatedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  retiredAt?: string | null;
  state: AssetState;
  latestVersion?: number | null;
  latestState?: string | null;
  pendingVersion?: number | null;
  contentType?: string | null;
  originalType?: string | null;
  width?: number | null;
  height?: number | null;
  templates: number;
  reports: number;
  /** Brand profiles naming it: a logo, or an allowed signature or stamp. */
  profiles?: number;
  updatedByName?: string | null;
  createdByName?: string | null;
  /** In the designer's usable list: whether this person may place it, and why not. */
  mayPlace?: boolean;
  why?: string | null;
}

export interface AssetVersion {
  version: number;
  state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
  reviewRequired: boolean;
  contentType: string;
  bytes: number;
  width: number;
  height: number;
  alpha: boolean;
  sha256: string;
  originalName?: string | null;
  originalType?: string | null;
  uploadedBy: number;
  uploadedByName?: string | null;
  uploadedAt?: string | null;
  reviewedBy?: number | null;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
}

export interface AssetUse {
  kind: 'TEMPLATE' | 'BRAND_PROFILE';
  name: string;
  templateId?: string;
  templateVersion?: number;
  templateVersionState?: string;
  assetVersion?: number;
  purpose?: string;
  reports?: number;
}

export interface AssetGrant {
  grantId: string;
  granteeUserId: number;
  granteeName?: string | null;
  templateId?: string | null;
  grantedBy: number;
  grantedByName?: string | null;
  grantedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  active: boolean;
}

export interface AssetDetail extends AssetCard {
  versions: AssetVersion[];
  usage: AssetUse[];
  usageTemplates: number;
  usageReports: number;
  grants: AssetGrant[];
  activity: (ActivityRow & { actorName?: string | null })[];
  you: { userId: number; owner: boolean; workspaceAdmin: boolean; mayPlace: boolean; mayGrant: boolean };
  digitalSignature?: { signsAs: string; when: string; workspace: string; lastUsedAt?: string | null; lastReportId?: string | null;
    lastReportLabel?: string | null; lastVersion?: number | null; lastSigned?: boolean | null };
}

/** One page of cards (total: what the filters match) and the scope's counts before them; the brand profiles. */
export interface AssetLibrary { assets: AssetCard[]; counts: { all: number; signaturesAndStamps: number }; profiles: BrandProfileRow[];
  total: number; offset?: number; limit?: number; }

export type Lock = 'REPORT' | 'TEMPLATE' | 'LOCKED';

/** A brand profile's definition (Branding.java): every field optional, what is empty is inherited. */
export interface BrandDefinition {
  logo?: { assetId: string; version?: number } | null;
  colors: { primary?: string; text?: string; background?: string };
  fonts: { heading?: string; body?: string };
  contact: { organisation?: string; email?: string; website?: string; phone?: string };
  header?: string;
  footer?: string;
  confidentiality?: string;
  signatures: { assetId: string; version?: number }[];
  stamps: { assetId: string; version?: number }[];
  signOnApproval: boolean;
  locks: { look: Lock; fontsContact: Lock; confidentiality: Lock };
}

export interface BrandVersion {
  versionId: string;
  version: number;
  state: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  revision: number;
  sha256: string;
  basedOnVersion?: number | null;
  changeSummary?: string | null;
  updatedAt?: string | null;
  publishedAt?: string | null;
  definition?: BrandDefinition;
  contrast?: Contrast;
}

export interface Contrast { text: number; primary: number; passes: boolean; }

export interface BrandProfileRow {
  profileId: string;
  tenantId: number;
  name: string;
  description?: string | null;
  isDefault: boolean;
  status: 'ACTIVE' | 'ARCHIVED';
  currentPublishedVersion?: number | null;
  draftRevision?: number | null;
  hasDraft: boolean;
  rowVersion: number;
  updatedBy?: number | null;
  updatedByName?: string | null;
  updatedAt?: string | null;
  templates: number;
}

export interface BrandProfileDetail extends BrandProfileRow {
  draft?: BrandVersion;
  published?: BrandVersion;
  versions: BrandVersion[];
  activity: ActivityRow[];
  approval?: { requestedByName?: string | null; requestedAt?: string | null; revision: number; current: boolean; note?: string | null } | null;
  assets: AssetCard[];
}

export interface UsableProfile { profileId: string; name: string; isDefault: boolean; version: number; logoAssetId?: string; logoName?: string;
  signOnApproval?: boolean; }

export interface Usable { assets: AssetCard[]; profiles: UsableProfile[]; total: number; }

export interface Person { userId: number; name: string; role?: string | null; }

export const KIND_WORDS: Record<AssetKind, string> = { LOGO: 'Logo', IMAGE: 'Image', SIGNATURE: 'Signature', STAMP: 'Stamp' };

export function stateWord(s: AssetState | string | null | undefined): string {
  return s === 'APPROVED' ? 'Approved' : s === 'IN_REVIEW' ? 'In review' : s === 'RETIRED' ? 'Retired' : s === 'REJECTED' ? 'Rejected' : '—';
}

export function stateTone(s: AssetState | string | null | undefined): string {
  return s === 'APPROVED' ? 'pill-ok' : s === 'IN_REVIEW' ? 'pill-warn' : s === 'REJECTED' ? 'pill-crit' : 'pill-neutral';
}

/** "SVG"/"PNG"/"JPG" as the card names the original. */
export function typeOf(a: { originalType?: string | null; contentType?: string | null }): string {
  const o = (a.originalType ?? '').toUpperCase();
  if (o === 'JPEG') return 'JPG';
  if (o) return o;
  return a.contentType === 'image/png' ? 'PNG' : 'JPG';
}

/** A starting definition for the editor when a profile has none. */
export function emptyDefinition(): BrandDefinition {
  return { colors: {}, fonts: {}, contact: {}, signatures: [], stamps: [], signOnApproval: true,
    locks: { look: 'REPORT', fontsContact: 'TEMPLATE', confidentiality: 'LOCKED' } };
}

/** WCAG relative contrast of two #RRGGBB colours (the console's own check, the server's the same). */
export function contrastRatio(a: string, b: string): number {
  const ok = (h: string) => /^#[0-9A-Fa-f]{6}$/.test(h);
  if (!ok(a) || !ok(b)) return 21;
  const lum = (h: string) => {
    const c = [1, 3, 5].map(i => parseInt(h.substring(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

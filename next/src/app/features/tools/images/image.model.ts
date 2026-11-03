/** Image review (the third Tools page, owner-approved design 2026-11-03): what media-service's /imageReview.json answers. */

export type PhotoStatus = 'MEASURING' | 'MEASURED' | 'NO_RULER' | 'NO_REGION' | 'TOO_DARK' | 'NOT_READ' | 'REFUSED';
export type DescriptionStatus = 'NONE' | 'PENDING' | 'DRAFT' | 'CONFIRMED' | 'DISCARDED' | 'FAILED' | 'OFF';
export type BodyPart = 'foot' | 'heel' | 'leg' | 'sacrum' | 'hip' | 'hand' | 'arm' | 'other';
export type DescriptionField = 'woundBed' | 'moisture' | 'edges' | 'around';
export type Description = Partial<Record<DescriptionField, string | null>>;

/** Where the measurement was made, in the photo's own pixels (x right, y down). */
export interface Geometry {
  width: number;
  height: number;
  meanLuminance?: number | null;
  rulerBox?: number[] | null;
  rulerTicks?: number | null;
  outline?: number[] | null;
  lengthLine?: number[] | null;
  widthLine?: number[] | null;
  areaPx?: number | null;
  lengthPx?: number | null;
  widthPx?: number | null;
}

export interface PhotoSummary {
  photoId: number;
  title: string;
  fileName: string;
  fileSize?: number | null;
  source?: string;
  status: PhotoStatus;
  refusalCode?: 'TOO_LARGE' | 'NOT_A_PHOTO' | null;
  refusalMessage?: string | null;
  patientRef?: string | null;
  woundLabel?: string | null;
  bodyPart?: BodyPart | null;
  siteDetail?: string | null;
  note?: string | null;
  takenAt?: string | null;
  createdAt?: string | null;
  createdBy?: number | null;
  createdByName?: string | null;
  mine?: boolean;
  scaleFound?: boolean | null;
  pxPerCm?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  areaCm2?: number | null;
  areaPx?: number | null;
  outlineSource?: 'auto' | 'drawn' | null;
  descriptionStatus: DescriptionStatus;
  unsureCount?: number | null;
  width?: number | null;
  height?: number | null;
  hasPhoto?: boolean;
  blurCount?: number;
  sentToDocuments?: boolean;
  inReport?: boolean;
  expiresAt?: string | null;
  visit?: number | null;
  visits?: number;
  changePct?: number | null;
  sinceFirstPct?: number | null;
  firstAt?: string | null;
}

export interface BlurRegion { x: number; y: number; width: number; height: number; }

export interface PhotoDetail extends PhotoSummary {
  contentType?: string | null;
  metadataRemoved?: string[];
  target?: string | null;
  measureNote?: string | null;
  geometry?: Geometry | null;
  description?: Description | null;
  descriptionDraft?: Description | null;
  descriptionModel?: string | null;
  descriptionMessage?: string | null;
  describedAt?: string | null;
  confirmedByName?: string | null;
  confirmedAt?: string | null;
  blurRegions?: BlurRegion[];
  documents?: { ocrDocumentId?: number | null; outcome?: string | null; at?: string } | null;
  reportAsset?: { assetId?: string | null; label?: string | null; name?: string | null; at?: string } | null;
  keepDays?: number;
}

export type PhotoFacets = Partial<Record<'status' | 'site' | 'patient' | 'by', Record<string, number>>>;

export interface PhotoList {
  rows: PhotoSummary[];
  total: number;
  all?: number;
  facets?: PhotoFacets;
  page?: number;
  size?: number;
}

export interface PhotoQuery {
  days: number;
  q: string;
  page: number;
  size: number;
  status: readonly string[];
  site: readonly string[];
  patient: readonly string[];
  by: readonly string[];
}

export interface ImageLimits {
  formats: string[];
  heic: boolean;
  maxMb: number;
  maxAtOnce: number;
  keepDays: number;
  describe: boolean;
  bodyParts: BodyPart[];
  documents: boolean;
  reports: boolean;
}

export const DEFAULT_IMAGE_LIMITS: ImageLimits = {
  formats: ['jpg', 'png', 'heic'], heic: true, maxMb: 25, maxAtOnce: 20, keepDays: 30, describe: true,
  bodyParts: ['foot', 'heel', 'leg', 'sacrum', 'hip', 'hand', 'arm', 'other'], documents: false, reports: false,
};

export interface CompareRow {
  photoId: number;
  visit: number;
  takenAt?: string | null;
  status: PhotoStatus;
  sized: boolean;
  lengthCm?: number | null;
  widthCm?: number | null;
  areaCm2?: number | null;
  changePct?: number | null;
  width?: number | null;
  height?: number | null;
  geometry?: Geometry | null;
  hasPhoto: boolean;
  current: boolean;
}

export interface Comparison {
  photos: CompareRow[];
  sizedCount: number;
  sinceFirstPct?: number | null;
  firstAt?: string | null;
}

/** What a person says about photos being uploaded. */
export interface PhotoDetails {
  patientRef?: string;
  woundLabel?: string;
  bodyPart?: BodyPart;
  siteDetail?: string;
  note?: string;
  takenAt?: string;
}

export interface ImageDocument { ocrDocumentId: number; name: string; contentType: string; size?: number | null; status?: string | null; createdAt?: string | null; }

export const STATUS_WORDS: Record<string, string> = {
  measured: 'Measured', no_ruler: 'No ruler: no size', to_confirm: 'Description to confirm', could_not_read: 'Could not read', measuring: 'Measuring',
};
export const SITE_WORDS: Record<BodyPart, string> = {
  foot: 'Foot', heel: 'Heel', leg: 'Leg', sacrum: 'Sacrum', hip: 'Hip', hand: 'Hand', arm: 'Arm', other: 'Other',
};
export const BY_WORDS: Record<string, string> = { me: 'Me', others: 'Others' };
export const FIELD_LABELS: Record<DescriptionField, string> = { woundBed: 'Wound bed', moisture: 'Moisture', edges: 'Edges', around: 'Around it' };
export const FIELDS: DescriptionField[] = ['woundBed', 'moisture', 'edges', 'around'];
export const NOT_SURE = 'Not sure: please fill in';
export const DRAFT_LABEL = 'Draft · not a diagnosis';

export interface Pill { tone: 'ok' | 'warn' | 'crit' | 'info' | 'neutral'; label: string; icon?: string; }

/** The list's status pill: what needs doing first. */
export function listPill(p: PhotoSummary): Pill {
  if (p.status === 'REFUSED') return { tone: 'crit', icon: 'alert', label: p.refusalCode === 'TOO_LARGE' ? 'Too large' : 'Upload failed' };
  if (p.status === 'TOO_DARK') return { tone: 'crit', icon: 'alert', label: 'Too dark' };
  if (p.status === 'NOT_READ') return { tone: 'crit', icon: 'alert', label: 'Could not read' };
  if (p.status === 'MEASURING') return { tone: 'info', label: 'Measuring…' };
  if (p.status === 'NO_RULER') return { tone: 'warn', icon: 'alert', label: 'No size' };
  if (p.status === 'NO_REGION') return { tone: 'warn', icon: 'alert', label: 'No wound found' };
  if (p.descriptionStatus === 'DRAFT') return { tone: 'warn', label: 'Confirm description' };
  if (p.descriptionStatus === 'PENDING') return { tone: 'info', label: 'Describing…' };
  if (p.descriptionStatus === 'CONFIRMED') return { tone: 'ok', icon: 'check', label: 'Confirmed' };
  return { tone: 'ok', icon: 'check', label: 'Measured' };
}

/** The measurement's own pill (the panel's and the page's first). */
export function measurePill(p: PhotoSummary): Pill {
  switch (p.status) {
    case 'MEASURED': return { tone: 'ok', icon: 'check', label: 'Measured' };
    case 'NO_RULER': return { tone: 'warn', label: 'No size' };
    case 'NO_REGION': return { tone: 'warn', label: 'No wound found' };
    case 'TOO_DARK': return { tone: 'crit', label: 'Not measured' };
    case 'MEASURING': return { tone: 'info', label: 'Measuring…' };
    case 'REFUSED': return { tone: 'crit', label: 'Not uploaded' };
    default: return { tone: 'crit', label: 'Not measured' };
  }
}

/** The description's pill, when there is one to show. */
export function descriptionPill(p: PhotoSummary): Pill | null {
  switch (p.descriptionStatus) {
    case 'DRAFT': return { tone: 'warn', label: 'Description to confirm' };
    case 'PENDING': return { tone: 'info', label: 'Describing…' };
    case 'CONFIRMED': return { tone: 'ok', icon: 'check', label: 'Description confirmed' };
    default: return null;
  }
}

/** "3.0 × 1.9 cm · 4.1 cm²"; null without a size. */
export function sizeParts(p: { lengthCm?: number | null; widthCm?: number | null; areaCm2?: number | null }): { lw: string; area: string } | null {
  if (p.areaCm2 == null || p.lengthCm == null || p.widthCm == null) return null;
  return { lw: `${p.lengthCm.toFixed(1)} × ${p.widthCm.toFixed(1)} cm`, area: `${p.areaCm2.toFixed(1)} cm²` };
}

/** "−56%" with a true minus sign; "+12%". */
export function pctText(pct: number | null | undefined): string {
  if (pct == null) return '';
  return pct < 0 ? `−${Math.abs(pct)}%` : pct > 0 ? `+${pct}%` : '0%';
}

/** "area down 56%" / "area up 12%" / "no change". */
export function trendWords(pct: number | null | undefined, prefix = 'area'): string {
  if (pct == null) return '';
  if (pct === 0) return `${prefix} unchanged`;
  return `${prefix} ${pct < 0 ? 'down' : 'up'} ${Math.abs(pct)}%`;
}

/** The photo's second line in the list: "visit 3 · wound-SV-000117-v3.jpg", or the refusal's size. */
export function subLine(p: PhotoSummary): string {
  if (p.status === 'REFUSED') return p.fileSize != null ? `${(p.fileSize / (1024 * 1024)).toFixed(1)} MB` : p.fileName;
  const parts: string[] = [];
  if (p.visit && p.patientRef) parts.push(`visit ${p.visit}`);
  if (p.note) parts.push(p.note);
  // The newest visit, or a photo with nothing else to say, names its file.
  if (!parts.length || (!p.note && p.visit != null && p.visit === p.visits && p.visit > 1)) parts.push(p.fileName);
  return parts.join(' · ');
}

/** A field of the draft or the confirmed description: null and blank are "not sure". */
export function fieldValue(d: Description | null | undefined, f: DescriptionField): string | null {
  const v = d?.[f];
  return v == null || !String(v).trim() ? null : String(v);
}

/** What a state says, and what to do next (design image-states.html). */
export interface StateAdvice { key: string; title: string; pill: Pill; lead: string; text: string; }

export function stateAdvice(p: PhotoDetail | PhotoSummary): StateAdvice | null {
  if (p.status === 'NO_RULER') return { key: 'no-ruler', title: 'No ruler found', pill: { tone: 'warn', label: 'No size' },
    lead: 'No ruler in this photo, so no size.', text: 'We only measure against a ruler in the photo; we never estimate a size. Take another photo with the paper ruler flat beside the wound. The outline is kept, and you can still compare its shape.' };
  if (p.status === 'TOO_DARK') return { key: 'too-dark', title: 'Too dark to read', pill: { tone: 'crit', label: 'Not measured' },
    lead: 'The photo is too dark to find the wound or the ruler.', text: "Retake it with the room light on or the phone's flash, and keep the ruler in view." };
  if (p.status === 'NO_REGION') return { key: 'no-region', title: 'No wound found', pill: { tone: 'warn', label: 'No size' },
    lead: 'The ruler was found, but no wound stood out from the skin around it.', text: 'Draw the outline yourself with Adjust outline: it is measured against this ruler.' };
  if (p.status === 'NOT_READ') return { key: 'not-read', title: 'Could not read', pill: { tone: 'crit', label: 'Not measured' },
    lead: 'The photo could not be measured.', text: (p as PhotoDetail).measureNote ?? p.refusalMessage ?? 'Try measuring it again in a moment.' };
  if (p.status === 'REFUSED' && p.refusalCode === 'TOO_LARGE') return { key: 'too-large', title: 'Too large', pill: { tone: 'crit', label: 'Not uploaded' },
    lead: p.refusalMessage ?? `${p.fileName} is over the limit.`, text: 'Send it from the phone at a smaller size (on iPhone: “Large” instead of “Actual size”), or upload it to a bucket and pick it from there.' };
  if (p.status === 'REFUSED') return { key: 'upload-failed', title: 'Upload failed', pill: { tone: 'crit', label: 'Not uploaded' },
    lead: `${p.fileName} could not be read as a photo.`, text: 'Image review takes JPG, PNG and HEIC. For a scanned PDF, use the Document Converter to turn its pages into images first.' };
  return null;
}

/** A file the browser offers: is it one this tool takes, and is it small enough? */
export function fileProblem(file: { name: string; size: number }, limits: ImageLimits): string | null {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (!['jpg', 'jpeg', 'png', 'heic', 'heif'].includes(ext)) return 'Not a photo: JPG, PNG or HEIC';
  if (file.size > limits.maxMb * 1024 * 1024) return `${(file.size / (1024 * 1024)).toFixed(1)} MB; the limit is ${limits.maxMb} MB`;
  return null;
}

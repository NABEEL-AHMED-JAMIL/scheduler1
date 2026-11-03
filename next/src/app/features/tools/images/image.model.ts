/** Image review (the third Tools page, owner-approved design 2026-11-03): what media-service's /imageReview.json answers. */
import { formatSize } from '../../../shared/ui/format-size';

/** UNMEASURED: a type that is never measured (X-ray, slide, other): "Description only". */
export type PhotoStatus = 'MEASURING' | 'MEASURED' | 'NO_RULER' | 'NO_REGION' | 'TOO_DARK' | 'NOT_READ' | 'REFUSED' | 'UNMEASURED' | 'NEEDS_TYPE';
export type DescriptionStatus = 'NONE' | 'PENDING' | 'DRAFT' | 'CONFIRMED' | 'DISCARDED' | 'FAILED' | 'OFF';
export type BodyPart = 'foot' | 'heel' | 'leg' | 'sacrum' | 'hip' | 'hand' | 'arm' | 'other';
/** A description's field: a key of the type's prompt's output schema (wound: woundBed, moisture, edges, around). */
export type DescriptionField = string;
export type Description = Record<DescriptionField, string | null | undefined>;

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
  /** The image type's key (wound, lesion, burn, xray, slide, other, custom-<n>) and name. */
  imageType?: string | null;
  imageTypeName?: string | null;
  /** The type came from the AI suggestion at upload and nobody changed it: a draft. */
  typeSuggested?: boolean;
  /** The key the AI suggested (kept as a draft), or null: no suggestion. */
  typeSuggestion?: string | null;
  /** The suggestion at upload for an image with no type (status NEEDS_TYPE until it is done): PENDING, DONE, FAILED, OFF. */
  typeSuggestStatus?: string | null;
  /** Whether the photo's type is measured; false: "Description only", never a size. */
  measuredType?: boolean | null;
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
  /** The description's fields, in the type's prompt's order. */
  descriptionFields?: string[] | null;
  descriptionModel?: string | null;
  /** Which prompt wrote the draft (its name and version), for the byline. */
  descriptionPromptName?: string | null;
  descriptionPromptVersion?: number | null;
  descriptionMessage?: string | null;
  describedAt?: string | null;
  confirmedByName?: string | null;
  confirmedAt?: string | null;
  blurRegions?: BlurRegion[];
  documents?: { ocrDocumentId?: number | null; outcome?: string | null; at?: string } | null;
  reportAsset?: { assetId?: string | null; label?: string | null; name?: string | null; at?: string } | null;
  keepDays?: number;
}

export type PhotoFacets = Partial<Record<'type' | 'status' | 'site' | 'patient' | 'by', Record<string, number>>>;

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
  type?: readonly string[];
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
  /** The types offered for the picker, in order. */
  types?: OfferedType[];
  /** The AI suggests a type at upload when none is chosen. */
  suggestOn?: boolean;
  /** Ask about this image is on. */
  askOn?: boolean;
}

/** A type the upload offers (limits.types). */
export interface OfferedType { key: string; name: string; measured: boolean; targetLabel?: string | null; measureNote?: string | null;
  bannerText?: string | null; note?: string | null; noteWarning?: boolean | null; }

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
  /** The image type's key; without one, media asks the AI for a suggestion (a draft). */
  imageType?: string;
  /** What the AI suggested before the upload (the sheet's draft), sent with the type chosen. */
  suggestedType?: string;
}

export interface ImageDocument { ocrDocumentId: number; name: string; contentType: string; size?: number | null; status?: string | null; createdAt?: string | null; }

export const STATUS_WORDS: Record<string, string> = {
  measured: 'Measured', unmeasured: 'Description only', no_ruler: 'No ruler: no size', to_confirm: 'Description to confirm',
  could_not_read: 'Could not read', measuring: 'Measuring',
};
/** The built-in types' names, for a facet before the types are read (the server's names win). */
export const TYPE_WORDS: Record<string, string> = {
  wound: 'Wound', lesion: 'Skin lesion', burn: 'Burn', xray: 'X-ray', slide: 'Tissue slide', other: 'Other photo',
};
/** Built-in types that are never measured: no paper ruler (a custom type copied from one is not measured either). */
export const NEVER_MEASURED = ['xray', 'slide', 'other'];
export const SITE_WORDS: Record<BodyPart, string> = {
  foot: 'Foot', heel: 'Heel', leg: 'Leg', sacrum: 'Sacrum', hip: 'Hip', hand: 'Hand', arm: 'Arm', other: 'Other',
};
export const BY_WORDS: Record<string, string> = { me: 'Me', others: 'Others' };
export const FIELD_LABELS: Record<string, string> = { woundBed: 'Wound bed', moisture: 'Moisture', edges: 'Edges', around: 'Around it' };
/** A wound's four fields: a photo from before image types, or one whose fields are not said. */
export const FIELDS: DescriptionField[] = ['woundBed', 'moisture', 'edges', 'around'];
export const NOT_SURE = 'Not sure: please fill in';
export const DRAFT_LABEL = 'Draft · not a diagnosis';

export interface Pill { tone: 'ok' | 'warn' | 'crit' | 'info' | 'neutral'; label: string; icon?: string; }

/** The list's status pill: what needs doing first. */
export function listPill(p: PhotoSummary): Pill {
  if (p.status === 'REFUSED') return { tone: 'crit', icon: 'alert', label: p.refusalCode === 'TOO_LARGE' ? 'Too large' : 'Upload failed' };
  if (p.status === 'NEEDS_TYPE') return p.typeSuggestStatus === 'PENDING' ? { tone: 'info', label: 'Suggesting a type…' } : { tone: 'warn', icon: 'alert', label: 'Choose a type' };
  if (p.status === 'TOO_DARK') return { tone: 'crit', icon: 'alert', label: 'Too dark' };
  if (p.status === 'NOT_READ') return { tone: 'crit', icon: 'alert', label: 'Could not read' };
  if (p.status === 'MEASURING') return { tone: 'info', label: 'Measuring…' };
  if (p.status === 'NO_RULER') return { tone: 'warn', icon: 'alert', label: 'No size' };
  if (p.status === 'NO_REGION') return { tone: 'warn', icon: 'alert', label: 'No wound found' };
  if (p.descriptionStatus === 'DRAFT') return { tone: 'warn', label: 'Confirm description' };
  if (p.descriptionStatus === 'PENDING') return { tone: 'info', label: 'Describing…' };
  if (p.descriptionStatus === 'CONFIRMED') return { tone: 'ok', icon: 'check', label: 'Confirmed' };
  if (p.status === 'UNMEASURED') return { tone: 'neutral', label: 'Description only' };
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
    case 'UNMEASURED': return { tone: 'neutral', label: 'Description only' };
    case 'NEEDS_TYPE': return { tone: 'warn', label: 'Choose a type' };
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
  if (p.status === 'REFUSED') return p.fileSize ? formatSize(p.fileSize) : '';
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

// ------------------------------------------------------------------------------------------------ image types (design image-tool-types)

/** A field's label made from its key: woundBed "Wound bed", bodyPart "Body part", imageQuality "Image quality". */
export function fieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const words = key.replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

/** The fields a photo's description has, in its type's order: descriptionFields, else the description's keys, else a wound's four. */
export function photoFields(p: Pick<PhotoDetail, 'descriptionFields' | 'description' | 'descriptionDraft'>): string[] {
  if (p.descriptionFields?.length) return p.descriptionFields;
  const keys = Object.keys(p.description ?? p.descriptionDraft ?? {});
  return keys.length ? keys : FIELDS;
}

/** Whether a photo's type is measured (a photo from before types: yes, unless it says Description only). */
export function isMeasuredPhoto(p: Pick<PhotoSummary, 'measuredType' | 'status'>): boolean {
  if (p.status === 'UNMEASURED') return false;
  return p.measuredType ?? true;
}

/** The measurement's target in words: red_region "red region", contrast "dark region". */
export function targetWords(target: string | null | undefined): string {
  if (target === 'contrast') return 'dark region';
  if (target === 'red_region') return 'red region';
  return target ? target.replace(/_/g, ' ') : '';
}

/** "Looks like an X-ray", "Looks like a skin lesion": a suggestion in plain words. */
export function looksLike(name: string): string {
  const acronym = /^[A-Z]{1,3}\b|^[A-Z]-/.test(name);
  const word = acronym ? name : name.toLowerCase();
  if (/^other\b/i.test(name)) return 'Looks like another kind of photo';
  const an = /^[aeiou]/i.test(word) || /^X-/.test(word);
  return `Looks like ${an ? 'an' : 'a'} ${word}`;
}

/** "X-ray and Other photo are described only, never measured." for the offered types that are not measured. */
export function describedOnlyNote(types: readonly { name: string; measured: boolean }[]): string {
  const names = types.filter(t => !t.measured).map(t => t.name);
  if (!names.length) return '';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${list} ${names.length === 1 ? 'is' : 'are'} described only, never measured.`;
}

/** A photo's type name: its own, else the built-in name for its key. */
export function typeName(p: Pick<PhotoSummary, 'imageType' | 'imageTypeName'>): string {
  return p.imageTypeName || (p.imageType ? TYPE_WORDS[p.imageType] ?? p.imageType : '');
}

/** The type's icon, the design's: wound image, lesion eye, burn alert, X-ray layers, slide table, other file. */
export function typeIcon(key: string | null | undefined, baseKey?: string | null): string {
  const k = key && TYPE_ICONS[key] ? key : baseKey ?? '';
  return TYPE_ICONS[k] ?? 'image';
}
const TYPE_ICONS: Record<string, string> = { wound: 'image', lesion: 'eye', burn: 'alert', xray: 'layers', slide: 'table', other: 'file' };

/** POST /photos/suggest: the AI's type for a file before upload. */
export interface TypeSuggestion { status: 'ok' | 'off' | 'failed' | 'skipped'; typeKey?: string | null; typeName?: string | null; message?: string | null; }

/** A question asked about a photo, and its answer (GET /photos/{id}/asks). */
export interface AskRow {
  askId: number;
  question: string;
  /** refused: the fixed reply in answer, no model was asked, nothing billed. */
  status: 'ok' | 'refused' | 'off' | 'failed' | 'held';
  answer?: string | null;
  refusedBecause?: string | null;
  model?: string | null;
  promptName?: string | null;
  promptVersion?: number | null;
  tookMs?: number | null;
  askedBy?: number | null;
  askedByName?: string | null;
  askedAt?: string | null;
  message?: string | null;
}

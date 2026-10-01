import { instantOf } from '../../core/instant';

/** The Data Catalog (Wave 5, MIG-285..288): analytics-service's /analyticsCatalog.json, page 'data-catalog'. */
export type AssetKind = 'file' | 'dataset' | 'document_type' | 'connector';
export type Sensitivity = 'Unclassified' | 'Public' | 'Internal' | 'Confidential' | 'Restricted';
export const SENSITIVITIES: readonly Sensitivity[] = ['Unclassified', 'Public', 'Internal', 'Confidential', 'Restricted'];

/** What the scanner (MIG-286) finds a column holds, and what a person may say it holds. */
export const TAGS: readonly { id: string; label: string }[] = [
  { id: 'email', label: 'email' }, { id: 'phone', label: 'phone' }, { id: 'national_id', label: 'national id' },
  { id: 'card_number', label: 'card number' }, { id: 'bank_account', label: 'bank account' },
  { id: 'person_name', label: 'person name' }, { id: 'address', label: 'address' },
];

export interface CatalogAsset {
  assetId: number;
  kind: AssetKind;
  source: string;
  name: string;
  connection: string | null;
  path: string | null;
  format: string | null;
  ownerUserId: number | null;
  ownerName: string | null;
  description: string | null;
  rowCount: number | null;
  sizeBytes: number | null;
  columnCount: number | null;
  qualityScore: number | null;
  sensitivity: Sensitivity;
  sensitivityByHand?: boolean;
  policyLevel?: string;
  status: 'Active' | 'Deleted';
  lastChangedAt: string | null;
  profiledAt: string | null;
  profileError: string | null;
  scannedAt?: string | null;
  scanError?: string | null;
  deletedAt: string | null;
  stale: boolean;
  noOwner: boolean;
  /** In the list: the tags across its columns. */
  tags?: string[];
}

export interface CatalogColumn {
  position: number;
  name: string;
  dataType: string | null;
  nullPercent: number | null;
  distinctCount: number | null;
  tags: string[];
  tagsReviewed: boolean;
}

export interface Grant {
  grantId: number;
  assetId: number;
  assetName: string;
  userId: number;
  userName: string | null;
  reason: string | null;
  days: number;
  status: 'Requested' | 'Granted' | 'Denied' | 'Cancelled' | 'Expired' | 'Revoked';
  workflowInstanceId: number | null;
  requestedAt: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
  endedAt: string | null;
}

export interface AssetDetail extends CatalogAsset {
  columns: CatalogColumn[];
  canEdit: boolean;
  /** The caller sees this asset's tagged values masked. */
  masked: boolean;
  myAccess: Grant | null;
}

export interface CatalogSummary {
  assets: number;
  sensitive: number;
  stale: number;
  noOwner: number;
  datasets: number;
  files: number;
  staleDays: number;
}

export interface LineageNode { ref: string; kind: string; name: string | null; }
export interface LineageEdge { from: string; to: string; via: string; runs: number; lastRunId: number | null; lastSeenAt: string | null; }
export interface LineageGraph { ref: string; nodes: LineageNode[]; edges: LineageEdge[]; }

export function kindText(kind: string): string {
  return ({ file: 'File', dataset: 'Dataset', document_type: 'Document type', connector: 'Connector' } as Record<string, string>)[kind] ?? kind;
}

export function sourceText(source: string): string {
  return ({ storage: 'storage', analytics: 'Analytics Studio', forms: 'Form', 'document-intelligence': 'Document Intelligence',
    pipeline: 'pipeline' } as Record<string, string>)[source] ?? source;
}

export function tagText(tag: string): string {
  return TAGS.find(t => t.id === tag)?.label ?? tag.replace(/_/g, ' ');
}

export function isSensitive(level: string | null | undefined): boolean {
  return level === 'Confidential' || level === 'Restricted';
}

export function sensitivityTone(level: string | null | undefined): string {
  return level === 'Restricted' ? 'crit' : level === 'Confidential' ? 'warn' : level === 'Internal' ? 'info' : 'neutral';
}

/** Where an asset lives, and how big it is, for the line under its name. */
export function whereText(a: CatalogAsset): string {
  const where = a.kind === 'document_type' ? 'Document Intelligence' : [a.connection, a.path].filter(Boolean).join(' · ');
  const rows = a.rowCount != null ? `${a.rowCount.toLocaleString('en-US')} rows` : '';
  return [where, rows].filter(Boolean).join(' · ');
}

/** How long since the asset last changed: "12 min", "3 h", "41 days"; "—" when never seen to change. */
export function freshnessText(lastChangedAt: string | null | undefined, now: Date = new Date()): string {
  const at = instantOf(lastChangedAt);
  if (!at) return '—';
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

export function grantTone(status: Grant['status']): string {
  return status === 'Granted' ? 'ok' : status === 'Requested' ? 'warn' : status === 'Denied' ? 'crit' : 'neutral';
}

/**
 * The lineage around one node, as the panel shows it: what comes before (upstream, nearest last) and after it
 * (downstream, nearest first) -- each hop once, by its name.
 */
export function lineageSides(graph: LineageGraph | null): { upstream: LineageNode[]; downstream: LineageNode[] } {
  if (!graph || !graph.edges?.length) return { upstream: [], downstream: [] };
  const byRef = new Map(graph.nodes.map(n => [n.ref, n]));
  const walk = (start: string, next: (ref: string) => string[]): LineageNode[] => {
    const seen = new Set([start]);
    const out: LineageNode[] = [];
    let frontier = [start];
    while (frontier.length) {
      const following: string[] = [];
      for (const ref of frontier) {
        for (const other of next(ref)) {
          if (seen.has(other)) continue;
          seen.add(other);
          following.push(other);
          const node = byRef.get(other);
          if (node) out.push(node);
        }
      }
      frontier = following;
    }
    return out;
  };
  const upstream = walk(graph.ref, ref => graph.edges.filter(e => e.to === ref).map(e => e.from)).reverse();
  const downstream = walk(graph.ref, ref => graph.edges.filter(e => e.from === ref).map(e => e.to));
  return { upstream, downstream };
}

export function nodeIcon(kind: string): string {
  return ({ file: 'file', dataset: 'database', pipeline: 'zap', form: 'list', dashboard: 'chart', run_output: 'table', connector: 'plug',
    source: 'server', document_type: 'file' } as Record<string, string>)[kind] ?? 'link';
}

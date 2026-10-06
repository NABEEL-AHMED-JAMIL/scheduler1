import { DestroyRef, Injectable, afterNextRender, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import generated from './content/developer-docs.generated.json';
import { LangKey } from './guide-markdown';
import { OpenApiDoc, Schema } from './openapi';

/**
 * MIG-336: the developer portal's content, copied from etl-platform docs/api by scripts/sync-developer-docs.mjs.
 * Imported only by the portal's own (lazy) pages, so the console's first load never carries it.
 */
export interface Guide { slug: string; title: string; summary: string; markdown: string }

export interface DeveloperDocs {
  spec: OpenApiDoc;
  /** One JSON Schema per event type the platform sends; `data`'s `$ref`s point into spec. */
  eventTypes: Schema[];
  guides: Guide[];
  changelog: string;
  /** sha256 of each source file, relative to docs/api: developer-docs.spec.ts says when they are stale. */
  sources: Record<string, string>;
}

export const DOCS = generated as unknown as DeveloperDocs;

/** Where the portal's downloads are served (public/developer). */
export const DOWNLOADS = [
  { label: 'OpenAPI (YAML)', href: '/developer/openapi-v1.yaml', note: 'The contract, as written.' },
  { label: 'OpenAPI (JSON)', href: '/developer/openapi-v1.json', note: 'The same, for tools that read JSON.' },
  { label: 'Postman collection', href: '/developer/postman-collection-v1.json',
    note: 'Every call, with a token request that keeps the token for the rest.' },
];

/** The browser tab's title for a guide's route. */
export function guideTitle(slug: string | null): string {
  return DOCS.guides.find(g => g.slug === slug)?.title ?? 'Guide';
}

const LANG_KEY = 'devportal.lang';

/** The code language a reader chose in a code group, kept across groups and pages (and visits, when storage allows). */
@Injectable({ providedIn: 'root' })
export class DevLangService {
  readonly lang = signal<LangKey | null>(DevLangService.stored());

  private static stored(): LangKey | null {
    try {
      const value = localStorage.getItem(LANG_KEY);
      return value === 'curl' || value === 'python' || value === 'node' ? value : null;
    } catch {
      return null;
    }
  }

  choose(key: LangKey): void {
    this.lang.set(key);
    try { localStorage.setItem(LANG_KEY, key); } catch { /* storage refused: the choice lasts this visit */ }
  }
}

/**
 * Scrolls to the address's #fragment once the page has drawn, and again whenever it changes: the portal's anchors are
 * links (op-createToken, tag-runs, schema-Run, events, problems) a reader shares. Call from a constructor.
 */
export function scrollToFragments(): void {
  const route = inject(ActivatedRoute);
  const destroyRef = inject(DestroyRef);
  let drawn = false;
  let pending: string | null = null;
  const go = (id: string) => {
    const el = document.getElementById(id);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
  };
  afterNextRender(() => {
    drawn = true;
    if (pending) go(pending);
  });
  const sub = route.fragment.subscribe(fragment => {
    pending = fragment;
    if (fragment && drawn) setTimeout(() => go(fragment));
  });
  destroyRef.onDestroy(() => sub.unsubscribe());
}

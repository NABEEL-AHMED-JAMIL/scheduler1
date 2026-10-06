import { describe, it, afterEach } from 'vitest';
import { useMemoryStorage } from '../shared/testing/memory-storage';
import { ALL_PAGES, TU_PAGES, Visit, detailsOf, pin, restoreClock, visit } from './harness';
import { PINNED } from './pinned/data-policies';

/**
 * MIG-254 characterisation baseline: Administration › Data policies, per role. The answers are ai-service's (MIG-243)
 * as workspace 2924 answered them on 2026-09-29: nothing saved, so every level its default -- and its three model
 * connections, all Ollama (local), none BAA-signed.
 */
const FILE = 'data-policies';

const level = (sensitivity: string, modelRule: string, aiWriteTools: boolean) =>
  ({ sensitivity, modelRule, allowedModels: [], retentionDays: null, deliveryOptions: {}, aiWriteTools, minFieldsWarning: true, saved: false });
const POLICY = { status: 'SUCCESS', message: 'The workspace\'s data policy.', data: { tenantId: 2924,
  levels: [level('public', 'any', true), level('internal', 'any', true), level('sensitive', 'local', false)],
  rule: 'A call\'s data is the highest level known of it -- the prompt\'s declared sensitivity, and in a tool run every API collection it has read '
    + '-- and internal when nothing is known. A model is local when its connection\'s provider is Ollama.' } };
const CONNECTION = { tenantId: 2924, provider: 'Ollama', baaSigned: false, status: 'Active', isDefault: false, models: null };
const CONNECTIONS = { status: 'SUCCESS', message: 'Connections fetched.', data: [
  { ...CONNECTION, connectionId: 1049, name: 'UI-CHECK Ollama qwen3 (tool loop)', defaultModel: 'qwen3:8b' },
  { ...CONNECTION, connectionId: 1047, name: 'Local Ollama', defaultModel: 'gemma3:1b', isDefault: true, models: ['gemma3:1b', 'gemma3:4b', 'qwen3:8b'] },
] };
const TENANTS = { status: 'SUCCESS', message: 'Tenants fetched.', data: [{ tenantId: 2924, tenantName: 'Claude Demo' }] };

const ANSWERS: Record<string, unknown> = {
  'GET /aiPrompt.json/dataPolicy': POLICY,
  'GET /aiConnection.json/list': CONNECTIONS,
  'GET /tenant.json/listTenants': TENANTS,
};

const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/** Each level as a person reads it: its state, its controls and their values, or its read-only terms. */
function levelsOf(v: Visit): Record<string, unknown>[] {
  return Array.from(v.main.querySelectorAll<HTMLElement>('[data-level]')).map(card => ({
    level: card.getAttribute('data-level'),
    state: clean(card.querySelector('.pill')?.textContent),
    rule: (card.querySelector('select[name="modelRule"]') as HTMLSelectElement | null)?.value ?? null,
    models: Array.from(card.querySelectorAll<HTMLInputElement>('input[name="allowedModel"]'))
      .map(b => `${b.value}${b.checked ? ' [x]' : ''}${b.disabled ? ' (blocked)' : ''}`),
    switches: Array.from(card.querySelectorAll<HTMLInputElement>('input[role="switch"]')).map(s => `${s.name}: ${s.checked ? 'on' : 'off'}`),
    terms: detailsOf(card).terms,
  }));
}

function pageOf(v: Visit): Record<string, unknown> {
  return {
    state: clean(v.main.querySelector('[data-state]')?.textContent).slice(0, 200),
    levels: levelsOf(v),
    footer: clean(v.main.querySelector('[data-dirty]')?.textContent) || null,
  };
}

describe('MIG-254: Administration › Data policies', () => {
  useMemoryStorage();
  afterEach(() => restoreClock());

  it('the defaults, as a workspace administrator', async () => {
    const v = await visit('/administration/data-policies', 'TENANT_ADMIN', null, ANSWERS);
    pin(FILE, 'the defaults, as a workspace administrator', { ...v.surface, page: pageOf(v) }, PINNED);
  });

  it('the defaults, as a tenant user with every page', async () => {
    const v = await visit('/administration/data-policies', 'TENANT_USER', ALL_PAGES, ANSWERS);
    pin(FILE, 'the defaults, as a tenant user with every page', { ...v.surface, page: pageOf(v) }, PINNED);
  });

  it('data policies, as a tenant user without the Prompts page', async () => {
    const v = await visit('/administration/data-policies', 'TENANT_USER', TU_PAGES, ANSWERS);
    pin(FILE, 'data policies, as a tenant user without the Prompts page', v.surface, PINNED);
  });

  it('data policies, as a platform administrator before a workspace is picked', async () => {
    const v = await visit('/administration/data-policies', 'PLATFORM_ADMIN', null, ANSWERS);
    pin(FILE, 'data policies, as a platform administrator before a workspace is picked', { ...v.surface, page: pageOf(v) }, PINNED);
  });
});

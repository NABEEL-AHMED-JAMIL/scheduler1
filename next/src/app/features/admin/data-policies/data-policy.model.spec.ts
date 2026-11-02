import { describe, it, expect } from 'vitest';
import { ModelConnection } from '../../ai/ai-providers';
import {
  PolicyLevel, allowedText, defaultLevel, draftOf, draftProblem, isChanged, isLocalConnection, levelSummary, levelsOf, modelChoices,
  policyState, ruleBlocks, saveBody,
} from './data-policy.model';
import { CatalogModel } from '../../ai/model-catalog/model-catalog';

const saved = (l: Partial<PolicyLevel>): PolicyLevel => ({ ...defaultLevel('internal'), saved: true, ...l });

describe('data policy -- the levels as the page holds them', () => {
  it('fills a level the answer leaves out with its default, in public, internal, sensitive order', () => {
    const levels = levelsOf({ levels: [saved({ sensitivity: 'sensitive', modelRule: 'baa', retentionDays: 7 })] });
    expect(levels.map(l => l.sensitivity)).toEqual(['public', 'internal', 'sensitive']);
    expect(levels[0]).toEqual(defaultLevel('public'));
    expect(levels[2]).toMatchObject({ modelRule: 'baa', retentionDays: 7, saved: true });
  });

  it('knows the live defaults: any model and write tools on, but local only and no write tools for sensitive', () => {
    expect(defaultLevel('public')).toMatchObject({ modelRule: 'any', aiWriteTools: true, minFieldsWarning: true, retentionDays: null, saved: false });
    expect(defaultLevel('internal')).toMatchObject({ modelRule: 'any', aiWriteTools: true });
    expect(defaultLevel('sensitive')).toMatchObject({ modelRule: 'local', aiWriteTools: false, minFieldsWarning: true });
  });

  it('says whether the workspace saved a policy, part of one or none', () => {
    expect(policyState(levelsOf(null))).toBe('defaults');
    expect(policyState(levelsOf({ levels: [saved({})] }))).toBe('partly');
    expect(policyState(['public', 'internal', 'sensitive'].map(s => saved({ sensitivity: s as PolicyLevel['sensitivity'] })))).toBe('saved');
  });
});

describe('data policy -- editing and saving', () => {
  it('takes blank retention as the pipeline\'s own, and refuses what the service would', () => {
    const d = draftOf(defaultLevel('internal'));
    expect(draftProblem({ ...d, retention: '' })).toBeNull();
    expect(draftProblem({ ...d, retention: '7' })).toBeNull();
    expect(draftProblem({ ...d, retention: '0' })).toMatch(/1 to 3650/);
    expect(draftProblem({ ...d, retention: '3651' })).toMatch(/1 to 3650/);
    expect(draftProblem({ ...d, retention: '2.5' })).toMatch(/whole number/);
  });

  it('sends only the levels that changed, each whole, without the stored delivery options', () => {
    const originals = levelsOf(null);
    const drafts = originals.map(draftOf);
    drafts[1] = { ...drafts[1], retention: '7' };
    expect(isChanged(drafts[0], originals[0])).toBe(false);
    expect(isChanged(drafts[1], originals[1])).toBe(true);
    expect(saveBody(drafts, originals, null)).toEqual({ levels: [
      { sensitivity: 'internal', modelRule: 'any', allowedModels: [], retentionDays: 7, aiWriteTools: true, minFieldsWarning: true },
    ] });
  });

  it('names the workspace in the body only for a platform administrator', () => {
    const originals = levelsOf(null);
    const drafts = originals.map(draftOf);
    drafts[0] = { ...drafts[0], aiWriteTools: false };
    expect(saveBody(drafts, originals, 2924)).toMatchObject({ tenantId: 2924, levels: [{ sensitivity: 'public', aiWriteTools: false }] });
  });

  it('does not count the allowed models\' order as a change', () => {
    const original = saved({ allowedModels: ['1', '2|gpt'] });
    expect(isChanged({ ...draftOf(original), allowedModels: ['2|gpt', '1'] }, original)).toBe(false);
  });
});

const CONNECTIONS = [
  { connectionId: 1049, name: 'Local box', provider: 'Ollama', defaultModel: 'qwen3:8b', models: ['qwen3:8b', 'gemma3:4b'], tenantId: 2924 },
  { connectionId: 1050, name: 'OpenAI', provider: 'OpenAI', defaultModel: 'gpt-4.1-mini', models: null, baaSigned: true, tenantId: 2924 },
  { connectionId: 1051, name: 'Claude', provider: 'Anthropic', defaultModel: 'claude-sonnet-5', tenantId: 2924 },
  { connectionId: 9, name: 'Elsewhere', provider: 'OpenAI', defaultModel: 'x', tenantId: 1 },
] as ModelConnection[];

/** Owner 2026-11-02: the platform's list of models, which every allowed model is chosen from (switched-off ones are not offered). */
const CATALOG: CatalogModel[] = [
  { catalogId: 1, modelName: 'qwen3:8b', displayName: 'Qwen3 8B', provider: 'Ollama', local: true, note: null, active: true },
  { catalogId: 2, modelName: 'gemma3:4b', displayName: 'Gemma 3 4B', provider: 'Ollama', local: true, note: null, active: true },
  { catalogId: 3, modelName: 'gpt-oss:120b-cloud', displayName: 'gpt-oss cloud', provider: 'Ollama', local: false, note: null, active: true },
  { catalogId: 4, modelName: 'qwen3.5:9b', displayName: 'Qwen3.5 9B', provider: 'Ollama', local: true, note: null, active: false },
  { catalogId: 5, modelName: 'gpt-4.1-mini', displayName: 'GPT-4.1 mini', provider: 'OpenAI', local: false, note: null, active: true },
];

describe('data policy -- allowed models', () => {
  it('offers each connection whole and each model on the platform\'s list its provider runs, for the workspace in hand', () => {
    const choices = modelChoices(CONNECTIONS, 2924, CATALOG);
    expect(choices.map(c => c.value)).toEqual(['1049', '1049|qwen3:8b', '1049|gemma3:4b', '1049|gpt-oss:120b-cloud', '1050', '1050|gpt-4.1-mini', '1051']);
    expect(choices[0]).toMatchObject({ label: 'Any listed model', connectionName: 'Local box', local: true });
    expect(choices[1]).toMatchObject({ label: 'Qwen3 8B', model: 'qwen3:8b', local: true });
    expect(choices[3]).toMatchObject({ model: 'gpt-oss:120b-cloud', local: false });
    expect(modelChoices(CONNECTIONS, 2924).map(c => c.value)).toEqual(['1049', '1050', '1051']);
  });

  it('says which choices a rule rules out -- an Ollama cloud model is not local', () => {
    const [local, qwen, , cloud, baa, , plain] = modelChoices(CONNECTIONS, 2924, CATALOG);
    expect(ruleBlocks('any', plain)).toBeNull();
    expect(ruleBlocks('local', baa)).toBe('Not local');
    expect(ruleBlocks('local', local)).toBeNull();
    expect(ruleBlocks('local', qwen)).toBeNull();
    expect(ruleBlocks('local', cloud)).toBe('Not local');
    expect(ruleBlocks('baa', cloud)).toBe('No BAA');
    expect(ruleBlocks('baa', baa)).toBeNull();
    expect(ruleBlocks('baa', plain)).toBe('No BAA');
  });

  it('calls an Ollama at this network\'s address local, and one at an internet address hosted', () => {
    for (const apiEndpoint of [null, '', 'http://host.docker.internal:11434', 'http://ollama:11434', 'http://10.1.2.3:11434', 'http://gpu.internal:11434']) {
      expect(isLocalConnection({ provider: 'Ollama', apiEndpoint }), String(apiEndpoint)).toBe(true);
    }
    expect(isLocalConnection({ provider: 'Ollama', apiEndpoint: 'https://ollama.example.com' })).toBe(false);
    expect(isLocalConnection({ provider: 'Ollama', apiEndpoint: 'http://52.14.3.9:11434' })).toBe(false);
    expect(isLocalConnection({ provider: 'OpenAI' })).toBe(false);
  });

  it('names a saved entry by its connection and the model\'s listed name, or by numbers when they cannot be read', () => {
    expect(allowedText('1050|gpt-4.1-mini', CONNECTIONS, CATALOG)).toBe('OpenAI · GPT-4.1 mini (gpt-4.1-mini)');
    expect(allowedText('1050|gpt-4.1-mini', CONNECTIONS)).toBe('OpenAI · gpt-4.1-mini');
    expect(allowedText('1049', CONNECTIONS)).toBe('Local box — any listed model');
    expect(allowedText('77|m', [])).toBe('Connection 77 · m');
  });
});

describe('data policy -- one line per level', () => {
  it('reads as the rule, the write tools and the retention', () => {
    expect(levelSummary(defaultLevel('public'))).toBe('Any model · write tools on · pipeline retention');
    expect(levelSummary(saved({ sensitivity: 'sensitive', modelRule: 'local', aiWriteTools: false, retentionDays: 7 })))
      .toBe('Local only · write tools off · 7 days');
    expect(levelSummary(saved({ modelRule: 'baa', allowedModels: ['1', '2'], retentionDays: 1 }))).toBe('BAA-signed or local, 2 models · write tools on · 1 day');
  });
});

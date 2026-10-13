import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { DataPolicyApi } from './data-policy.api';
import { DataPolicy, PolicyLevel, defaultLevel } from './data-policy.model';
import { DataPolicies } from './data-policies';
import { RetentionApi } from './retention.api';
import { RETENTION_VIEW } from './retention.fixtures';

const RULE = 'A call\'s data is the highest level known of it.';
const DEFAULTS: DataPolicy = { tenantId: 2924, levels: (['public', 'internal', 'sensitive'] as const).map(defaultLevel), rule: RULE };
const CONNECTIONS = [
  { connectionId: 1049, name: 'Local box', provider: 'Ollama', defaultModel: 'qwen3:8b', tenantId: 2924 },
  { connectionId: 1050, name: 'Claude', provider: 'Anthropic', defaultModel: 'claude-sonnet-5', tenantId: 2924 },
];

type Role = 'TENANT_USER' | 'TENANT_ADMIN' | 'PLATFORM_ADMIN';

function render(role: Role, policy: DataPolicy | { error: string } = DEFAULTS) {
  const answer = 'error' in policy ? { status: 'ERROR', message: policy.error } : { status: 'SUCCESS', message: 'The workspace\'s data policy.', data: policy };
  const api = {
    get: vi.fn(() => of(answer)),
    save: vi.fn((body: { levels: Omit<PolicyLevel, 'saved'>[] }) => of({ status: 'SUCCESS', message: `Data policy saved (${body.levels.length} level(s)).`,
      data: { ...DEFAULTS, levels: DEFAULTS.levels!.map(l => ({ ...l, ...(body.levels.find(b => b.sensitivity === l.sensitivity) ?? {}),
        saved: l.saved || body.levels.some(b => b.sensitivity === l.sensitivity) })) } })),
    connections: vi.fn(() => of({ status: 'SUCCESS', message: '', data: CONNECTIONS })),
    tenants: vi.fn(() => of({ status: 'SUCCESS', message: '', data: [{ tenantId: 2924, tenantName: 'Claude Demo' }] })),
  };
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  // MIG-354: Core's retention section, read for the workspace a platform administrator picks (a workspace administrator's own
  // needs the session's workspace, which this screen test has not).
  const retention = { view: vi.fn(() => of({ status: 'SUCCESS', message: 'Retention policy.', data: RETENTION_VIEW })) };
  const admin = role !== 'TENANT_USER';
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DataPolicies],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: DataPolicyApi, useValue: api },
      { provide: RetentionApi, useValue: retention },
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: { isTenantAdmin: () => admin, isPlatformAdmin: () => role === 'PLATFORM_ADMIN', role: () => role } },
    ],
  });
  const fixture = TestBed.createComponent(DataPolicies);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  // UX review B8: a level is a column of the comparison table -- its cells, read together, are what a card was.
  const card = (level: string) => {
    const cells = () => Array.from(el.querySelectorAll(`[data-level="${level}"]`));
    return {
      querySelector: (sel: string) => cells().map(c => c.querySelector(sel)).find(Boolean) ?? null,
      querySelectorAll: <T extends Element>(sel: string) => cells().flatMap(c => Array.from(c.querySelectorAll<T>(sel))),
      get textContent() { return cells().map(c => c.textContent).join(' '); },
    } as unknown as HTMLElement;
  };
  const text = (node: Element | null) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const refresh = () => { fixture.detectChanges(); };
  return { fixture, el, api, retention, toast, card, text, refresh, page: fixture.componentInstance };
}

const type = (input: HTMLInputElement, value: string) => { input.value = value; input.dispatchEvent(new Event('input')); };

describe('Administration › Data policies -- as a workspace administrator', () => {
  it('shows the three levels as the defaults when nothing is saved', () => {
    const { el, card, text, api } = render('TENANT_ADMIN');
    expect(text(el.querySelector('[data-state]'))).toContain('Not saved yet — these are the defaults');
    expect(['public', 'internal', 'sensitive'].map(l => text(card(l).querySelector('h2')))).toEqual(['Public', 'Internal', 'Sensitive']);
    expect(text(card('sensitive'))).toContain('Default');
    expect((card('sensitive').querySelector('select') as HTMLSelectElement).value).toBe('local');
    expect((card('public').querySelector('input[role="switch"][name="aiWriteTools"]') as HTMLInputElement).checked).toBe(true);
    expect((card('sensitive').querySelector('input[role="switch"][name="aiWriteTools"]') as HTMLInputElement).checked).toBe(false);
    expect(text(el)).toContain(RULE);
    expect(api.connections).toHaveBeenCalled();
    expect((el.querySelector('[data-save]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves Internal\'s retention alone, then shows it saved', () => {
    const { el, card, text, api, toast, refresh } = render('TENANT_ADMIN');
    type(card('internal').querySelector('input[name="retention"]') as HTMLInputElement, '7');
    refresh();
    expect(text(el.querySelector('[data-dirty]'))).toContain('1 level changed');
    (el.querySelector('[data-save]') as HTMLButtonElement).click();
    refresh();
    expect(api.save).toHaveBeenCalledWith({ levels: [
      { sensitivity: 'internal', modelRule: 'any', allowedModels: [], retentionDays: 7, aiWriteTools: true, minFieldsWarning: true },
    ] });
    expect(toast.success).toHaveBeenCalledWith('Data policy saved (1 level(s)).');
    expect(text(card('internal'))).toContain('Saved');
    expect(text(card('public'))).toContain('Default');
    expect((card('internal').querySelector('input[name="retention"]') as HTMLInputElement).value).toBe('7');
  });

  it('names a wrong retention on its field and sends nothing', () => {
    const { el, card, text, api, refresh } = render('TENANT_ADMIN');
    type(card('public').querySelector('input[name="retention"]') as HTMLInputElement, '0');
    refresh();
    expect(text(card('public'))).toContain('Retention is 1 to 3650 days');
    (el.querySelector('[data-save]') as HTMLButtonElement).click();
    expect(api.save).not.toHaveBeenCalled();
  });

  it('shows the service\'s message when it refuses, and keeps the edit', () => {
    const { el, card, text, api, toast, refresh } = render('TENANT_ADMIN');
    api.save.mockReturnValueOnce(of({ status: 'ERROR', message: 'Model connection 1050 is not one this workspace can use.' }) as never);
    (card('public').querySelector('input[role="switch"][name="aiWriteTools"]') as HTMLInputElement).click();
    refresh();
    (el.querySelector('[data-save]') as HTMLButtonElement).click();
    refresh();
    expect(text(el.querySelector('[data-save-error]'))).toBe('Model connection 1050 is not one this workspace can use.');
    expect(toast.error).toHaveBeenCalled();
    expect((card('public').querySelector('input[role="switch"][name="aiWriteTools"]') as HTMLInputElement).checked).toBe(false);
  });

  it('compares the levels in one table, Sensitive (PHI) first, a setting a row (UX review B8, DP1)', () => {
    const { el, text } = render('TENANT_ADMIN');
    const table = el.querySelector('[data-policy-table] table')!;
    expect(Array.from(table.querySelectorAll('thead th[data-level]')).map(th => th.getAttribute('data-level'))).toEqual(['sensitive', 'internal', 'public']);
    expect(Array.from(table.querySelectorAll('tbody th[scope="row"] > span:first-child')).slice(0, 5).map(t => text(t)))
      .toEqual(['Model rule', 'Allowed models', 'Keep run files', 'AI write tools', 'Minimum-fields warning']);
    expect(el.querySelectorAll('section[data-level]').length).toBe(0);
  });

  it('offers the workspace\'s models, and rules out the ones the level\'s rule would never use', () => {
    const { card, refresh, page } = render('TENANT_ADMIN');
    const boxes = () => Array.from(card('sensitive').querySelectorAll<HTMLInputElement>('input[name="allowedModel"]'));
    expect(boxes().map(b => b.value)).toEqual(['1049', '1049|qwen3:8b', '1050', '1050|claude-sonnet-5']);
    expect(boxes().map(b => b.disabled)).toEqual([false, false, true, true]);
    boxes()[1].click();
    refresh();
    expect(page.drafts()[2].allowedModels).toEqual(['1049|qwen3:8b']);
  });

  it('puts a changed level back to its defaults, and discards every change', () => {
    const { el, card, refresh, page } = render('TENANT_ADMIN');
    const select = card('public').querySelector('select') as HTMLSelectElement;
    select.value = 'local'; select.dispatchEvent(new Event('change'));
    refresh();
    (card('public').querySelector('[data-use-defaults]') as HTMLButtonElement).click();
    refresh();
    expect(page.drafts()[0].modelRule).toBe('any');
    type(card('internal').querySelector('input[name="retention"]') as HTMLInputElement, '3');
    refresh();
    (el.querySelector('[data-discard]') as HTMLButtonElement).click();
    refresh();
    expect(page.drafts()[1].retention).toBe('');
  });

  it('says so when the policy cannot be read', () => {
    const { el, text } = render('TENANT_ADMIN', { error: 'The policy could not be read.' });
    expect(text(el.querySelector('app-load-error'))).toContain('The policy could not be read.');
    expect(el.querySelector('[data-level]')).toBeNull();
  });
});

describe('Administration › Data policies -- as a member', () => {
  it('reads the policy and changes nothing', () => {
    const { el, card, text, api } = render('TENANT_USER');
    expect(api.connections).not.toHaveBeenCalled();
    expect(el.querySelector('[data-save]')).toBeNull();
    expect(el.querySelector('select, input')).toBeNull();
    expect(text(el.querySelector('[data-read-only]'))).toContain('Only a workspace administrator can change');
    expect(text(card('sensitive'))).toContain('Local only');
    expect(text(card('sensitive'))).toContain('Off');
    expect(text(card('public'))).toContain('Any the rule allows');
  });
});

describe('Administration › Data policies -- as a platform administrator', () => {
  it('reads nothing until a workspace is picked, then reads and saves that one', () => {
    const { el, api, refresh, page } = render('PLATFORM_ADMIN');
    expect(api.get).not.toHaveBeenCalled();
    expect(el.querySelector('[data-level]')).toBeNull();
    page.pickWorkspace('2924');
    refresh();
    expect(api.get).toHaveBeenCalledWith(2924);
    page.setRetention(1, '7');
    page.save();
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 2924 }));
  });

  it('shows that workspace\'s retention below the levels (MIG-354)', () => {
    const { el, retention, refresh, page } = render('PLATFORM_ADMIN');
    expect(retention.view).not.toHaveBeenCalled();
    page.pickWorkspace('2924');
    refresh();
    expect(retention.view).toHaveBeenCalledWith(2924);
    expect(el.querySelector('[data-retention]')).not.toBeNull();
    expect(el.querySelectorAll('[data-retention-table] tbody tr').length).toBe(RETENTION_VIEW.classes.length);
  });
});

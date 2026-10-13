import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PromptEdit } from './prompt-edit';
import { placeholdersOf } from './prompt-model';
import { ToastService } from '../../../shared/ui/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { API_SUCCESS } from '../../../core/api/api.config';

/**
 * The editor's one rule that the server also enforces: every {{placeholder}} in the template
 * is a declared variable. The editor adds the row itself and refuses to save or try until
 * the row is there, so a typo never reaches a run as an empty string.
 */
function editor() {
  const get = vi.fn((url: string, options?: { params?: Record<string, string> }) => {
    if (url.endsWith('/aiConnection.json/list')) return of({ status: API_SUCCESS, data: [{ connectionId: 7, name: 'Ollama', provider: 'Ollama', defaultModel: 'gemma3:1b', isDefault: true }] });
    if (url.endsWith('/aiPrompt.json/objectText')) return of({ status: API_SUCCESS, message: 'Read discharge.pdf: 420 characters.', data: {
      bucket: options?.params?.['bucket'], key: options?.params?.['key'], name: 'discharge.pdf', kind: 'text',
      text: 'Discharge summary for M. Okafor. Total billed $188.50.', chars: 54, totalChars: 54, truncated: false,
    } });
    throw new Error(`unexpected GET ${url}`);
  });
  const post = vi.fn(() => of({ status: API_SUCCESS, message: 'ok', data: {} }));
  const toast = { success: vi.fn(), error: vi.fn(), info: () => {} };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get, post } },
    { provide: ToastService, useValue: toast },
    { provide: Router, useValue: { navigate: () => {} } },
    { provide: AuthService, useValue: { isPlatformAdmin: () => false, canManageAgents: () => true, builderLocked: () => false, user: () => ({ appUserId: 1 }) } },
  ] });
  const component = TestBed.runInInjectionContext(() => new PromptEdit());
  component.ngOnInit();
  TestBed.tick();
  return { component, post, toast, get };
}

describe('placeholdersOf', () => {
  it('reads each placeholder once, in order, tolerating spaces inside the braces', () => {
    expect(placeholdersOf('Claim {{claim_id}}: {{ document_text }} -- {{claim_id}}')).toEqual(['claim_id', 'document_text']);
  });
});

describe('PromptEdit', () => {
  it('adds a variable row for a placeholder typed into the template', () => {
    const { component } = editor();
    component.form.patchValue({ userTemplate: 'Summarise {{document_text}} for {{claim_id}}' });
    TestBed.tick();
    expect(component.declaredNames()).toEqual(['document_text', 'claim_id']);
    expect(component.undeclared()).toEqual([]);
  });

  it('refuses to try or save while a placeholder has no variable', () => {
    const { component, post, toast } = editor();
    component.form.patchValue({ name: 'x', userTemplate: 'Hello {{who}}' });
    TestBed.tick();
    // Take the auto-added row away again, as a person deleting it would.
    component.removeVariable(0);
    component.tryIt();
    component.save(true);
    expect(post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('{{who}}'));
  });

  it('sends the page as it is to try, samples included, and to save with activate', () => {
    const { component, post } = editor();
    component.form.patchValue({ name: 'Summarise', userTemplate: 'Claim {{claim_id}}', outputMode: 'json', outputSchema: '{"required":["a"]}' });
    TestBed.tick();
    component.variables.at(0).patchValue({ sample: 'CLM-1' });
    component.tryIt();
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/aiPrompt.json/try'), expect.objectContaining({
      name: 'Summarise', userTemplate: 'Claim {{claim_id}}', outputMode: 'json', outputSchema: '{"required":["a"]}', activate: false,
      variables: [{ name: 'claim_id', type: 'text', required: true, sample: 'CLM-1' }],
    }));
    component.save(true);
    expect(post).toHaveBeenLastCalledWith(expect.stringContaining('/aiPrompt.json/save'), expect.objectContaining({ activate: true }));
  });

  /**
   * Try it on a file. The file's text rides on the try as `values`, keyed by variable, and
   * never becomes the saved sample; a file_name variable is filled with the name alongside.
   */
  it('names the variable plainly in the file picker: no template braces in its heading', () => {
    const { component } = editor();
    const open = vi.spyOn((component as any).dialog, 'open').mockReturnValue({ closed: of(undefined) } as any);
    component.fromFile('file_name');
    expect((open.mock.calls[0][1] as any).data.heading).toBe('Choose a file for file_name');
  });

  it('fills a variable from a file for the try alone, and file_name with it', () => {
    const { component, post, get } = editor();
    component.form.patchValue({ name: 'Any file', userTemplate: '{{file_name}}: {{document_text}}' });
    TestBed.tick();
    component.variables.at(1).patchValue({ sample: 'hello' });
    // The picker is a dialog; drive the read directly with what it would have answered.
    (component as any).readObject('document_text', { bucket: 'medaxis', key: 'docs/discharge.pdf', name: 'discharge.pdf' });
    expect(get).toHaveBeenCalledWith(expect.stringContaining('/aiPrompt.json/objectText'), { params: { bucket: 'medaxis', key: 'docs/discharge.pdf' } });
    expect(component.sourceOf('document_text')?.name).toBe('discharge.pdf');
    expect(component.sourceOf('file_name')?.text).toBe('discharge.pdf');
    expect(component.trySourceList().map(s => s.variable).sort()).toEqual(['document_text', 'file_name']);

    component.tryIt();
    expect(post).toHaveBeenCalledWith(expect.stringContaining('/aiPrompt.json/try'), expect.objectContaining({
      values: { document_text: 'Discharge summary for M. Okafor. Total billed $188.50.', file_name: 'discharge.pdf' },
      // The sample is untouched: it documents the variable, the file is the try's business.
      variables: expect.arrayContaining([expect.objectContaining({ name: 'document_text', sample: 'hello' })]),
    }));
    component.save(false);
    expect(post).toHaveBeenLastCalledWith(expect.stringContaining('/aiPrompt.json/save'), expect.not.objectContaining({ values: expect.anything() }));

    component.clearSource('document_text');
    expect(component.sourceOf('document_text')).toBeUndefined();
    expect(component.sourceOf('file_name')).toBeDefined();
  });
});

/**
 * Opening an existing prompt whose read fails.
 *
 * The failure cleared the spinner and toasted, then rendered a blank "Edit prompt" form. Nothing
 * was loaded, so the save carried no promptId and CREATED a new prompt instead of a version of
 * the one being edited.
 */
describe('PromptEdit when the prompt cannot be read', () => {
  function openFailing() {
    let reads = 0;
    const get = vi.fn((url: string) => {
      if (url.endsWith('/aiPrompt.json/get')) { reads++; return throwError(() => ({ status: 500, error: { message: 'Database unavailable.' } })); }
      return of({ status: API_SUCCESS, data: [] });
    });
    const post = vi.fn((_url: string, _body?: unknown) => of({ status: API_SUCCESS, message: 'ok', data: {} }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: HttpClient, useValue: { get, post } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: () => {} } },
      provideRouter([]),
      { provide: AuthService, useValue: { isPlatformAdmin: () => false, canManageAgents: () => true, builderLocked: () => false, user: () => ({ appUserId: 1 }) } },
    ] });
    const fixture = TestBed.createComponent(PromptEdit);
    fixture.componentRef.setInput('promptId', '42');
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, post, reads: () => reads,
      text: () => ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ') };
  }

  it('shows why, with a way to try again, instead of an empty form', () => {
    const view = openFailing();
    expect(view.text()).toContain('Database unavailable.');
    expect((view.fixture.nativeElement as HTMLElement).querySelector('form')).toBeNull();

    const retry = Array.from((view.fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find(b => (b.textContent ?? '').includes('Try again'))!;
    retry.click();
    expect(view.reads()).toBe(2);
  });

  it('never saves a version of a prompt it could not read', () => {
    const view = openFailing();
    view.component.form.patchValue({ name: 'x', userTemplate: 'Hello' });
    view.component.save(true);
    expect(view.post.mock.calls.filter(c => String(c[0]).endsWith('/aiPrompt.json/save'))).toHaveLength(0);
  });
});

/**
 * The variables table tracked its rows by position. Removing the first row kept the first row's
 * DOM (and its form bindings) on screen, so the name you just removed was still shown and typing
 * into it changed nothing the form would save.
 */
describe('PromptEdit variables table after a removal', () => {
  function rendered() {
    const get = vi.fn((url: string) => of({ status: API_SUCCESS, data: url.endsWith('/aiConnection.json/list') ? [] : {} }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: HttpClient, useValue: { get, post: vi.fn(() => of({ status: API_SUCCESS, data: {} })) } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: () => {} } },
      provideRouter([]),
      { provide: AuthService, useValue: { isPlatformAdmin: () => false, canManageAgents: () => true, builderLocked: () => false, user: () => ({ appUserId: 1 }) } },
    ] });
    const fixture = TestBed.createComponent(PromptEdit);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const inputs = (label: string) => Array.from(el.querySelectorAll<HTMLInputElement>('table.prompt-vars tbody tr input'))
      .filter(i => (i.getAttribute('aria-label') ?? '').endsWith(label));
    return { fixture, component: fixture.componentInstance, inputs };
  }

  it('shows the rows that are left, and edits reach the right variable', () => {
    const { fixture, component, inputs } = rendered();
    component.addVariable({ name: 'alpha', sample: 'A' });
    component.addVariable({ name: 'beta', sample: 'B' });
    component.addVariable({ name: 'gamma', sample: 'C' });
    fixture.detectChanges();

    component.removeVariable(0);
    fixture.detectChanges();

    expect(inputs(' name').map(i => i.value)).toEqual(['beta', 'gamma']);
    expect(inputs(' sample value').map(i => i.value)).toEqual(['B', 'C']);
    const sample = inputs(' sample value')[0];
    sample.value = 'typed';
    sample.dispatchEvent(new Event('input'));
    expect(component.variables.at(0).value.sample).toBe('typed');
  });
});

/** The editor rendered for real, as a tenant administrator unless told otherwise. */
function renderedEditor(options: { platformAdmin?: boolean; promptId?: string; connections?: unknown[]; tenants?: unknown[]; prompt?: unknown } = {}) {
  const get = vi.fn((url: string) => {
    if (url.endsWith('/aiConnection.json/list')) return of({ status: API_SUCCESS, data: options.connections ?? [] });
    if (url.endsWith('/tenant.json/listTenants')) return of({ status: API_SUCCESS, data: options.tenants ?? [] });
    if (url.endsWith('/aiPrompt.json/get')) return of({ status: API_SUCCESS, data: options.prompt });
    return of({ status: API_SUCCESS, data: [] });
  });
  const post = vi.fn(() => of({ status: API_SUCCESS, message: 'ok', data: {} }));
  const toast = { success: vi.fn(), error: vi.fn(), info: () => {} };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [
    { provide: HttpClient, useValue: { get, post } },
    { provide: ToastService, useValue: toast },
    provideRouter([]),
    { provide: AuthService, useValue: { isPlatformAdmin: () => !!options.platformAdmin, canManageAgents: () => true, builderLocked: () => false, user: () => ({ appUserId: 1 }) } },
  ] });
  const fixture = TestBed.createComponent(PromptEdit);
  if (options.promptId) fixture.componentRef.setInput('promptId', options.promptId);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, component: fixture.componentInstance, el, post, toast };
}

/**
 * Any invalid control made the toast say "Fill in the name and the message template", even when
 * both were filled and the problem was a variable's name or the temperature. A bad variable name
 * got no red mark either.
 */
describe('PromptEdit validation says what is actually wrong', () => {
  it('names the variable rule when a variable name is the problem, and marks that name', () => {
    const { fixture, component, el, post, toast } = renderedEditor();
    component.form.patchValue({ name: 'x', userTemplate: 'Hello' });
    component.addVariable({ name: 'bad-name', sample: 'A' });
    fixture.detectChanges();

    component.save(true);
    fixture.detectChanges();

    expect(post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Name every variable'));
    const name = el.querySelector<HTMLInputElement>('table.prompt-vars tbody tr input')!;
    expect(name.classList).toContain('input-invalid');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('#pVarsError')?.textContent).toContain('letters, digits and underscores');
  });

  it('points at the highlighted fields when a number is out of range', () => {
    const { fixture, component, el, post, toast } = renderedEditor();
    component.form.patchValue({ name: 'x', userTemplate: 'Hello' });
    const temperature = el.querySelector<HTMLInputElement>('#pTemp')!;
    temperature.value = '5';
    temperature.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    component.tryIt();

    expect(post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Check the highlighted fields.');
    expect(component.form.get('temperature')!.touched).toBe(true);
  });

  it('still asks for the name and template when those are what is missing', () => {
    const { component, toast } = renderedEditor();
    component.save(false);
    expect(toast.error).toHaveBeenCalledWith('Fill in the name and the message template.');
  });

  it('keeps a badly named variable out of the Insert chips', () => {
    const { component } = renderedEditor();
    component.addVariable({ name: 'bad-name' });
    component.addVariable({ name: 'good_name' });
    expect(component.declaredNames()).toEqual(['good_name']);
  });
});

/**
 * On a phone the variables table was crushed to the card's width and an absolutely positioned
 * sr-only header span, contained by nothing nearer than the page, widened the page by 90px.
 */
describe('PromptEdit variables table on a narrow screen', () => {
  it('scrolls the table inside its own box, with a floor under each control', () => {
    const { fixture, component, el } = renderedEditor();
    component.addVariable({ name: 'alpha' });
    fixture.detectChanges();
    const table = el.querySelector<HTMLElement>('table.prompt-vars')!;
    expect(table.parentElement!.classList).toContain('overflow-x-auto');
    expect(table.parentElement!.classList).toContain('relative');
    expect(table.classList).toContain('min-w-[36rem]');
    expect(table.querySelector('input.mono')!.classList).toContain('min-w-28');
    expect(table.querySelector('select')!.classList).toContain('min-w-32');
  });
});

/**
 * A platform administrator sees every workspace's connections. The editor offered all of them,
 * and with no connection picked it named some other workspace's default as where Try it would run.
 */
describe('PromptEdit for a platform administrator', () => {
  const connections = [
    { connectionId: 1, tenantId: 10, name: 'Acme Ollama', provider: 'Ollama', defaultModel: 'gemma3:1b', isDefault: true },
    { connectionId: 2, tenantId: 20, name: 'Globex OpenAI', provider: 'OpenAI', defaultModel: 'gpt-4o-mini', isDefault: true },
    { connectionId: 3, tenantId: 20, name: 'Globex Claude', provider: 'Anthropic', defaultModel: 'claude', isDefault: false },
  ];
  const tenants = [{ tenantId: 10, tenantName: 'Acme' }, { tenantId: 20, tenantName: 'Globex' }];

  it('offers no connection and names no default until a workspace is picked', () => {
    const { component, el } = renderedEditor({ platformAdmin: true, connections, tenants });
    expect(component.connectionOptions()).toEqual([]);
    expect(component.connection()).toBeNull();
    expect(component.modelHint()).toContain('Pick a workspace first');
    expect(el.textContent).toContain('Pick a workspace first');
  });

  it('offers only the picked workspace\'s connections, and its own default', () => {
    const { component } = renderedEditor({ platformAdmin: true, connections, tenants });
    component.form.patchValue({ tenantId: 20 });
    expect(component.connectionOptions().map(o => o.value)).toEqual(['2', '3']);
    expect(component.connection()?.name).toBe('Globex OpenAI');
  });

  it('drops a picked connection that the newly picked workspace does not have', () => {
    const { component } = renderedEditor({ platformAdmin: true, connections, tenants });
    component.form.patchValue({ tenantId: 20 });
    component.form.patchValue({ connectionId: 3 });
    component.form.patchValue({ tenantId: 10 });
    expect(component.form.get('connectionId')!.value).toBeNull();
    expect(component.connection()?.name).toBe('Acme Ollama');
  });

  it('says which workspace a prompt being edited belongs to', () => {
    const { fixture, el } = renderedEditor({ platformAdmin: true, connections, tenants, promptId: '5', prompt: {
      promptId: 5, tenantId: 20, name: 'Summarise', userTemplate: 'Hi', outputMode: 'text', version: 2, status: 'Active', variables: [],
    } });
    fixture.detectChanges();
    expect(el.querySelector('h1')!.textContent).toContain('Globex');
  });

  it('changes nothing for a tenant administrator, whose list the server already scoped', () => {
    const { component } = renderedEditor({ connections: connections.slice(0, 1) });
    expect(component.connectionOptions().map(o => o.value)).toEqual(['1']);
    expect(component.connection()?.name).toBe('Acme Ollama');
  });
});

/** MIG-243/254: a prompt declares the level of the data it is sent, and the workspace's data policy for that level applies. */
describe('PromptEdit -- data sensitivity', () => {
  it('offers the three levels, and not set', () => {
    const { component } = editor();
    expect(component.sensitivities.map(s => s.value)).toEqual(['', 'public', 'internal', 'sensitive']);
    expect(component.sensitivities[0].label).toBe('Not set (read as internal)');
  });

  it('sends the level picked, and blank to clear it', () => {
    const { component, post } = editor();
    component.form.patchValue({ name: 'Summarise', userTemplate: 'Hello', dataSensitivity: 'sensitive' });
    TestBed.tick();
    component.save(true);
    expect(post).toHaveBeenLastCalledWith(expect.stringContaining('/aiPrompt.json/save'), expect.objectContaining({ dataSensitivity: 'sensitive' }));
    component.form.patchValue({ dataSensitivity: '' });
    component.save(true);
    expect(post).toHaveBeenLastCalledWith(expect.stringContaining('/aiPrompt.json/save'), expect.objectContaining({ dataSensitivity: '' }));
  });
});

/**
 * MIG-349: an answer that never fit the output schema comes back held for review -- the reason, and the answer that was
 * held, shown apart from a failure and never as the answer.
 */
describe('PromptEdit try held for review', () => {
  function rendered(run: Record<string, unknown>) {
    const get = vi.fn((url: string) => of({ status: API_SUCCESS, data: url.endsWith('/aiConnection.json/list')
      ? [{ connectionId: 7, name: 'Ollama', provider: 'Ollama', defaultModel: 'gemma3:4b', isDefault: true }] : {} }));
    const post = vi.fn(() => of({ status: 'ERROR', message: String(run['error'] ?? ''), data: run }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [
      { provide: HttpClient, useValue: { get, post } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: () => {} } },
      provideRouter([]),
      { provide: AuthService, useValue: { isPlatformAdmin: () => false, canManageAgents: () => true, builderLocked: () => false, user: () => ({ appUserId: 1 }) } },
    ] });
    const fixture = TestBed.createComponent(PromptEdit);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.patchValue({ name: 'Triage', userTemplate: 'Label the image.', outputMode: 'json',
      outputSchema: '{"properties":{"label":{"type":"string","enum":["normal","pneumonia"]}}}' });
    TestBed.tick();
    component.tryIt();
    fixture.detectChanges();
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
  }

  it('says held for review with the reason, and shows the held answer as not used', () => {
    const text = rendered({ runId: 1, kind: 'try', status: 'review', dateCreated: '2026-10-07T09:00:00',
      error: 'Held for review: the answer is not the JSON the prompt expects: label: "maybe" is not one of the allowed values (normal, pneumonia)',
      output: '{"label":"maybe"}' });
    expect(text).toContain('Held for review');
    expect(text).toContain('is not one of the allowed values (normal, pneumonia)');
    expect(text).toContain('The answer that was held (not used):');
    expect(text).toContain('"label": "maybe"');
    expect(text).not.toContain('Answered');
  });

  it('still says Failed, with no held answer, for a run that failed', () => {
    const text = rendered({ runId: 2, kind: 'try', status: 'failed', dateCreated: '2026-10-07T09:00:00', error: 'HTTP 401: bad key' });
    expect(text).toContain('Failed');
    expect(text).toContain('HTTP 401: bad key');
    expect(text).not.toContain('Held for review');
  });
});

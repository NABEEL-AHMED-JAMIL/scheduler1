import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { SchemaForm } from './schema-form';
import { ApiRequestChoice, JsonSchema, fieldsOf, usesApiRequest } from './steps.model';
import { StepsApi } from './steps.service';
import { DocumentsApi } from '../../documents/documents.service';

/**
 * Owner #25: a step that names a saved API request (Read API, Enrich, Call API) picks it from the workspace's requests,
 * grouped by collection with their methods, and its environment from that request's collection.
 */
const SCHEMA: JsonSchema = {
  type: 'object', required: ['requestId'],
  properties: {
    requestId: { type: 'integer', title: 'API request', format: 'api-request' },
    environmentId: { type: 'integer', title: 'Environment', format: 'api-environment' },
  },
};
const REQUESTS: ApiRequestChoice[] = [
  { id: 12, label: 'Referrals › Create referral', method: 'POST', collectionId: 3, collection: 'Referrals', enabled: true,
    environments: [{ id: 7, label: 'Sandbox (default)' }, { id: 8, label: 'Live' }] },
  { id: 13, label: 'Referrals › Update referral', method: 'PUT', collectionId: 3, collection: 'Referrals', enabled: false, environments: [] },
  { id: 20, label: 'Labs › Results', method: 'GET', collectionId: 4, collection: 'Labs', enabled: true, environments: [] },
];

function form(value: Record<string, unknown>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [SchemaForm], providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(SchemaForm);
  fixture.componentRef.setInput('schema', SCHEMA);
  fixture.componentRef.setInput('value', value);
  fixture.componentRef.setInput('apiRequests', REQUESTS);
  const changes: Record<string, unknown>[] = [];
  fixture.componentInstance.valueChange.subscribe(v => changes.push(v));
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, changes };
}

describe('an api-request setting', () => {
  it('is a picker, not a number box, and says which tasks need the list', () => {
    expect(fieldsOf(SCHEMA).map(f => f.kind)).toEqual(['api-request', 'api-environment']);
    expect(usesApiRequest(SCHEMA)).toBe(true);
    expect(usesApiRequest({ type: 'object', properties: { a: { type: 'integer' } } })).toBe(false);
  });

  it('offers the requests by collection with their methods, a disabled one greyed, and answers the id', () => {
    const { el, changes } = form({});
    const select = el.querySelector<HTMLSelectElement>('#cfg-requestId')!;
    expect([...select.querySelectorAll('optgroup')].map(g => g.label)).toEqual(['Referrals', 'Labs']);
    const options = [...select.querySelectorAll('option')].map(o => [o.textContent!.trim(), o.disabled]);
    expect(options).toEqual([['Choose an API request…', false], ['POST · Create referral', false],
      ['PUT · Update referral (disabled)', true], ['GET · Results', false]]);
    select.value = '12';
    select.dispatchEvent(new Event('change'));
    expect(changes.at(-1)).toEqual({ requestId: 12 });
  });

  it('offers the chosen request\'s environments, and names a saved one that is not listed', () => {
    const { el } = form({ requestId: 12, environmentId: 99 });
    const env = el.querySelector<HTMLSelectElement>('#cfg-environmentId')!;
    expect([...env.querySelectorAll('option')].map(o => o.textContent!.trim()))
      .toEqual(["The collection's default", 'Sandbox (default)', 'Live', 'Environment 99']);
  });
});

describe('StepsApi.apiRequests', () => {
  it('reads every collection once and lists its requests with the collection\'s environments', async () => {
    const get = vi.fn((url: string, options?: { params?: Record<string, unknown> }) => of(url.endsWith('/list')
      ? { data: [{ collectionId: 3, name: 'Referrals' }] }
      : { status: 'SUCCESS', data: { collection: { collectionId: options!.params!['collectionId'], name: 'Referrals' },
        requests: [{ requestId: 12, name: 'Create referral', method: 'post', enabled: true }],
        environments: [{ environmentId: 7, name: 'Sandbox', isDefault: true }] } }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: { get } }, { provide: DocumentsApi, useValue: {} }] });
    const api = TestBed.inject(StepsApi);
    const choices = await new Promise<ApiRequestChoice[]>(done => api.apiRequests().subscribe(done));
    expect(choices).toEqual([{ id: 12, label: 'Referrals › Create referral', method: 'POST', collectionId: 3, collection: 'Referrals',
      enabled: true, environments: [{ id: 7, label: 'Sandbox (default)' }] }]);
    expect(get).toHaveBeenCalledTimes(2);
  });
});

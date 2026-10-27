import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { StepNames } from './step-names';
import { StepsApi } from './steps.service';

function setup() {
  const get = vi.fn((url: string, _options?: { params: Record<string, number> }) => of(url.endsWith('/request/get')
    ? { status: 'SUCCESS', data: { name: 'Create referral', collectionId: 3 } }
    : { status: 'SUCCESS', data: { environments: [{ environmentId: 7, name: 'Sandbox' }] } }));
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: { get } }, { provide: StepsApi, useValue: {} }] });
  return { get, names: TestBed.inject(StepNames) };
}

const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

describe('StepNames: an API request\'s name', () => {
  it('names the pipeline\'s workspace on a platform administrator\'s reads', async () => {
    const { get, names } = setup();
    expect(names.lookupIn(2960)('api-request', '70', { config: {} } as never)).toBeNull();
    await settle();
    expect(get.mock.calls.map(c => (c[1] as { params: Record<string, number> }).params)).toEqual([
      { requestId: 70, tenantId: 2960 }, { collectionId: 3, tenantId: 2960 }]);
    expect(names.lookupIn(2960)('api-request', '70', { config: {} } as never)).toBe('Create referral');
    expect(names.names()['api-environment:7']).toBe('Sandbox');
  });

  it('names none for a workspace\'s people', async () => {
    const { get, names } = setup();
    names.lookup('api-request', '71', { config: {} } as never);
    await settle();
    expect((get.mock.calls[0][1] as { params: Record<string, number> }).params).toEqual({ requestId: 71 });
  });
});

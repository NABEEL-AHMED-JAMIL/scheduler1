import { describe, it, expect } from 'vitest';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { ApiResponse } from '../../../core/api/api.config';
import { kafkaDependencyNote, kafkaProfilesUsing } from './kafka-dependents';

const profiles = [
  { profileName: 'prod-sasl', sslTruststoreBucket: 'etl-bucket', sslKeystoreBucket: 'etl-bucket' },
  { profileName: 'staging',   sslKeystoreBucket: 'etl-bucket' },
  { profileName: 'dev',       sslTruststoreBucket: 'other-bucket' },
  { profileName: 'plaintext' },
];

/** Stands in for HttpClient: the helper only ever issues the one GET. */
function httpReturning(response: ApiResponse<unknown> | 'fails'): HttpClient {
  return {
    get: () => response === 'fails'
      ? throwError(() => new Error('403'))
      : of(response),
  } as unknown as HttpClient;
}

describe('kafkaProfilesUsing', () => {
  const ok: ApiResponse<unknown> = { status: 'SUCCESS', message: '', data: profiles };

  it('names every profile bound to the alias, by either store', async () => {
    expect(await kafkaProfilesUsing(httpReturning(ok), 'etl-bucket'))
      .toEqual(['prod-sasl', 'staging']);
  });

  it('names a profile once even when both of its stores use the alias', async () => {
    const names = await kafkaProfilesUsing(httpReturning(ok), 'etl-bucket');
    expect(names.filter(name => name === 'prod-sasl')).toHaveLength(1);
  });

  it('matches the alias exactly, so "etl" does not claim "etl-bucket"', async () => {
    expect(await kafkaProfilesUsing(httpReturning(ok), 'etl')).toEqual([]);
  });

  it('asks nothing when there is no alias to ask about', async () => {
    expect(await kafkaProfilesUsing(httpReturning('fails'), '  ')).toEqual([]);
  });

  // The warning is advisory. Someone who cannot read the Kafka profiles still has to be able to
  // save or delete, so a refused or broken lookup reports no dependants rather than throwing.
  it('reports nothing when the lookup fails', async () => {
    expect(await kafkaProfilesUsing(httpReturning('fails'), 'etl-bucket')).toEqual([]);
  });

  it('reports nothing when the server answers with an error envelope', async () => {
    const denied: ApiResponse<unknown> = { status: 'ERROR', message: 'Not permitted.' };
    expect(await kafkaProfilesUsing(httpReturning(denied), 'etl-bucket')).toEqual([]);
  });
});

describe('kafkaDependencyNote', () => {
  it('says nothing when nothing depends on the alias', () => {
    expect(kafkaDependencyNote([])).toBe('');
  });

  it('names the profiles, so the warning can be acted on', () => {
    expect(kafkaDependencyNote(['prod-sasl', 'staging']))
      .toContain('Kafka profiles prod-sasl, staging');
  });

  it('reads as a singular for one profile', () => {
    expect(kafkaDependencyNote(['prod-sasl'])).toContain('Kafka profile prod-sasl');
  });
});

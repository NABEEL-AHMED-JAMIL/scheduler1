import { describe, it, expect } from 'vitest';
import type { AbstractControl } from '@angular/forms';
import {
  additionalPropertiesJson, combinationSummary, identityFileIds, profilePayload, protocolNeedsSasl,
  protocolNeedsSsl, tlsLead, trustFileIds,
} from './kafka-profile-form';

/** The validator only ever reads `value`, so a control's worth of it is enough to try it on. */
const check = (value: unknown) => additionalPropertiesJson({ value } as AbstractControl);

describe('what a protocol asks for', () => {
  it.each(['SASL_PLAINTEXT', 'SASL_SSL'])('%s needs credentials', protocol => {
    expect(protocolNeedsSasl(protocol)).toBe(true);
  });

  it.each(['PLAINTEXT', 'SSL', '', null, undefined])('%s does not', protocol => {
    expect(protocolNeedsSasl(protocol)).toBe(false);
  });

  it.each(['SSL', 'SASL_SSL'])('%s needs TLS material', protocol => {
    expect(protocolNeedsSsl(protocol)).toBe(true);
  });

  it.each(['PLAINTEXT', 'SASL_PLAINTEXT', null])('%s does not', protocol => {
    expect(protocolNeedsSsl(protocol)).toBe(false);
  });
});

describe('additional properties', () => {
  it('rejects the key=value line the field used to suggest', () => {
    // The hint said "one key=value per line" while the server parsed the same string as JSON,
    // so the screen's own placeholder was a value the API refused. Now it is caught here.
    expect(check('request.timeout.ms=30000')).toEqual({ jsonObject: true });
  });

  it('accepts a JSON object of properties', () => {
    expect(check('{"request.timeout.ms": "30000", "retries": "3"}')).toBeNull();
  });

  it('says nothing about a field left empty', () => {
    expect(check('')).toBeNull();
    expect(check('   \n ')).toBeNull();
    expect(check(null)).toBeNull();
  });

  it('accepts numbers and booleans, which Gson widens into strings on the way in', () => {
    expect(check('{"request.timeout.ms": 30000, "enable.idempotence": true}')).toBeNull();
  });

  it('rejects a value the server cannot read as a string property', () => {
    expect(check('{"sasl": {"mechanism": "PLAIN"}}')).toEqual({ jsonScalarValues: true });
    expect(check('{"brokers": ["a", "b"]}')).toEqual({ jsonScalarValues: true });
    expect(check('{"acks": null}')).toEqual({ jsonScalarValues: true });
  });

  it('rejects JSON that is not an object at all', () => {
    expect(check('[]')).toEqual({ jsonObject: true });
    expect(check('"30000"')).toEqual({ jsonObject: true });
    expect(check('null')).toEqual({ jsonObject: true });
    expect(check('{')).toEqual({ jsonObject: true });
  });
});

describe('the body a save sends', () => {
  const form = (over: Record<string, any> = {}) => ({
    kafkaConnectionProfileId: 1003,
    profileName: 'Production cluster',
    bootstrapServers: 'broker-1:9092',
    securityProtocol: 'SASL_SSL',
    saslMechanism: 'SCRAM-SHA-512',
    saslUsername: 'svc-etl',
    saslPassword: '',
    sslTruststoreBucket: 'etl-secrets',
    sslTruststoreLocation: 'kafka-secrets/truststore.p12',
    sslTruststorePassword: '',
    sslKeystoreBucket: 'etl-secrets',
    sslKeystoreLocation: 'kafka-secrets/keystore.p12',
    sslKeystorePassword: '',
    sslKeyPassword: '',
    sslKeyPasswordEnc: '',
    sslEndpointIdentificationAlgorithm: 'https',
    additionalProperties: '',
    status: 'Active',
    ...over,
  });

  it('leaves a blank password out rather than sending an empty one', () => {
    // An empty string would be encrypted and stored, wiping a working credential; absent means
    // "keep what is there", which is what the server does with a missing key.
    const body = profilePayload(form(), true);
    expect('saslPassword' in body).toBe(false);
    expect('sslTruststorePassword' in body).toBe(false);
  });

  it('sends a password that was actually typed', () => {
    expect(profilePayload(form({ saslPassword: 'typed' }), true)['saslPassword']).toBe('typed');
  });

  it('carries the hostname verification setting back unchanged', () => {
    // The control did not exist, so the key was never in the body and the server -- which
    // writes this field with no null guard -- turned the check back on behind the user.
    expect(profilePayload(form({ sslEndpointIdentificationAlgorithm: '' }), true)
      ['sslEndpointIdentificationAlgorithm']).toBe('');
  });

  it('clears the credentials a protocol without SASL cannot use', () => {
    const body = profilePayload(form({ securityProtocol: 'SSL' }), true);
    expect(body['saslMechanism']).toBeNull();
    expect(body['saslUsername']).toBeNull();
    expect('saslPassword' in body).toBe(false);
    // Dropping the field only means "keep what is stored", so the flag is what actually takes
    // the credential away from a profile that has stopped speaking SASL.
    expect(body['clearSaslPassword']).toBe(true);
  });

  it('clears the keystore when the broker does not ask for a client certificate', () => {
    const body = profilePayload(form(), false);
    expect(body['sslKeystoreBucket']).toBeNull();
    expect(body['sslKeystoreLocation']).toBeNull();
    expect('sslKeystorePassword' in body).toBe(false);
    expect('sslKeyPassword' in body).toBe(false);
    expect(body['clearSslKeystorePassword']).toBe(true);
    expect(body['clearSslKeyPassword']).toBe(true);
    // The truststore is a different question and is left alone.
    expect(body['sslTruststoreLocation']).toBe('kafka-secrets/truststore.p12');
  });

  it('sends the truststore clear flag the TLS section sets, and no other', () => {
    const body = profilePayload(form({ clearSslTruststorePassword: true }), true);
    expect(body['clearSslTruststorePassword']).toBe(true);
    expect('clearSslKeystorePassword' in body).toBe(false);
  });

  it('says nothing at all about a flag that is still false', () => {
    // The server only reads a true one, and an absent key is quieter than a false one.
    const body = profilePayload(form({ clearSslTruststorePassword: false }), true);
    expect('clearSslTruststorePassword' in body).toBe(false);
  });

  it('keeps the keystore on an mTLS profile', () => {
    expect(profilePayload(form(), true)['sslKeystoreLocation']).toBe('kafka-secrets/keystore.p12');
  });

  /**
   * The password of the key inside a generated keystore, in a column of its own. Sent blank it
   * would read as "keep what is stored" against a store that has just been replaced -- and left
   * out of the going-away branch it would outlive the keystore entirely.
   */
  it('carries the generated key password through, and drops it with the keystore', () => {
    expect(profilePayload(form({ sslKeyPasswordEnc: 'cipher' }), true)['sslKeyPasswordEnc'])
      .toBe('cipher');
    expect('sslKeyPasswordEnc' in profilePayload(form(), true)).toBe(false);
    expect('sslKeyPasswordEnc' in profilePayload(form({ sslKeyPasswordEnc: 'cipher' }), false))
      .toBe(false);
  });

  /**
   * The mTLS branch is about the keystore question, not the protocol: it must not fire on a
   * protocol that has no TLS at all, where the answer to that question is meaningless.
   *
   * What the server does with the paths afterwards is its own decision and not this function's --
   * applyProfileDto drops both stores, their locations included, whenever the protocol is not SSL
   * or SASL_SSL, so a profile saved on PLAINTEXT does not come back with its TLS material intact.
   */
  it('leaves the TLS paths alone on a protocol that has no TLS to have an opinion about', () => {
    const body = profilePayload(form({ securityProtocol: 'SASL_PLAINTEXT' }), false);
    expect(body['sslKeystoreLocation']).toBe('kafka-secrets/keystore.p12');
    expect(body['sslTruststoreLocation']).toBe('kafka-secrets/truststore.p12');
    expect('clearSslKeystorePassword' in body).toBe(false);
  });

  it('does not touch the form value it was handed', () => {
    const raw = form();
    profilePayload(raw, false);
    expect(raw.saslPassword).toBe('');
    expect(raw.sslKeystoreLocation).toBe('kafka-secrets/keystore.p12');
  });
});

describe('the line explaining the chosen combination', () => {
  it('names the mechanism doing the authenticating', () => {
    expect(combinationSummary('SASL_SSL', 'SCRAM-SHA-512', false)).toContain('SCRAM-SHA-512');
  });

  it('warns that PLAIN over an unencrypted connection is readable', () => {
    expect(combinationSummary('SASL_PLAINTEXT', 'PLAIN', false)).toContain('readable on the wire');
  });

  it('calls the truststore optional on a managed SASL_SSL cluster', () => {
    expect(combinationSummary('SASL_SSL', 'PLAIN', false)).toContain('only needed');
  });

  it('says a keystore is required once mTLS is on', () => {
    expect(combinationSummary('SASL_SSL', 'PLAIN', true)).toContain('keystore is required');
    expect(combinationSummary('SSL', 'PLAIN', true)).toContain('required');
  });

  it('points at the mTLS box on an SSL profile with no client certificate', () => {
    expect(combinationSummary('SSL', 'PLAIN', false)).toContain('client certificate');
  });

  it('has nothing to ask for on PLAINTEXT', () => {
    expect(combinationSummary('PLAINTEXT', 'PLAIN', false)).toContain('No credentials and no files');
  });
});

describe('which TLS files a combination asks for', () => {
  it('asks for nothing at all on a protocol with no TLS', () => {
    expect(trustFileIds('PLAINTEXT', 'certificates', true)).toEqual([]);
    expect(identityFileIds('SASL_PLAINTEXT', 'certificates', true)).toEqual([]);
  });

  it('asks for nothing on a managed cluster whose CA the JVM already trusts', () => {
    expect(trustFileIds('SASL_SSL', 'certificates', false)).toEqual([]);
    expect(identityFileIds('SASL_SSL', 'certificates', false)).toEqual([]);
  });

  it('takes the CA certificate on the route that builds the stores', () => {
    expect(trustFileIds('SASL_SSL', 'certificates', true)).toEqual(['ca']);
  });

  it('takes a finished truststore on the route for somebody who ran keytool', () => {
    expect(trustFileIds('SASL_SSL', 'stores', true)).toEqual(['truststore']);
  });

  it('takes both halves of the client pair for mTLS, and one store instead', () => {
    expect(identityFileIds('SSL', 'certificates', true)).toEqual(['clientCertificate', 'clientKey']);
    expect(identityFileIds('SSL', 'stores', true)).toEqual(['keystore']);
  });

  it('asks for everything when the broker is both private and mutual', () => {
    expect([...trustFileIds('SSL', 'certificates', true),
            ...identityFileIds('SSL', 'certificates', true)])
      .toEqual(['ca', 'clientCertificate', 'clientKey']);
  });

  /**
   * The reason the two halves ask separately. A site that publishes one finished truststore and
   * issues PEM client pairs per service had nowhere to put either file while a single route
   * answered for both.
   */
  it('lets a finished truststore sit beside a PEM client pair', () => {
    expect(trustFileIds('SSL', 'stores', true)).toEqual(['truststore']);
    expect(identityFileIds('SSL', 'certificates', true))
      .toEqual(['clientCertificate', 'clientKey']);
  });

  it('lets a PEM CA sit beside a finished keystore', () => {
    expect(trustFileIds('SSL', 'certificates', true)).toEqual(['ca']);
    expect(identityFileIds('SSL', 'stores', true)).toEqual(['keystore']);
  });
});

describe('the line above the TLS uploads', () => {
  it('has nothing to say where there is no TLS', () => {
    expect(tlsLead('SASL_PLAINTEXT', 'PLAIN', true, true)).toBe('');
  });

  it('names the mechanism, because it is what makes a client certificate optional', () => {
    const lead = tlsLead('SASL_SSL', 'SCRAM-SHA-512', false, false);
    expect(lead).toContain('SCRAM-SHA-512');
    expect(lead).toContain('unless the broker was set up to demand one');
  });

  it('says the client certificate is the only identity on plain SSL', () => {
    expect(tlsLead('SSL', 'PLAIN', false, true)).toContain('only thing that says who this client is');
  });

  it('says outright that a public CA needs no upload', () => {
    expect(tlsLead('SASL_SSL', 'PLAIN', false, false)).toContain('Nothing is needed to trust the broker');
  });

  it('asks for the authority once somebody says the CA is private', () => {
    expect(tlsLead('SASL_SSL', 'PLAIN', true, false)).toContain('has to be supplied here');
  });
});

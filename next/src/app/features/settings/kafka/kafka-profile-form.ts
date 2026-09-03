import type { AbstractControl, ValidationErrors } from '@angular/forms';
import type { KafkaSecretKind } from './kafka-secret.service';

/**
 * The rules the Kafka profile form and the server have to agree on, kept out of the dialog so
 * they can be read and tested on their own. Every one of them exists because the screen and the
 * API disagreed about something: which fields a protocol needs, what format Advanced properties
 * are in, and which values survive a save.
 */

/** Exactly what validateProfile accepts; anything else is rejected on the way in. */
export const SECURITY_PROTOCOLS = ['PLAINTEXT', 'SASL_PLAINTEXT', 'SASL_SSL', 'SSL'];

/** The mechanisms the broker-side login modules cover -- PLAIN, or either SCRAM digest. */
export const SASL_MECHANISMS = ['PLAIN', 'SCRAM-SHA-256', 'SCRAM-SHA-512'];

/** Java keystore formats, shared by the file inputs and the guidance that lists them. */
export const STORE_FILE_TYPES = '.p12,.jks,.pfx';

/** CertificateFactory reads PEM and DER off the same stream, so both extensions are offered. */
export const CERTIFICATE_FILE_TYPES = '.pem,.crt,.cer,.der';

/** Only unencrypted PKCS#8 is readable server-side; anything else is refused by name there. */
export const PRIVATE_KEY_FILE_TYPES = '.pem,.key,.pk8,.p8';

/** Hostname verification: Kafka's own default is https, and blank switches it off. */
export const VERIFY_HOSTNAME = 'https';
export const SKIP_HOSTNAME_CHECK = '';

/** The secrets the API only ever reports as "configured", never returns. */
const SECRET_FIELDS = ['saslPassword', 'sslTruststorePassword', 'sslKeystorePassword', 'sslKeyPassword',
  'sslTruststorePasswordEnc', 'sslKeystorePasswordEnc', 'sslKeyPasswordEnc'];

/**
 * The flags that put a stored secret back to none at all.
 *
 * A blank password field means "keep the stored one", so without these there is no way from this
 * screen to take a credential away again -- which matters now that removing a store is one click.
 * A false flag is dropped rather than sent, because the server only reads it when it is true and
 * an absent key says the same thing more quietly.
 */
const CLEAR_FLAGS = [
  'clearSaslPassword', 'clearSslTruststorePassword', 'clearSslKeystorePassword', 'clearSslKeyPassword'];

export function protocolNeedsSasl(protocol: string | null | undefined): boolean {
  return !!protocol && protocol.startsWith('SASL_');
}

export function protocolNeedsSsl(protocol: string | null | undefined): boolean {
  return protocol === 'SSL' || protocol === 'SASL_SSL';
}

/**
 * Advanced properties travel as a JSON object of Kafka client properties -- the server parses
 * the string with Gson as a Map<String,String>, so a bare `key=value` line is refused. This is
 * that same parse, run before the request leaves, so the complaint lands on the field instead
 * of arriving as a toast after a round trip.
 *
 * Gson widens a number or a boolean into its string form, so those are let through; an array,
 * a nested object or a null value is what it actually throws on.
 */
export function additionalPropertiesJson(control: AbstractControl): ValidationErrors | null {
  const text = String(control.value ?? '').trim();
  if (!text) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { jsonObject: true };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { jsonObject: true };
  }
  const values = Object.values(parsed as Record<string, unknown>);
  if (values.some(value => value === null || typeof value === 'object')) {
    return { jsonScalarValues: true };
  }
  return null;
}

/**
 * Turns the raw form value into the body the API is sent.
 *
 * A blank secret means "leave the stored one alone" rather than "clear it", so it is dropped
 * rather than sent empty. Fields the chosen combination does not use are cleared, so the saved
 * row says the same thing the screen did -- a profile that no longer speaks SASL should not
 * keep a username, and one the broker never asks for a certificate on should not keep a
 * keystore path pointing at a file the client will still try to download.
 */
export function profilePayload(raw: Record<string, any>, mutualTls: boolean): Record<string, any> {
  const body: Record<string, any> = { ...raw };
  SECRET_FIELDS.forEach(key => { if (!body[key]) delete body[key]; });

  if (!protocolNeedsSasl(body['securityProtocol'])) {
    body['saslMechanism'] = null;
    body['saslUsername'] = null;
    delete body['saslPassword'];
    body['clearSaslPassword'] = true;
  }
  if (protocolNeedsSsl(body['securityProtocol']) && !mutualTls) {
    body['sslKeystoreBucket'] = null;
    body['sslKeystoreLocation'] = null;
    delete body['sslKeystorePassword'];
    delete body['sslKeystorePasswordEnc'];
    delete body['sslKeyPassword'];
    delete body['sslKeyPasswordEnc'];
    // The store is going; its password has nothing left to open and would otherwise sit in the
    // row until somebody turned mTLS back on and wondered which store it belonged to.
    body['clearSslKeystorePassword'] = true;
    body['clearSslKeyPassword'] = true;
  }

  CLEAR_FLAGS.forEach(key => { if (!body[key]) delete body[key]; });
  return body;
}

/**
 * One line saying what the chosen protocol and mechanism actually ask of the person filling the
 * form. The screen used to show the same nine TLS controls to everybody and leave them to work
 * out from the guide which four were mTLS-only.
 */
export function combinationSummary(
    protocol: string, mechanism: string, mutualTls: boolean): string {
  if (protocol === 'PLAINTEXT') {
    return 'No credentials and no files: the broker takes the connection as it comes.';
  }
  if (protocol === 'SASL_PLAINTEXT') {
    return mechanism === 'PLAIN'
      ? 'A username and password, and nothing to upload. PLAIN hands the password to the broker as it is, and on an unencrypted connection that is readable on the wire.'
      : `A username and password, and nothing to upload. ${mechanism} proves the password without sending it, but everything else on this connection is unencrypted.`;
  }
  if (protocol === 'SASL_SSL') {
    const credentials = `TLS encrypts the connection and ${mechanism} authenticates you with a username and password.`;
    return mutualTls
      ? `${credentials} The broker also asks for a client certificate, so a keystore is required as well.`
      : `${credentials} A truststore is only needed when the broker's certificate is signed by a CA the JVM does not already trust.`;
  }
  if (protocol === 'SSL') {
    return mutualTls
      ? 'There is no username here -- the client certificate in your keystore is what identifies you to the broker, so it is required.'
      : 'TLS encrypts the connection and verifies the broker, but sends nothing that identifies this client. Tick the box below if the broker asks for a client certificate.';
  }
  return '';
}

/**
 * The two ways of supplying TLS material.
 *
 * 'certificates' is what a managed cluster actually hands you -- Confluent, Aiven and MSK all give
 * out PEM files -- and the server turns those into the stores a Kafka client wants. 'stores' is for
 * somebody who has already run keytool and would rather not do it again.
 */
export type TlsRoute = 'certificates' | 'stores';

export type TlsFileId = 'ca' | 'clientCertificate' | 'clientKey' | 'truststore' | 'keystore';

/** One upload slot, described once so the picker, the prose and the validation agree. */
export interface TlsFileNeed {
  id: TlsFileId;
  /** What the server is told the file is; it parses the bytes to check the claim. */
  kind: KafkaSecretKind;
  label: string;
  /** The file-picker filter. */
  accept: string;
  /** The same list said in words, because a native picker hides its filter behind a dropdown. */
  accepts: string;
  /** What the file is, in the words of whoever downloaded it from a provider. */
  what: string;
  /** A CA arriving as a chain split across files is ordinary, so that one slot takes several. */
  multiple: boolean;
  icon: string;
}

export const TLS_FILE_NEEDS: Record<TlsFileId, TlsFileNeed> = {
  ca: {
    id: 'ca', kind: 'CA_CERTIFICATE', label: 'CA certificate', multiple: true, icon: 'shield',
    accept: CERTIFICATE_FILE_TYPES, accepts: 'PEM or DER — .pem, .crt, .cer, .der',
    what: 'The authority that signed your broker\'s certificate. Your provider publishes it; add a second file if the chain came split in two.',
  },
  clientCertificate: {
    id: 'clientCertificate', kind: 'CLIENT_CERTIFICATE', label: 'Client certificate', multiple: false, icon: 'file',
    accept: CERTIFICATE_FILE_TYPES, accepts: 'PEM or DER — .pem, .crt, .cer, .der',
    what: 'The certificate issued to this client, which is what the broker checks you by.',
  },
  clientKey: {
    id: 'clientKey', kind: 'CLIENT_PRIVATE_KEY', label: 'Client private key', multiple: false, icon: 'key',
    accept: PRIVATE_KEY_FILE_TYPES, accepts: 'Unencrypted PKCS#8 — .pem, .key, .pk8, .p8',
    what: 'The key that came with that certificate. It never leaves the platform bucket, and the server checks the two are a pair.',
  },
  truststore: {
    id: 'truststore', kind: 'TRUSTSTORE', label: 'Truststore', multiple: false, icon: 'shield',
    accept: STORE_FILE_TYPES, accepts: 'PKCS12 or JKS — .p12, .jks, .pfx',
    what: 'The store you built yourself, holding the certificate authorities this client should trust.',
  },
  keystore: {
    id: 'keystore', kind: 'KEYSTORE', label: 'Keystore', multiple: false, icon: 'lock',
    accept: STORE_FILE_TYPES, accepts: 'PKCS12 or JKS — .p12, .jks, .pfx',
    what: 'The store you built yourself, holding this client\'s certificate and its private key.',
  },
};

/**
 * Which upload slots belong on screen, asked once per half of the section.
 *
 * Both questions are answered by the person filling the form rather than by the protocol, because
 * neither is discoverable from it: a broker on a public CA needs no truststore and one on a private
 * CA does, and whether a client certificate is demanded is a broker-side setting. What the protocol
 * decides is whether either question is asked at all.
 *
 * Each half takes its own route because the two are supplied independently. A corporate PKI that
 * publishes one finished truststore and issues PEM client pairs per service is ordinary, and under
 * a single shared route that combination could not be entered at all: the store route had no way
 * to take the PEM pair and the certificate route had no way to take the store.
 */
export function trustFileIds(protocol: string, route: TlsRoute, privateCa: boolean): TlsFileId[] {
  if (!protocolNeedsSsl(protocol) || !privateCa) {
    return [];
  }
  return [route === 'certificates' ? 'ca' : 'truststore'];
}

export function identityFileIds(protocol: string, route: TlsRoute, mutualTls: boolean): TlsFileId[] {
  if (!protocolNeedsSsl(protocol) || !mutualTls) {
    return [];
  }
  return route === 'certificates' ? ['clientCertificate', 'clientKey'] : ['keystore'];
}

/**
 * What this combination is actually asking for, in two sentences.
 *
 * The mechanism is in here rather than only in the Security section because it changes the answer:
 * on SASL_SSL something already proves who you are and a client certificate is an extra the broker
 * has to have been set up to want, while on plain SSL the certificate is the only identity there is.
 */
export function tlsLead(
    protocol: string, mechanism: string, privateCa: boolean, mutualTls: boolean): string {
  if (!protocolNeedsSsl(protocol)) {
    return '';
  }
  const trust = privateCa
    ? 'You have said this broker is signed by a private or self-signed CA, so that authority has to be supplied here.'
    : 'Nothing is needed to trust the broker: its CA is one the JVM already carries, which covers Confluent Cloud, Aiven and the public MSK endpoints.';
  const identity = protocol === 'SSL'
    ? (mutualTls
      ? 'There is no username on this protocol, so the client certificate below is the only thing that says who this client is.'
      : 'Nothing here identifies this client to the broker. Tick the client-certificate box if yours asks for one.')
    : (mutualTls
      ? `${mechanism} already proves who you are, and this broker asks for a client certificate on top of it.`
      : `${mechanism} proves who you are over the encrypted connection, so no client certificate is needed unless the broker was set up to demand one.`);
  return `${trust} ${identity}`;
}

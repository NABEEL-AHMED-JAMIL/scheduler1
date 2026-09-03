import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { KafkaTlsSection } from './kafka-tls-section';
import { KafkaSecret, KafkaSecretKind, KafkaSecretService } from './kafka-secret.service';
import { KafkaProfile } from './kafka-connections';
import { profilePayload } from './kafka-profile-form';

/**
 * The upload flow, exercised through the rendered section.
 *
 * These are worth rendering rather than poking at the class: the point of the rework is that the
 * server's answer reaches the profile without passing through anything a person types, and the
 * only way to show that a generated password is never displayed is to look at what was drawn.
 *
 * The file inputs are hidden and driven from code here -- jsdom has no way to put a real File on
 * an <input type=file> -- so the pick handlers are called with a stand-in for the element, which
 * is exactly what the change listener passes them.
 */

const SECRET_BUCKET = 'etl-bucket';
const KEY = 'kafka-secrets/42/9f2c/2026-08-31';

/** A response of the shape the API envelope carries. */
const ok = <T,>(data: T, message = 'File uploaded and checked.') =>
  of({ status: 'SUCCESS' as const, message, data });
const refused = (message: string) => of({ status: 'ERROR' as const, message, data: undefined });

const stored = (over: Partial<KafkaSecret> = {}): KafkaSecret => ({
  kind: 'CA_CERTIFICATE',
  bucket: SECRET_BUCKET,
  objectKey: `${KEY}/ca.pem`,
  fileName: 'ca.pem',
  uploadId: '9f2c',
  uploadedOn: '2026-08-31',
  sizeBytes: 2048,
  ...over,
});

class FakeSecretService {
  readonly upload = vi.fn<(file: File, kind: KafkaSecretKind) => any>(() => ok(stored()));
  readonly generateTruststore = vi.fn<(keys: string[]) => any>(
    () => ok(stored({ kind: 'TRUSTSTORE', objectKey: `${KEY}/truststore.p12` }),
      'Truststore built from 1 certificate.'));
  readonly generateKeystore = vi.fn<(cert: string, key: string) => any>(
    () => ok(stored({ kind: 'KEYSTORE', objectKey: `${KEY}/keystore.p12` }),
      'Keystore built from the certificate and key.'));
}

@Component({
  imports: [ReactiveFormsModule, KafkaTlsSection],
  template: `
    <form [formGroup]="form">
      <app-kafka-tls-section [form]="form" [protocol]="protocol()" [mechanism]="mechanism()"
                             [profile]="profile()" [submitted]="submitted()"
                             [(mutualTls)]="mutualTls" />
    </form>
  `,
})
class Host {
  readonly protocol = signal('SASL_SSL');
  readonly mechanism = signal('SCRAM-SHA-512');
  readonly profile = signal<KafkaProfile | undefined>(undefined);
  readonly submitted = signal(false);
  readonly mutualTls = signal(false);

  readonly form: FormGroup = new FormBuilder().group({
    securityProtocol: ['SASL_SSL'],
    sslTruststoreBucket: [''],
    sslTruststoreLocation: [''],
    sslTruststorePassword: [''],
    sslKeystoreBucket: [''],
    sslKeystoreLocation: [''],
    sslKeystorePassword: [''],
    // The pre-encrypted passthrough the dialog's form carries; the section writes a generated
    // store's password here rather than into the box that gets encrypted on save.
    sslTruststorePasswordEnc: [''],
    sslKeystorePasswordEnc: [''],
    sslKeyPassword: [''],
    // The key inside a generated keystore carries the store's own password, in a column of its own.
    sslKeyPasswordEnc: [''],
    clearSslTruststorePassword: [false],
    clearSslKeystorePassword: [false],
    clearSslKeyPassword: [false],
    sslEndpointIdentificationAlgorithm: ['https'],
  });
}

function render(setUp: (host: Host) => void = () => {}) {
  TestBed.resetTestingModule();
  const secrets = new FakeSecretService();
  const fixture = TestBed.configureTestingModule({
    imports: [Host],
    providers: [{ provide: KafkaSecretService, useValue: secrets }],
  }).createComponent(Host);
  setUp(fixture.componentInstance);
  fixture.detectChanges();

  const section = fixture.debugElement.query(By.directive(KafkaTlsSection))
    .componentInstance as KafkaTlsSection;
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  /** What the change listener on a hidden file input hands the component. */
  const choose = (id: any, name: string) => {
    const input = { files: [new File(['-----BEGIN-----'], name)], value: name };
    section.pick(id, input as unknown as HTMLInputElement);
    fixture.detectChanges();
  };

  /** Says yes to the private-CA question, which is what makes the CA slot appear. */
  const privateCa = (on = true) => {
    section.setPrivateCa(on);
    fixture.detectChanges();
  };

  const mutualTls = (on = true) => {
    fixture.componentInstance.mutualTls.set(on);
    fixture.detectChanges();
  };

  return { fixture, host: fixture.componentInstance, section, secrets, text, choose, privateCa, mutualTls };
}

describe('uploading a certificate', () => {
  it('sends it under its own kind and saves the profile at the location the server chose', () => {
    const { host, secrets, choose, privateCa } = render();
    privateCa();
    choose('ca', 'ca.pem');

    expect(secrets.upload).toHaveBeenCalledTimes(1);
    expect(secrets.upload.mock.calls[0][1]).toBe('CA_CERTIFICATE');
    // The bucket is the server's answer, not a choice: nothing on this screen offers one.
    expect(host.form.get('sslTruststoreBucket')!.value).toBe(SECRET_BUCKET);
    expect(host.form.get('sslTruststoreLocation')!.value).toBe(`${KEY}/truststore.p12`);
  });

  it('shows what the certificate turned out to be, so the wrong one can be spotted', () => {
    const { secrets, text, choose, privateCa } = render();
    privateCa();
    secrets.upload.mockReturnValueOnce(ok(stored({
      subject: 'prod.kafka.example.com', issuer: 'Example Root CA', expiresOn: '2027-04-01',
      expired: false,
    })));
    choose('ca', 'ca.pem');

    expect(text()).toContain('prod.kafka.example.com');
    expect(text()).toContain('Example Root CA');
    expect(text()).toContain('2027-04-01');
  });

  it('says plainly when the certificate has already expired', () => {
    const { secrets, text, choose, privateCa } = render();
    privateCa();
    secrets.upload.mockReturnValueOnce(ok(stored({
      subject: 'old.kafka.example.com', issuer: 'Example Root CA', expiresOn: '2024-01-09',
      expired: true,
    })));
    choose('ca', 'ca.pem');

    expect(text()).toContain('expired on 2024-01-09');
  });

  it('builds the truststore itself rather than leaving a step to remember', () => {
    const { secrets, text, choose, privateCa } = render();
    privateCa();
    choose('ca', 'ca.pem');

    expect(secrets.generateTruststore).toHaveBeenCalledWith([`${KEY}/ca.pem`]);
    expect(text()).toContain('Truststore built');
  });

  it('builds the keystore only once both halves of the pair are there', () => {
    const { host, secrets, choose, mutualTls } = render();
    mutualTls();

    secrets.upload.mockReturnValueOnce(ok(stored({
      kind: 'CLIENT_CERTIFICATE', objectKey: `${KEY}/client.crt`, fileName: 'client.crt' })));
    choose('clientCertificate', 'client.crt');
    expect(secrets.generateKeystore).not.toHaveBeenCalled();

    secrets.upload.mockReturnValueOnce(ok(stored({
      kind: 'CLIENT_PRIVATE_KEY', objectKey: `${KEY}/client.key`, fileName: 'client.key' })));
    choose('clientKey', 'client.key');
    expect(secrets.generateKeystore).toHaveBeenCalledWith(`${KEY}/client.crt`, `${KEY}/client.key`);
    expect(host.form.get('sslKeystoreLocation')!.value).toBe(`${KEY}/keystore.p12`);
  });

  it('stops naming the truststore once the certificate it was built from is taken away', () => {
    const { host, section, fixture, choose, privateCa } = render();
    privateCa();
    choose('ca', 'ca.pem');
    expect(host.form.get('sslTruststoreLocation')!.value).toBe(`${KEY}/truststore.p12`);

    section.remove('ca', section.slot('ca').files[0]);
    fixture.detectChanges();

    // Otherwise the row still points at a store nothing on screen mentions, and the worker keeps
    // downloading it at every connection.
    expect(host.form.get('sslTruststoreLocation')!.value).toBeNull();
    expect(host.form.get('clearSslTruststorePassword')!.value).toBe(true);
  });

  /**
   * The button has to say what it does. A pick empties the slot first, so over a chain of two it
   * is not replacing "the first file" -- somebody correcting the root would have lost the
   * intermediate with it, and the truststore would have been rebuilt from half a chain.
   */
  it('does not promise to replace only the first of a chain', () => {
    const { section, secrets, fixture, text, choose, privateCa } = render();
    privateCa();
    choose('ca', 'root.pem');
    expect(text()).toContain('Replace');

    secrets.upload.mockReturnValueOnce(ok(stored({ fileName: 'intermediate.pem' })));
    section.add('ca', { files: [new File(['x'], 'intermediate.pem')], value: '' } as any);
    fixture.detectChanges();

    expect(section.slot('ca').files).toHaveLength(2);
    expect(section.pickLabel({ id: 'ca', multiple: true } as any)).toBe('Replace the whole chain');
  });

  it('lets a wrongly chosen file be replaced', () => {
    const { section, secrets, choose, privateCa } = render();
    privateCa();
    secrets.upload.mockReturnValueOnce(ok(stored({ fileName: 'staging-ca.pem' })));
    choose('ca', 'staging-ca.pem');
    secrets.upload.mockReturnValueOnce(ok(stored({ fileName: 'prod-ca.pem' })));
    choose('ca', 'prod-ca.pem');

    // Replaced, not appended: the second choice on a slot is a correction, not a second CA.
    expect(section.slot('ca').files.map(file => file.fileName)).toEqual(['prod-ca.pem']);
  });
});

describe('a file the server refuses', () => {
  /** The exact wording KafkaCertificateUtil sends for the format openssl produces by default. */
  const PKCS1 = 'That private key is in the older PKCS#1 format, which this server cannot read. '
    + 'Convert it with: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key-pkcs8.pem '
    + 'and upload the result.';

  it('shows the server\'s own message, openssl command and all', () => {
    const { secrets, text, choose, mutualTls } = render();
    mutualTls();
    secrets.upload.mockReturnValueOnce(refused(PKCS1));
    choose('clientKey', 'client.key');

    // Verbatim on purpose: the message names the one command that fixes the file, and any
    // wording of ours would send the reader to a support ticket instead.
    expect(text()).toContain(PKCS1);
    expect(text()).toContain('openssl pkcs8 -topk8 -nocrypt');
  });

  it('leaves the profile pointing at nothing and builds no store from it', () => {
    const { host, secrets, choose, mutualTls } = render();
    mutualTls();
    secrets.upload.mockReturnValueOnce(refused(PKCS1));
    choose('clientKey', 'client.key');

    expect(secrets.generateKeystore).not.toHaveBeenCalled();
    expect(host.form.get('sslKeystoreLocation')!.value).toBeFalsy();
  });

  it('falls back to its own wording only when the request never got an answer', () => {
    const { secrets, text, choose, privateCa } = render();
    privateCa();
    secrets.upload.mockReturnValueOnce(throwError(() => ({ error: null })));
    choose('ca', 'ca.pem');

    expect(text()).toContain('The file could not be uploaded');
  });
});

describe('the password of a generated store', () => {
  const CIPHERTEXT = 'k3sQm1p+ZmFrZS1jaXBoZXJ0ZXh0LWZvci10ZXN0aW5n';

  const withGeneratedTruststore = () => {
    const harness = render();
    harness.privateCa();
    harness.secrets.generateTruststore.mockReturnValueOnce(ok(stored({
      kind: 'TRUSTSTORE', objectKey: `${KEY}/truststore.p12`, fileName: 'truststore.p12',
      storePasswordEnc: CIPHERTEXT,
    })));
    harness.choose('ca', 'ca.pem');
    return harness;
  };

  /**
   * Into the pre-encrypted field, never the password box. The save path encrypts whatever arrives
   * in the box, so putting ciphertext there stored encrypt(ciphertext) and produced a store that
   * nothing could open -- a bug no amount of testing the two halves separately would have shown.
   */
  it('is carried into the profile as ciphertext, in the field that is not encrypted again', () => {
    const { host } = withGeneratedTruststore();
    const body = profilePayload(host.form.getRawValue(), false);
    expect(host.form.get('sslTruststorePasswordEnc')!.value).toBe(CIPHERTEXT);
    expect(body['sslTruststorePasswordEnc']).toBe(CIPHERTEXT);
    expect(host.form.get('sslTruststorePassword')!.value).toBe('');
    expect('sslTruststorePassword' in body).toBe(false);
  });

  it('never reaches the screen', () => {
    const { fixture, text } = withGeneratedTruststore();
    const html = (fixture.nativeElement as HTMLElement).innerHTML;
    expect(html).not.toContain(CIPHERTEXT);
    expect(text()).not.toContain(CIPHERTEXT);
    // Not even behind a masked input, which a password manager or the DOM would give up.
    const values = [...(fixture.nativeElement as HTMLElement).querySelectorAll('input')]
      .map(input => input.value);
    expect(values).not.toContain(CIPHERTEXT);
  });

  it('asks for no password at all on the route where the system made the store', () => {
    const { fixture, text } = withGeneratedTruststore();
    expect(fixture.nativeElement.querySelector('#sslTruststorePassword')).toBeNull();
    expect(text()).toContain('nothing for you to choose, copy or type');
  });

  /**
   * The key inside a generated keystore is locked with the store's own password, and the server
   * keeps the two in separate columns -- ssl.keystore.password and ssl.key.password. Sending only
   * the first left a replaced keystore paired with the key password of the one before it: the
   * store downloads, opens, and then fails to unwrap the key, at the first publish rather than at
   * the save.
   */
  it('locks the key inside a generated keystore with the same ciphertext as the store', () => {
    const { host, secrets, choose, mutualTls } = render();
    mutualTls();
    secrets.generateKeystore.mockReturnValueOnce(ok(stored({
      kind: 'KEYSTORE', objectKey: `${KEY}/keystore.p12`, fileName: 'keystore.p12',
      storePasswordEnc: CIPHERTEXT,
    })));
    secrets.upload.mockReturnValueOnce(ok(stored({
      kind: 'CLIENT_CERTIFICATE', objectKey: `${KEY}/client.crt`, fileName: 'client.crt' })));
    choose('clientCertificate', 'client.crt');
    secrets.upload.mockReturnValueOnce(ok(stored({
      kind: 'CLIENT_PRIVATE_KEY', objectKey: `${KEY}/client.key`, fileName: 'client.key' })));
    choose('clientKey', 'client.key');

    const body = profilePayload(host.form.getRawValue(), true);
    expect(body['sslKeystorePasswordEnc']).toBe(CIPHERTEXT);
    expect(body['sslKeyPasswordEnc']).toBe(CIPHERTEXT);
    // Never the box: whatever arrives there is encrypted again on the way in.
    expect('sslKeyPassword' in body).toBe(false);
  });

  /**
   * A profile edited from an uploaded keystore onto a generated one. Its stored key password
   * belongs to the store that has just been taken off the screen, and nothing else in the request
   * says so -- a blank field means "keep what is there".
   */
  it('takes the stored key password away with the keystore it belonged to', () => {
    const { host, section, fixture } = render(h => {
      // On before the first render, as the dialog does for a profile that already has a keystore.
      h.mutualTls.set(true);
      h.form.get('sslKeystoreBucket')!.setValue(SECRET_BUCKET);
      h.form.get('sslKeystoreLocation')!.setValue(`${KEY}/old.p12`);
      h.profile.set({
        sslKeystorePasswordConfigured: true, sslKeyPasswordConfigured: true } as KafkaProfile);
    });

    // Untouched, so neither password is disturbed -- otherwise the flags below would be set
    // before the route change that is supposed to set them.
    const untouched = profilePayload(host.form.getRawValue(), true);
    expect(untouched['sslKeystoreLocation']).toBe(`${KEY}/old.p12`);
    expect('clearSslKeyPassword' in untouched).toBe(false);

    // Switching how this client identifies itself drops the store, and the key password with it.
    section.setIdentityRoute('stores');
    fixture.detectChanges();

    const body = profilePayload(host.form.getRawValue(), true);
    expect(body['clearSslKeystorePassword']).toBe(true);
    expect(body['clearSslKeyPassword']).toBe(true);
    expect('sslKeyPasswordEnc' in body).toBe(false);
  });

  /**
   * The same rule for the store's own password, which had been left behind.
   *
   * A store uploaded here brings no password with it -- whatever is typed in the box beside it is
   * the password. The one already on the row is the random one the server chose for the file this
   * just replaced, so leaving it there hands a store a password that cannot open it, while the
   * hint on the box still reads "leave blank to keep it".
   */
  it('takes the stored store password away with the store it belonged to', () => {
    const { host, section, secrets, fixture, choose, text } = render(h => {
      h.form.get('sslTruststoreBucket')!.setValue(SECRET_BUCKET);
      h.form.get('sslTruststoreLocation')!.setValue(`${KEY}/truststore-abc.p12`);
      h.profile.set({ sslTruststorePasswordConfigured: true } as KafkaProfile);
    });
    section.setTrustRoute('stores');
    fixture.detectChanges();
    secrets.upload.mockReturnValueOnce(ok(stored({
      kind: 'TRUSTSTORE', objectKey: `${KEY}/corp.p12`, fileName: 'corp.p12' })));
    choose('truststore', 'corp.p12');

    const body = profilePayload(host.form.getRawValue(), false);
    expect(body['sslTruststoreLocation']).toBe(`${KEY}/corp.p12`);
    expect(body['clearSslTruststorePassword']).toBe(true);
    // And asked for, rather than swapping a wrong password for none at all.
    expect(section.truststorePasswordRequired()).toBe(true);
    expect(host.form.get('sslTruststorePassword')!.hasError('required')).toBe(true);
    // The box must not go on saying the saved one still applies.
    expect(text()).not.toContain('Leave blank to keep it');
  });

  it('asks for the keystore password again once the keystore is replaced', () => {
    const { host, section, secrets, fixture, choose } = render(h => {
      h.mutualTls.set(true);
      h.form.get('sslKeystoreBucket')!.setValue(SECRET_BUCKET);
      h.form.get('sslKeystoreLocation')!.setValue(`${KEY}/old.p12`);
      h.profile.set({
        sslKeystorePasswordConfigured: true, sslKeyPasswordConfigured: true } as KafkaProfile);
    });
    section.setIdentityRoute('stores');
    fixture.detectChanges();
    secrets.upload.mockReturnValueOnce(ok(stored({
      kind: 'KEYSTORE', objectKey: `${KEY}/new.p12`, fileName: 'new.p12' })));
    choose('keystore', 'new.p12');

    const body = profilePayload(host.form.getRawValue(), true);
    expect(body['sslKeystoreLocation']).toBe(`${KEY}/new.p12`);
    expect(body['clearSslKeystorePassword']).toBe(true);
    expect(body['clearSslKeyPassword']).toBe(true);
    expect(section.keystorePasswordRequired()).toBe(true);
  });

  /** A truststore holds no key, so it has no business writing the key's password. */
  it('says nothing about a key password for a generated truststore', () => {
    const { host } = withGeneratedTruststore();
    // Read against the store password that did land, so this cannot pass on a form nothing wrote.
    expect(host.form.get('sslTruststorePasswordEnc')!.value).toBe(CIPHERTEXT);
    expect(host.form.get('sslKeyPasswordEnc')!.value).toBe('');
  });

  it('is not sent as an empty string when nothing was generated, which would wipe the stored one', () => {
    const { host } = render();
    const body = profilePayload(host.form.getRawValue(), false);
    expect('sslTruststorePassword' in body).toBe(false);
    expect('sslTruststorePasswordEnc' in body).toBe(false);
  });
});

describe('what the combination asks for', () => {
  it('offers no truststore on a managed cluster, where the JVM already trusts the CA', () => {
    const { text, fixture } = render();
    expect(text()).toContain('Nothing is needed to trust the broker');
    expect(fixture.nativeElement.textContent).not.toContain('CA certificate');
  });

  it('opens with a truststore expected on plain SSL, where a private CA is the usual reason', () => {
    const { section, text } = render(host => {
      host.protocol.set('SSL');
      host.form.get('securityProtocol')!.setValue('SSL');
    });
    expect(section.privateCa()).toBe(true);
    expect(text()).toContain('CA certificate');
  });

  it('opens with the truststore of a profile being edited kept rather than dropped', () => {
    const { host, section, text } = render(h => {
      h.form.get('sslTruststoreBucket')!.setValue(SECRET_BUCKET);
      h.form.get('sslTruststoreLocation')!.setValue(`${KEY}/truststore.p12`);
      h.profile.set({ sslTruststorePasswordConfigured: true } as KafkaProfile);
    });
    expect(section.privateCa()).toBe(true);
    expect(host.form.get('sslTruststoreLocation')!.value).toBe(`${KEY}/truststore.p12`);
    expect(text()).toContain('Keeping the truststore');
  });

  /**
   * The message is about the row, so it has to follow the row. Answering the CA question no drops
   * the store; answering it yes again does not bring it back, and a line still saying the profile
   * is keeping a truststore would be describing a field this section had already emptied.
   */
  it('stops claiming to keep a store the profile has stopped naming', () => {
    const { host, section, fixture, text } = render(h => {
      h.form.get('sslTruststoreBucket')!.setValue(SECRET_BUCKET);
      h.form.get('sslTruststoreLocation')!.setValue(`${KEY}/truststore.p12`);
      h.profile.set({ sslTruststorePasswordConfigured: true } as KafkaProfile);
    });
    expect(text()).toContain('Keeping the truststore');

    section.setPrivateCa(false);
    fixture.detectChanges();
    section.setPrivateCa(true);
    fixture.detectChanges();

    expect(host.form.get('sslTruststoreLocation')!.value).toBeNull();
    expect(text()).not.toContain('Keeping the truststore');
  });

  it('takes the truststore back off the profile when the CA question is answered no', () => {
    const { host, fixture, section } = render(h => {
      h.form.get('sslTruststoreBucket')!.setValue(SECRET_BUCKET);
      h.form.get('sslTruststoreLocation')!.setValue(`${KEY}/truststore.p12`);
    });
    section.setPrivateCa(false);
    fixture.detectChanges();

    expect(host.form.get('sslTruststoreLocation')!.value).toBeNull();
    // The password would otherwise sit in the row with nothing left for it to open.
    expect(host.form.get('clearSslTruststorePassword')!.value).toBe(true);
  });

  it('asks for a store and its password on the route for somebody who ran keytool', () => {
    const { section, fixture, text } = render(h => {
      h.protocol.set('SSL');
      h.form.get('securityProtocol')!.setValue('SSL');
    });
    section.setTrustRoute('stores');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#sslTruststorePassword')).not.toBeNull();
    expect(text()).toContain('PKCS12 or JKS');
  });

  it('says what is still outstanding once a save has been attempted', () => {
    const { host, fixture, text } = render(h => {
      h.protocol.set('SSL');
      h.form.get('securityProtocol')!.setValue('SSL');
    });
    host.submitted.set(true);
    fixture.detectChanges();

    expect(text()).toContain('Still needed: CA certificate');
  });

  /**
   * The half that was uploaded is not asked for again. Naming the whole route read as though the
   * accepted file had been rejected, which sent people back to re-upload a certificate that was
   * sitting on screen with a tick beside it.
   */
  it('names only the half of the client pair that is actually absent', () => {
    const { host, secrets, fixture, text, choose, mutualTls } = render();
    mutualTls();
    secrets.upload.mockReturnValueOnce(ok(stored({
      kind: 'CLIENT_CERTIFICATE', objectKey: `${KEY}/client.crt`, fileName: 'client.crt' })));
    choose('clientCertificate', 'client.crt');
    host.submitted.set(true);
    fixture.detectChanges();

    expect(text()).toContain('Still needed: Client private key');
    expect(text()).not.toContain('Still needed: Client certificate');
  });

  it('points at the build rather than the uploads when the store could not be made', () => {
    const { host, secrets, fixture, text, choose, privateCa } = render();
    privateCa();
    secrets.generateTruststore.mockReturnValueOnce(refused('That certificate could not be found.'));
    choose('ca', 'ca.pem');
    host.submitted.set(true);
    fixture.detectChanges();

    // The CA is uploaded and shown as accepted; asking for it again would contradict the screen.
    expect(text()).toContain('could not be built from the files above');
    expect(text()).not.toContain('Still needed: CA certificate');
  });
});

/**
 * The two questions are supplied independently.
 *
 * A site that publishes one finished truststore and issues PEM client pairs per service is
 * ordinary, and under a single route for the whole section that combination could not be entered
 * at all -- the store route had nowhere to take the PEM pair and the certificate route had nowhere
 * to take the store, so the profile could not be saved by either.
 */
describe('supplying the two halves differently', () => {
  it('takes a ready-made truststore beside a PEM client pair', () => {
    const { host, section, secrets, fixture, choose, privateCa, mutualTls } = render(h => {
      h.protocol.set('SSL');
      h.form.get('securityProtocol')!.setValue('SSL');
    });
    privateCa();
    mutualTls();
    section.setTrustRoute('stores');
    fixture.detectChanges();

    secrets.upload.mockReturnValueOnce(ok(stored({
      kind: 'TRUSTSTORE', objectKey: `${KEY}/corp.p12`, fileName: 'corp.p12' })));
    choose('truststore', 'corp.p12');
    secrets.upload.mockReturnValueOnce(ok(stored({
      kind: 'CLIENT_CERTIFICATE', objectKey: `${KEY}/client.crt`, fileName: 'client.crt' })));
    choose('clientCertificate', 'client.crt');
    secrets.upload.mockReturnValueOnce(ok(stored({
      kind: 'CLIENT_PRIVATE_KEY', objectKey: `${KEY}/client.key`, fileName: 'client.key' })));
    choose('clientKey', 'client.key');

    expect(host.form.get('sslTruststoreLocation')!.value).toBe(`${KEY}/corp.p12`);
    expect(host.form.get('sslKeystoreLocation')!.value).toBe(`${KEY}/keystore.p12`);
    // The uploaded store keeps the password box; the built one has none to ask for.
    expect(fixture.nativeElement.querySelector('#sslTruststorePassword')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#sslKeystorePassword')).toBeNull();
  });

  it('leaves the other half alone when one route is changed', () => {
    const { host, section, fixture, choose, privateCa, mutualTls } = render();
    privateCa();
    mutualTls();
    choose('ca', 'ca.pem');
    expect(host.form.get('sslTruststoreLocation')!.value).toBe(`${KEY}/truststore.p12`);

    section.setIdentityRoute('stores');
    fixture.detectChanges();

    // Switching how the client identifies itself says nothing about the broker's own CA.
    expect(host.form.get('sslTruststoreLocation')!.value).toBe(`${KEY}/truststore.p12`);
    expect(section.slot('ca').files).toHaveLength(1);
  });
});

describe('what the screen says about the files', () => {
  it('says where an upload is put without anything having to be opened first', () => {
    const { text } = render(h => {
      h.protocol.set('SSL');
      h.form.get('securityProtocol')!.setValue('SSL');
    });
    // In the section itself, not behind the guide toggle: it is the question a first-time
    // uploader stops on, and the guide is shut when the dialog opens.
    expect(text()).toContain('etl-bucket');
    expect(text()).toContain('kafka-secrets/');
    expect(text()).toContain('You do not choose a location');
    expect(text()).toContain('none of it is listed in the object browser');
  });

  it('says what the system will do before anything has been uploaded', () => {
    const { text } = render(h => {
      h.protocol.set('SSL');
      h.form.get('securityProtocol')!.setValue('SSL');
    });
    expect(text()).toContain('the system builds the truststore from it and picks its password');
    expect(text()).toContain('Accepts PEM or DER');
  });

  it('names every file it is asking for as required', () => {
    const { fixture, mutualTls } = render();
    mutualTls();
    const required = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.pill')]
      .filter(pill => pill.textContent?.trim() === 'Required');
    // The section header plus one on each of the two cards, which is the point: "Required" above
    // a pair of cards says nothing about whether both of them are.
    expect(required).toHaveLength(3);
  });
});

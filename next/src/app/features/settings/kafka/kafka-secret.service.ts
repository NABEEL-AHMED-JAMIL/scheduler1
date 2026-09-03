import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE, ApiResponse } from '../../../core/api/api.config';

/**
 * Where the server puts every Kafka file.
 *
 * Named here only so the screen can say out loud where an upload goes, which is the one thing
 * about the storage a person filling this form has to be told. It mirrors
 * KafkaSecretService.SECRET_BUCKET; nothing sends it, because the bucket is the server's answer
 * and never a choice made in the browser.
 */
export const KAFKA_SECRET_BUCKET = 'etl-bucket';

/** The folder inside that bucket, for the same reason. Mirrors KafkaSecretPath.ROOT. */
export const KAFKA_SECRET_ROOT = 'kafka-secrets';

/** What kind of file is being handed over. The server checks the claim by parsing the file. */
export type KafkaSecretKind =
  | 'CA_CERTIFICATE'
  | 'CLIENT_CERTIFICATE'
  | 'CLIENT_PRIVATE_KEY'
  | 'TRUSTSTORE'
  | 'KEYSTORE';

/**
 * A stored file, or a store the server built from stored files.
 *
 * `objectKey` is a location, not a secret: the object behind it is only reachable through this
 * workflow, never through the object browser. `storePasswordEnc` is ciphertext under a key the
 * browser has never seen -- it exists so the profile saved in a later request can be tied to the
 * store built in this one.
 */
export interface KafkaSecret {
  kind: KafkaSecretKind;
  bucket: string;
  objectKey: string;
  fileName: string;
  uploadId: string;
  uploadedOn: string;
  sizeBytes: number;
  /** Present for a certificate, so somebody can confirm they picked the right one. */
  subject?: string;
  issuer?: string;
  expiresOn?: string;
  expired?: boolean;
  storePasswordEnc?: string;
}

/**
 * Uploading Kafka TLS material, and turning certificates into the stores a client wants.
 *
 * Separate from the generic object-storage service on purpose. That one takes a bucket and a
 * prefix from the caller, which is right for a folder of reports and wrong for a private key --
 * whoever chooses the path can also choose somebody else's. Here the browser sends a file and a
 * kind, and every part of the location is decided by the server.
 */
@Injectable({ providedIn: 'root' })
export class KafkaSecretService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/kafkaSecret.json`;

  upload(file: File, kind: KafkaSecretKind): Observable<ApiResponse<KafkaSecret>> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ApiResponse<KafkaSecret>>(
      `${this.base}/uploadSecret?kind=${kind}`, form);
  }

  /** Several CA files become one truststore, which is what a chain split across files needs. */
  generateTruststore(caObjectKeys: string[]): Observable<ApiResponse<KafkaSecret>> {
    return this.http.post<ApiResponse<KafkaSecret>>(`${this.base}/generateTruststore`, caObjectKeys);
  }

  generateKeystore(certificateObjectKey: string, privateKeyObjectKey: string): Observable<ApiResponse<KafkaSecret>> {
    return this.http.post<ApiResponse<KafkaSecret>>(`${this.base}/generateKeystore`, null, {
      params: { certificateObjectKey, privateKeyObjectKey },
    });
  }
}

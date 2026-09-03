import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';

/** Only the fields the dependency lookup reads; the full profile shape lives on the Kafka screen. */
interface KafkaProfileRef {
  profileName: string;
  sslKeystoreBucket?: string;
  sslTruststoreBucket?: string;
}

/**
 * Names the Kafka profiles that load a keystore or truststore from a storage connection.
 *
 * A profile records the connection's alias and nothing else, and the download behind it resolves
 * Active connections only -- so retiring or deleting one breaks every profile bound to it at the
 * next publish, with nothing on either screen saying so. The edit dialog and the delete
 * confirmation both ask this before the change is committed.
 *
 * Returns nothing when the lookup fails, deliberately: the list is advisory, someone who cannot
 * read the Kafka profiles must still be able to save, and the server is what decides whether the
 * change is allowed.
 */
export async function kafkaProfilesUsing(http: HttpClient, alias: string): Promise<string[]> {
  const wanted = (alias ?? '').trim();
  if (!wanted) return [];
  try {
    const response = await firstValueFrom(http.get<ApiResponse<KafkaProfileRef[]>>(
      `${API_BASE}/kafkaConnectionProfile.json/fetchAllProfiles`));
    if (response.status !== API_SUCCESS) return [];
    return (response.data ?? [])
      .filter(profile => profile.sslTruststoreBucket === wanted || profile.sslKeystoreBucket === wanted)
      .map(profile => profile.profileName);
  } catch {
    return [];
  }
}

/** The sentence both screens use to name what a retired or deleted alias would break. */
export function kafkaDependencyNote(names: string[]): string {
  if (!names.length) return '';
  return `Kafka ${names.length === 1 ? 'profile' : 'profiles'} ${names.join(', ')} `
    + `load a keystore or truststore from this alias.`;
}

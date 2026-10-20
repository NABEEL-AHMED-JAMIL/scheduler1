import { APIRequestContext, test } from '@playwright/test';
import { api, authOf, Session } from './session';
import { riverside } from './fixtures';

/**
 * Inputs only the owner may bring back. On 2026-10-20 LocalStack was emptied twice; the Kaggle files the rebuilt
 * workspace's tabular pipelines read went with it, and their raw downloads are not on this Mac. Nothing in the suite may
 * download them again (licences, the owner's account) or make up a stand-in: a check that reads one says so instead.
 *
 * waitOnOwnerData() looks each named input up in the workspace's bucket. When one is missing the test is skipped --
 * never passed -- with a line that starts "[waiting on owner data]", which etl-platform's final-regression.sh lists in its
 * report, and an annotation of the same words. Once the owner has uploaded the file again the test runs as before.
 */
export const OWNER_DATA = {
  readmission: { key: 'datasets/readmission/diabetic_data.csv',
    what: 'Kaggle "Diabetes 130-US hospitals 1999-2008" (brandao/diabetes), the readmission pipeline\'s input' },
  appointments: { key: 'datasets/appointments/smart_hospital_appointment_dataset.csv',
    what: 'Kaggle smart hospital appointments, the appointment no-shows pipeline\'s input' },
} as const;

export type OwnerInput = keyof typeof OWNER_DATA;

export const WAITING_ON_OWNER_DATA = '[waiting on owner data]';

/** The inputs among these that are not in Riverside's bucket now. */
export async function missingOwnerData(request: APIRequestContext, s: Session, ...inputs: OwnerInput[]): Promise<OwnerInput[]> {
  const bucket = riverside().storageAlias;
  const missing: OwnerInput[] = [];
  for (const input of inputs) {
    const answer = await request.get(`${api}/storage.json/objectMetadata`, { headers: authOf(s), params: { bucket, key: OWNER_DATA[input].key } });
    const body = await answer.json().catch(() => ({}));
    if (body?.status !== 'SUCCESS' || !(Number(body?.data?.size) > 0)) missing.push(input);
  }
  return missing;
}

/** Skips the running test, saying which owner input it waits for, when any of these is missing. */
export async function waitOnOwnerData(request: APIRequestContext, s: Session, ...inputs: OwnerInput[]): Promise<void> {
  const missing = await missingOwnerData(request, s, ...inputs);
  if (!missing.length) return;
  const bucket = riverside().storageAlias;
  const what = missing.map(i => `${bucket}/${OWNER_DATA[i].key} (${OWNER_DATA[i].what})`).join('; ');
  const line = `${WAITING_ON_OWNER_DATA} ${test.info().titlePath.slice(1).join(' › ')}: needs ${what}, which only the owner may upload again`;
  console.log(line);
  test.info().annotations.push({ type: 'waiting-on-owner-data', description: line });
  test.skip(true, line);
}

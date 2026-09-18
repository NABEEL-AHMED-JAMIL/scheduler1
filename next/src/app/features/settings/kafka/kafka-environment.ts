/**
 * The environments a Kafka profile can belong to.
 *
 * The field started as free text ("shown beside the name, e.g. staging"), which meant it could
 * not be filtered on, could not be coloured, and the same environment could be spelt three ways
 * across five profiles. Five values cover every deployment this platform has, in the order a
 * change travels; prod is the one that should look different at a glance, so it is the one
 * drawn red. A value that is none of these -- an older profile's free text -- is still shown,
 * as a neutral chip, rather than silently dropped.
 */
export interface KafkaEnvironment {
  key: string;
  label: string;
  /** Matches the pill tones in styles.css. */
  tone: 'neutral' | 'brand' | 'ok' | 'warn' | 'crit';
  hint: string;
}

export const KAFKA_ENVIRONMENTS: readonly KafkaEnvironment[] = [
  { key: 'local', label: 'Local',      tone: 'neutral', hint: 'A broker on this machine or in the local compose stack.' },
  { key: 'dev',   label: 'Dev',        tone: 'brand',   hint: 'Shared development cluster; data can be thrown away.' },
  { key: 'test',  label: 'Test',       tone: 'ok',      hint: 'Where pipelines are verified before a release.' },
  { key: 'stage', label: 'Stage',      tone: 'warn',    hint: 'Production-like; treat its data with care.' },
  { key: 'prod',  label: 'Production', tone: 'crit',    hint: 'Live traffic. A wrong topic here reaches real consumers.' },
];

/** The environment for a stored label, or a neutral stand-in for free text that predates the list. */
export function kafkaEnvironment(label: string | null | undefined): KafkaEnvironment | null {
  const key = (label ?? '').trim().toLowerCase();
  if (!key) return null;
  return KAFKA_ENVIRONMENTS.find(e => e.key === key)
    ?? { key, label: label!.trim(), tone: 'neutral', hint: 'A label from before environments were a fixed list.' };
}

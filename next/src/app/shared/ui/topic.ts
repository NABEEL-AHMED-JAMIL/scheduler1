export interface TopicPartition {
  topic: string;
  /** Without the brackets: "0,1", or "*" for every partition. */
  partitions: string;
}

/**
 * A source task type stores its Kafka target as one string, `topic=name&partitions=[0,1]`.
 * Three screens were each unpacking it their own way -- one with a regex that dropped the
 * brackets, one that kept them, one via URLSearchParams -- so the same type could read as
 * `[0,1]`, `0,1` or `*` depending on where you looked at it.
 */
export function parseTopicPartition(raw?: string | null): TopicPartition {
  const value = String(raw ?? '');
  if (!value) return { topic: '', partitions: '' };
  const match = /topic=([^&]*)&partitions=\[([^\]]*)\]/.exec(value);
  if (match) return { topic: match[1] || '', partitions: match[2] || '*' };
  // A value stored before the format settled is just the topic name.
  return { topic: value, partitions: '*' };
}

/** The inverse, so the dialog that writes the field and the screens that read it agree. */
export function formatTopicPartition(topic: string, partitions: string): string {
  return `topic=${topic}&partitions=[${partitions || '*'}]`;
}

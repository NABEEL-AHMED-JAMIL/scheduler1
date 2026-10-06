/**
 * A connection test's answer as a person reads it (UI review U6): the broker's internal cluster id is left out --
 * it identifies nothing a reader can act on -- and "1 broker(s)" says one broker.
 */
export function testMessageText(message: string | null | undefined): string {
  return (message ?? '')
    .replace(/\s*cluster\s+"[^"]*"\s*/i, ' ')
    .replace(/(\d+) broker\(s\)/g, (_, n) => `${n} ${n === '1' ? 'broker' : 'brokers'}`)
    .replace(/—\s+with\s+(\d+ brokers?)/, '— $1 answered')
    .replace(/\s{2,}/g, ' ')
    .trim();
}


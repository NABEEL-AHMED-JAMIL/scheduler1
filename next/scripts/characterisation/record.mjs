#!/usr/bin/env node
// MIG-222 / MIG-266: re-records the console's characterisation baseline.
//
//   node scripts/characterisation/record.mjs            # every area
//   node scripts/characterisation/record.mjs source-jobs # one area (its pinned file is replaced whole)
//
// Runs the characterisation specs with CHAR_RECORD=1 (harness.ts then prints each surface instead of
// comparing it) and writes src/app/characterisation/pinned/<area>.ts. Only for a change that is MEANT
// to alter a screen: commit the pinned diff with that change, where the review reads it.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const only = process.argv[2];
const include = only ? `src/app/characterisation/${only}.characterisation.spec.ts` : 'src/app/characterisation';
const run = spawnSync('npx', ['ng', 'test', '--watch=false', '--reporters=verbose', `--include=${include}`], {
  cwd: new URL('../..', import.meta.url).pathname,
  env: { ...process.env, CHAR_RECORD: '1' },
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
});
const output = (run.stdout + run.stderr).replace(/\x1b\[[0-9;]*m/g, '');
const pinned = {};
for (const line of output.split('\n')) {
  const at = line.indexOf('@@CHAR@@');
  if (at < 0) continue;
  const [file, name, json] = line.slice(at + 8).split('@@');
  (pinned[file] ??= {})[name] = JSON.parse(json);
}
if (!Object.keys(pinned).length) {
  console.error(output.split('\n').slice(-60).join('\n'));
  console.error('nothing recorded');
  process.exit(1);
}
for (const [file, entries] of Object.entries(pinned)) {
  const sorted = Object.fromEntries(Object.keys(entries).sort().map(k => [k, entries[k]]));
  writeFileSync(new URL(`../../src/app/characterisation/pinned/${file}.ts`, import.meta.url),
    '// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.\n'
    + `export const PINNED: Record<string, unknown> = ${JSON.stringify(sorted, null, 2)};\n`);
  console.log(`${file}: ${Object.keys(entries).length} surfaces`);
}
if (run.status !== 0) {
  console.error(output.split('\n').filter(l => /FAIL|Error|✗|×/.test(l)).slice(0, 40).join('\n'));
  console.error('the recording run itself failed: fix that first');
  process.exit(1);
}

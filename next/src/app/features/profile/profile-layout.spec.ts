import { describe, it, expect } from 'vitest';

/**
 * Two layout faults on the profile page, which the test DOM cannot measure, so these read the
 * sources. A truncated .link-inline was cut mid-letter with no ellipsis, because text-overflow
 * does nothing on the inline-flex box .link-inline is; and the phone number box was 101px at
 * 1024, so a typed number scrolled out of view.
 */
async function read(path: string): Promise<string> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${root}/src/${path}`, 'utf8');
}

const classesOf = (source: string, marker: string): string[] => {
  const at = source.indexOf(marker);
  expect(at, marker + ' not found').toBeGreaterThanOrEqual(0);
  const open = source.lastIndexOf('class="', at);
  return source.slice(open + 7, source.indexOf('"', open + 7)).split(/\s+/);
};

describe('profile layout', () => {
  it('lets a truncated inline link show its ellipsis', async () => {
    const css = await read('styles.css');
    const rule = css.slice(css.indexOf('.link-inline.truncate {'));
    expect(rule.startsWith('.link-inline.truncate {'), 'rule missing').toBe(true);
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body).toContain('display: inline-block');
    expect(body).toContain('min-width: 0');
    expect(body).toContain('max-width: 100%');
  });

  it('sets the recent run names in the card\'s own text size', async () => {
    const html = await read('app/features/profile/profile.html');
    expect(classesOf(html, "[routerLink]=\"['/pipelines/schedules', run.jobId, 'executions']\"")).toContain('text-sm');
  });

  it('gives the phone number a floor, and lets it drop under the country in a narrow column', async () => {
    const ts = await read('app/shared/ui/phone-input.ts');
    expect(classesOf(ts, 'name="phoneCountry"')).toEqual(expect.arrayContaining(['w-32', 'shrink-0']));
    expect(classesOf(ts, 'type="tel"')).toContain('min-w-[9rem]');
    expect(ts).toContain('<div class="flex flex-wrap gap-2">');
  });
});

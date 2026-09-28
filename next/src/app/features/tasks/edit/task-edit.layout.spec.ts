import { describe, it, expect } from 'vitest';

/**
 * UI review tasks#20: the pipeline form's header kept its pill beside the title at any width, so
 * on a phone the name and description were squeezed into a narrow column. Layout the test DOM
 * cannot measure, so this reads the template.
 */
async function read(file: string): Promise<string> {
  const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
  const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
  return fs.readFileSync(`${root}/src/app/features/tasks/edit/${file}`, 'utf8');
}

const classesBefore = (source: string, marker: string, back = 1): string[] => {
  let at = source.indexOf(marker);
  expect(at, marker + ' not found').toBeGreaterThanOrEqual(0);
  for (let i = 0; i < back; i++) at = source.lastIndexOf('class="', at - 1);
  return source.slice(at + 7, source.indexOf('"', at + 7)).split(/\s+/);
};

describe('task editor pipeline-form header on a phone', () => {
  it('wraps the pill below the text instead of squeezing the text', async () => {
    const source = await read('task-edit.html');
    const marker = '<h2 class="form-section-title mb-0">{{ def.pipelineName }}</h2>';
    expect(classesBefore(source, marker, 1)).toEqual(expect.arrayContaining(['flex-1', 'basis-60', 'min-w-0']));
    expect(classesBefore(source, marker, 2)).toEqual(expect.arrayContaining(['flex', 'flex-wrap']));
  });

  it('uses an em dash, not a double hyphen, in the footnote', async () => {
    const source = await read('task-edit.html');
    expect(source).not.toContain('when you save --');
  });
});

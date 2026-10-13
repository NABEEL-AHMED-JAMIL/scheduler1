import { describe, it, expect } from 'vitest';

/**
 * UX review B6 (AI1): one chat layout. The AI Assistant, Ask your data and the file chat each put Send at the foot of the
 * box on the right (.chat-composer: align-items flex-end), the same 28 px button -- the Assistant's sat below a shorter
 * box, Ask's at its top, the file chat's beside a one-line box.
 */
const COMPOSERS = ['ai/assistant/assistant.html', 'ask-data/ask-data.html', 'objects/chat/file-chat.html'];

describe('one chat composer', () => {
  it('is the shared .chat-composer, a two-line box and a small primary Send in all three', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    for (const file of COMPOSERS) {
      const html = fs.readFileSync(`${root}/src/app/features/${file}`, 'utf8');
      const block = html.slice(html.indexOf('class="chat-composer'));
      expect(block.length, file).toBeGreaterThan(0);
      const box = block.slice(block.indexOf('<textarea'), block.indexOf('</textarea>'));
      expect(box, file).toContain('rows="2"');
      expect(box, file).not.toContain('self-end');
      expect(block.slice(0, block.indexOf('</div>')), file).toMatch(/class="btn btn-primary btn-sm"/);
    }
    const css = fs.readFileSync(`${root}/src/styles.css`, 'utf8');
    expect(css).toMatch(/\.chat-composer \{[^}]*align-items: flex-end/);
  });
});

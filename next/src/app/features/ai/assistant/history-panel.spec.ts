import { describe, it, expect } from 'vitest';

/**
 * Coordinator 2026-10-12 (step 2 follow-up): below 1280 the AI Assistant's History opens as the console's side panels do --
 * over the whole window, full height, flush right, a scrim over everything -- not over the assistant's panes only.
 */
describe('AI Assistant: the History panel below 1280', () => {
  it('is fixed to the window, full height, right, above a full-window scrim; beside the thread from 1280', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const ts = fs.readFileSync(`${root}/src/app/features/ai/assistant/assistant.ts`, 'utf8');
    const open = /\.ai-history\.open \{([^}]*)\}/.exec(ts)![1];
    expect(open).toContain('position: fixed');
    expect(open).toContain('right: 0');
    expect(open).toContain('height: 100dvh');
    const scrim = /\.ai-history-backdrop \{([^}]*)\}/.exec(ts)![1];
    expect(scrim).toContain('position: fixed');
    expect(scrim).toContain('inset: 0');
    expect(ts).toMatch(/@media \(min-width: 1280px\)[\s\S]*\.ai-history, \.ai-history\.open \{[^}]*position: static/);
  });
});

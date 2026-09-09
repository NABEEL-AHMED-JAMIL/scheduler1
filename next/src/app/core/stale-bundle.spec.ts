import { describe, it, expect, beforeEach } from 'vitest';
import { isStaleChunkError, shouldReloadFor, clearStaleBundleMarker } from './stale-bundle';

/**
 * The situation these guard: a tab open across a deploy asks for a lazy chunk whose content
 * hash no longer exists on the server. The import rejects, the router stops dead, and the nav
 * bar silently does nothing -- the user has to know to hard-refresh. This is not an edge case;
 * it happens to every open tab on every deploy.
 */
describe('isStaleChunkError', () => {
  it.each([
    'Failed to fetch dynamically imported module: http://localhost:4400/chunk-Dn6X9m0D.js',
    'error loading dynamically imported module',
    'ChunkLoadError: Loading chunk 5 failed',
    'Importing a module script failed',
  ])('recognises %s', message => {
    expect(isStaleChunkError(new Error(message))).toBe(true);
  });

  it('accepts a bare string as well as an Error', () => {
    expect(isStaleChunkError('Failed to fetch dynamically imported module')).toBe(true);
  });

  it.each([
    'Cannot match any routes. URL Segment: nope',
    'Http failure response for /api/v1/report.json/runs: 500',
    '',
  ])('leaves ordinary failures alone: %s', message => {
    expect(isStaleChunkError(new Error(message))).toBe(false);
  });

  it('does not throw on null or undefined', () => {
    expect(isStaleChunkError(null)).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});

describe('shouldReloadFor', () => {
  beforeEach(() => clearStaleBundleMarker());

  it('allows the first reload for a URL', () => {
    expect(shouldReloadFor('/reports')).toBe(true);
  });

  it('refuses a second, so a genuinely missing chunk cannot loop for ever', () => {
    expect(shouldReloadFor('/reports')).toBe(true);
    expect(shouldReloadFor('/reports')).toBe(false);
    expect(shouldReloadFor('/reports')).toBe(false);
  });

  it('re-arms once a navigation succeeds, so a later deploy still recovers', () => {
    expect(shouldReloadFor('/reports')).toBe(true);
    clearStaleBundleMarker();
    expect(shouldReloadFor('/reports')).toBe(true);
  });

  it('tracks one URL at a time, so a different route is still allowed its own attempt', () => {
    expect(shouldReloadFor('/reports')).toBe(true);
    expect(shouldReloadFor('/jobs')).toBe(true);
  });
});

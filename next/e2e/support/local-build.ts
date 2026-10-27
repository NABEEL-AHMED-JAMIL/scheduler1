import { Page, Route } from '@playwright/test';

/**
 * E2E_LOCAL_BUILD=http://127.0.0.1:4301: the console's pages come from that server (a worktree's `ng build`, served as
 * static files) while the address stays E2E_BASE_URL's -- so the gateway's CORS allow-list and the stored session still
 * apply. For checking a branch before the console container is rebuilt; unset, nothing changes.
 *
 * A page fulfilled by a route counts as a public one to Chromium's local-network checks, which then refuse its calls to
 * the gateway on localhost. Relaying them through route.fetch loses a multipart upload's file, so instead the browser is
 * started without those checks: a spec that uses this puts `test.use(LOCAL_BUILD_USE)` at its top.
 */
export const LOCAL_BUILD_USE = process.env['E2E_LOCAL_BUILD']
  ? { launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'] } }
  : {};

export async function useLocalBuild(page: Page): Promise<void> {
  const local = process.env['E2E_LOCAL_BUILD'];
  if (!local) return;
  const origin = new URL(process.env['E2E_BASE_URL'] ?? 'http://localhost:4400').origin;
  // A request still in flight when the test closes its page has nowhere to go: dropped quietly.
  const relay = async (route: Route, url?: string) => {
    try {
      await route.fulfill({ response: await route.fetch(url ? { url } : undefined) });
    } catch {
      await route.abort().catch(() => undefined);
    }
  };
  await page.route(`${origin}/**`, route => {
    const path = new URL(route.request().url()).pathname;
    return relay(route, local + (/\.[a-z0-9]+$/i.test(path) ? path : '/index.html'));
  });
  await page.reload();
}

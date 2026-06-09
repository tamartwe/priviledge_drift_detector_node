/**
 * Known / trusted application IDs that are allowed to emit permission-change events.
 *
 * Extend this set at startup via the WHITELISTED_APPS environment variable:
 *   WHITELISTED_APPS=app-a,app-b npm run dev
 *
 * Any event whose `appId` is NOT present in the whitelist triggers an
 * UNKNOWN_APP anomaly. Events with no `appId` are exempt from this check.
 */

const BUILTIN_WHITELIST: ReadonlySet<string> = new Set([
  'iam-service',
  'admin-portal',
  'auth-gateway',
  'provisioning-worker',
  'ci-pipeline',
]);

function buildWhitelist(): Set<string> {
  const extra = (process.env.WHITELISTED_APPS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return new Set([...BUILTIN_WHITELIST, ...extra]);
}

export const appWhitelist: Set<string> = buildWhitelist();

export function isKnownApp(appId: string): boolean {
  return appWhitelist.has(appId);
}

export function addToWhitelist(appId: string): void {
  appWhitelist.add(appId);
}

/**
 * MIG-450: a Route step's branches, read from a pipeline definition the way Core's engine reads them (process.pipeline.Routes):
 *
 *   - a Route ("route") names its branches in config.branches[].name, then its Otherwise (config.otherwise, "otherwise");
 *   - the first step of a branch reads "<route>.<branch>" (its input);
 *   - a step is in a branch when what it reads is (its input, else the step before it) -- the branch, or a step in it;
 *   - a Merge ("merge", config.route) stacks every branch's last step, or the branch's own rows when it has none, and the
 *     steps after it are one line again.
 */
export interface RouteStepLike {
  key: string;
  task: string;
  input?: string | null;
  config?: Record<string, unknown> | null;
}

export const ROUTE_TASK = 'route';
export const MERGE_TASK = 'merge';

export function isRoute(step: RouteStepLike | null | undefined): boolean {
  return step?.task === ROUTE_TASK;
}

export function isMerge(step: RouteStepLike | null | undefined): boolean {
  return step?.task === MERGE_TASK;
}

/** A route's branch names in order: its condition branches, then Otherwise. */
export function branchNames(route: RouteStepLike): string[] {
  const config = route.config ?? {};
  const branches = Array.isArray(config['branches']) ? config['branches'] as unknown[] : [];
  const names = branches.map(b => (b && typeof b === 'object' && typeof (b as Record<string, unknown>)['name'] === 'string'
    ? ((b as Record<string, unknown>)['name'] as string).trim() : '')).filter(Boolean);
  const otherwise = typeof config['otherwise'] === 'string' && (config['otherwise'] as string).trim() ? (config['otherwise'] as string).trim() : 'otherwise';
  return [...names, otherwise];
}

/** The column a route writes each row's branch into. */
export function routeColumn(route: RouteStepLike): string {
  const c = route.config?.['column'];
  return typeof c === 'string' && c.trim() ? c.trim() : 'branch';
}

/** The branch refs ("<route>.<branch>") the routes among these steps make, each with its route and name. */
export function branchRefs(steps: readonly RouteStepLike[]): Map<string, { route: string; branch: string }> {
  const out = new Map<string, { route: string; branch: string }>();
  for (const step of steps) {
    if (!isRoute(step)) continue;
    for (const name of branchNames(step)) out.set(`${step.key}.${name}`, { route: step.key, branch: name });
  }
  return out;
}

/** Which branch each step is in ("<route>.<branch>"); a step in none is absent. */
export function branchOfSteps(steps: readonly RouteStepLike[]): Map<string, string> {
  const of = new Map<string, string>();
  const refs = new Set<string>();
  let previous: string | null = null;
  for (const step of steps) {
    const reads = step.input || previous;
    const branch = reads ? (refs.has(reads) ? reads : of.get(reads) ?? null) : null;
    if (branch && !isMerge(step)) of.set(step.key, branch);
    if (isRoute(step)) for (const name of branchNames(step)) refs.add(`${step.key}.${name}`);
    previous = step.key;
  }
  return of;
}

/** What a Merge at {@code mergeIndex} stacks: per branch of the route, its last step before the Merge, or the branch itself. */
export function mergeHeads(steps: readonly RouteStepLike[], mergeIndex: number, routeKey: string): { branch: string; reads: string }[] {
  const route = steps.find(s => s.key === routeKey && isRoute(s));
  if (!route) return [];
  const of = branchOfSteps(steps);
  return branchNames(route).map(branch => {
    const ref = `${routeKey}.${branch}`;
    let reads = ref;
    steps.slice(0, mergeIndex).forEach(s => { if (of.get(s.key) === ref) reads = s.key; });
    return { branch, reads };
  });
}

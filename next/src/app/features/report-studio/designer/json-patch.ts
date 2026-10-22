import { PatchOp } from '../ai-designer.api';

/**
 * RFC 6902's add, remove, replace and test (the AI designer's proposals, Report Studio phase 6), applied to a copy: the
 * designer previews a proposal on the page and applies an accepted one as one undo step. The same rules as media's
 * JsonPatch: a path that is not there, or a test that does not hold, throws and nothing is half-applied.
 */
export function applyPatch<T>(doc: T, patch: PatchOp[]): T {
  let root: unknown = JSON.parse(JSON.stringify(doc));
  patch.forEach((op, i) => {
    const at = pointer(op.path, i + 1);
    const value = op.value === undefined ? undefined : JSON.parse(JSON.stringify(op.value));
    if (op.op === 'test') {
      if (JSON.stringify(get(root, at, i + 1)) !== JSON.stringify(value)) throw new Error(`Operation ${i + 1} (test ${op.path}) does not hold.`);
      return;
    }
    if (!at.length) {
      if (op.op === 'remove') throw new Error(`Operation ${i + 1} removes the whole draft.`);
      root = value;
      return;
    }
    const parent = get(root, at.slice(0, -1), i + 1) as Record<string, unknown> | unknown[];
    const last = at[at.length - 1];
    if (Array.isArray(parent)) {
      const index = last === '-' && op.op === 'add' ? parent.length : position(last, op.op === 'add' ? parent.length : parent.length - 1, i + 1);
      if (op.op === 'add') parent.splice(index, 0, value);
      else if (op.op === 'replace') parent[index] = value;
      else parent.splice(index, 1);
    } else if (parent && typeof parent === 'object') {
      if (op.op !== 'add' && !(last in parent)) throw new Error(`Operation ${i + 1}'s path is not in the draft (${op.path}).`);
      if (op.op === 'remove') delete parent[last];
      else parent[last] = value;
    } else {
      throw new Error(`Operation ${i + 1} goes inside a value that holds nothing (${op.path}).`);
    }
  });
  return root as T;
}

function pointer(path: string, n: number): string[] {
  if (path === '') return [];
  if (!path.startsWith('/')) throw new Error(`Operation ${n}'s path does not start with '/'.`);
  return path.slice(1).split('/').map(t => t.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function position(token: string, max: number, n: number): number {
  if (!/^(0|[1-9]\d{0,5})$/.test(token) || Number(token) > max) throw new Error(`Operation ${n}'s path has no list position '${token}'.`);
  return Number(token);
}

function get(root: unknown, at: string[], n: number): unknown {
  let node = root;
  for (const t of at) {
    if (Array.isArray(node)) node = node[position(t, node.length - 1, n)];
    else if (node && typeof node === 'object' && t in (node as object)) node = (node as Record<string, unknown>)[t];
    else throw new Error(`Operation ${n}'s path is not in the draft (/${at.join('/')}).`);
  }
  return node;
}

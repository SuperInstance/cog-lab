// src/harness.mjs — samplers, drivers, stub runtime/executor for the 9 quilt-dba engine cells.
// Real cell code comes from subject/quilt-dba/engine (pinned commit, see subject/QUILT-DBA.txt).
// Stubs are deterministic and their behavior is pinned in test — receipts state what was stubbed.
import { evaluateValue, evaluateFormula, evaluateApi, evaluateRouter, fireListener, makeSensorValue, makeIoValue } from '../subject/quilt-dba/engine/index.js';
import { emptyContext, evalWhen } from '../subject/quilt-dba/engine/index.js';

// ---------- deterministic RNG (mulberry32) so sampler seeds are real ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const rint = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

// ---------- canonical key for entropy/model work ----------
export const canon = (v) => {
  if (v === undefined) return 'u';
  if (typeof v === 'number') return Number.isInteger(v) ? `n${v}` : `f${v.toFixed(4)}`;
  if (typeof v === 'string') return `s${v}`;
  if (typeof v === 'boolean') return `b${v}`;
  if (Array.isArray(v)) return 'a[' + v.map(canon).join(',') + ']';
  if (typeof v === 'object' && v !== null) {
    if ('kind' in v && 'data' in v && 'status' in v) return canon(v.data); // unwrap cell envelopes
    return 'o{' + Object.keys(v).sort().map(k => k + ':' + canon(v[k])).join(',') + '}';
  }
  return `x${String(v)}`;
};

// ---------- input distributions (RULES R2) ----------
const CONDS = ['caller.row > 10', 'caller.col == 0', 'caller.row <= 5', 'caller.col > 3', '1 == 1', 'caller.row == caller.col'];
const CELLS = ['models.fast', 'models.precise', 'cache.warm', 'teacher.offline'];

function sampleRules(r, d) {
  if (d === 'degenerate') return [];
  const n = d === 'uniform' ? rint(r, 0, 6) : rint(r, 1, 4);
  const rules = [];
  for (let i = 0; i < n; i++) {
    const kind = pick(r, ['cell', 'cellwith', 'value', 'model']);
    const when = d === 'uniform' ? pick(r, CONDS.concat(['nonsense.expr', ''])) : pick(r, CONDS);
    if (kind === 'cell') rules.push({ when, route: pick(r, CELLS) });
    else if (kind === 'cellwith') rules.push({ when, route: { cell: pick(r, CELLS), with: { tier: pick(r, ['gold', 'silver']) } } });
    else if (kind === 'value') rules.push({ when, route: { value: pick(r, ['premium', 'fallback', 42]) } });
    else rules.push({ when, route: { model: pick(r, ['gpt-4o', 'small']) } });
  }
  return rules;
}
const sampleCtx = (r, d) => {
  if (d === 'degenerate') return { ...emptyContext(), caller: 'test.caller', row: 0, col: 0 };
  const row = d === 'uniform' ? rint(r, -50, 5000) : rint(r, 0, 30);
  const col = d === 'uniform' ? rint(r, -20, 200) : rint(r, 0, 12);
  return { ...emptyContext(), caller: 'test.caller', row, column: col }; // CallerContext field is `column` (types.d.ts)
};
const sampleInput = (r, d) => {
  if (d === 'degenerate') return 'same-payload';
  if (d === 'uniform') return pick(r, [rint(r, -1000, 1000), 'str' + rint(r, 0, 99), { k: rint(r, 0, 9) }, null]);
  return pick(r, [rint(r, 0, 100), 'task-payload-' + rint(r, 0, 9), { step: rint(r, 0, 20) }]);
};

// ---------- stub runtime/executor (pinned; receipts state these are stubs) ----------
// Router's ROLE is route selection; delegation effect is stubbed deterministically.
export const makeStubRuntime = (log) => ({
  call: async (id, input, ctx) => {
    if (log) log.push({ id, input: canon(input), row: ctx?.row });
    return { data: { stub: id, echo: input ?? null }, status: 'ready', computedAt: 0 };
  },
});
// Api's ROLE is request shaping + response mapping; network is stubbed.
export const makeStubExecutor = (failEvery = 0) => {
  let n = 0;
  return {
    fetch: async (url, init) => {
      n += 1;
      if (failEvery && n % failEvery === 0) return { ok: false, status: 503, statusText: 'Stub Down', headers: { get: () => 'application/json' } };
      const isJson = (init.headers?.['Content-Type'] ?? 'application/json').includes('json');
      return {
        ok: true, status: 200,
        headers: { get: () => (isJson ? 'application/json' : 'text/plain') },
        json: async () => ({ url, got: JSON.parse(init.body ?? 'null'), method: init.method }),
        text: async () => 'plain-stub',
      };
    },
  };
};

// ---------- cell drivers: build a cell def, run REAL code, return {x, y} ----------
const mkCell = (kind, def) => ({ id: `test.${kind}`, kind, def, value: { data: undefined, status: 'idle', error: null }, contextCache: new Map() });

export const drivers = {
  router: async (r, d) => {
    const rules = sampleRules(r, d);
    const cell = mkCell('router', { rules });
    const ctx = sampleCtx(r, d);
    const input = sampleInput(r, d);
    const log = [];
    const y = await evaluateRouter(cell, ctx, input, makeStubRuntime(log));
    return { x: { rules, ctxRow: ctx.row, ctxCol: ctx.col, input }, y };
  },
  formula: async (r, d) => {
    const exprs = d === 'degenerate' ? [''] : d === 'uniform'
      ? ['a.b + a.c', 'abs(a.k)', 'min(1, max(9, 4))', 'a.missing * 2', 'clamp(a.x, 0, 100)']
      : ['a.b + a.c', 'abs(a.k)', 'min(a.b, a.c) + max(1, a.k)', 'clamp(a.k, 0, 100)'];
    const expr = pick(r, exprs);
    const world = new Map();
    world.set('a.b', { value: { data: d === 'uniform' ? rint(r, -50, 50) : rint(r, 0, 100) } });
    world.set('a.c', { value: { data: d === 'uniform' ? rint(r, -50, 50) : rint(r, 0, 20) } });
    world.set('a.k', { value: { data: sampleInput(r, d) } });
    world.set('a.x', { value: { data: rint(r, -20, 300) } });
    const cell = mkCell('formula', { expr });
    let y;
    try { y = evaluateFormula(cell, emptyContext(), world); } catch (e) { y = { data: undefined, status: 'error', error: { message: String(e.message ?? e) } }; }
    return { x: { expr, world: Object.fromEntries([...world].map(([k, v]) => [k, v.value.data])) }, y };
  },
  api: async (r, d) => {
    const endpoints = d === 'degenerate' ? [''] : d === 'uniform'
      ? ['https://h.example/{{caller.row}}', 'model:test', 'mcp://tool/x', 'https://h.example/p']
      : ['https://api.internal/jobs', 'https://api.internal/jobs/{{caller.row}}', 'model:test'];
    const endpoint = pick(r, endpoints);
    const method = pick(r, ['GET', 'POST']);
    const cell = mkCell('api', { endpoint, method });
    const ctx = sampleCtx(r, d);
    const input = method === 'GET' ? undefined : sampleInput(r, d);
    const y = await evaluateApi(cell, ctx, input, makeStubExecutor(d === 'uniform' ? 5 : 0));
    return { x: { endpoint, method, row: ctx.row, input }, y };
  },
  listener: async (r, d) => {
    const watch = d === 'degenerate' ? [] : d === 'uniform'
      ? [pick(r, ['a.x', 'a.y', 'a.z']), pick(r, [['a.x', 'a.y'], ['a.z'], ['q.w']].flat())]
      : [['a.b'], ['a.k'], ['a.b', 'a.k']][rint(r, 0, 2)];
    const condition = d === 'uniform' ? pick(r, [undefined, '1 == 1', 'caller.row > 100']) : undefined;
    const cell = mkCell('listener', { watch, condition, action: 'acts.log' });
    const changed = d === 'uniform' ? pick(r, ['a.x', 'a.b', 'a.k', 'a.nope']) : pick(r, ['a.b', 'a.k', 'a.zzz']);
    const newV = { data: sampleInput(r, d), status: 'ready' };
    const prevV = { data: sampleInput(r, d), status: 'ready' };
    const log = [];
    const fired = await fireListener(cell, changed, newV, prevV, makeStubRuntime(log));
    return { x: { watch, condition: condition ?? 'none', changed, newData: newV.data }, y: { fired, calls: log.length } };
  },
  // --- determinacy-only cells (R3: def-driven, training arm degenerate) ---
  value: async (r, d) => {
    const val = d === 'degenerate' ? 7 : sampleInput(r, d);
    const cell = mkCell('value', { value: val });
    const y = evaluateValue(cell, emptyContext());
    return { x: { ignoredInput: sampleInput(r, d) }, y };
  },
  sensor: async (r, d) => {
    const data = d === 'degenerate' ? 7 : sampleInput(r, d);
    const y = makeSensorValue(data);
    return { x: { wrapped: data }, y };
  },
  io: async (r, d) => {
    const data = d === 'degenerate' ? 7 : sampleInput(r, d);
    const y = makeIoValue(data);
    return { x: { wrapped: canon(data) }, y };
  },
};

export const CELLS_ALL = Object.keys(drivers);

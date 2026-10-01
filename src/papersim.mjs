// src/papersim.mjs — paper simulators, written from the DOCUMENTED cell contracts only.
// Provenance: each simulator was written from the header/comment contract in the subject's
// .js/.d.ts files WITHOUT reading the implementation body of the corresponding evaluator.
// Where the doc is ambiguous, the ambiguity is noted (that ambiguity is what the transfer
// gap will price). Deliberate mismatches for the null control are marked MISMATCH.

// Documented router contract: "Rules are evaluated in order. The first one whose `when`
// evaluates to truthy wins." Route kinds: string cell id | {cell, with} | {model} | {value}.
// No match → undefined with status 'ready'. `when` is evaluated in the caller's context.
export function evalWhenDoc(expr, row, col) {
  // documented shapes: caller.X <op> literal, literal == literal
  if (expr === undefined || expr === '') return false;
  if (expr === '1 == 1') return true;
  const m = /^\s*caller\.(row|col|column)\s*(==|>|<=|>=|<|!=)\s*(-?\d+)\s*$/.exec(expr);
  if (m) {
    // documented evalWhen scope (context.js): {row, column, sheet, identity, metadata}.
    // `caller.col` is NOT in the scope → undefined → any numeric comparison is false.
    const v = m[1] === 'row' ? row : (m[1] === 'column' ? col : undefined);
    const n = Number(m[3]);
    if (v === undefined) return false;
    switch (m[2]) {
      case '==': return v === n;
      case '>': return v > n;
      case '<=': return v <= n;
      case '>=': return v >= n;
      case '<': return v < n;
      case '!=': return v !== n;
    }
  }
  const eq = /^\s*caller\.(row|col|column)\s*==\s*caller\.(row|col|column)\s*$/.exec(expr);
  if (eq) { const v = (f) => (f === 'row' ? row : (f === 'column' ? col : undefined)); return v(eq[1]) === v(eq[2]); }
  return false; // undocumented expressions are falsy in the doc-sim (ambiguity noted)
}
export function paperRouter(x, { mismatch = false } = {}) {
  const rules = x.rules;
  const seq = mismatch ? [...rules].reverse() : rules; // MISMATCH: last-match-wins
  for (const rule of seq) {
    if (evalWhenDoc(rule.when, x.ctxRow, x.ctxCol)) {
      const rt = rule.route;
      if (typeof rt === 'string') return { stub: rt, echo: x.input ?? null }; // doc: "delegate to a cell"; pinned harness double echoes its input
      if (rt && typeof rt === 'object') {
        if ('value' in rt) return rt.value;
        if ('model' in rt) return { model: rt.model }; // doc: "swap the model (placeholder)" — placeholder payload shape is doc-silent; this guess is deliberately left pricing CG-4
        if ('cell' in rt) {
          const base = { stub: rt.cell, echo: x.input ?? null };
          // doc: "delegate to a cell, then merge `with` into the result" (d.ts:43-44)
          return rt.with ? { ...base, ...rt.with } : base;
        }
      }
      return undefined;
    }
  }
  return undefined; // no match → undefined (status 'ready' is harness chrome, data is the output)
}

// Documented formula contract: an expression over cell ids with helpers abs/min/max/clamp.
// The doc lists helper names but not precedence tables — standard arithmetic precedence
// is assumed (ambiguity noted; the MISMATCH variant flattens to left-to-right).
const parseDoc = (expr, world, { mismatch = false } = {}) => {
  if (!expr || !expr.trim()) return { error: 'formula cell has no expr' };
  const toks = expr.match(/[a-z]\.[a-zA-Z]+|abs|min|max|clamp|\d+\.?\d*|[()+\-*,]/g) ?? [];
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];
  function parseExpr() {
    if (mismatch) return parseFlat();
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') { const op = next(); const r = parseTerm(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  function parseFlat() { // MISMATCH: strictly left-to-right, no precedence
    let v = parseAtom();
    while (['+', '-', '*'].includes(peek())) { const op = next(); const r = parseAtom(); v = op === '+' ? v + r : op === '-' ? v - r : v * r; }
    return v;
  }
  function parseTerm() {
    let v = parseFactor();
    while (peek() === '*') { next(); v = v * parseFactor(); }
    return v;
  }
  function parseFactor() { const v = parseAtom(); return v; }
  function parseAtom() {
    const t = next();
    if (t === undefined) return 0;
    if (t === '(') { const v = parseExpr(); if (peek() === ')') next(); return v; }
    if (/^\d/.test(t)) return Number(t);
    if (t === 'abs') { if (peek() === '(') next(); return Math.abs(parseExpr()); }
    if (t === 'min' || t === 'max' || t === 'clamp') {
      next(); // '('
      const args = [parseExpr()];
      while (peek() === ',') { next(); args.push(parseExpr()); }
      if (peek() === ')') next();
      if (t === 'min') return Math.min(...args);
      if (t === 'max') return Math.max(...args);
      return Math.min(Math.max(args[0], args[1] ?? 0), args[2] ?? 100);
    }
    if (/^[a-z]\./.test(t)) { const val = world[t]; return typeof val === 'number' ? val : 0; } // missing cell → undefined→0 (doc: "no thrown errors for missing cells")
    return 0;
  }
  try { const v = parseExpr(); return Number.isNaN(v) ? undefined : v; } catch { return undefined; } // real error path carries data:undefined
};
export function paperFormula(x, opts) { return parseDoc(x.expr, x.world, opts); }

// Documented api contract: substitute {{caller.row}} etc., method defaults GET,
// body for non-GET, error shape on failure, JSON vs text by content-type. Network stubbed.
export function paperApi(x, { mismatch = false } = {}) {
  if (!x.endpoint) return undefined; // real error path carries data:undefined
  if (x.endpoint.startsWith('model:')) return { model: x.endpoint, note: 'model calls not yet implemented' };
  if (x.endpoint.startsWith('mcp://')) return { mcp: x.endpoint, note: 'mcp placeholder' };
  let url = x.endpoint.replace('{{caller.row}}', String(x.row));
  if (mismatch) url = x.endpoint.replace('{{caller.row}}', String(x.row + 1)); // MISMATCH: off-by-one substitution
  if (x.method === 'GET') return { url, got: null, method: 'GET' };
  return { url, got: x.input === undefined ? null : JSON.parse(JSON.stringify(x.input)), method: x.method }; // mirror the stub's parsed body echo
}

// Documented listener contract: fire only if changed cell is watched AND condition passes;
// action invoked with {changed, value}. Output = {fired, calls}.
export function paperListener(x, { mismatch = false } = {}) {
  const watched = Array.isArray(x.watch) ? x.watch : [];
  if (!watched.includes(x.changed)) return { fired: false, calls: 0 };
  if (!mismatch && x.condition && x.condition !== 'none') {
    if (!evalWhenDoc(x.condition, 0, 0)) return { fired: false, calls: 0 };
  }
  if (mismatch && x.condition && x.condition !== 'none') return { fired: false, calls: 0 }; // MISMATCH: conditions never fire
  return { fired: true, calls: 1 };
}

export const PAPER = { router: paperRouter, formula: paperFormula, api: paperApi, listener: paperListener };

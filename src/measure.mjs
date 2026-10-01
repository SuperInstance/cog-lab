// src/measure.mjs — determinacy (R1), input-sensitivity (R7), entropy estimators.
import { canon } from './harness.mjs';

// plugin entropy over a multiset of canonical keys
export function entropy(keys) {
  const n = keys.length;
  if (n === 0) return 0;
  const counts = new Map();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) { const p = c / n; h -= p * Math.log2(p); }
  return h;
}

// H(Y|X) plugin: group by x key, average group entropies weighted by group size
export function condEntropy(pairs) {
  const groups = new Map();
  for (const [x, y] of pairs) {
    const g = groups.get(x) ?? [];
    g.push(y); groups.set(x, g);
  }
  let h = 0; const n = pairs.length;
  for (const g of groups.values()) h += (g.length / n) * entropy(g);
  return h;
}

export const mutualInfo = (pairs, hx, hy) => hy - condEntropy(pairs);

// det = 1 - H(Y|X)/log2|O_observed|   (R1; HEURISTIC when support < 20)
// sens = I(X;Y)/H(Y)                 (R7; 0 when output is def-driven)
export function measures(pairs) {
  const ys = pairs.map(p => p[1]);
  const hy = entropy(ys);
  const hyc = condEntropy(pairs);
  const support = new Set(ys).size;
  const logO = Math.log2(Math.max(support, 2));
  const det = 1 - hyc / logO;
  const sens = hy === 0 ? 0 : (hy - hyc) / hy;
  return { det, sens, hy, hyc, support, n: pairs.length, heuristic: support < 20 };
}

// src/findings.mjs — wave-1 contract-gap localization: where does the doc-derived
// paper simulator disagree with the real cell, and what doc line would close it?
import { writeFileSync } from 'node:fs';
import { drivers, rng, canon } from './harness.mjs';
import { PAPER } from './papersim.mjs';

const payload = (y) => (y && typeof y === 'object' && 'data' in y ? y.data : y);

const findings = [];
for (const cell of ['router', 'formula', 'api', 'listener']) {
  const r = rng(4242);
  const misses = [];
  let n = 0, agree = 0;
  const missByClass = {};
  for (let i = 0; i < 400; i++) {
    const { x, y } = await drivers[cell](r, 'operational');
    const py = PAPER[cell](x);
    n++;
    if (canon(payload(y)) === canon(py)) { agree++; continue; }
    // classify the miss
    let cls = 'other';
    if (cell === 'formula') {
      const hasNonNumeric = Object.values(x.world).some(v => typeof v !== 'number');
      cls = hasNonNumeric ? 'operand-typing-undocumented' : 'expr-semantics';
    } else if (cell === 'api') {
      if (typeof x.input === 'string') cls = 'string-body-encoding-undocumented';
      else if (/\{\{caller\./.test(x.endpoint)) cls = 'template-namespace-inconsistent';
      else cls = 'response-shape';
    } else if (cell === 'router') cls = (JSON.stringify(x.rules).includes('model')) ? 'placeholder-shape-undocumented' : 'route-dispatch';
    else if (cell === 'listener') cls = 'fire-semantics';
    missByClass[cls] = (missByClass[cls] ?? 0) + 1;
    if (misses.length < 5) misses.push({ x: JSON.stringify(x).slice(0, 140), real: canon(payload(y)), paper: canon(py) });
  }
  findings.push({
    cell, n, agree, agreement: agree / n, missByClass, sampleMisses: misses,
    mark: 'MEASURED (real quilt-dba engine code vs doc-derived paper sim, CPU, Node)',
  });
}

// hand-authored contract-gap readings of the measured classes (each cites the subject file:line)
findings.push({
  kind: 'contract-gap',
  id: 'CG-1',
  cell: 'api',
  measuredClass: 'template-namespace-inconsistent',
  what: "{{caller.row}} in a URL template walks the RAW context object (engine/cells/api.js substitute: path-walk over ctx), so it resolves ctx.caller.row — but ctx.caller is a CellId string → ''. Meanwhile the SAME spelling in a router when-condition resolves ctx.row via evalWhen's scope (engine/context.js). The .d.ts example (api.d.ts ENDPOINT SHAPES) shows {{caller.row}} → /tenants/boat-1/status — which the implementation cannot produce.",
  suggestion: "One doc line: either templates adopt the evalWhen scope ({{row}}), or the example changes to {{row}}. Until then, a doc-derived simulator cannot know which 'caller.row' is real — that IS the measured gap.",
  mark: 'MEASURED + CITED',
});
findings.push({
  kind: 'contract-gap',
  id: 'CG-2',
  cell: 'formula',
  measuredClass: 'operand-typing-undocumented',
  what: "Formula docs list helpers but say nothing about operand types. Real impl follows JS coercion: abs('task-payload-8') = NaN, and 'a'+'b' concatenates. Doc-derived sim guessed 0 for non-numerics. Agreement loss = P(non-numeric operand reaches arithmetic) under the operational distribution.",
  suggestion: "One doc line: 'expressions follow JavaScript coercion; non-numeric operands yield NaN (or string concat for +), never errors.'",
  mark: 'MEASURED + CITED',
});
findings.push({
  kind: 'contract-gap',
  id: 'CG-3',
  cell: 'api',
  measuredClass: 'string-body-encoding-undocumented',
  what: "Request body for non-GET: impl sends STRING inputs raw (typeof input === 'string' ? input : JSON.stringify(input)); doc example shows JSON only. A JSON-parsing stub (or a JSON-assuming simulator) errors/diverges on raw string bodies.",
  suggestion: "One doc line: 'string inputs are sent as-is (raw body); non-strings are JSON-encoded.'",
  mark: 'MEASURED + CITED',
});
findings.push({
  kind: 'contract-gap',
  id: 'CG-4',
  cell: 'router',
  measuredClass: 'placeholder-shape-undocumented',
  what: "The {model} route is documented only as 'swap the model for the next call (placeholder)' (router.d.ts:46-47) — the placeholder's payload shape is doc-silent. Impl returns {model, input}; the doc-derived sim guessed {model}. After two doc-supported sim revisions (echo passthrough + with-merge shape, both cited to router.d.ts:43-44 and the pinned harness double), remaining router disagreement prices exactly this silence.",
  suggestion: "One doc line: 'model routes return {model, input} as a placeholder until providers land.'",
  mark: 'MEASURED + CITED',
});
findings.push({
  kind: 'harness',
  id: 'H-1',
  what: "Under the R4 exact-match learner with heavy-tailed x (rule sets, payloads), train/test x rarely collide; unresolved test points fall back to the prior for EVERY arm, so a mismatched simulator's gap CANNOT widen (nullWidened=false everywhere). The transfer gap as measured prices per-point sim/real agreement, not learned generalization — consistent with thesis §5.5 ('a control that cannot widen the gap is not a control'). Wave 2 must pre-register a generalizing model class.",
  mark: 'MEASURED (inert null control) + PREDICTED (wave-2 fix)',
});

writeFileSync('experiments/outputs/findings_w1.json', JSON.stringify(findings, null, 2));
for (const f of findings) {
  if (f.kind) { console.log(`${f.id} [${f.kind}] ${f.cell ?? ''}: ${String(f.what).slice(0, 110)}...`); }
  else console.log(`${f.cell}: agreement ${f.agreement.toFixed(3)} (${f.agree}/${f.n}) miss classes ${JSON.stringify(f.missByClass)}`);
}

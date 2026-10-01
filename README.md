# cog-lab — the Cog Thesis, tested

Tests the falsifiable hypothesis in
[`SuperInstance/quilt-dba` → `docs/COG-THESIS.md`](https://github.com/SuperInstance/quilt-dba/blob/main/docs/COG-THESIS.md):

> A component inside a cellular system is learnable from simulated data when its role is
> computable from its own input/output contract — and not otherwise.

**Subject:** `subject/quilt-dba` engine pinned at `37efeabd0c7ae9f503f25a68483199ab4f6187c1`
(real engine code driven headless; stubs are pinned in `test/` and declared in receipts).

## Version lineage

| version | what |
|---|---|
| `efcb934` | **RULES.md committed before any run** (R1–R8): pre-registered measure, distribution grid, degeneracy prediction, matched-budget training arm, must-fire null control, scope cuts, input-sensitivity qualifier, honest marks. |
| wave-1 code | `src/harness.mjs` (samplers + drivers + stub runtime/executor), `src/measure.mjs`, `src/papersim.mjs` (doc-derived sims + deliberately-mismatched variants), `src/run.mjs`, `src/findings.mjs`. |
| wave-1 outputs | `experiments/outputs/wave1_determinacy_transfer.json`, `findings_w1.json`, `receipts_coglab_w1.jsonl`. |
| wave-1 pins | `test/cog.test.mjs` — 9/9. |

## Wave-1 headline numbers (MEASURED, CPU, Node; plugin-entropy bias noted in RULES R1)

| cell | det (uniform/operational) | sim↔real agreement | transfer gap (arm) | verdict |
|---|---|---|---|---|
| router | 1.000 / 1.000 | 0.858 (rest = CG-4) | 0.001 | doc-faithful except doc-silent `{model}` placeholder |
| formula | 1.000 / 1.000 | 0.537 | 0.483 | **CG-2**: operand typing undocumented (NaN vs 0) |
| api | 1.000 / 1.000 | 0.620 | 0.152 | **CG-1, CG-3**: template namespace, string body encoding |
| listener | 1.000\* / 1.000\* | 1.000 | 0.005 | doc-faithful |
| value / sensor / io | see outputs | — | — | R3 degenerates confirmed (def-driven, not input-driven) |

\* HEURISTIC flag (output support < 20, R1).

## The four measured contract gaps (each: what + one-line doc suggestion)

1. **CG-1 (api)** — `{{caller.row}}` templates walk the raw context object while the same
   spelling in router `when`-conditions resolves via the evalWhen scope. The engine has two
   different `caller.row` namespaces; the `.d.ts` example shows output the implementation
   cannot produce.
2. **CG-2 (formula)** — docs list helpers but not operand types. Real impl follows JS
   coercion (`abs('x') = NaN`); doc-derived sims guess anything. Agreement loss = P(non-numeric operand).
3. **CG-3 (api)** — string request bodies are sent **raw**, not JSON-encoded (docs show JSON only).
4. **CG-4 (router)** — the `{model}` route placeholder's payload shape is doc-silent
   (impl: `{model, input}`; sim guessed `{model}`). Priced, not patched.

## H-1 — the harness finding (recorded, not hidden)

Under the R4 exact-match learner with heavy-tailed inputs, train/test inputs rarely
collide and every arm falls back to the prior on unseen points — so the **null control
cannot widen the gap** (null_widened=false for all four cells). The transfer gap as
measured prices per-point sim/real agreement, not learned generalization (thesis §5.5's
own warning). **Wave 2 must pre-register a generalizing model class** (feature-based or
small neural) before re-running the arm.

## What wave 1 does NOT claim

- No claim that cells are/aren't "trainable" in general — only that doc-derived
  simulators transfer exactly as far as the documented contract reaches, and no further.
- No claim about `program`/`ai` cells (R6 wave-2 scope cut, needs full runtime).
- Determinacy uses plugin entropy: biased low on thin support (flagged HEURISTIC);
  `sens` (I(X;Y)/H(Y)) is positively biased at high support — qualitative only for
  value/sensor/io.

## Reproduce

```bash
git clone https://github.com/SuperInstance/cog-lab && cd cog-lab
git clone --depth 1 https://github.com/SuperInstance/quilt-dba.git subject/quilt-dba
npm install yaml@2
node src/run.mjs && node src/findings.mjs && node --test test/cog.test.mjs
```

Honest marks: every output carries MEASURED / SYNTHETIC / CITED / PREDICTED
(RULES R8). Refusal policy: if a run cannot fire its control, the run says so (H-1).

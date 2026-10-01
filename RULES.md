# cog-lab decision rules — wave 1

**Committed: 2026-10-01, before any measurement run.** Per
`quilt-dba/CHARTER.md` and `docs/COG-THESIS.md` §6: rules as receipts dated
before the run that produces the numbers. If a number below was produced
before this file existed, distrust it.

Subject: `subject/quilt-dba` pinned at `37efeabd0c7ae9f503f25a68483199ab4f6187c1`.
Question: does a cell's I/O determinacy predict its transfer gap
(simulated-data-trained vs real-trace-trained behavior model)?

## R1 — Measure interpretation (pre-registered)

COG-THESIS §3 defines `determinacy(c) = 1 − H(observed output | fixed input)/log|O|`.
Operationalized as:

    det(c, D) = 1 − Ĥ(Y | X ~ D) / log2 |O_observed|

- `D` is an input distribution (three per cell, R2).
- `Ĥ` is the **plugin estimator** over canonical output keys. Known bias:
  plugin underestimates entropy when support is thin. Every reported value
  carries `n` and `support`. Where support < 20 distinct outputs, the value
  is marked **HEURISTIC** in the receipt.
- `|O_observed|` = number of distinct observed outputs (not the declared
  alphabet — declared alphabets are mostly unbounded strings; that choice is
  itself recorded in the receipt).

## R2 — Input distributions (pre-registered grid)

- **D1 uniform**: inputs drawn uniformly over the cell's declared type space
  (random rules, random caller contexts, random payloads).
- **D2 operational**: sheet-realistic inputs — small integer rows/cols,
  rule sets of 1–4 entries with plausible conditions, task-like payloads.
- **D3 degenerate**: near-empty / constant inputs (empty rule lists, fixed
  caller, single repeated payload).

If the three disagree wildly for a cell, report the instability as a finding
(do not average).

## R3 — Degeneracy pre-registration (the expected crack)

Cells whose behavior is a function of their own **definition** rather than
their **inputs** (`value` returns `cell.def.value`; `sensor`/`io` wrap their
payload) cannot be behavior-cloned from input simulation — any correct
simulator must read the def, and then "transfer" is a lookup, not learning.
**Prediction: these cells show determinacy ≈ 1.0 AND trivially-zero transfer
gaps, and this is NOT evidence for the thesis.** It is evidence that the
thesis needs an input-sensitivity qualifier (R7).

## R4 — Training arm protocol

- Model: maximum-likelihood conditional over canonical input keys with
  Laplace(α=0.1) smoothing. Transparent, seed-free (deterministic given
  sample), budget = number of training samples. "Two identical models,
  matched budget" (§5.3) → same learner class, same n, same seeds for the
  samplers.
- **Real arm**: trains on real traces (x = real input, y = real cell output).
- **Sim arm**: trains on (x = simulated input from D2, y = **paper-simulator
  output**). Paper simulators are written from the cell's documented contract
  (headers/.d.ts) only — not copied from impl source (see `src/papersim.mjs`
  provenance note).
- Eval: both arms on the SAME held-out real test set (n=250, drawn before
  training, never used for fitting). Holdout hash recorded in receipt.
- **Transfer gap** = acc(real arm) − acc(sim arm) on held-out real traces.
  Report over **3 sampler seeds**; std == 0 → INCONCLUSIVE per §6.

## R5 — Null control (the control must be able to fire)

A **mismatched simulator** (sim2) deliberately perturbs the behavior-relevant
dimension: for the router, last-matching-rule-wins instead of first. For
formula, an operator-precedence variant. If sim2's transfer gap does not
widen relative to sim1's, the simulator is not carrying signal → report
INCONCLUSIVE, never "supported."

## R6 — Cells in scope, wave 1

Full treatment (determinacy + transfer arm): **router, formula, api,
listener** — behavior is a non-trivial function of inputs/context, drivable
with stub runtime/executor (the stub's own behavior is recorded and pinned;
the cell's ROLE is the routing/decision, not the delegated effect).

Determinacy-only: **value, sensor, io** (R3 degenerates the training arm;
lookup-transfer is demonstrated once, as a pin, and reported as degenerate).

Wave 2 with reason: **program, ai** (need full ProgramRuntime / engine
resolution; the honest scope cut is recorded, not hidden).

## R7 — Secondary measure (input-sensitivity)

Because of R3, also report `sens = I(X;Y) / H(Y)` (fraction of output entropy
explained by inputs; 0 for def-driven cells). The thesis-refined prediction:
**transfer gap is a decreasing function of determinacy only among cells with
sens > 0.** If value/sensor/io land at det≈1 with gap≈0 yet sens=0, the
crack is confirmed and the thesis needs the qualifier.

## R8 — Honest marks

Every number in `experiments/outputs/` carries `mark`: MEASURED (ran on this
host, CPU, Node), SYNTHETIC (constructed), CITED, PREDICTED. Stubs are not
the real engine: api/listener arms use stub executor/runtime — the receipt
states exactly what was stubbed. CPU-only run, stated (§6).

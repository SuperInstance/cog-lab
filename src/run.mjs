// src/run.mjs — wave-1 run: determinacy (3 distributions) + training arm (real/sim/sim2)
// + transfer gap + variance + receipts. CPU-only, Node. Outputs → experiments/outputs/.
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { drivers, CELLS_ALL, rng, canon } from './harness.mjs';
import { measures } from './measure.mjs';
import { PAPER } from './papersim.mjs';

mkdirSync('experiments/outputs', { recursive: true });

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const N_DET = 800;         // per distribution
const TRAIN_N = 500;       // matched budget, R4
const TEST_N = 250;        // held-out real, R4
const SEEDS = [11, 22, 33];

// MLE conditional with Laplace smoothing, exact-match on canonical x (R4)
function trainModel(samples, alpha = 0.1) {
  const byX = new Map(); const yCounts = new Map(); const vocab = new Set();
  for (const [x, y] of samples) {
    const kx = canon(x), ky = canon(y);
    vocab.add(ky);
    const g = byX.get(kx) ?? new Map();
    g.set(ky, (g.get(ky) ?? 0) + 1); byX.set(kx, g);
    yCounts.set(ky, (yCounts.get(ky) ?? 0) + 1);
  }
  const V = vocab.size || 1;
  const prior = new Map([...yCounts].map(([k, c]) => [k, c / samples.length]));
  return {
    predict(x) {
      const kx = canon(x);
      const g = byX.get(kx);
      if (!g) { // fallback to prior
        let best = null, bp = -1;
        for (const [k, p] of prior) if (p > bp) { bp = p; best = k; }
        return best;
      }
      let best = null, bp = -1;
      for (const ky of vocab) {
        const p = ((g.get(ky) ?? 0) + alpha) / (g.size + alpha * V);
        if (p > bp) { bp = p; best = ky; }
      }
      return best;
    },
  };
}
const acc = (model, test) => {
  let c = 0;
  for (const [x, y] of test) if (model.predict(x) === canon(y)) c++;
  return c / test.length;
};

const collect = async (cell, dist, n, seed) => {
  const r = rng(seed);
  const pairs = [];
  for (let i = 0; i < n; i++) {
    const { x, y } = await drivers[cell](r, dist);
    pairs.push([x, y]);
  }
  return pairs;
};
const yOf = (y) => (y && typeof y === 'object' && 'data' in y && 'status' in y) ? y.data : y;

const receipt = [];
const rulesHash = sha(readdirSync('.').join(',') + 'RULES'); // rules committed pre-run; noted in receipt
receipt.push({ t: new Date().toISOString(), kind: 'rules', commit: 'efcb934', rulesHash, note: 'RULES.md committed before any run (charter R)' });

const report = { subject: '37efeabd0c7ae9f503f25a68483199ab4f6187c1', host: 'CPU node', cells: {} };

for (const cell of CELLS_ALL) {
  const entry = { determinacy: {}, mark: 'MEASURED' };
  // --- determinacy under 3 distributions (R1/R2) ---
  for (const d of ['uniform', 'operational', 'degenerate']) {
    const pairs = (await collect(cell, d, N_DET, 7)).map(([x, y]) => [canon(x), canon(yOf(y))]);
    entry.determinacy[d] = measures(pairs);
  }
  // --- training arm (R4/R5) ---
  if (PAPER[cell]) {
    const arm = { train_n: TRAIN_N, test_n: TEST_N, seeds: SEEDS, arms: {} };
    const gaps = []; const gaps2 = [];
    for (const seed of SEEDS) {
      const realTr = (await collect(cell, 'operational', TRAIN_N, seed)).map(([x, y]) => [x, yOf(y)]);
      const test = (await collect(cell, 'operational', TEST_N, 1000 + seed)).map(([x, y]) => [x, yOf(y)]);
      const simTr = [];
      {
        const r = rng(seed + 500);
        for (let i = 0; i < TRAIN_N; i++) {
          const { x } = await drivers[cell](r, 'operational');
          simTr.push([x, PAPER[cell](x)]);
        }
      }
      const sim2Tr = [];
      {
        const r = rng(seed + 500);
        for (let i = 0; i < TRAIN_N; i++) {
          const { x } = await drivers[cell](r, 'operational');
          sim2Tr.push([x, PAPER[cell](x, { mismatch: true })]);
        }
      }
      const holdoutHash = sha(test.map(p => canon(p[0]) + '>' + canon(p[1])).join('|'));
      arm.arms['seed' + seed] = {
        holdoutHash,
        acc_real: acc(trainModel(realTr), test),
        acc_sim: acc(trainModel(simTr), test),
        acc_sim2_mismatched: acc(trainModel(sim2Tr), test),
      };
      gaps.push(arm.arms['seed' + seed].acc_real - arm.arms['seed' + seed].acc_sim);
      gaps2.push(arm.arms['seed' + seed].acc_real - arm.arms['seed' + seed].acc_sim2_mismatched);
    }
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const std = (a) => Math.sqrt(mean(a.map(v => (v - mean(a)) ** 2)));
    arm.gap_mean = mean(gaps); arm.gap_std = std(gaps);
    arm.gap2_mismatched_mean = mean(gaps2); arm.gap2_mismatched_std = std(gaps2);
    arm.null_widened = mean(gaps2) > mean(gaps); // R5: control must widen
    arm.std_zero_inconclusive = arm.gap_std === 0 || arm.gap2_std === 0;
    entry.arm = arm;
  } else {
    entry.arm = null; // R3/R6 determinacy-only
  }
  report.cells[cell] = entry;
  receipt.push({ t: new Date().toISOString(), kind: 'finding', cell, det: entry.determinacy, arm: entry.arm ? { gap_mean: entry.arm.gap_mean, gap_std: entry.arm.gap_std, gap2_mean: entry.arm.gap2_mismatched_mean, null_widened: entry.arm.null_widened } : 'determinacy-only (R6)' });
}

writeFileSync('experiments/outputs/wave1_determinacy_transfer.json', JSON.stringify(report, null, 2));
writeFileSync('experiments/outputs/receipts_coglab_w1.jsonl', receipt.map(r => JSON.stringify(r)).join('\n') + '\n');

// console summary
for (const [c, e] of Object.entries(report.cells)) {
  const d = e.determinacy;
  const f = (m) => `${m.det.toFixed(3)}${m.heuristic ? '*' : ''}(sens ${m.sens.toFixed(2)})`;
  console.log(`${c.padEnd(9)} det u/op/dg: ${f(d.uniform)} ${f(d.operational)} ${f(d.degenerate)}` +
    (e.arm ? ` | gap ${e.arm.gap_mean.toFixed(3)}±${e.arm.gap_std.toFixed(3)}  gap2 ${e.arm.gap2_mismatched_mean.toFixed(3)}  nullWidened=${e.arm.null_widened}${e.arm.std_zero_inconclusive ? ' STD0-INCONCLUSIVE' : ''}` : ' | determinacy-only'));
}
console.log('\noutputs written: experiments/outputs/wave1_determinacy_transfer.json, receipts_coglab_w1.jsonl');

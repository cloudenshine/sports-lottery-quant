# Scientific repair acceptance plan

Goal: inspect and correct root mathematical, runtime, data and application defects; make probability claims falsifiable and reproducible.
Boundary: local code and offline fixtures only; no betting, deployment, real synchronization or replacement of original data snapshots. No promise of improved odds for independent fair lottery draws.
Baseline: clean worktree at 0a4169d; npm test passed 168 tests before changes. These tests did not detect future leakage, fabricated team histories or mismatched payout tables.

| Node | Outcome | Dependencies | Evidence gate | State |
|---|---|---|---|---|
| A | Root-cause audit and fixed acceptance | none | Evidence recorded below and in final report | DONE |
| B | Correct lottery probabilities, payouts, history boundaries | A | Exact combinatorial and future-perturbation regression | DONE |
| C | Correct sports probability and ticket expansion | A | Probability mass, independent enumeration, malformed inputs | DONE |
| D | Truthful data ingestion and app state | A | No fabricated fallback; invalid snapshot and offline runtime checks | DONE |
| E | Reproducible scientific comparisons | B | Same-cost paired forward test; proper scores; uncertainty and limitations | DONE |
| F | Integrated delivery | B,C,D,E | npm run verify; source and standalone behavior; independent review | DONE |
| G | READY_FOR_JUDGMENT | F | Report current evidence and unresolved prediction/data limitations | DONE |

Acceptance gates (fixed before implementation):

1. Number-lottery jackpot probabilities use distinct valid full tickets and exact universes. Coverage events and conditional wheel guarantees are named accurately.
2. Changing future observations cannot change prior-period selections. Baselines use equal spending and disclosed seeds; no exploratory result is labeled proven future edge.
3. Payout assumptions, floating prizes and historical rule limitations are explicit. Unknown inputs cannot produce fabricated positive EV or automatic Kelly spending.
4. Sports outcome probabilities conserve mass; missing team observations cannot be treated as measured ability. Expanded ticket counts and budgets agree, including RX9.
5. Data ingestion rejects malformed observations. Legacy/absent/stale real-time snapshots and synthetic demos have visibly different states; refreshing cannot falsely claim a network sync.
6. Relevant regressions and application execution pass; standalone files match sources. Scientific predictive superiority is a separate gate that remains unproven without valid prospective data.

Root causes confirmed: full-history reuse in time-machine generation; DLT prize classification/payout table mismatch; non-deduplicated jackpot probabilities; truncated Poisson mass; fixed pseudo market margin; RX9 Cartesian expansion error; fabricated histories and odds during synchronization; static UI claims and no-op live refresh.

# TDD evidence: lottery funnel rebuild

Source plan: conversation plan (L0 honesty / L1 hard filter / L2 anti-crowd / L3 portfolio / L4 budget+dan-tuo), not a `*.plan.md` file.

## User journeys

1. As a buyer, I want the machine to refuse claiming better jackpot odds, so I am not sold a prediction fantasy.
2. As a buyer, I want 4-run / extreme / arithmetic / exact-full-history tickets killed, so I do not buy deformed faces.
3. As a buyer, I do **not** want last-20 hot numbers banned, because that would also ban real draws.
4. As a buyer, I want tickets inside a portfolio to spread mains and rotate specials, so small prizes have coverage.
5. As a buyer, I want dan-tuo expansion to lock to budget instead of silently truncating.
6. As a verifier, I want walk-forward filters (prior history only) to pass ≥80% of real draws.

## RED / GREEN

| Stage | Command | Result |
|---|---|---|
| RED | `node --test test/adversarial.test.js` against the old IIFE-only engine + missing APIs | 28/28 fail (`E.generate is not a function`, missing `walkForwardPassRate`, no budget, no dan-tuo validation) |
| GREEN | rewrite `engine.js` to CommonJS+browser API | 28/28 pass |
| GREEN+ | prize matrix, budget leftover, UI contract | 85 pass / 0 fail |

Final command:

```
node --test --test-reporter=spec test/adversarial.test.js test/prizes-and-budget.test.js test/ui-contract.test.js
```

Result: **85 tests, 0 fail**.

## Guarantees

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Universe sizes 17,721,088 / 21,425,712 | `L0 honesty layer` | unit | PASS |
| 2 | `honesty.filterImprovesJackpot === false` | same | unit | PASS |
| 3 | Budget caps ticket count and leftover | `budget leftover` | unit | PASS |
| 4 | Unknown game throws | L0 | unit | PASS |
| 5 | 4-run killed, 3-run kept | L1 | unit | PASS |
| 6 | Full-history collision killed, main-only not | L1 | unit | PASS |
| 7 | Last-20 pool membership is not a hard reject | L1 | unit | PASS |
| 8 | Walk-forward pass rate ≥ 80% with prior context only | L1 | integration | PASS |
| 9 | Unique portfolio pairwise main overlap ≤ 3 | L3 | integration | PASS |
| 10 | 5 SSQ tickets rotate 5 distinct blues | L3 | integration | PASS |
| 11 | Dan-tuo 2+8+3 blues = 210 tickets / 420 yuan | L4 | unit | PASS |
| 12 | Over-budget dan-tuo errors, empty tickets | L4 | unit | PASS |
| 13 | Full SSQ and DLT prize matrices, highest prize only | prize tests | unit | PASS |
| 14 | UI exposes budget, dan-tuo, L1 sliders, no “稳赚/必中大奖” | ui-contract | unit | PASS |

## Coverage

Node's `--experimental-test-coverage` reported 100% on the executed files in this environment; engine.js is exercised by generation, walk-forward over 3000+ draws, prize matrices, and dan-tuo expansion. Intentional gap: browser click-through E2E was not run (no Playwright project here); UI is locked by id-contract tests instead.

## Known limits

Filtering does not change single-ticket jackpot probability. Walk-forward ≥80% means the default funnel is not overfit to folklore AC=3–6.

## Regression fix: portfolio looked identical

RED: `test/diversity.test.js` failed — every ticket converged to odd=3 / AC=8 / one 2-run / sum≈100 because `structureScore` used `log(1+freq)` chasing the historical mode, and greedy generation picked the highest score repeatedly.

Fix:
- `structureScore` no longer rewards the mode; it only rewards non-extreme shapes and 10%–90% quartile membership.
- `shapeFingerprint` + `usedShapes` dedupe tickets by (odd, small, sum-bucket, run) so a portfolio cannot repeat the same face.
- `usedOdd` hard constraint forces the first 3 tickets to differ in odd/even before relaxing.
- `greedyCover` forces odd/even variety across the first 3 cover picks.

GREEN: `test/diversity.test.js` 7/7, full suite 92/92.

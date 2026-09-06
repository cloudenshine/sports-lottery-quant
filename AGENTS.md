# Project operating notes

This project is a dependency-free Node.js/browser lottery analysis workbench.

- `engine.js`: SSQ/DLT combinatorics, selection and historical simulation.
- `sports-*-engine.js`, `sports-form-analyzer.js`: sports scenarios and ticket expansion.
- `index.html`, `sports.html`: source applications. Rebuild standalone HTML with `npm run build` after changing source.
- `data/`: bundled snapshots, not proof of live availability. Never invent missing observations or silently replace live data with demos.
- `npm run verify`: syntax, regression tests, scientific evaluation and source/standalone parity.
- Work plan and fixed acceptance gates: `docs/scientific-repair-plan.md`.

Preserve user-owned work. The 2026-09-06 research task authorizes public network collection and recurring daily local research runs. Deterministic tests remain offline; real collection must archive provenance and distinguish failed/stale sources. This does not authorize real bets or remote publication. A filter score is not a win probability. Historical simulations must use only earlier observations and state their prize-rule assumptions; compare predictions with an equal-cost random or market baseline. A deterministic PASS means READY_FOR_JUDGMENT, not evidence of predictive advantage or user acceptance.

Research expansion: `docs/research/implementation-plan.md`, frozen `data/research/protocol.json`. `npm run research:daily` collects data, records prospective predictions and settles paper results; never backdate predictions. Source aliases cannot be joined heuristically across languages.

User correction: SSQ/DLT reconstruction is bound to `docs/research/number-rebuild-acceptance.md`. The user clarified that reliable return advantage against equal-cost random selection is the objective and delegated technical choices. New primary flow: number-models/number-settlement/number-rule-context/number-evaluation/numbers-ledger/numbers-runtime; legacy tools remain at number-tools.html. Follow `docs/research/numbers-operations.md`; preserve both independently frozen protocols and never call an engineering PASS proof of monetary advantage.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const context = { window: {}, globalThis: {} };
context.window = context;
context.globalThis = context;
vm.createContext(context);

for (const file of ["data/ssq-compact.js", "data/dlt-compact.js", "engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context, { filename: file });
}

const E = context.LotteryEngine;
for (const gameId of ["ssq", "dlt"]) {
  const filters = E.defaultFilters(gameId);
  const pass = E.historicalPassRate(gameId, filters);
  const out = E.generate(gameId, { count: 5, seed: 260821, mode: "unique", filters });
  const cov = E.portfolioCoverage(gameId, out.tickets);
  const cover = E.generate(gameId, { count: 8, seed: 7, mode: "cover", filters });
  console.log(
    JSON.stringify(
      {
        gameId,
        tickets: out.tickets.length,
        first: out.tickets[0] && { main: out.tickets[0].main, special: out.tickets[0].special, crowd: out.tickets[0].crowd },
        pass: { total: pass.total, rate: Number(pass.rate.toFixed(4)), killed: pass.killed },
        coverMain: cov.mainCover,
        coverSpecial: cov.specialCover,
        sixth: cov.sixth.text,
        coverModeTickets: cover.tickets.length,
        pool: cover.pool,
      },
      null,
      2
    )
  );
}

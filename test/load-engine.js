"use strict";

const path = require("path");

function loadEngine() {
  global.window = global;
  global.globalThis = global;
  for (const rel of ["../data/ssq-compact.js", "../data/dlt-compact.js", "../engine.js"]) {
    const abs = require.resolve(rel);
    delete require.cache[abs];
  }
  require("../data/ssq-compact.js");
  require("../data/dlt-compact.js");
  const api = require("../engine.js");
  return api.LotteryEngine || api;
}

module.exports = { loadEngine, rootDir: path.join(__dirname, "..") };

#!/usr/bin/env node
// CRAP (Change Risk Anti-Patterns) score per function: CRAP = complexity^2 * (1 -
// coverage)^3 + complexity. High complexity combined with low test coverage is the
// actual risk -- a complex function with full coverage, or a simple function with no
// coverage, both score low. Flags anything above CRAP_THRESHOLD.
//
// Scoped to the files we hold to a coverage bar (see vitest.config.js): scene.js is
// WebGL/DOM orchestration that unit tests can't exercise, so a CRAP score for it
// would just report "0% covered" for everything and tell us nothing useful.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { ESLint } from "eslint";

const CRAP_THRESHOLD = 30;
const SCORED_FILES = ["src/astronomy.js", "src/ui.js", "src/textures.js"];
const COVERAGE_FILE = "coverage/coverage-final.json";

// These draw onto a 2D canvas and need a real browser; see the matching note on
// textures.js in vitest.config.js. Still reported (and still worth simplifying),
// just not held to the "write a test instead" gate like everything else.
const CANVAS_DOM_FUNCTIONS = new Set([
  "landMask",
  "earthTexture",
  "sphereTexture",
  "cloudTexture",
  "moonTexture",
  "sunGlowTexture",
]);

async function complexityByFunction() {
  const eslint = new ESLint({
    overrideConfig: { rules: { complexity: ["error", 0] } },
  });
  const results = await eslint.lintFiles(SCORED_FILES);

  const byFile = new Map();
  for (const result of results) {
    const entries = result.messages
      .filter((m) => m.ruleId === "complexity")
      .map((m) => ({
        line: m.line,
        complexity: Number(/complexity of (\d+)/.exec(m.message)[1]),
      }));
    byFile.set(result.filePath, entries);
  }
  return byFile;
}

function coverageByFunction(coveragePath) {
  const coverage = JSON.parse(readFileSync(coveragePath, "utf8"));
  const byFile = new Map();

  for (const fileCoverage of Object.values(coverage)) {
    const functions = Object.values(fileCoverage.fnMap).map((fn) => {
      const start = fn.decl.start.line;
      const end = fn.loc.end.line ?? fn.loc.start.line;

      let coveredStatements = 0;
      let totalStatements = 0;
      for (const [stmtId, stmt] of Object.entries(fileCoverage.statementMap)) {
        if (stmt.start.line >= start && stmt.start.line <= end) {
          totalStatements++;
          if (fileCoverage.s[stmtId] > 0) coveredStatements++;
        }
      }

      return {
        name: fn.name,
        declLine: start,
        coverage: totalStatements === 0 ? 1 : coveredStatements / totalStatements,
      };
    });
    byFile.set(fileCoverage.path, functions);
  }
  return byFile;
}

function closestFunction(functions, line) {
  return functions.reduce((best, fn) => {
    const distance = Math.abs(fn.declLine - line);
    return !best || distance < Math.abs(best.declLine - line) ? fn : best;
  }, null);
}

function ensureCoverageReportExists() {
  if (existsSync(COVERAGE_FILE)) return;
  console.log("Generating coverage report...");
  execFileSync("npx", ["vitest", "run", "--coverage", "--coverage.reporter=json"], {
    stdio: "inherit",
  });
}

function buildReportRows(complexity, coverage) {
  const rows = [];
  for (const [filePath, functions] of complexity) {
    const coverageFunctions = coverage.get(filePath) ?? [];
    for (const { line, complexity: fnComplexity } of functions) {
      const match = closestFunction(coverageFunctions, line);
      const fnCoverage = match ? match.coverage : 0;
      const crap = fnComplexity ** 2 * (1 - fnCoverage) ** 3 + fnComplexity;
      rows.push({
        file: filePath.replace(process.cwd() + "/", ""),
        name: match?.name || "(anonymous)",
        line,
        complexity: fnComplexity,
        coverage: fnCoverage,
        crap,
      });
    }
  }
  return rows.sort((a, b) => b.crap - a.crap);
}

function flagFor(row) {
  if (row.crap <= CRAP_THRESHOLD) return " ";
  return CANVAS_DOM_FUNCTIONS.has(row.name) ? "~" : "!";
}

function printReport(rows) {
  console.log("\nCRAP score by function (complexity^2 * (1-coverage)^3 + complexity)\n");
  console.log("! over threshold   ~ over threshold, exempt (canvas/DOM, see above)\n");
  console.log("CRAP    Complexity  Coverage  Location");
  for (const row of rows) {
    console.log(
      `${flagFor(row)}${row.crap.toFixed(1).padStart(6)}  ${String(row.complexity).padStart(10)}  ` +
        `${(row.coverage * 100).toFixed(0).padStart(7)}%  ${row.file}:${row.line} ${row.name}`,
    );
  }
}

async function main() {
  ensureCoverageReportExists();

  const complexity = await complexityByFunction();
  const coverage = coverageByFunction(COVERAGE_FILE);
  const rows = buildReportRows(complexity, coverage);
  printReport(rows);

  const risky = rows.filter((r) => r.crap > CRAP_THRESHOLD && !CANVAS_DOM_FUNCTIONS.has(r.name));
  if (risky.length > 0) {
    console.log(`\n${risky.length} function(s) exceed the CRAP threshold of ${CRAP_THRESHOLD}.`);
    process.exit(1);
  }
  console.log(`\nAll functions are at or below the CRAP threshold of ${CRAP_THRESHOLD}.`);
}

main();

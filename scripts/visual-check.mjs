#!/usr/bin/env node
// Drives the running app in headless Chromium: starts the Vite dev server, opens the
// page, hands off to a scenario module, and leaves screenshots behind under
// scripts/visual-check-output/. Verifying a UI change this way means writing one
// small scenario file, not re-deriving how to launch a browser against this project
// each time.
//
// Usage: node scripts/visual-check.mjs <scenario-file>
//
// A scenario file default-exports an async function (page, { screenshot }) => {...}.
// `page` is a Playwright page already navigated to the running dev server.
// `screenshot(label)` saves scripts/visual-check-output/<scenario-name>-<label>.png.

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const PORT = 5183; // distinct from Vite's default 5173, in case a dev server is already running
const OUTPUT_DIR = "scripts/visual-check-output";
const STARTUP_TIMEOUT_MS = 20000;

const [scenarioPath] = process.argv.slice(2);
if (!scenarioPath) {
  console.error("Usage: node scripts/visual-check.mjs <scenario-file>");
  process.exit(1);
}
const scenarioName = path.basename(scenarioPath, path.extname(scenarioPath));

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet; keep polling instead of failing on the first attempt.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Dev server did not respond at ${url} within ${timeoutMs}ms`);
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const devServer = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let devServerOutput = "";
  devServer.stdout.on("data", (chunk) => (devServerOutput += chunk));
  devServer.stderr.on("data", (chunk) => (devServerOutput += chunk));

  const url = `http://localhost:${PORT}`;
  const browser = await chromium.launch();
  try {
    await waitForServer(url, STARTUP_TIMEOUT_MS);

    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(url);

    let shotCount = 0;
    async function screenshot(label) {
      shotCount += 1;
      const fileName = `${scenarioName}-${String(shotCount).padStart(2, "0")}-${label}.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, fileName) });
      console.log(`screenshot: ${path.join(OUTPUT_DIR, fileName)}`);
    }

    const { default: runScenario } = await import(pathToFileURL(path.resolve(scenarioPath)));
    await runScenario(page, { screenshot });

    if (consoleErrors.length > 0) {
      console.error("Console errors during scenario:");
      for (const error of consoleErrors) console.error(`  ${error}`);
      process.exitCode = 1;
    } else {
      console.log("No console errors.");
    }
  } catch (error) {
    console.error("Dev server output:\n" + devServerOutput);
    throw error;
  } finally {
    await browser.close();
    devServer.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

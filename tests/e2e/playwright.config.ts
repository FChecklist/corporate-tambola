// Playwright config for the end-to-end suite. System Chrome (channel "chrome"), at most 2 workers.
//   E2E_TARGET=live  (default)  the real site; use tests/e2e/run-live.mjs, which holds the RAM lock and keeps the site in TEST mode only for the run
//   E2E_TARGET=local            a local stand-in started here (bun, in-memory database, TEST mode, test e-mail/code echo on)
import { defineConfig } from "@playwright/test";
const local = (process.env.E2E_TARGET ?? "live") === "local";
const PORT = Number(process.env.E2E_PORT ?? 8791);
const BUN = process.env.BUN_EXE ?? "C:/Users/Dell/AppData/Roaming/npm/node_modules/bun/node_modules/@oven/bun-windows-x64-baseline/bin/bun.exe";
export default defineConfig({
  testDir: ".",
  testMatch: process.env.E2E_MATCH ? new RegExp(process.env.E2E_MATCH) : /.*\.spec\.ts/,
  workers: Math.min(2, Number(process.env.E2E_WORKERS ?? 2)),
  fullyParallel: false,
  retries: 0,
  timeout: Number(process.env.E2E_TIMEOUT ?? 120_000),
  reporter: [["list"], ["json", { outputFile: "results/playwright-report.json" }]],
  use: { channel: "chrome", reducedMotion: "reduce", headless: true, viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: false, trace: "off", screenshot: "off" },
  webServer: local ? { command: `"${BUN}" run lib/local-server.ts`, cwd: ".", port: PORT, reuseExistingServer: false, timeout: 60_000, env: { E2E_PORT: String(PORT) }, stdout: "ignore", stderr: "pipe" } : undefined,
});

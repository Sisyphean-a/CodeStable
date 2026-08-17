// 工单 02：HTTP 路由、静态资源与安全头测试。
// 同源 CSP、nosniff、明确 MIME、路径穿越拒绝。

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { startDashboard } from "../src/dashboard.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "codestable-http-"));
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  await writeFile(
    join(root, ".codestable", "architecture", "INDEX.md"),
    "# Fixture\n",
  );
  return root;
}

test("serves the page shell, module script and security headers", async (t) => {
  const root = await fixture();
  const dashboard = await startDashboard(root, {
    openBrowser: false,
    port: 0,
  });
  t.after(async () => {
    await dashboard.stop();
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  });

  const page = await fetch(dashboard.address, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  const csp = page.headers.get("content-security-policy");
  assert.ok(csp.includes("default-src 'self'"));
  assert.ok(csp.includes("script-src 'self'"));
  assert.ok(csp.includes("style-src 'self'"));
  const pageText = await page.text();
  assert.match(pageText, /<script type="module" src="\/assets\/app\.js">/);
  assert.match(pageText, /<link rel="stylesheet" href="\/assets\/styles\.css">/);

  const appJs = await fetch(`${dashboard.address}/assets/app.js`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(appJs.status, 200);
  assert.match(appJs.headers.get("content-type"), /text\/javascript/);
  assert.equal(appJs.headers.get("x-content-type-options"), "nosniff");
  assert.match(await appJs.text(), /createWorkbench/);

  const styles = await fetch(`${dashboard.address}/assets/styles.css`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(styles.status, 200);
  assert.match(styles.headers.get("content-type"), /text\/css/);

  const snapshot = await fetch(`${dashboard.address}/api/snapshot`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.headers.get("x-content-type-options"), "nosniff");
  const body = await snapshot.json();
  assert.ok(body.overview);
  assert.equal(body.overview.identity.name, "Fixture");
  assert.equal(body.snapshot.status, "fresh");
});

test("rejects path traversal, unknown extensions and missing assets", async (t) => {
  const root = await fixture();
  const dashboard = await startDashboard(root, {
    openBrowser: false,
    port: 0,
  });
  t.after(async () => {
    await dashboard.stop();
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  });

  const cases = [
    "/assets/../dashboard.js",
    "/assets/..%2F..%2Fdashboard.js",
    "/assets/%2e%2e/%2e%2e/dashboard.js",
    "/assets/../../../etc/passwd",
    "/assets/missing.js",
    "/assets/notes.txt",
    "/assets/",
  ];
  for (const path of cases) {
    const response = await fetch(`${dashboard.address}${path}`, {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(
      response.status,
      404,
      `${path} should be rejected with 404`,
    );
  }

  // 已知资源仍可访问（确认不是误伤全部 /assets/）。
  const ok = await fetch(`${dashboard.address}/assets/app.js`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(ok.status, 200);
});

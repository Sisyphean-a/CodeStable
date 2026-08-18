import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createSnapshot,
  findProjectRoot,
  parseWebArguments,
  startDashboard,
} from "../src/dashboard.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "codestable-dashboard-"));
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  await mkdir(join(root, ".codestable", "history"), { recursive: true });
  await mkdir(join(root, ".wayfinding", "sample", "decisions"), {
    recursive: true,
  });
  await mkdir(join(root, ".delivery", "sample", "tickets"), {
    recursive: true,
  });
  await mkdir(join(root, "nested", "child"), { recursive: true });

  await writeFile(
    join(root, ".codestable", "architecture", "INDEX.md"),
    "# Fixture Project\n",
  );
  await writeFile(
    join(root, ".codestable", "history", "2026-08.md"),
    "# 2026-08\n\n" +
      "- 2026-08-01 · [功能] One. 范围：workspace\n" +
      "  原因：reason one\n" +
      "  当前依据：[架构索引](../architecture/INDEX.md)。\n" +
      "  证据：代码锚点 `dashboard/src/dashboard.js`。\n",
  );
  await writeFile(
    join(root, ".wayfinding", "sample", "map.md"),
    "# Sample Map\n\n## 迷雾\n- Unresolved area\n",
  );
  await writeFile(
    join(root, ".wayfinding", "sample", "decisions", "01-closed.md"),
    decision("关闭", "", "[]"),
  );
  await writeFile(
    join(root, ".wayfinding", "sample", "decisions", "02-ready.md"),
    decision("打开", "", "[01-closed.md]"),
  );
  await writeFile(
    join(root, ".wayfinding", "sample", "decisions", "03-blocked.md"),
    decision("打开", "agent", "[02-ready.md]"),
  );
  await writeFile(
    join(root, ".delivery", "sample", "spec.md"),
    "# Sample Spec\n",
  );
  await writeFile(
    join(root, ".delivery", "sample", "tickets", "01-closed.md"),
    decision("关闭", "", "[]"),
  );
  await writeFile(
    join(root, ".delivery", "sample", "tickets", "02-ready.md"),
    decision("打开", "", "[01-closed.md]"),
  );
  await writeFile(
    join(root, ".delivery", "sample", "tickets", "03-blocked.md"),
    decision("打开", "agent", "[02-ready.md]"),
  );
  return root;
}

function decision(status, owner, dependencies) {
  return `---\n状态: ${status}\n认领者: "${owner}"\n硬依赖: ${dependencies}\n---\n\n# Item\n`;
}

test("discovers the nearest CodeStable project and derives map and delivery progress", async (t) => {
  const root = await fixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );

  assert.equal(await findProjectRoot(join(root, "nested", "child")), root);
  const snapshot = await createSnapshot(root);

  assert.equal(snapshot.project.name, "Fixture Project");
  const map = snapshot.maps[0];
  assert.equal(map.name, "Sample Map");
  assert.equal(map.path, ".wayfinding/sample/map.md");
  assert.equal(map.closed, 1);
  assert.equal(map.open, 2);
  assert.equal(map.unknown, 0);
  assert.equal(map.blocked, 0);
  assert.equal(map.frontier, 1);
  assert.equal(map.claimed, 1);
  assert.equal(map.fog, 1);
  assert.equal(map.progress, 25);
  assert.equal(map.validity, "valid");
  assert.equal(map.decisions.length, 3);
  assert.equal(map.decisions[1].readiness, "frontier");
  assert.equal(map.decisions[2].readiness, "claimed");
  assert.equal(snapshot.deliveries[0].hasSpec, true);
  assert.equal(snapshot.deliveries[0].closed, 1);
  assert.equal(snapshot.deliveries[0].blocked, 0);
  assert.equal(snapshot.deliveries[0].ready, 1);
  assert.equal(snapshot.deliveries[0].claimed, 1);
  assert.equal(snapshot.deliveries[0].progress, 33);
  assert.equal(snapshot.deliveries[0].tickets.length, 3);
  assert.equal(snapshot.history[0].entries, 1);
  assert.equal(snapshot.snapshot.status, "fresh");
  assert.equal(snapshot.schemaVersion, 1);
});

test("refreshes the served snapshot after a tracked project file changes", async (t) => {
  const root = await fixture();
  const dashboard = await startDashboard(root, { openBrowser: false, port: 0 });
  t.after(async () => {
    await dashboard.stop();
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  });

  const fetchJson = (url) =>
    fetch(url, { signal: AbortSignal.timeout(5000) }).then((response) =>
      response.json(),
    );
  const before = await fetchJson(`${dashboard.address}/api/snapshot`);
  const page = await fetch(dashboard.address, {
    signal: AbortSignal.timeout(5000),
  }).then((response) => response.text());
  assert.match(page, /<script type="module" src="\/assets\/app\.js">/);
  assert.match(page, /<nav[^>]*aria-label="主导航"/);
  assert.match(page, /<button[^>]*id="nav-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="nav"/);
  assert.match(page, /<span aria-hidden="true">导航<\/span>/);
  assert.match(page, /\?view=overview/);
  assert.match(page, /\?view=delivery/);
  const appJs = await fetch(`${dashboard.address}/assets/app.js`, {
    signal: AbortSignal.timeout(5000),
  }).then((response) => response.text());
  assert.match(appJs, /EventSource/);
  assert.match(appJs, /history\.pushState/);
  assert.match(appJs, /popstate/);
  const stylesCss = await fetch(`${dashboard.address}/assets/styles.css`, {
    signal: AbortSignal.timeout(5000),
  }).then((response) => response.text());
  assert.match(stylesCss, /#nav\.is-open/);
  assert.match(stylesCss, /prefers-reduced-motion/);

  const historyText = (dates) =>
    "# 2026-08\n\n" +
    dates
      .map(
        (date) =>
          `- ${date} · [功能] Change ${date}. 范围：workspace\n` +
          `  原因：reason ${date}\n` +
          `  当前依据：[架构索引](../architecture/INDEX.md)。\n` +
          `  证据：代码锚点 \`dashboard/src/dashboard.js\`。\n`,
      )
      .join("\n");
  await writeFile(
    join(root, ".codestable", "history", "2026-08.md"),
    historyText(["2026-08-01", "2026-08-02"]),
  );
  await new Promise((resolveWait) => setTimeout(resolveWait, 900));
  const after = await fetchJson(`${dashboard.address}/api/snapshot`);

  assert.equal(before.history[0].entries, 1);
  assert.equal(after.history[0].entries, 2);
});

test("refuses to start outside a CodeStable project", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "not-codestable-"));
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );

  assert.equal(await findProjectRoot(root), undefined);
  await assert.rejects(
    () => startDashboard(root, { openBrowser: false, port: 0 }),
    /No .codestable directory/,
  );
});

test("validates web command options", () => {
  assert.deepEqual(parseWebArguments(["--port", "4400", "--no-open"]), {
    openBrowser: false,
    port: 4400,
  });
  assert.throws(() => parseWebArguments(["--port", "0"]), /--port/);
  assert.throws(() => parseWebArguments(["--unknown"]), /Unknown option/);
});

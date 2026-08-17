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
    "# 2026-08\n\n- 2026-08-01 · [功能] One\n",
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
  assert.deepEqual(snapshot.maps[0], {
    name: "Sample Map",
    path: ".wayfinding/sample/map.md",
    closed: 1,
    open: 2,
    blocked: 1,
    frontier: 1,
    fog: 1,
    progress: 25,
  });
  assert.equal(snapshot.deliveries[0].hasSpec, true);
  assert.equal(snapshot.deliveries[0].closed, 1);
  assert.equal(snapshot.deliveries[0].blocked, 1);
  assert.equal(snapshot.deliveries[0].ready, 1);
  assert.equal(snapshot.deliveries[0].claimed, 1);
  assert.equal(snapshot.deliveries[0].progress, 33);
  assert.equal(snapshot.history[0].entries, 1);
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

  const before = await fetch(`${dashboard.address}/api/snapshot`).then(
    (response) => response.json(),
  );
  const page = await fetch(dashboard.address).then((response) =>
    response.text(),
  );
  const script = page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "dashboard page must contain a client script");
  assert.doesNotThrow(() => new Function(script));

  await writeFile(
    join(root, ".codestable", "history", "2026-08.md"),
    "# 2026-08\n\n- 2026-08-01 · [功能] One\n- 2026-08-02 · [功能] Two\n",
  );
  await new Promise((resolveWait) => setTimeout(resolveWait, 900));
  const after = await fetch(`${dashboard.address}/api/snapshot`).then(
    (response) => response.json(),
  );

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

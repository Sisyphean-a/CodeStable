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

async function readEvent(reader, eventName, timeoutMs = 4000) {
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    let timer;
    const result = await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out waiting for ${eventName}`)),
          remaining,
        );
      }),
    ]);
    clearTimeout(timer);
    if (result.done) break;
    buffer += decoder.decode(result.value);
    if (buffer.includes(`event: ${eventName}`)) return buffer;
  }
  throw new Error(`timed out waiting for ${eventName}`);
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  return false;
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
  assert.equal(snapshot.schemaVersion, 2);
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
  assert.match(page, /<nav[^>]*aria-label="项目导航"/);
  assert.match(page, /<title>CodeStable · 文档工作台<\/title>/);
  assert.doesNotMatch(page, /项目全景/);
  assert.match(page, /<button[^>]*id="nav-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="nav"/);
  assert.match(page, /<span aria-hidden="true">导航<\/span>/);
  assert.match(page, /id="nav-content"/);
  assert.match(page, /\?view=overview/);
  assert.doesNotMatch(page, /\?view=delivery/);
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
  const refreshed = await waitFor(
    async () =>
      (await fetchJson(`${dashboard.address}/api/snapshot`)).history[0].entries === 2,
    4000,
  );
  assert.ok(refreshed, "snapshot must rebuild after a tracked change");
  const after = await fetchJson(`${dashboard.address}/api/snapshot`);

  assert.equal(before.history[0].entries, 1);
  assert.equal(after.history[0].entries, 2);
});

test("exposes fingerprint polling failures as stale diagnostics and SSE", async (t) => {
  const root = await fixture();
  let fingerprintReads = 0;
  const dashboard = await startDashboard(root, {
    openBrowser: false,
    port: 0,
    pollIntervalMs: 30,
    fingerprintReader: async () => {
      fingerprintReads += 1;
      if (fingerprintReads === 1) return "initial";
      throw new Error("simulated fingerprint read failure: .codestable/history");
    },
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

  const events = await fetch(`${dashboard.address}/events`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.ok(events.body, "SSE response must expose a readable body");
  const eventText = await readEvent(events.body.getReader(), "snapshot-stale");
  assert.ok(eventText.includes("simulated fingerprint read failure"));

  const snapshot = await fetch(`${dashboard.address}/api/snapshot`, {
    signal: AbortSignal.timeout(5000),
  }).then((response) => response.json());
  assert.equal(snapshot.snapshot.status, "stale");
  assert.match(snapshot.snapshot.lastError, /\.codestable\/history/);
  assert.equal(typeof snapshot.snapshot.staleSince, "number");
  assert.equal(snapshot.history[0].entries, 1, "last successful index remains available");
  assert.ok(
    snapshot.diagnostics.items.some(
      (diagnostic) =>
        diagnostic.code === "stale-snapshot" &&
        diagnostic.location.path === "." &&
        diagnostic.message.includes(".codestable/history"),
    ),
    "stale snapshot includes a locatable refresh diagnostic",
  );
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

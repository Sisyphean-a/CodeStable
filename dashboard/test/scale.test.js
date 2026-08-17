// 工单 09：规模与性能门槛测试。
// 规模 fixture 至少 250 个 SourceDocument、100 个 decision/ticket、2000 条历史、
// 1000 条正式关系并含 Colombia DAG 形状；完整索引构建中位值 ≤2 秒，
// 热索引概览/实体/结构化搜索 ≤200 ms，变更到 SSE 通知 ≤3 秒。
// 性能以固定次数的中位值验证，不忽略尖峰或缩小输入。

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createScaleFixture } from "./fixtures/scale.js";
import { buildProjectIndex } from "../src/project/index.js";
import { createSnapshotProjection } from "../src/project/projections.js";
import { entityDetailProjection } from "../src/project/entity-detail.js";
import { searchProjection } from "../src/project/search.js";
import { graphProjection } from "../src/project/graph.js";
import { startDashboard } from "../src/dashboard.js";

const RUNS = 5;

async function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function measure(fn, runs = RUNS) {
  const samples = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  return median(samples);
}

test("scale fixture meets minimum counts", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "codestable-scale-"));
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  await createScaleFixture(root);
  const index = await buildProjectIndex(root);

  assert.ok(index.sources.length >= 250, `sources=${index.sources.length}`);
  const decisions = index.entities.filter((entity) => entity.kind === "Decision").length;
  const tickets = index.entities.filter((entity) => entity.kind === "Ticket").length;
  assert.ok(decisions + tickets >= 100, `decision+ticket=${decisions + tickets}`);
  const history = index.entities.filter((entity) => entity.kind === "HistoryEntry").length;
  assert.ok(history >= 2000, `history=${history}`);
  assert.ok(index.relations.length >= 1000, `relations=${index.relations.length}`);

  // Colombia 形状：并行分支与链式依赖的派生状态。
  const byId = new Map(index.entities.map((entity) => [entity.id, entity]));
  const readiness = (kind, name) =>
    byId.get(`${kind}:.wayfinding/colombia/decisions/${name}`)?.readiness;
  assert.equal(readiness("Decision", "01-d1.md"), "none"); // closed
  assert.equal(readiness("Decision", "02-d2.md"), "frontier"); // 依赖 d1
  assert.equal(readiness("Decision", "11-d11.md"), "none"); // 链式已闭合
  assert.equal(readiness("Decision", "25-d25.md"), "claimed"); // owner
  assert.equal(readiness("Decision", "22-d22.md"), "none"); // 偶数关闭
  assert.equal(readiness("Decision", "23-d23.md"), "frontier"); // 依赖 22

  // 关系图在规模 fixture 上工作（Colombia decision DAG）。
  const graph = graphProjection(index, {
    entity: "Decision:.wayfinding/colombia/decisions/05-d5.md",
    kind: "decision",
    depth: 2,
  });
  assert.ok(graph.nodes.length >= 3);
  assert.ok(graph.textList.nodes.length >= 3);
});

test("full index build median stays under 2 seconds", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "codestable-scale-perf-"));
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  await createScaleFixture(root);

  const medianBuild = await measure(() => buildProjectIndex(root), RUNS);
  assert.ok(
    medianBuild <= 2000,
    `index build median ${medianBuild.toFixed(0)}ms exceeds 2000ms`,
  );
});

test("hot index projections stay under 200 ms", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "codestable-scale-hot-"));
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  await createScaleFixture(root);
  const index = await buildProjectIndex(root);

  const overviewMedian = await measure(() => createSnapshotProjection(index, { status: "fresh" }));
  assert.ok(overviewMedian <= 200, `overview ${overviewMedian.toFixed(0)}ms`);

  const entityMedian = await measure(() =>
    entityDetailProjection(index, "ArchitectureIndex:.codestable/architecture/INDEX.md"),
  );
  assert.ok(entityMedian <= 200, `entity ${entityMedian.toFixed(0)}ms`);

  const searchMedian = await measure(() =>
    searchProjection(index, { query: "Scale", filters: "kind:Decision" }),
  );
  assert.ok(searchMedian <= 200, `search ${searchMedian.toFixed(0)}ms`);
});

test("change to SSE notification stays under 3 seconds", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "codestable-scale-sse-"));
  t.after(async () => {
    await dashboardStop();
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  await createScaleFixture(root);
  const { writeFile } = await import("node:fs/promises");
  const { join: pathJoin } = await import("node:path");

  const dashboard = await startDashboard(root, {
    openBrowser: false,
    port: 0,
    pollIntervalMs: 60,
  });
  let stopFn = null;
  const dashboardStop = () => stopFn?.() ?? Promise.resolve();
  stopFn = () => dashboard.stop();

  const events = await fetch(`${dashboard.address}/events`, {
    signal: AbortSignal.timeout(10000),
  });
  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const start = performance.now();
  await writeFile(
    pathJoin(root, ".codestable", "history", "2026-10.md"),
    "# 2026-10\n\n- 2026-10-01 · [功能] SSE trigger. 范围：workspace\n  原因：r\n  当前依据：[架构索引](../architecture/INDEX.md)。\n  证据：代码锚点 `dashboard/src/dashboard.js`。\n",
  );
  let received = false;
  while (performance.now() - start < 5000) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
    if (buffer.includes("event: snapshot-changed")) {
      received = true;
      break;
    }
  }
  const elapsed = performance.now() - start;
  assert.ok(received, "snapshot-changed event must arrive");
  assert.ok(elapsed <= 3000, `SSE latency ${elapsed.toFixed(0)}ms exceeds 3000ms`);
});

test("no legacy single-file scan, inline page or duplicate DTO remains", async (t) => {
  const { readFile, readdir } = await import("node:fs/promises");
  const dashboardJs = await readFile(new URL("../src/dashboard.js", import.meta.url), "utf8");
  assert.doesNotMatch(dashboardJs, /scanMaps|scanDeliveries|scanHistory|pageHtml|projectFingerprint/);
  assert.match(dashboardJs, /createSnapshotProjection/);

  const srcDir = new URL("../src/", import.meta.url);
  const { readdir: readdirUrl } = await import("node:fs/promises");
  const entries = await readdirUrl(srcDir, { recursive: true });
  const jsFiles = entries.filter((name) => name.endsWith(".js"));
  // 不存在遗留的旧扫描/DTO 模块名。
  assert.ok(!jsFiles.some((name) => /legacy|old-|v1|stats/.test(name)));
});

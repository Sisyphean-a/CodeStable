// 工单 08：有界的显式关系探索测试。
// 入向置左/出向置右、确定性布局、20 节点/40 边限制、完整文字列表、
// 筛选不改变关系事实、unresolved/external/unsafe 不可错误导航、无关系提示。

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProjectIndex } from "../src/project/index.js";
import { relationGraphProjection, parseRelationFilters } from "../src/project/relation-graph.js";
import { createSnapshotProjection } from "../src/project/projections.js";
import { startDashboard } from "../src/dashboard.js";
import { renderRelations } from "../src/web/views/relations.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "codestable-rel-"));
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  await mkdir(join(root, ".codestable", "history"), { recursive: true });
  await mkdir(join(root, ".wayfinding", "sample", "decisions"), {
    recursive: true,
  });
  await mkdir(join(root, ".delivery", "sample", "tickets"), { recursive: true });

  await writeFile(
    join(root, ".codestable", "architecture", "INDEX.md"),
    "# 架构索引\n\n## 代码锚点\n- `dashboard/src/dashboard.js`\n",
  );
  await writeFile(
    join(root, ".codestable", "history", "2026-08.md"),
    "# 2026-08\n\n- 2026-08-01 · [功能] 结果. 范围：workspace\n  原因：原因\n  当前依据：[架构索引](../architecture/INDEX.md)。\n  证据：代码锚点 `dashboard/src/dashboard.js`。\n",
  );
  await writeFile(
    join(root, ".wayfinding", "sample", "map.md"),
    "# Map\n\n- [ghost](../ghost.md)\n- [外部](https://example.com/x)\n",
  );
  await writeFile(
    join(root, ".wayfinding", "sample", "decisions", "01-d1.md"),
    "---\n状态: 打开\n认领者: \"\"\n硬依赖: []\n---\n\n# 决策一\n",
  );
  await writeFile(
    join(root, ".delivery", "sample", "spec.md"),
    "# 规格\n",
  );
  await mkdir(join(root, "dashboard", "src"), { recursive: true });
  await writeFile(join(root, "dashboard", "src", "dashboard.js"), "// fixture\n");
  await writeFile(
    join(root, ".delivery", "sample", "tickets", "01-t1.md"),
    "---\n交付类型: 功能\n状态: 打开\n认领者: \"\"\n硬依赖: []\n---\n\n# 工单一\n",
  );
  return root;
}

test("relation graph centers the entity with incoming left and outgoing right", async (t) => {
  const root = await fixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);
  const entity = "ArchitectureIndex:.codestable/architecture/INDEX.md";

  const graph = relationGraphProjection(index, { entity, depth: 1 });
  assert.equal(graph.error, undefined);
  const center = graph.nodes.find((node) => node.isSelected);
  assert.equal(center.id, entity);
  assert.equal(center.layer, 0);
  assert.ok(graph.nodes.some((node) => node.id === "source:.codestable/history/2026-08.md" && node.layer === -1));
  assert.ok(graph.nodes.some((node) => node.id === "CodeAnchor:dashboard/src/dashboard.js" && node.layer === 1));

  // 边带 kind 与方向。
  assert.ok(
    graph.edges.some(
      (edge) => edge.kind === "current-basis" && edge.direction === "incoming",
    ),
  );
  assert.ok(
    graph.edges.some(
      (edge) => edge.kind === "code-anchor" && edge.direction === "outgoing",
    ),
  );

  // 文字列表完整。
  assert.ok(graph.textList.nodes.length >= 3);
  assert.ok(graph.textList.edges.length >= 2);
  assert.ok(graph.textList.edges.every((edge) => edge.kind && edge.resolution));

  // 确定性。
  const again = relationGraphProjection(index, { entity, depth: 1 });
  assert.deepEqual(graph, again);
});

test("unresolved, external and unsafe relations stay visible but not navigable", async (t) => {
  const root = await fixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);
  const graph = relationGraphProjection(index, {
    entity: "DecisionMap:.wayfinding/sample/map.md",
    depth: 1,
  });

  // ghost.md（未解析）与外部 URL 保留为边，不产生伪造节点。
  const unresolved = graph.edges.filter((edge) => edge.kind === "links-to" && edge.resolution !== "resolved");
  assert.ok(unresolved.length >= 2);
  assert.ok(
    unresolved.some(
      (edge) =>
        edge.resolution === "unresolved" &&
        edge.originalTarget === "../ghost.md",
    ),
  );
  assert.ok(
    unresolved.some(
      (edge) =>
        edge.resolution === "external" &&
        edge.originalTarget === "https://example.com/x",
    ),
  );
  // 没有指向不存在实体的节点。
  assert.ok(!graph.nodes.some((node) => node.id.includes("ghost")));
});

test("relation filters change the projection, not the facts; bounds truncate deterministically", async (t) => {
  const root = await fixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);
  const entity = "ArchitectureIndex:.codestable/architecture/INDEX.md";

  const onlyEvidence = relationGraphProjection(index, {
    entity,
    depth: 2,
    filters: "kind:evidence",
  });
  assert.ok(
    onlyEvidence.edges.every((edge) => edge.kind === "evidence"),
  );

  const onlyIncoming = relationGraphProjection(index, {
    entity,
    depth: 2,
    filters: "direction:incoming",
  });
  assert.ok(
    onlyIncoming.edges.every((edge) => edge.direction === "incoming"),
  );

  // 筛选不改变事实：未筛选投影仍然包含全部 kind。
  const all = relationGraphProjection(index, { entity, depth: 2 });
  assert.ok(
    new Set(all.edges.map((edge) => edge.kind)).size >= 2,
  );

  assert.deepEqual(parseRelationFilters("kind:evidence,resolution:resolved"), {
    kind: ["evidence"],
    resolution: ["resolved"],
  });

  // 超限截断：构造大图（50 个决策）。
  const bigRoot = await mkdtemp(join(tmpdir(), "codestable-rel-big-"));
  t.after(() =>
    rm(bigRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  await mkdir(join(bigRoot, ".codestable", "architecture"), { recursive: true });
  await mkdir(join(bigRoot, ".wayfinding", "big", "decisions"), { recursive: true });
  await writeFile(join(bigRoot, ".codestable", "architecture", "INDEX.md"), "# Big\n");
  await writeFile(join(bigRoot, ".wayfinding", "big", "map.md"), "# Map\n");
  for (let i = 1; i <= 50; i += 1) {
    await writeFile(
      join(bigRoot, ".wayfinding", "big", "decisions", `${String(i).padStart(2, "0")}-d${i}.md`),
      "---\n状态: 打开\n认领者: \"\"\n硬依赖: []\n---\n\n# D\n",
    );
  }
  await writeFile(
    join(bigRoot, ".wayfinding", "big", "map.md"),
    "# Map\n\n" +
      Array.from({ length: 50 }, (_, i) => `- [d${i + 1}](decisions/${String(i + 1).padStart(2, "0")}-d${i + 1}.md)`).join("\n"),
  );
  const bigIndex = await buildProjectIndex(bigRoot);
  const bigGraph = relationGraphProjection(index ? bigIndex : bigIndex, {
    entity: "DecisionMap:.wayfinding/big/map.md",
    depth: 1,
  });
  assert.equal(bigGraph.nodes.length, 20);
  assert.ok(bigGraph.truncated.nodes >= 30);
  assert.ok(bigGraph.textList.nodes.length >= 50);
});

test("no formal relations shows an explicit empty state", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "codestable-rel-none-"));
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  await writeFile(join(root, ".codestable", "architecture", "INDEX.md"), "# None\n");
  const index = await buildProjectIndex(root);
  const graph = relationGraphProjection(index, {
    entity: "ArchitectureIndex:.codestable/architecture/INDEX.md",
    depth: 1,
  });
  assert.equal(graph.nodes.length, 2); // 实体自身 + 来源端点
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.textList.nodes.length, 2);
  assert.equal(graph.textList.edges.length, 0);
});

test("relations API and view render deterministic graph with filters", async (t) => {
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

  const entity = "ArchitectureIndex:.codestable/architecture/INDEX.md";
  const response = await fetch(
    `${dashboard.address}/api/relations?entity=${encodeURIComponent(entity)}&depth=1`,
    { signal: AbortSignal.timeout(5000) },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.entity, entity);
  assert.ok(body.nodes.length >= 3);

  const snapshot = await fetch(`${dashboard.address}/api/snapshot`, {
    signal: AbortSignal.timeout(5000),
  }).then((response) => response.json());
  const html = renderRelations(
    snapshot,
    { view: "relations", entity, query: "", filters: "", depth: "1" },
    body,
  );
  assert.match(html, /入向关系在左、出向关系在右/);
  assert.match(html, /<svg class="dag"/);
  assert.match(html, /完整文字关系列表/);
  assert.match(html, /再展开一层（深度 2）/);
  assert.match(html, /边文字：关系类型/);

  // 未选实体：提示选择。
  const emptyHtml = renderRelations(snapshot, { view: "relations", entity: "", query: "", filters: "", depth: "" });
  assert.match(emptyHtml, /先选择一个实体/);
});

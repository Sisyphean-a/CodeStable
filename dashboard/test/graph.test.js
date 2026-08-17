// 工单 06：探路行动列表与决策依赖图测试。
// Colombia 形状 fixture 验证并行决策依赖、claimed/blocked/frontier 派生、
// 图的方向/截断/文字等价与 20 节点/40 边限制。

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProjectIndex } from "../src/project/index.js";
import { graphProjection } from "../src/project/graph.js";
import { startDashboard } from "../src/dashboard.js";
import { renderWayfinding } from "../src/web/views/wayfinding.js";
import { renderDag } from "../src/web/graph.js";

function decision(name, status, owner, dependencies) {
  const deps = dependencies.length > 0 ? `[${dependencies.join(",")}]` : "[]";
  return `---\n处理方式: 裁决\n状态: ${status}\n认领者: "${owner}"\n硬依赖: ${deps}\n---\n\n# ${name}\n`;
}

// Colombia 形状：已闭合决策 DAG + 并行分支 + claimed + 坏依赖。
// 形状：A(closed) → B,C,D(open frontier，并行依赖 A)；B → E(claimed)；C → F(blocked，依赖缺失文件)。
async function colombiaFixture() {
  const root = await mkdtemp(join(tmpdir(), "codestable-colombia-"));
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  await mkdir(join(root, ".wayfinding", "colombia", "decisions"), {
    recursive: true,
  });
  await writeFile(
    join(root, ".codestable", "architecture", "INDEX.md"),
    "# Colombia Fixture\n",
  );
  await writeFile(
    join(root, ".wayfinding", "colombia", "map.md"),
    "# Colombia Map\n",
  );
  const decisions = [
    decision("A 基础决定", "关闭", "", []),
    decision("B 并行一", "打开", "", ["01-a.md"]),
    decision("C 并行二", "打开", "", ["01-a.md"]),
    decision("D 并行三", "打开", "", ["01-a.md"]),
    decision("E 已认领", "打开", "agent-1", ["02-b.md"]),
    decision("F 被阻塞", "打开", "", ["03-c.md", "missing-file.md"]),
    decision("G 未知状态", "未来态", "", []),
  ];
  const names = ["a", "b", "c", "d", "e", "f", "g"];
  for (let i = 0; i < decisions.length; i += 1) {
    const number = String(i + 1).padStart(2, "0");
    await writeFile(
      join(root, ".wayfinding", "colombia", "decisions", `${number}-${names[i]}.md`),
      decisions[i],
    );
  }
  return root;
}

test("frontier derives only from closed predecessors, open and unclaimed", async (t) => {
  const root = await colombiaFixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);
  const byId = new Map(index.entities.map((entity) => [entity.id, entity]));

  const FILES = { a: "01-a.md", b: "02-b.md", c: "03-c.md", d: "04-d.md", e: "05-e.md", f: "06-f.md", g: "07-g.md" };
  const readiness = (name) =>
    byId.get(`Decision:.wayfinding/colombia/decisions/${FILES[name]}`).readiness;

  assert.equal(readiness("a"), "none"); // closed
  assert.equal(readiness("b"), "frontier"); // 依赖 a(closed)、未认领
  assert.equal(readiness("c"), "frontier");
  assert.equal(readiness("d"), "frontier");
  assert.equal(readiness("e"), "claimed"); // 有认领者
  assert.equal(readiness("f"), "blocked"); // missing-file.md 未解析
  assert.equal(readiness("g"), "unknown"); // 未知状态枚举

  // 缺失依赖有定位诊断。
  assert.ok(
    index.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "missing-dependency" &&
        diagnostic.relatedTarget === "missing-file.md",
    ),
  );
});

test("dependency DAG is directional, bounded, deterministic and text-equivalent", async (t) => {
  const root = await colombiaFixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);

  // 以 B 为中心一跳：上游 A、下游 E。
  const oneHop = graphProjection(index, {
    entity: "Decision:.wayfinding/colombia/decisions/02-b.md",
    kind: "decision",
    depth: 1,
  });
  const nodeNames = oneHop.nodes.map((node) => node.id.split("/").at(-1)).sort();
  assert.deepEqual(nodeNames, ["01-a.md", "02-b.md", "05-e.md"]);
  assert.ok(
    oneHop.edges.some(
      (edge) =>
        edge.from.endsWith("02-b.md") && edge.to?.endsWith("01-a.md"),
    ),
  );
  assert.ok(
    oneHop.edges.some(
      (edge) =>
        edge.from.endsWith("05-e.md") && edge.to?.endsWith("02-b.md"),
    ),
  );

  // 未解析依赖保留为未解析边，不伪造节点。
  const fGraph = graphProjection(index, {
    entity: "Decision:.wayfinding/colombia/decisions/06-f.md",
    kind: "decision",
    depth: 1,
  });
  assert.ok(
    fGraph.edges.some(
      (edge) => edge.resolution === "unresolved" && edge.originalTarget === "missing-file.md",
    ),
  );

  // 文字列表等价：节点与边完整（不受图截断影响）。
  assert.ok(oneHop.textList.nodes.length >= 3);
  assert.ok(oneHop.textList.edges.length >= 2);
  assert.ok(oneHop.textList.edges.every((edge) => edge.resolution));

  // 确定性：两次投影结果一致。
  const again = graphProjection(index, {
    entity: "Decision:.wayfinding/colombia/decisions/02-b.md",
    kind: "decision",
    depth: 1,
  });
  assert.deepEqual(oneHop, again);

  // 全图深度展开：从 B 可达 a,c,d,e,f（含经 C 的 F），6 个节点。
  const full = graphProjection(index, {
    entity: "Decision:.wayfinding/colombia/decisions/02-b.md",
    kind: "decision",
    depth: 3,
  });
  assert.equal(full.nodes.length, 6);
  assert.equal(full.truncated.nodes, 0);
});

test("graph exceeds limits reports deterministic truncation with remaining counts", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "codestable-bigdag-"));
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  await mkdir(join(root, ".wayfinding", "big", "decisions"), { recursive: true });
  await writeFile(join(root, ".codestable", "architecture", "INDEX.md"), "# Big\n");
  await writeFile(join(root, ".wayfinding", "big", "map.md"), "# Big Map\n");
  // 链式 30 个决策：01 → 02 → … → 30。
  for (let i = 1; i <= 30; i += 1) {
    const deps = i > 1 ? [`${String(i - 1).padStart(2, "0")}-d${i - 1}.md`] : [];
    await writeFile(
      join(root, ".wayfinding", "big", "decisions", `${String(i).padStart(2, "0")}-d${i}.md`),
      decision(`D${i}`, "打开", "", deps),
    );
  }
  const index = await buildProjectIndex(root);
  const graph = graphProjection(index, {
    entity: "Decision:.wayfinding/big/decisions/15-d15.md",
    kind: "decision",
    depth: 30,
  });
  assert.equal(graph.nodes.length, 20); // 上限
  assert.ok(graph.truncated.nodes > 0);
  assert.ok(graph.truncated.nodes + graph.nodes.length >= 30);
  assert.ok(graph.textList.nodes.length >= 30); // 文字列表不受截断影响
});

test("wayfinding view renders action groups and graph section; DAG svg has text equivalents", async (t) => {
  const root = await colombiaFixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);
  const { createSnapshotProjection } = await import("../src/project/projections.js");
  const snapshot = createSnapshotProjection(index, { status: "fresh" });

  const urlState = {
    view: "wayfinding",
    entity: "",
    query: "",
    filters: "",
    depth: "",
  };
  const listHtml = renderWayfinding(snapshot, urlState);
  assert.match(listHtml, /当前前沿（3）/);
  assert.match(listHtml, /已认领（1）/);
  assert.match(listHtml, /被阻塞（1）/);
  assert.match(listHtml, /状态未知（1）/);
  assert.match(listHtml, /认领者 agent-1/);
  assert.match(listHtml, /查看依赖/);
  assert.match(listHtml, /前置决策已关闭且未被认领/);

  // 图状态：SVG + 图例 + 文字列表 + 截断说明。
  const graph = graphProjection(index, {
    entity: "Decision:.wayfinding/colombia/decisions/02-b.md",
    kind: "decision",
    depth: 1,
  });
  const graphHtml = renderWayfinding(snapshot, {
    ...urlState,
    entity: graph.entity,
    depth: "1",
  }, graph);
  assert.match(graphHtml, /依赖图：B 并行一/);
  assert.match(graphHtml, /<svg class="dag"/);
  assert.match(graphHtml, /箭头方向：被依赖对象在右/);
  assert.match(graphHtml, /完整文字依赖列表/);
  assert.match(graphHtml, /再展开一层（深度 2）/);

  const rendered = renderDag(graph);
  assert.ok(rendered.svg.includes("<svg"));
  assert.ok(rendered.svg.includes('role="img"'));
  assert.ok(rendered.svg.includes("aria-label"));
  assert.equal(rendered.truncation, ""); // 小图无截断
  assert.match(rendered.textListHtml, /depends-on/);
});

test("graph API serves direction, status and resolution over HTTP", async (t) => {
  const root = await colombiaFixture();
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

  const response = await fetch(
    `${dashboard.address}/api/graph?entity=${encodeURIComponent("Decision:.wayfinding/colombia/decisions/02-b.md")}&kind=decision&depth=1`,
    { signal: AbortSignal.timeout(5000) },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.kind, "Decision");
  assert.equal(body.depth, 1);
  assert.ok(body.nodes.length >= 3);
  assert.ok(body.edges.length >= 2);

  // 未知实体：错误响应。
  const missing = await fetch(
    `${dashboard.address}/api/graph?entity=${encodeURIComponent("Decision:ghost.md")}`,
    { signal: AbortSignal.timeout(5000) },
  ).then((response) => response.json());
  assert.equal(missing.error, "entity not found");
});

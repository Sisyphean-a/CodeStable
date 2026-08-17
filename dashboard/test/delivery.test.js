// 工单 07：交付实施状态与 ticket 依赖图测试。
// Colombia 形状 fixture 验证 11 ticket 的并行分支、claimed、ready 与 blocked 路径；
// ticket DAG 与 decision DAG 永不混图。

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProjectIndex } from "../src/project/index.js";
import { graphProjection } from "../src/project/graph.js";
import { createSnapshotProjection } from "../src/project/projections.js";
import { startDashboard } from "../src/dashboard.js";
import { renderDelivery } from "../src/web/views/delivery.js";

function ticket(name, type, status, owner, dependencies) {
  const deps = dependencies.length > 0 ? `[${dependencies.join(",")}]` : "[]";
  return `---\n交付类型: ${type}\n状态: ${status}\n认领者: "${owner}"\n硬依赖: ${deps}\n来源规格: spec.md\n---\n\n# ${name}\n`;
}

// Colombia 形状：11 张 ticket，并行分支 + claimed + ready + blocked。
// T1(closed) → T2,T3,T4(ready，并行依赖 T1)；T2 → T5(claimed)；T3 → T6(blocked，依赖缺失)；
// T7(closed)；T8(ready 依赖 T7)；T9(claimed 依赖 T8)；T10(blocked 依赖 T9)；T11(未知状态)。
async function colombiaTicketsFixture() {
  const root = await mkdtemp(join(tmpdir(), "codestable-colombia-tickets-"));
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  await mkdir(join(root, ".delivery", "colombia", "tickets"), { recursive: true });
  await writeFile(
    join(root, ".codestable", "architecture", "INDEX.md"),
    "# Colombia Tickets\n",
  );
  await writeFile(join(root, ".delivery", "colombia", "spec.md"), "# Spec\n");
  const tickets = [
    ticket("T1 基础", "重构", "关闭", "", []),
    ticket("T2 并行一", "功能", "打开", "", ["01-t1.md"]),
    ticket("T3 并行二", "功能", "打开", "", ["01-t1.md"]),
    ticket("T4 并行三", "功能", "打开", "", ["01-t1.md"]),
    ticket("T5 已认领", "缺陷", "打开", "agent-2", ["02-t2.md"]),
    ticket("T6 被阻塞", "功能", "打开", "", ["03-t3.md", "missing.md"]),
    ticket("T7 已完成", "重构", "关闭", "", []),
    ticket("T8 依赖已关", "功能", "打开", "", ["07-t7.md"]),
    ticket("T9 认领链", "功能", "打开", "agent-3", ["08-t8.md"]),
    ticket("T10 链阻塞", "功能", "打开", "", ["09-t9.md"]),
    ticket("T11 未知", "功能", "未来态", "", []),
  ];
  const names = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10", "t11"];
  for (let i = 0; i < tickets.length; i += 1) {
    const number = String(i + 1).padStart(2, "0");
    await writeFile(
      join(root, ".delivery", "colombia", "tickets", `${number}-${names[i]}.md`),
      tickets[i],
    );
  }
  return root;
}

test("ticket readiness derives ready/claimed/blocked from real predecessors", async (t) => {
  const root = await colombiaTicketsFixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);
  const byId = new Map(index.entities.map((entity) => [entity.id, entity]));
  const readiness = (name) => {
    const file = `.delivery/colombia/tickets/${name}`;
    return byId.get(`Ticket:${file}`)?.readiness;
  };

  assert.equal(readiness("01-t1.md"), "none"); // closed
  assert.equal(readiness("02-t2.md"), "ready"); // 依赖 t1(closed)、未认领
  assert.equal(readiness("03-t3.md"), "ready");
  assert.equal(readiness("04-t4.md"), "ready");
  assert.equal(readiness("05-t5.md"), "claimed"); // 认领者
  assert.equal(readiness("06-t6.md"), "blocked"); // missing.md 未解析
  assert.equal(readiness("09-t9.md"), "claimed"); // 认领者优先于依赖检查
  assert.equal(readiness("10-t10.md"), "blocked"); // 依赖 t9(claimed→open)
  assert.equal(readiness("11-t11.md"), "unknown"); // 未知状态枚举

  // 缺失依赖诊断可定位。
  assert.ok(
    index.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "missing-dependency" &&
        diagnostic.relatedTarget === "missing.md",
    ),
  );
});

test("ticket DAG never mixes with decisions and keeps parallel branches", async (t) => {
  const root = await colombiaTicketsFixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);

  // T5 一跳：上游 T2（T5 依赖 T2）。
  const oneHop = graphProjection(index, {
    entity: "Ticket:.delivery/colombia/tickets/05-t5.md",
    kind: "ticket",
    depth: 1,
  });
  const nodeFiles = oneHop.nodes.map((node) => node.id.split("/").at(-1)).sort();
  assert.deepEqual(nodeFiles, ["02-t2.md", "05-t5.md"]);
  assert.ok(
    oneHop.edges.some(
      (edge) =>
        edge.from.endsWith("05-t5.md") && edge.to?.endsWith("02-t2.md"),
    ),
  );

  // 并行分支：T2 的下游图包含 T5。
  const t2Graph = graphProjection(index, {
    entity: "Ticket:.delivery/colombia/tickets/02-t2.md",
    kind: "ticket",
    depth: 2,
  });
  assert.ok(
    t2Graph.nodes.some((node) => node.id.endsWith("05-t5.md")),
  );
  assert.ok(
    t2Graph.nodes.every((node) => node.id.startsWith("Ticket:")),
  );

  // decision 与 ticket 永不混图：用决策 id 请求 ticket 图返回错误。
  const decisionEntity = "Decision:.wayfinding/nonexistent/01-x.md";
  const mixed = graphProjection(index, {
    entity: decisionEntity,
    kind: "ticket",
    depth: 1,
  });
  assert.equal(mixed.error, "entity not found");

  // 未解析依赖保留为未解析边。
  const t6 = graphProjection(index, {
    entity: "Ticket:.delivery/colombia/tickets/06-t6.md",
    kind: "ticket",
    depth: 1,
  });
  assert.ok(
    t6.edges.some(
      (edge) => edge.resolution === "unresolved" && edge.originalTarget === "missing.md",
    ),
  );
});

test("delivery view renders groups, spec link and ticket DAG section", async (t) => {
  const root = await colombiaTicketsFixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);
  const snapshot = createSnapshotProjection(index, { status: "fresh" });

  const urlState = {
    view: "delivery",
    entity: "",
    query: "",
    filters: "",
    depth: "",
  };
  const listHtml = renderDelivery(snapshot, urlState);
  assert.match(listHtml, /Ready（4）/);
  assert.match(listHtml, /已认领（2）/);
  assert.match(listHtml, /被阻塞（2）/);
  assert.match(listHtml, /状态未知（1）/);
  assert.match(listHtml, /规格：\.delivery\/colombia\/spec\.md/);
  assert.match(listHtml, /认领者 agent-2/);
  assert.match(listHtml, /查看依赖/);
  assert.match(listHtml, /前置工单已关闭且未被认领/);

  const graph = graphProjection(index, {
    entity: "Ticket:.delivery/colombia/tickets/05-t5.md",
    kind: "ticket",
    depth: 1,
  });
  const graphHtml = renderDelivery(
    snapshot,
    { ...urlState, entity: graph.entity, depth: "1" },
    graph,
  );
  assert.match(graphHtml, /依赖图：T5 已认领/);
  assert.match(graphHtml, /<svg class="dag"/);
  assert.match(graphHtml, /完整文字依赖列表/);
  assert.match(graphHtml, /再展开一层（深度 2）/);
});

test("delivery API serves ticket graph and unconfigured delivery shows unconfigured", async (t) => {
  const root = await colombiaTicketsFixture();
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
    `${dashboard.address}/api/graph?entity=${encodeURIComponent("Ticket:.delivery/colombia/tickets/02-t2.md")}&kind=ticket&depth=2`,
    { signal: AbortSignal.timeout(5000) },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.kind, "Ticket");
  assert.ok(body.nodes.length >= 2);

  const snapshot = await fetch(`${dashboard.address}/api/snapshot`, {
    signal: AbortSignal.timeout(5000),
  }).then((response) => response.json());
  assert.equal(snapshot.deliveries[0].hasSpec, true);
  assert.equal(snapshot.deliveries[0].tickets.length, 11);

  // 无交付面的项目：视图显示未配置。
  const bareRoot = await mkdtemp(join(tmpdir(), "codestable-no-delivery-"));
  t.after(() =>
    rm(bareRoot, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    }),
  );
  await mkdir(join(bareRoot, ".codestable", "architecture"), { recursive: true });
  await writeFile(join(bareRoot, ".codestable", "architecture", "INDEX.md"), "# Bare\n");
  const { createSnapshot } = await import("../src/dashboard.js");
  const bareSnapshot = await createSnapshot(bareRoot);
  assert.match(
    renderDelivery(bareSnapshot, { view: "delivery", entity: "", query: "", filters: "", depth: "" }),
    /交付面：未配置\/无资料/,
  );
});

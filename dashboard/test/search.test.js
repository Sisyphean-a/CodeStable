// 工单 04：结构化搜索与目录测试。
// 中文/英文/路径片段/多词 AND、确定性排序、筛选、无结果状态与未索引范围。

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProjectIndex } from "../src/project/index.js";
import {
  normalizeTerm,
  parseFilters,
  searchProjection,
} from "../src/project/search.js";
import { startDashboard } from "../src/dashboard.js";
import { renderDocuments } from "../src/web/views/documents.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "codestable-search-"));
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  await mkdir(join(root, ".codestable", "history"), { recursive: true });
  await mkdir(join(root, ".wayfinding", "sample", "decisions"), {
    recursive: true,
  });
  await mkdir(join(root, ".delivery", "sample", "tickets"), { recursive: true });
  await mkdir(join(root, "notes"), { recursive: true });

  await writeFile(
    join(root, ".codestable", "architecture", "INDEX.md"),
    "# 架构索引\n\n## 范围地图\n",
  );
  await writeFile(
    join(root, ".codestable", "history", "2026-08.md"),
    "# 2026-08\n\n- 2026-08-01 · [演进] 建立索引. 范围：workspace\n  原因：reason\n  当前依据：[架构索引](../architecture/INDEX.md)。\n  证据：代码锚点 `dashboard/src/dashboard.js`。\n",
  );
  await writeFile(
    join(root, ".wayfinding", "sample", "map.md"),
    "# Sample Map\n",
  );
  await writeFile(
    join(root, ".wayfinding", "sample", "decisions", "01-alpha.md"),
    "---\n处理方式: 裁决\n状态: 打开\n认领者: \"\"\n硬依赖: []\n---\n\n# Alpha 决策\n\n正文\n",
  );
  await writeFile(
    join(root, ".wayfinding", "sample", "decisions", "02-beta.md"),
    "---\n处理方式: 调查\n状态: 关闭\n认领者: \"\"\n硬依赖: [01-alpha.md]\n---\n\n# Beta 决策\n",
  );
  await writeFile(join(root, ".delivery", "sample", "spec.md"), "# 规格\n");
  await writeFile(
    join(root, ".delivery", "sample", "tickets", "01-ticket.md"),
    "---\n交付类型: 功能\n状态: 打开\n认领者: \"\"\n硬依赖: []\n---\n\n# 交付功能工单\n",
  );
  await writeFile(join(root, "notes", "draft.md"), "# Draft\n");
  return root;
}

test("search matches Chinese, English, path segments and multi-word AND", async (t) => {
  const root = await fixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);

  // 中文标题匹配。
  const alpha = searchProjection(index, { query: "Alpha" });
  assert.ok(
    alpha.results.some((result) => result.id === "Decision:.wayfinding/sample/decisions/01-alpha.md"),
  );
  assert.deepEqual(alpha.results[0].hitFields, ["标题", "ID", "路径", "标题目录"]);
  // 已解析关系目标可搜索（02-beta 通过 depends-on 目标命中）。
  const beta = alpha.results.find(
    (result) => result.id === "Decision:.wayfinding/sample/decisions/02-beta.md",
  );
  assert.ok(beta.hitFields.includes("关系目标"));

  // 英文大小写不敏感。
  const lower = searchProjection(index, { query: "alpha" });
  assert.equal(lower.total, alpha.total);

  // 路径片段匹配。
  const byPath = searchProjection(index, { query: "decisions/01" });
  assert.ok(
    byPath.results.some(
      (result) => result.path === ".wayfinding/sample/decisions/01-alpha.md",
    ),
  );

  // 多词 AND：标题 + 类型都命中才返回。
  const multi = searchProjection(index, { query: "Alpha Decision" });
  assert.ok(
    multi.results.some(
      (result) => result.id === "Decision:.wayfinding/sample/decisions/01-alpha.md",
    ),
  );

  // 多词 AND 不同字段：Alpha + 打开（状态中文标签）。
  const crossField = searchProjection(index, { query: "Alpha 打开" });
  assert.ok(
    crossField.results.some(
      (result) => result.id === "Decision:.wayfinding/sample/decisions/01-alpha.md",
    ),
  );

  // 历史标签/日期/范围可搜索。
  const history = searchProjection(index, { query: "演进" });
  assert.ok(history.results.some((result) => result.kind === "HistoryEntry"));

  // 类型筛选。
  const onlyDecisions = searchProjection(index, {
    query: "决策",
    filters: "kind:Decision",
  });
  assert.ok(onlyDecisions.results.every((result) => result.kind === "Decision"));
});

test("search sorting is deterministic by match level, authority and path", async (t) => {
  const root = await fixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);

  // 标题精确匹配排第一。
  const result = searchProjection(index, { query: "Beta 决策" });
  assert.equal(result.results[0].id, "Decision:.wayfinding/sample/decisions/02-beta.md");

  // 同一查询两次结果一致。
  const again = searchProjection(index, { query: "Beta 决策" });
  assert.deepEqual(
    result.results.map((item) => item.id),
    again.results.map((item) => item.id),
  );
});

test("filters, no-results and unindexed scope behave per contract", async (t) => {
  const root = await fixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);

  // 解析状态的筛选（relation 类型）。
  const depends = searchProjection(index, {
    query: "决策",
    filters: "relation:depends-on",
  });
  assert.ok(
    depends.results.some(
      (result) => result.id === "Decision:.wayfinding/sample/decisions/02-beta.md",
    ),
  );
  assert.ok(
    !depends.results.some(
      (result) => result.id === "Decision:.wayfinding/sample/decisions/01-alpha.md",
    ),
  );

  // 无结果：total 0，保留查询与筛选。
  const none = searchProjection(index, { query: "不存在xyz", filters: "kind:Ticket" });
  assert.equal(none.total, 0);
  assert.equal(none.query, "不存在xyz");
  assert.deepEqual(none.filters, { kind: ["Ticket"] });

  // 未索引文档：默认不出现在结果，显式切换才列出。
  const hidden = searchProjection(index, { query: "Draft" });
  assert.equal(hidden.total, 0);
  assert.equal(hidden.unindexed.length, 0);
  const visible = searchProjection(index, { includeUnindexed: true });
  assert.ok(
    visible.unindexed.some((item) => item.path === "notes/draft.md"),
  );
  assert.ok(
    visible.unindexed.every((item) => item.reason.length > 0),
  );

  // parseFilters 与 normalizeTerm。
  assert.deepEqual(parseFilters("kind:Decision,state:open"), {
    kind: ["Decision"],
    state: ["open"],
  });
  assert.deepEqual(parseFilters("nonsense"), {});
  assert.equal(normalizeTerm("  Foo_Bar-01  "), "foo bar 01");
});

test("search API works over HTTP and documents view renders results and no-results", async (t) => {
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
  const snapshot = await fetch(`${dashboard.address}/api/snapshot`, {
    signal: AbortSignal.timeout(5000),
  }).then((response) => response.json());

  const search = await fetch(
    `${dashboard.address}/api/search?q=${encodeURIComponent("Alpha")}`,
    { signal: AbortSignal.timeout(5000) },
  );
  assert.equal(search.status, 200);
  const body = await search.json();
  assert.equal(body.total, 3); // 标题 + 关系目标（02-beta 经 depends-on、map 经 contains）
  assert.ok(body.searchedFields.length >= 6);
  assert.ok(body.results[0].hitFields.includes("标题"));
  assert.equal(body.results[0].path, ".wayfinding/sample/decisions/01-alpha.md");

  const noResult = await fetch(
    `${dashboard.address}/api/search?q=${encodeURIComponent("zzz")}`,
    { signal: AbortSignal.timeout(5000) },
  ).then((response) => response.json());
  assert.equal(noResult.total, 0);

  // 视图渲染：结果列表 + 无结果状态 + 未索引范围。
  const resultHtml = renderDocuments(snapshot, {
    view: "documents",
    entity: "",
    query: "Alpha",
    filters: "",
    depth: "",
  }, body);
  assert.match(resultHtml, /3 个结果/);
  assert.match(resultHtml, /命中：标题/);
  assert.match(resultHtml, /entity-link/);

  const noResultHtml = renderDocuments(snapshot, {
    view: "documents",
    entity: "",
    query: "zzz",
    filters: "kind:Ticket",
    depth: "",
  }, noResult);
  assert.match(noResultHtml, /没有匹配/);
  assert.match(noResultHtml, /可搜索字段/);
  assert.match(noResultHtml, /清除搜索与筛选，返回目录/);

  const unindexedHtml = renderDocuments(snapshot, {
    view: "documents",
    entity: "",
    query: "",
    filters: "",
    depth: "",
    unindexed: "1",
  }, { query: "", filters: {}, results: [], total: 0, unindexed: [{ path: "notes/draft.md", reason: "未在受支持资料位置" }], includeUnindexed: true });
  assert.match(unindexedHtml, /未索引文档/);
  assert.match(unindexedHtml, /notes\/draft\.md/);
});

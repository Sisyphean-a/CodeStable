// 工单 05：语义历史时间线测试。
// 真实排序（月文件日期逆序、同日写入顺序）、筛选不改变来源事实、
// 格式错误行不计入且可定位、Git 证据带类型、演变链边类型。

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProjectIndex } from "../src/project/index.js";
import { historyProjection, parseHistoryFilters } from "../src/project/history.js";
import { startDashboard } from "../src/dashboard.js";

const ENTRY = (date, tag = "功能", extra = "") =>
  `- ${date} · [${tag}] Result ${date}. 范围：workspace${extra}\n` +
  `  原因：reason for ${date}\n` +
  `  当前依据：[架构索引](../architecture/INDEX.md)。\n` +
  `  证据：提交 \`1581e4b\`；代码锚点 \`dashboard/src/dashboard.js\`。\n`;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "codestable-history-"));
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  await mkdir(join(root, ".codestable", "history"), { recursive: true });
  await writeFile(
    join(root, ".codestable", "architecture", "INDEX.md"),
    "# 架构索引\n",
  );
  await writeFile(
    join(root, ".codestable", "history", "2026-08.md"),
    `# 2026-08\n\n${ENTRY("2026-08-03", "演进")}${ENTRY("2026-08-01")}${ENTRY("2026-08-01", "重构", "x")}\n`,
  );
  await writeFile(
    join(root, ".codestable", "history", "2026-07.md"),
    `# 2026-07\n\n${ENTRY("2026-07-15", "缺陷")}\n`,
  );
  return root;
}

test("timeline follows month-file reverse order and same-day write order", async (t) => {
  const root = await fixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);
  const result = historyProjection(index, {});

  assert.equal(result.total, 4);
  const order = result.months.flatMap((month) =>
    month.entries.map((entry) => `${month.name}:${entry.date}:${entry.sequence}`),
  );
  assert.deepEqual(order, [
    "2026-08:2026-08-03:1",
    "2026-08:2026-08-01:1",
    "2026-08:2026-08-01:2",
    "2026-07:2026-07-15:1",
  ]);

  // 条目携带全部语义字段。
  const first = result.months[0].entries[0];
  assert.equal(first.tag, "演进");
  assert.equal(first.range, "workspace");
  assert.ok(first.reason.includes("reason for 2026-08-03"));
  assert.ok(first.currentBasis.raw.includes("架构索引"));
  assert.ok(first.evidence.raw.includes("提交"));
});

test("filters and theme do not change source facts or stable order", async (t) => {
  const root = await fixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);

  const byTag = historyProjection(index, { filters: "tag:演进" });
  assert.equal(byTag.total, 1);
  assert.equal(byTag.months[0].entries[0].tag, "演进");

  const byDate = historyProjection(index, { filters: "date:2026-08" });
  assert.equal(byDate.total, 3);

  const byRange = historyProjection(index, { filters: "range:workspace" });
  assert.equal(byRange.total, 4);

  const byBasis = historyProjection(index, { filters: "basis:架构索引" });
  assert.equal(byBasis.total, 4);

  const byTheme = historyProjection(index, { theme: "result 2026-08-03" });
  assert.equal(byTheme.total, 1);
  assert.equal(byTheme.months[0].entries[0].date, "2026-08-03");

  // 筛选结果保持月内稳定顺序。
  const filtered = historyProjection(index, { filters: "date:2026-08" });
  assert.deepEqual(
    filtered.months[0].entries.map((entry) => `${entry.date}:${entry.sequence}`),
    ["2026-08-03:1", "2026-08-01:1", "2026-08-01:2"],
  );
});

test("malformed history lines are not counted and stay locatable", async (t) => {
  const root = await fixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  await writeFile(
    join(root, ".codestable", "history", "2026-08.md"),
    `# 2026-08\n\n${ENTRY("2026-08-01")}\n- 2026-08-05 · [坏标签] Broken\n- 2026-08-06 · [功能] Missing fields\n`,
  );
  const index = await buildProjectIndex(root);
  const result = historyProjection(index, {});

  assert.equal(result.total, 2); // 2026-07 一条有效 + 2026-08 一条有效
  assert.equal(result.invalidCount, 2);
  const diagnostics = index.diagnostics.filter(
    (diagnostic) => diagnostic.code === "history-format",
  );
  assert.equal(diagnostics.length, 2);
  assert.ok(
    diagnostics.every(
      (diagnostic) => diagnostic.location.path === ".codestable/history/2026-08.md",
    ),
  );
  assert.ok(diagnostics.every((diagnostic) => diagnostic.location.line >= 3));
});

test("evolution chain carries typed edges; git evidence is typed, not a second timeline", async (t) => {
  const root = await fixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);
  const result = historyProjection(index, {});

  const first = result.months[0].entries[0];
  const chainKinds = first.chain.map((item) => item.kind);
  assert.ok(chainKinds.includes("current-basis"));
  assert.ok(chainKinds.includes("evidence"));

  const evidenceEdges = first.chain.filter((item) => item.kind === "evidence");
  const commitEdge = evidenceEdges.find(
    (item) =>
      item.text?.includes("提交") ||
      item.originalTarget?.includes("提交") ||
      item.to?.startsWith("GitCommit:"),
  );
  assert.ok(commitEdge, "commit evidence is typed as evidence");
  // fixture 无 .git：commit 目标不可验证时保持 unresolved，并伴随 git 诊断。
  if (commitEdge.resolution === "resolved") {
    assert.equal(commitEdge.targetKind, "GitCommit");
  } else {
    assert.equal(commitEdge.resolution, "unresolved");
    assert.ok(
      index.diagnostics.some(
        (diagnostic) => diagnostic.code === "git-unavailable",
      ),
    );
  }

  // 有依据的演变链标注边类型；无依据条目只有原始文本。
  const julyEntry = result.months.find((month) => month.name === "2026-07")
    .entries[0];
  assert.ok(julyEntry.chain.some((item) => item.kind === "evidence"));
  assert.ok(
    julyEntry.chain.every(
      (item) => item.kind === "current-basis" || item.kind === "evidence",
    ),
  );
});

test("history API serves the timeline with filters over HTTP", async (t) => {
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

  const all = await fetch(`${dashboard.address}/api/history`, {
    signal: AbortSignal.timeout(5000),
  }).then((response) => response.json());
  assert.equal(all.total, 4);
  assert.equal(all.months.length, 2);

  const filtered = await fetch(
    `${dashboard.address}/api/history?filters=${encodeURIComponent("tag:缺陷")}`,
    { signal: AbortSignal.timeout(5000) },
  ).then((response) => response.json());
  assert.equal(filtered.total, 1);
  assert.equal(filtered.months[0].entries[0].tag, "缺陷");

  const themed = await fetch(
    `${dashboard.address}/api/history?theme=${encodeURIComponent("2026-07")}`,
    { signal: AbortSignal.timeout(5000) },
  ).then((response) => response.json());
  assert.equal(themed.total, 1);

  assert.deepEqual(parseHistoryFilters("date:2026-08,tag:功能"), {
    date: ["2026-08"],
    tag: ["功能"],
  });
  assert.deepEqual(parseHistoryFilters(""), {});
});

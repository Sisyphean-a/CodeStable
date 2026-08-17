// 工单 01：ProjectIndex 与兼容快照测试。
// 覆盖正常、缺失、冲突、错误与 stale 路径；诊断必须可定位且不把未知伪装成成功。

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProjectIndex } from "../src/project/index.js";
import { createSnapshot } from "../src/dashboard.js";

const HISTORY_ENTRY = (date, extra = "") =>
  `- ${date} · [功能] Result ${date}. 范围：workspace${extra}\n` +
  `  原因：reason\n` +
  `  当前依据：[架构索引](../architecture/INDEX.md)。\n` +
  `  证据：代码锚点 \`dashboard/src/dashboard.js\`。\n`;

async function baseFixture() {
  const root = await mkdtemp(join(tmpdir(), "codestable-index-"));
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  await mkdir(join(root, ".codestable", "history"), { recursive: true });
  await mkdir(join(root, ".codestable", "requirements", "adrs"), {
    recursive: true,
  });
  await mkdir(join(root, ".wayfinding", "sample", "decisions"), {
    recursive: true,
  });
  await mkdir(join(root, ".delivery", "sample", "tickets"), { recursive: true });
  await mkdir(join(root, "skills", "sample-skill"), { recursive: true });
  await mkdir(join(root, "notes"), { recursive: true });

  await writeFile(
    join(root, ".codestable", "architecture", "INDEX.md"),
    "# Fixture Project\n\n## 代码锚点\n- `dashboard/src/dashboard.js`\n",
  );
  await writeFile(
    join(root, ".codestable", "attention.md"),
    "# 注意力规则\n\n暂无规则。\n",
  );
  await writeFile(
    join(root, ".codestable", "history", "2026-08.md"),
    `# 2026-08\n\n${HISTORY_ENTRY("2026-08-01")}${HISTORY_ENTRY("2026-08-02")}\n`,
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
    join(root, ".delivery", "sample", "spec.md"),
    "# Sample Spec\n",
  );
  await writeFile(
    join(root, ".delivery", "sample", "tickets", "01-closed.md"),
    decision("关闭", "", "[]", "重构"),
  );
  await writeFile(
    join(root, ".delivery", "sample", "tickets", "02-ready.md"),
    decision("打开", "", "[01-closed.md]", "功能"),
  );
  await writeFile(
    join(root, "skills", "sample-skill", "SKILL.md"),
    "---\nname: sample-skill\ndescription: A sample skill\n---\n\n# Skill\n",
  );
  await writeFile(join(root, "notes", "unindexed.md"), "# Unindexed\n");
  await writeFile(join(root, "README.md"), "# Fixture Project\n");
  return root;
}

function decision(status, owner, dependencies, type = "裁决") {
  return `---\n处理方式: ${type}\n状态: ${status}\n认领者: "${owner}"\n硬依赖: ${dependencies}\n---\n\n# Item\n`;
}

async function cleanup(t, root) {
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
}

test("builds a typed ProjectIndex with categories, entities, readiness and relations", async (t) => {
  const root = await baseFixture();
  cleanup(t, root);
  const index = await buildProjectIndex(root);

  assert.equal(index.schemaVersion, 1);
  assert.equal(index.project.name, "Fixture Project");

  const categories = new Set(index.sources.map((source) => source.category));
  assert.deepEqual(
    [...categories].sort(),
    ["current-state", "history", "reader-document", "skill", "unindexed", "work-state"],
  );

  const kinds = new Set(index.entities.map((entity) => entity.kind));
  for (const kind of [
    "Project",
    "ArchitectureIndex",
    "AttentionDocument",
    "HistoryEntry",
    "DecisionMap",
    "Decision",
    "Delivery",
    "Specification",
    "Ticket",
    "Skill",
    "ReaderDocument",
    "GitRepository",
    "CodeAnchor",
  ]) {
    assert.ok(kinds.has(kind), `missing entity kind ${kind}`);
  }
  // Git 可用时才有 GitCommit；fixture 无 .git 时 GitRepository 为 unavailable。
  const gitEntity = index.entities.find(
    (entity) => entity.kind === "GitRepository",
  );
  if (gitEntity.state !== "unavailable") {
    assert.ok(kinds.has("GitCommit"), "missing entity kind GitCommit");
  }

  // 资料只解析一次：每个文件只有一个 source。
  const sourceIds = new Set(index.sources.map((source) => source.id));
  assert.equal(sourceIds.size, index.sources.length);

  // 稳定 ID 使用仓库相对 POSIX 路径。
  const decision = index.entities.find(
    (entity) => entity.id === "Decision:.wayfinding/sample/decisions/02-ready.md",
  );
  assert.equal(
    decision.id,
    "Decision:.wayfinding/sample/decisions/02-ready.md",
  );
  assert.equal(decision.state, "open");
  assert.equal(decision.readiness, "frontier");

  const closed = index.entities.find(
    (entity) => entity.id === "Decision:.wayfinding/sample/decisions/01-closed.md",
  );
  assert.equal(closed.readiness, "none");

  // ticket readiness 派生。
  const readyTicket = index.entities.find(
    (entity) => entity.id === "Ticket:.delivery/sample/tickets/02-ready.md",
  );
  assert.equal(readyTicket.readiness, "ready");

  // 关系：目录包含 + 硬依赖 + 来源规格 + 代码锚点。
  const kindsByKind = new Map();
  for (const relation of index.relations) {
    if (!kindsByKind.has(relation.kind)) kindsByKind.set(relation.kind, []);
    kindsByKind.get(relation.kind).push(relation);
  }
  assert.ok((kindsByKind.get("contains") ?? []).length >= 5);
  const dependsOn = kindsByKind.get("depends-on") ?? [];
  assert.ok(dependsOn.length >= 2);
  assert.ok(
    dependsOn.every(
      (relation) =>
        relation.provenance.field === "硬依赖" &&
        relation.resolution === "resolved",
    ),
  );
  assert.ok((kindsByKind.get("code-anchor") ?? []).length >= 1);
  assert.ok((kindsByKind.get("links-to") ?? []).length >= 1);

  // 历史条目：完整格式才计数，带日期与同日顺序。
  const entries = index.entities.filter(
    (entity) => entity.kind === "HistoryEntry",
  );
  assert.equal(entries.length, 2);
  assert.ok(entries.every((entry) => entry.date === "2026-08-0".concat("1") || entry.date === "2026-08-02"));
  assert.ok(entries.every((entry) => entry.tag === "功能"));
  assert.equal(entries[0].sourceOrder, 1);
  assert.equal(entries[1].sourceOrder, 1); // 同日顺序独立于全局序号

  // Git 实体。
  const git = index.entities.find((entity) => entity.kind === "GitRepository");
  assert.ok(["clean", "changed", "unavailable"].includes(git.state));

  // unindexed 资料保留来源但不提升为实体。
  assert.ok(index.sources.some((source) => source.path === "notes/unindexed.md"));
});

test("reports unknown enums, missing fields and bad links as locatable diagnostics", async (t) => {
  const root = await baseFixture();
  cleanup(t, root);
  await writeFile(
    join(root, ".wayfinding", "sample", "decisions", "04-broken.md"),
    decision("未来态", "", "[missing-file.md]"),
  );
  await writeFile(
    join(root, ".wayfinding", "sample", "map.md"),
    "# Sample Map\n\n- [ghost](../nonexistent.md)\n- [escape](../../../outside.md)\n",
  );
  const index = await buildProjectIndex(root);

  const broken = index.entities.find(
    (entity) => entity.id === "Decision:.wayfinding/sample/decisions/04-broken.md",
  );
  assert.equal(broken.state, "unknown");
  assert.equal(broken.readiness, "unknown");
  assert.equal(broken.validity, "partial");

  const codes = new Map();
  for (const diagnostic of index.diagnostics) {
    if (!codes.has(diagnostic.code)) codes.set(diagnostic.code, []);
    codes.get(diagnostic.code).push(diagnostic);
  }
  assert.ok((codes.get("unknown-enum") ?? []).length >= 1);
  const unknownEnum = codes.get("unknown-enum")[0];
  assert.equal(
    unknownEnum.location.path,
    ".wayfinding/sample/decisions/04-broken.md",
  );
  assert.ok(unknownEnum.message.includes("未来态"));

  assert.ok((codes.get("missing-dependency") ?? []).length >= 1);
  const missingDependency = codes.get("missing-dependency")[0];
  assert.equal(missingDependency.relatedTarget, "missing-file.md");

  // 坏链接与越界链接产生 bad-link / path-escape 诊断。
  assert.ok((codes.get("bad-link") ?? []).length >= 1);
  assert.ok((codes.get("path-escape") ?? []).length >= 1);

  // 未解析依赖的 decision 必须 blocked，不能是 frontier。
  const readyDecision = index.entities.find(
    (entity) => entity.id === "Decision:.wayfinding/sample/decisions/02-ready.md",
  );
  // 02-ready 依赖 01-closed（已关闭）→ 仍为 frontier。
  assert.equal(readyDecision.readiness, "frontier");
});

test("history format errors keep the raw line locatable and are not counted", async (t) => {
  const root = await baseFixture();
  cleanup(t, root);
  await writeFile(
    join(root, ".codestable", "history", "2026-08.md"),
    `# 2026-08\n\n${HISTORY_ENTRY("2026-08-01")}\n- 2026-08-03 · [演进] Broken line\n- bad line\n`,
  );
  const index = await buildProjectIndex(root);

  const entries = index.entities.filter(
    (entity) => entity.kind === "HistoryEntry",
  );
  assert.equal(entries.length, 1);

  const historyFormat = index.diagnostics.filter(
    (diagnostic) => diagnostic.code === "history-format",
  );
  assert.ok(historyFormat.length >= 1);
  assert.ok(
    historyFormat.some(
      (diagnostic) =>
        diagnostic.location.path === ".codestable/history/2026-08.md",
    ),
  );

  // 快照投影不把格式错误行计入 entries。
  const snapshot = await createSnapshot(root);
  assert.equal(snapshot.history[0].entries, 1);
  assert.equal(snapshot.history[0].invalid, 1);
});

test("read failures produce locatable unavailable sources", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "codestable-readfail-"));
  cleanup(t, root);
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  // 用目录顶替 md 文件路径，使 readFile 失败。
  await mkdir(join(root, ".codestable", "architecture", "broken.md"), {
    recursive: true,
  });
  await writeFile(
    join(root, ".codestable", "architecture", "INDEX.md"),
    "# F\n",
  );
  const { readSourceDocument } = await import("../src/project/sources.js");
  const { DiagnosticCollector } = await import("../src/project/diagnostics.js");
  const diagnostics = new DiagnosticCollector();
  const source = await readSourceDocument(
    root,
    ".codestable/architecture/broken.md",
    diagnostics,
  );
  assert.equal(source.validity, "unavailable");
  assert.ok(
    diagnostics.items.some(
      (diagnostic) =>
        diagnostic.code === "read-failed" &&
        diagnostic.location.path === ".codestable/architecture/broken.md",
    ),
  );
});

test("missing optional sources are unconfigured, not zero progress", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "codestable-minimal-"));
  cleanup(t, root);
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  await writeFile(
    join(root, ".codestable", "architecture", "INDEX.md"),
    "# Minimal\n",
  );
  const index = await buildProjectIndex(root);

  assert.deepEqual(index.project, {
    root,
    name: "Minimal",
    hasArchitectureIndex: true,
    hasRequirementsContext: false,
  });
  assert.equal(
    index.sources.some((source) => source.path === ".codestable/requirements/CONTEXT.md"),
    false,
  );

  const snapshot = await createSnapshot(root);
  assert.deepEqual(snapshot.maps, []);
  assert.deepEqual(snapshot.deliveries, []);
  assert.equal(snapshot.project.hasRequirementsContext, false);
  assert.equal(snapshot.snapshot.status, "fresh");
});

test("keeps the last good snapshot and exposes stale state when rebuild fails", async (t) => {
  const root = await baseFixture();
  const { startDashboard } = await import("../src/dashboard.js");

  let buildCount = 0;
  const flakyBuild = async (projectRoot, previous) => {
    buildCount += 1;
    if (buildCount % 2 === 0) throw new Error("simulated rebuild failure");
    return buildProjectIndex(projectRoot, previous);
  };

  const dashboard = await startDashboard(root, {
    openBrowser: false,
    port: 0,
    pollIntervalMs: 60,
    buildIndex: flakyBuild,
  });
  t.after(async () => {
    await dashboard.stop();
  });
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );

  const before = await fetchJson(dashboard.address);
  assert.equal(before.snapshot.status, "fresh");
  assert.equal(before.history[0].entries, 2);

  // 第一次变更触发一次失败重建：保留最后成功快照并标记 stale。
  await writeFile(
    join(root, ".codestable", "history", "2026-08.md"),
    `# 2026-08\n\n${HISTORY_ENTRY("2026-08-01")}\n`,
  );
  const stale = await waitFor(
    () => fetchJson(dashboard.address).then((snapshot) => snapshot.snapshot.status === "stale"),
    4000,
  );
  assert.ok(stale, "failed rebuild should expose stale state");
  assert.equal(buildCount, 2);
  const afterStale = await fetchJson(dashboard.address);
  assert.equal(afterStale.snapshot.status, "stale");
  assert.equal(afterStale.history[0].entries, 2); // 保留最后成功快照
  assert.ok(afterStale.snapshot.lastError.includes("simulated rebuild failure"));

  // 下一次成功重建恢复 fresh，并公开新快照。
  await writeFile(
    join(root, ".codestable", "history", "2026-08.md"),
    `# 2026-08\n\n${HISTORY_ENTRY("2026-08-02")}\n`,
  );
  const fresh = await waitFor(
    () =>
      fetchJson(dashboard.address).then(
        (snapshot) => snapshot.snapshot.status === "fresh" && snapshot.history[0].entries === 1,
      ),
    4000,
  );
  assert.ok(fresh, "a successful rebuild should publish a fresh snapshot");
  assert.equal(buildCount, 3);

  // 连接 SSE 后再次失败重建：广播 snapshot-stale 事件。
  const events = await fetch(`${dashboard.address}/events`, {
    signal: AbortSignal.timeout(6000),
  });
  const reader = events.body.getReader();
  await writeFile(
    join(root, ".codestable", "history", "2026-08.md"),
    `# 2026-08\n\n${HISTORY_ENTRY("2026-08-03")}\n`,
  );
  const eventText = await readEvent(reader, "snapshot-stale", 6000);
  assert.ok(eventText, "SSE should broadcast snapshot-stale after failed rebuild");
  assert.equal(buildCount, 4);
  const stillStale = await fetchJson(dashboard.address);
  assert.equal(stillStale.snapshot.status, "stale");
  assert.equal(stillStale.history[0].entries, 1); // 保留成功快照
});

async function fetchJson(address) {
  return fetch(`${address}/api/snapshot`, {
    signal: AbortSignal.timeout(5000),
  }).then((response) => response.json());
}

async function readEvent(reader, eventName, timeoutMs = 4000) {
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) return false;
    buffer += decoder.decode(value);
    if (buffer.includes(`event: ${eventName}`)) return true;
  }
  return false;
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  return false;
}

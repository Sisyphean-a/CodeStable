// 工单 02：视图纯函数与概览/导航投影测试。
// 概览与导航的稳定输出以纯字符串由 Node 断言。

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createSnapshot } from "../src/dashboard.js";
import { renderOverview } from "../src/web/views/overview.js";
import { renderState } from "../src/web/views/state.js";
import { renderWayfinding } from "../src/web/views/wayfinding.js";
import { renderDelivery } from "../src/web/views/delivery.js";
import { renderHistory } from "../src/web/views/history.js";
import { renderDocuments } from "../src/web/views/documents.js";
import { renderRelations } from "../src/web/views/relations.js";
import { renderReader } from "../src/web/views/reader.js";

const HISTORY_ENTRY = (date) =>
  `- ${date} · [功能] Result. 范围：workspace\n` +
  `  原因：reason\n` +
  `  当前依据：[架构索引](../architecture/INDEX.md)。\n` +
  `  证据：代码锚点 \`dashboard/src/dashboard.js\`。\n`;

async function projectFixture() {
  const root = await mkdtemp(join(tmpdir(), "codestable-views-"));
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  await mkdir(join(root, ".codestable", "history"), { recursive: true });
  await mkdir(join(root, ".wayfinding", "sample", "decisions"), {
    recursive: true,
  });
  await mkdir(join(root, ".delivery", "sample", "tickets"), { recursive: true });
  await mkdir(join(root, "skills", "sample-skill"), { recursive: true });

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
    "---\n状态: 关闭\n认领者: \"\"\n硬依赖: []\n---\n\n# Closed Item\n",
  );
  await writeFile(
    join(root, ".wayfinding", "sample", "decisions", "02-ready.md"),
    "---\n状态: 打开\n认领者: \"\"\n硬依赖: [01-closed.md]\n---\n\n# Ready Item\n",
  );
  await writeFile(
    join(root, ".delivery", "sample", "spec.md"),
    "# Sample Spec\n",
  );
  await writeFile(
    join(root, ".delivery", "sample", "tickets", "01-closed.md"),
    "---\n交付类型: 重构\n状态: 关闭\n认领者: \"\"\n硬依赖: []\n---\n\n# Closed Ticket\n",
  );
  await writeFile(
    join(root, ".delivery", "sample", "tickets", "02-ready.md"),
    "---\n交付类型: 功能\n状态: 打开\n认领者: \"\"\n硬依赖: [01-closed.md]\n---\n\n# Ready Ticket\n",
  );
  await writeFile(
    join(root, "skills", "sample-skill", "SKILL.md"),
    "---\nname: sample-skill\ndescription: A skill\n---\n\n# Skill\n",
  );
  await writeFile(join(root, "README.md"), "# Fixture Project\n");
  return root;
}

test("overview projection follows the guided reading order and honors unconfigured sources", async (t) => {
  const root = await projectFixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const snapshot = await createSnapshot(root);

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.snapshot.status, "fresh");
  assert.equal(snapshot.project.root, ".");

  const overview = snapshot.overview;
  assert.equal(overview.identity.name, "Fixture Project");
  assert.ok(overview.identity.git.available === false || overview.identity.git.available === true);
  assert.equal(overview.attention.configured, true);
  assert.ok(overview.attention.summary.includes("暂无规则"));

  // 权威阅读路径：注意力 → 架构索引 → 领域入口。
  assert.deepEqual(
    overview.readingPath.map((item) => item.kind),
    ["AttentionDocument", "ArchitectureIndex"],
  );
  assert.equal(overview.readingPath[0].path, ".codestable/attention.md");

  // 当前项目地图与语义演变。
  assert.equal(overview.hasWayfinding, true);
  assert.equal(overview.maps[0].frontier, 1);
  assert.equal(overview.hasHistory, true);
  assert.equal(overview.evolution.months[0].entries, 2);

  // 继续入口来自真实 readiness。
  assert.deepEqual(
    overview.continue.map((item) => item.reason),
    ["当前前沿", "Ready"],
  );

  // entities 摘要可定位且不含绝对路径。
  const decision = snapshot.entities.find((entity) => entity.kind === "Decision");
  assert.equal(decision.id, "Decision:.wayfinding/sample/decisions/01-closed.md");
  assert.equal(decision.path, ".wayfinding/sample/decisions/01-closed.md");
  assert.ok(!JSON.stringify(snapshot).includes("C:\\\\"));
});

test("unconfigured sources render as unconfigured, not zero progress", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "codestable-views-min-"));
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  await writeFile(
    join(root, ".codestable", "architecture", "INDEX.md"),
    "# Minimal\n",
  );
  const snapshot = await createSnapshot(root);

  assert.equal(snapshot.overview.hasWayfinding, false);
  assert.equal(snapshot.overview.hasHistory, false);
  assert.equal(snapshot.overview.attention.configured, false);
  assert.equal(snapshot.overview.readingPath.length, 1);

  const html = renderOverview(snapshot, {});
  assert.match(html, /探路地图：未配置\/无资料/);
  assert.match(html, /项目历史：未配置\/无资料/);
  assert.match(html, /注意力规则：未配置/);
  assert.match(html, /当前没有可行动的前沿或 Ready 工单/);
});

test("all seven views render stable, escapable output", async (t) => {
  const root = await projectFixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const snapshot = await createSnapshot(root);
  const urlState = { view: "overview", entity: "", query: "", filters: "", depth: "" };

  const overviewHtml = renderOverview(snapshot, urlState);
  assert.match(overviewHtml, /权威阅读路径/);
  assert.match(overviewHtml, /当前项目地图/);
  assert.match(overviewHtml, /语义演变/);
  assert.match(overviewHtml, /当前注意力/);
  assert.match(overviewHtml, /继续入口/);
  assert.match(overviewHtml, /entity-link/);
  assert.doesNotMatch(overviewHtml, /<script|onclick=/i);

  const stateHtml = renderState(snapshot, urlState);
  assert.match(stateHtml, /注意力规则/);
  assert.match(stateHtml, /架构索引/);
  assert.match(stateHtml, /未配置\/无资料/);

  const wayfindingHtml = renderWayfinding(snapshot, urlState);
  assert.match(wayfindingHtml, /当前前沿/);
  assert.match(wayfindingHtml, /已关闭/);
  assert.match(wayfindingHtml, /Ready Item/);
  assert.match(wayfindingHtml, /依赖 1/);

  const deliveryHtml = renderDelivery(snapshot, urlState);
  assert.match(deliveryHtml, /Ready/);
  assert.match(deliveryHtml, /Closed Ticket/);
  assert.match(deliveryHtml, /规格/);

  const historyHtml = renderHistory(snapshot, urlState, {
    total: 2,
    theme: null,
    filters: {},
    searchedFields: ["日期"],
    invalidCount: 0,
    months: [
      {
        name: "2026-08",
        path: ".codestable/history/2026-08.md",
        entries: [
          {
            id: "HistoryEntry:.codestable/history/2026-08.md:2026-08-01:1",
            date: "2026-08-01",
            tag: "功能",
            result: "Result",
            range: "workspace",
            reason: "reason",
            currentBasis: { raw: "[架构索引](../architecture/INDEX.md)。" },
            evidence: { raw: "代码锚点 `dashboard/src/dashboard.js`。" },
            chain: [
              {
                kind: "current-basis",
                resolution: "resolved",
                to: "ArchitectureIndex:.codestable/architecture/INDEX.md",
                text: "架构索引",
              },
              {
                kind: "evidence",
                resolution: "resolved",
                to: "file:dashboard/src/dashboard.js",
                text: "代码锚点 `dashboard/src/dashboard.js`",
              },
            ],
          },
        ],
      },
    ],
  });
  assert.match(historyHtml, /2026-08/);
  assert.match(historyHtml, /功能/);
  assert.match(historyHtml, /当前依据/);
  assert.match(historyHtml, /证据/);
  assert.match(historyHtml, /共 2 条有效条目/);

  const documentsHtml = renderDocuments(snapshot, urlState);
  assert.match(documentsHtml, /当前态/);
  assert.match(documentsHtml, /工作状态/);
  assert.match(documentsHtml, /读者与技能资料/);

  const relationsHtml = renderRelations(snapshot, urlState);
  assert.match(relationsHtml, /关系探索/);

  // 无效实体阅读目标：保留目标 ID 与返回入口，不静默跳转。
  const readerHtml = renderReader(snapshot, { ...urlState, entity: "Decision:missing" });
  assert.match(readerHtml, /对象不可用/);
  assert.match(readerHtml, /Decision:missing/);
  assert.match(readerHtml, /返回概览/);
  assert.doesNotMatch(readerHtml, /location\.(href|replace)/);

  // 有效实体阅读目标：详情视图显示正文、原文入口与检查器。
  const { buildProjectIndex } = await import("../src/project/index.js");
  const { entityDetailProjection } = await import(
    "../src/project/entity-detail.js",
  );
  const index = await buildProjectIndex(root);
  const detail = entityDetailProjection(
    index,
    "Decision:.wayfinding/sample/decisions/02-ready.md",
  );
  assert.ok(detail);
  assert.match(detail.contentHtml, /<h1[^>]*id="ready-item"/);
  const readerOkHtml = renderReader(
    snapshot,
    { ...urlState, entity: detail.id },
    detail,
  );
  assert.match(readerOkHtml, /查看原始 Markdown/);
  assert.match(readerOkHtml, /复制路径/);
  assert.match(readerOkHtml, /信息 \/ 关系/);
  assert.match(readerOkHtml, /跳关系/);
  assert.match(readerOkHtml, /item/);
  assert.match(readerOkHtml, /api\/entities\/Decision%3A\.wayfinding%2Fsample%2Fdecisions%2F02-ready\.md\/raw/);
});

test("URL state parsing keeps view, entity, query, filters and depth", async () => {
  const { parseUrl, buildUrl } = await import("../src/web/app.js");
  const parsed = parseUrl(
    "?view=delivery&entity=Ticket%3Ax&query=abc&filters=state%3Aopen&depth=2",
  );
  assert.equal(parsed.view, "delivery");
  assert.equal(parsed.entity, "Ticket:x");
  assert.equal(parsed.query, "abc");
  assert.equal(parsed.filters, "state:open");
  assert.equal(parsed.depth, "2");
  assert.equal(buildUrl({ view: "overview", entity: "", query: "", filters: "", depth: "" }), "?view=overview");
  assert.equal(
    buildUrl({ view: "reader", entity: "Decision:x", query: "", filters: "", depth: "" }),
    "?view=reader&entity=Decision%3Ax",
  );
  // 未知 view 回退到 overview。
  assert.equal(parseUrl("?view=nope").view, "overview");
});

test("snapshot load failure renders a retry page instead of crashing", async () => {
  const { createWorkbench } = await import("../src/web/app.js");
  const makeEl = () => ({
    innerHTML: "",
    textContent: "",
    hidden: false,
    dataset: {},
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    focus() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return null;
    },
  });
  const app = makeEl();
  const snapshotState = makeEl();
  const dom = {
    document: {
      querySelector: (selector) => (selector === "#app" ? app : snapshotState),
      querySelectorAll: () => [],
      addEventListener() {},
      title: "",
    },
    window: {
      location: { search: "" },
      scrollY: 0,
      scrollTo() {},
      history: { pushState() {} },
      addEventListener() {},
    },
    // 模拟 window.fetch 的 this 绑定约束：this 不是 window 时抛 Illegal invocation。
    fetch: async function () {
      if (this !== dom.window) {
        throw new TypeError("Illegal invocation");
      }
      throw new Error("snapshot fetch failed");
    },
    EventSource: function EventSourceStub() {
      this.addEventListener = () => {};
    },
  };
  const workbench = createWorkbench(dom);
  await workbench.boot();
  assert.match(app.innerHTML, /无法加载项目快照/);
  assert.match(app.innerHTML, /重试/);
  assert.doesNotMatch(app.innerHTML, /undefined/);
});

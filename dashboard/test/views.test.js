// 工单 02：视图纯函数与概览/导航投影测试。
// 概览与导航的稳定输出以纯字符串由 Node 断言。

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
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

const execFileAsync = promisify(execFile);

const HISTORY_ENTRY = (date) =>
  `- ${date} · [功能] Result. 范围：workspace\n` +
  `  原因：reason\n` +
  `  当前依据：[架构索引](../architecture/INDEX.md)。\n` +
  `  证据：代码锚点 \`dashboard/src/dashboard.js\`。\n`;

async function projectFixture() {
  const root = await mkdtemp(join(tmpdir(), "codestable-views-"));
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  await mkdir(join(root, ".codestable", "architecture", "packages"), {
    recursive: true,
  });
  await mkdir(join(root, ".codestable", "requirements"), { recursive: true });
  await mkdir(join(root, ".codestable", "history"), { recursive: true });
  await mkdir(join(root, ".wayfinding", "sample", "decisions"), {
    recursive: true,
  });
  await mkdir(join(root, ".delivery", "sample", "tickets"), { recursive: true });
  await mkdir(join(root, "skills", "sample-skill"), { recursive: true });

  await writeFile(
    join(root, ".codestable", "architecture", "INDEX.md"),
    "# Fixture Project\n\nA project summary for the overview.\n\n## 范围地图\n- workspace\n\n## 公开边界\n- Fixture dashboard boundary\n\n## 代码锚点\n- `dashboard/src/dashboard.js`\n",
  );
  await writeFile(
    join(root, ".codestable", "architecture", "packages", "dashboard.md"),
    "---\nscope: package:dashboard\ncode-paths:\n  - dashboard/src/dashboard.js\n---\n\n# Dashboard Package\n\n## 公开边界\n- Dashboard package boundary\n\n## 代码锚点\n- `dashboard/src/web/views/overview.js`\n",
  );
  await writeFile(
    join(root, ".codestable", "requirements", "CONTEXT.md"),
    "---\nscope: workspace\n---\n\n# Domain Context\n\nWorkspace domain context.\n",
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
    join(root, ".delivery", "sample", "tickets", "03-claimed.md"),
    "---\n交付类型: 功能\n状态: 打开\n认领者: alice\n硬依赖: []\n---\n\n# Claimed Ticket\n",
  );
  await writeFile(
    join(root, ".delivery", "sample", "tickets", "04-blocked.md"),
    "---\n交付类型: 缺陷\n状态: 打开\n认领者: \"\"\n硬依赖: [missing-ticket.md]\n---\n\n# Blocked Ticket\n",
  );
  await writeFile(
    join(root, "skills", "sample-skill", "SKILL.md"),
    "---\nname: sample-skill\ndescription: A skill\n---\n\n# Skill\n",
  );
  await writeFile(join(root, "README.md"), "# Fixture Project\n");
  return root;
}

function navigationDom() {
  const documentListeners = new Map();
  const document = {
    activeElement: null,
    title: "",
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) ?? [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    },
    dispatchEvent(event) {
      for (const listener of documentListeners.get(event.type) ?? []) {
        listener(event);
      }
    },
  };

  const createElement = (tagName) => {
    const listeners = new Map();
    const attributes = new Map();
    const classes = new Set();
    const element = {
      tagName: tagName.toUpperCase(),
      children: [],
      dataset: {},
      innerHTML: "",
      textContent: "",
      addEventListener(type, listener) {
        const handlers = listeners.get(type) ?? [];
        handlers.push(listener);
        listeners.set(type, handlers);
      },
      dispatchEvent(event) {
        event.target ??= element;
        event.currentTarget = element;
        for (const listener of listeners.get(event.type) ?? []) {
          listener(event);
        }
      },
      click() {
        element.dispatchEvent({ type: "click", target: element });
      },
      focus() {
        document.activeElement = element;
      },
      setAttribute(name, value) {
        attributes.set(name, String(value));
      },
      getAttribute(name) {
        return attributes.get(name) ?? null;
      },
      removeAttribute(name) {
        attributes.delete(name);
      },
      classList: {
        toggle(name, force) {
          const next = force ?? !classes.has(name);
          if (next) classes.add(name);
          else classes.delete(name);
          return next;
        },
        contains(name) {
          return classes.has(name);
        },
      },
      querySelector(selector) {
        if (selector === "a[href]") {
          return element.children.find((child) => child.tagName === "A") ?? null;
        }
        return null;
      },
      querySelectorAll(selector) {
        if (selector.includes("a[href]")) {
          return element.children.filter((child) => child.tagName === "A");
        }
        return [];
      },
      contains(target) {
        return target === element || element.children.some((child) => child.contains(target));
      },
      closest(selector) {
        if (selector === "a[href]" && element.tagName === "A") return element;
        if (selector === "#nav" && element.parent === nav) return nav;
        return null;
      },
    };
    return element;
  };

  const app = createElement("main");
  const snapshotState = createElement("div");
  const nav = createElement("nav");
  const navToggle = createElement("button");
  const links = ["overview", "state", "wayfinding", "delivery", "history", "documents", "relations"].map(
    (view) => {
      const link = createElement("a");
      link.dataset.view = view;
      link.setAttribute("href", `?view=${view}`);
      link.parent = nav;
      nav.children.push(link);
      return link;
    },
  );

  document.querySelector = (selector) => {
    if (selector === "#app") return app;
    if (selector === "#snapshot-state") return snapshotState;
    if (selector === "#nav") return nav;
    if (selector === "#nav-toggle") return navToggle;
    return null;
  };
  document.querySelectorAll = (selector) =>
    selector === "#nav a" ? links : [];

  const window = {
    location: { search: "" },
    scrollY: 0,
    scrollTo() {},
    history: { pushState() {} },
    addEventListener() {},
  };
  return { document, window, nav, navToggle, links };
}

test("overview projection follows the guided reading order and honors unconfigured sources", async (t) => {
  const root = await projectFixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const snapshot = await createSnapshot(root);

  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.snapshot.status, "fresh");
  assert.equal(snapshot.project.root, ".");

  const overview = snapshot.overview;
  assert.equal(overview.identity.name, "Fixture Project");
  assert.equal(overview.identity.summary, "A project summary for the overview.");
  assert.equal(overview.identity.root, ".");
  assert.deepEqual(overview.identity.packages, ["package:dashboard"]);
  assert.deepEqual(overview.identity.scopes, ["package:dashboard", "workspace"]);
  assert.ok(!JSON.stringify(overview).includes("C:\\\\"));
  assert.ok(overview.identity.git.available === false || overview.identity.git.available === true);
  assert.equal(overview.attention.configured, true);
  assert.ok(overview.attention.summary.includes("暂无规则"));

  // 权威阅读路径：注意力 → 架构索引 → 领域入口。
  assert.deepEqual(
    overview.readingPath.map((item) => item.kind),
    ["AttentionDocument", "ArchitectureIndex", "ArchitectureDocument", "RequirementIndex"],
  );
  assert.ok(overview.readingPath.every((item) => item.reason));
  assert.equal(overview.readingPath[0].path, ".codestable/attention.md");

  // 当前项目地图来自当前态入口，而不是探路地图统计。
  assert.equal(overview.currentMap.configured, true);
  assert.ok(
    overview.currentMap.entries.some(
      (entry) =>
        entry.scope === "package:dashboard" &&
        entry.publicBoundary.includes("Dashboard package boundary") &&
        entry.codeAnchors.includes("dashboard/src/web/views/overview.js"),
    ),
  );

  // 语义演变保留近期有效条目的六个字段与当前依据。
  assert.equal(overview.hasHistory, true);
  assert.equal(overview.evolution.entries.length, 2);
  assert.equal(overview.evolution.entries[0].date, "2026-08-02");
  assert.equal(overview.evolution.entries[0].tag, "功能");
  assert.equal(overview.evolution.entries[0].result, "Result.");
  assert.equal(overview.evolution.entries[0].range, "workspace");
  assert.equal(overview.evolution.entries[0].reason, "reason");
  assert.ok(
    overview.evolution.entries[0].currentBasis.items.some(
      (item) => item.targetId === "ArchitectureIndex:.codestable/architecture/INDEX.md",
    ),
  );

  // 当前注意力显示对象、状态、直接原因和诊断，而不是只显示计数。
  const attentionStatuses = overview.attention.items.map((item) => item.status);
  assert.ok(attentionStatuses.includes("当前前沿"));
  assert.ok(attentionStatuses.includes("Ready"));
  assert.ok(attentionStatuses.includes("已认领"));
  assert.ok(attentionStatuses.includes("被阻塞"));
  assert.ok(
    overview.attention.items.some(
      (item) => item.kind === "Diagnostic" && item.reason.includes("missing-ticket.md"),
    ),
  );

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
  assert.equal(snapshot.overview.currentMap.configured, true);
  assert.equal(snapshot.overview.currentMap.entries.length, 1);
  assert.equal(snapshot.overview.readingPath.length, 1);

  const html = renderOverview(snapshot, {});
  assert.match(html, /overview-landing/);
  assert.match(html, /Minimal/);
  assert.match(html, /包与能力/);
  assert.match(html, /项目历史：未配置\/无资料/);
  assert.match(html, /全部文档/);
  assert.doesNotMatch(html, /工作台指标|当前项目地图|当前注意力|最近变化条目/);
});

test("all views render stable, escapable output", async (t) => {
  const root = await projectFixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const snapshot = await createSnapshot(root);
  const urlState = { view: "overview", entity: "", query: "", filters: "", depth: "" };

  const overviewHtml = renderOverview(snapshot, urlState);
  assert.match(overviewHtml, /overview-landing/);
  assert.match(overviewHtml, /包与能力/);
  assert.match(overviewHtml, /当前态/);
  assert.match(overviewHtml, /历史时间线/);
  assert.match(overviewHtml, /全部文档/);
  assert.doesNotMatch(overviewHtml, /A project summary for the overview|让项目的入口/);
  assert.match(overviewHtml, /package:dashboard/);
  assert.match(overviewHtml, /\.codestable\/architecture\/packages\/dashboard\.md/);
  assert.doesNotMatch(overviewHtml, /工作台指标|当前项目地图|语义演变|当前注意力|先读理由|missing-ticket\.md/);
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
  assert.match(historyHtml, /原因：reason/);
  assert.match(historyHtml, /共 2 条有效条目/);
  // 历史条目只保留原因与结果，不展开依据/证据/演变链。
  assert.doesNotMatch(historyHtml, /当前依据|证据/);

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

  // 有效实体阅读目标：详情视图直接显示正文与真实来源路径。
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
  assert.match(readerOkHtml, /reader-page/);
  assert.match(readerOkHtml, /Ready Item/);
  assert.match(readerOkHtml, /\.wayfinding\/sample\/decisions\/02-ready\.md/);
  assert.doesNotMatch(readerOkHtml, /查看原始 Markdown|复制路径|信息 \/ 关系|一跳关系|代码锚点|api\/entities\/.*\/raw/);
});

test("overview attention locates workspace changes", async (t) => {
  const root = await projectFixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: root });
  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "fixture"], { cwd: root });
  await writeFile(join(root, "README.md"), "# Fixture Project\nchanged\n");

  const snapshot = await createSnapshot(root);
  const change = snapshot.overview.attention.items.find(
    (item) => item.kind === "WorkspaceChange" && item.path === "README.md",
  );
  assert.ok(change);
  assert.equal(change.status, "已修改");
  assert.equal(snapshot.overview.identity.git.changes[0].path, "README.md");
  assert.match(renderOverview(snapshot), /README\.md/);
});
test("global navigation groups real documents and opens entities directly", async (t) => {
  const root = await projectFixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const snapshot = await createSnapshot(root);
  const { buildNavigation } = await import("../src/web/app.js");
  const html = buildNavigation(snapshot);

  assert.match(html, /包与能力/);
  assert.match(html, /当前态/);
  assert.match(html, /工作状态/);
  assert.match(html, /\.codestable\/architecture\/packages\/dashboard\.md/);
  assert.match(
    html,
    /href="\?view=reader&amp;entity=ArchitectureDocument%3A\.codestable%2Farchitecture%2Fpackages%2Fdashboard\.md"/,
  );
  assert.match(html, /href="\?view=history"/);
  assert.doesNotMatch(html, /代码入口|运行时 dashboard/);
});

test("mobile navigation drawer supports keyboard state and focus return", async () => {
  const { createWorkbench } = await import("../src/web/app.js");
  const dom = navigationDom();
  createWorkbench(dom);

  dom.navToggle.focus();
  let enterPrevented = false;
  dom.navToggle.dispatchEvent({
    type: "keydown",
    key: "Enter",
    preventDefault() {
      enterPrevented = true;
    },
  });
  assert.equal(enterPrevented, true);
  assert.equal(dom.navToggle.getAttribute("aria-expanded"), "true");
  assert.equal(dom.navToggle.getAttribute("aria-label"), "关闭导航");
  assert.equal(dom.nav.classList.contains("is-open"), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(dom.document.activeElement, dom.links[0]);

  dom.document.activeElement = dom.links.at(-1);
  let tabPrevented = false;
  dom.document.dispatchEvent({
    type: "keydown",
    key: "Tab",
    shiftKey: false,
    preventDefault() {
      tabPrevented = true;
    },
  });
  assert.equal(tabPrevented, true);
  assert.equal(dom.document.activeElement, dom.links[0]);

  dom.document.activeElement = dom.links[0];
  let reverseTabPrevented = false;
  dom.document.dispatchEvent({
    type: "keydown",
    key: "Tab",
    shiftKey: true,
    preventDefault() {
      reverseTabPrevented = true;
    },
  });
  assert.equal(reverseTabPrevented, true);
  assert.equal(dom.document.activeElement, dom.links.at(-1));

  let escapePrevented = false;
  dom.document.dispatchEvent({
    type: "keydown",
    key: "Escape",
    preventDefault() {
      escapePrevented = true;
    },
  });
  assert.equal(escapePrevented, true);
  assert.equal(dom.navToggle.getAttribute("aria-expanded"), "false");
  assert.equal(dom.navToggle.getAttribute("aria-label"), "打开导航");
  assert.equal(dom.nav.classList.contains("is-open"), false);
  assert.equal(dom.document.activeElement, dom.navToggle);

  let spacePrevented = false;
  dom.navToggle.dispatchEvent({
    type: "keydown",
    key: " ",
    preventDefault() {
      spacePrevented = true;
    },
  });
  assert.equal(spacePrevented, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(dom.document.activeElement, dom.links[0]);

  let linkPrevented = false;
  dom.document.dispatchEvent({
    type: "click",
    target: dom.links[1],
    preventDefault() {
      linkPrevented = true;
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(linkPrevented, true);
  assert.equal(dom.nav.classList.contains("is-open"), false);
  assert.equal(dom.document.activeElement, dom.navToggle);
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

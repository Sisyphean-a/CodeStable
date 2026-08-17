// 工单 03：受限 Markdown 渲染与实体 API 安全测试。
// 原始 HTML 文本化、危险 URL 不可点击、图片禁用、外部链接安全语义；
// API 只接受稳定实体 ID，拒绝路径穿越。

import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildProjectIndex } from "../src/project/index.js";
import { entityDetailProjection, isValidEntityId, rawContentProjection } from "../src/project/entity-detail.js";
import { createMarkdownRenderer } from "../src/server/markdown-render.js";
import { startDashboard } from "../src/dashboard.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "codestable-reader-"));
  await mkdir(join(root, ".codestable", "architecture"), { recursive: true });
  await mkdir(join(root, ".wayfinding", "sample", "decisions"), {
    recursive: true,
  });
  await writeFile(
    join(root, ".codestable", "architecture", "INDEX.md"),
    "# Fixture\n",
  );
  await writeFile(
    join(root, ".wayfinding", "sample", "map.md"),
    "# Map\n\n- [decision one](decisions/01-one.md)\n- [ghost](ghost.md)\n",
  );
  await writeFile(
    join(root, ".wayfinding", "sample", "decisions", "01-one.md"),
    "---\n状态: 打开\n认领者: \"\"\n硬依赖: []\n---\n\n# One\n\n正文 <script>alert(1)</script> 与图片 ![x](img.png)。\n\n[外链](https://example.com/a) 与 [危险](javascript:alert(1))。\n",
  );
  return root;
}

test("markdown renderer disables raw html, images and unsafe links", () => {
  const renderer = createMarkdownRenderer(
    new Map([
      ["decisions/01-one.md", { resolution: "resolved", targetId: "Decision:x" }],
      ["https://example.com/a", { resolution: "external" }],
      ["ghost.md", { resolution: "unresolved", originalTarget: "ghost.md" }],
      ["../../outside.md", { resolution: "unsafe", originalTarget: "../../outside.md" }],
    ]),
  );
  const html = renderer.render(
    "# T\n\n原始 <b>html</b> 与 <script>alert(1)</script>\n\n![alt](img.png)\n\n[内链](decisions/01-one.md) [外链](https://example.com/a) [危险](javascript:alert(1)) [幽灵](ghost.md) [越界](../../outside.md)\n",
  );

  assert.match(html, /&lt;b&gt;html&lt;\/b&gt;/); // 原始 HTML 文本化
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img/); // 没有真实 img 标签
  assert.match(html, /图片已禁用/);

  assert.match(html, /class="internal-link"/);
  assert.match(html, /href="\?view=reader&amp;entity=Decision%3Ax"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  // 危险协议与未解析目标不可点击。
  assert.match(html, /class="unresolved-link link-unresolved"/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /data-unsafe="1"/);
});

test("markdown renderer adds heading anchors matching the index", () => {
  const renderer = createMarkdownRenderer();
  const html = renderer.render(
    "# 标题一\n\n## 标题二\n\n### 标题 三\n",
    { headingAnchors: [{ anchor: "标题一" }, { anchor: "标题二" }, { anchor: "标题-三" }] },
  );
  assert.match(html, /<h1 id="标题一">/);
  assert.match(html, /<h2 id="标题二">/);
  assert.match(html, /<h3 id="标题-三">/);
});

test("entity ids reject traversal, absolute paths and drive letters", () => {
  for (const invalid of [
    "Decision:../outside.md",
    "Decision:.wayfinding/../secret.md",
    "Decision:C:\\windows\\secret.md",
    "Decision:/etc/passwd",
    "Decision:..%2F..%2Fsecret.md",
    "source:foo%5c..%5cbar",
    "source:..",
    "file:..\\..\\x",
    "not-an-id",
    "",
    "../x.md",
  ]) {
    assert.equal(isValidEntityId(invalid), false, `${invalid} must be rejected`);
  }
  for (const valid of [
    "Decision:.wayfinding/sample/decisions/01-one.md",
    "source:.codestable/architecture/INDEX.md",
    "HistoryEntry:.codestable/history/2026-08.md:2026-08-01:1",
    "GitCommit:0c96a190",
    "CodeAnchor:dashboard/src/dashboard.js",
    "file:dashboard/src/dashboard.js",
  ]) {
    assert.equal(isValidEntityId(valid), true, `${valid} must be accepted`);
  }
});

test("entity detail and raw projections expose content, relations and diagnostics", async (t) => {
  const root = await fixture();
  t.after(() =>
    rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
  );
  const index = await buildProjectIndex(root);

  const detail = entityDetailProjection(
    index,
    "Decision:.wayfinding/sample/decisions/01-one.md",
  );
  assert.ok(detail);
  assert.equal(detail.kind, "Decision");
  assert.equal(detail.hasMarkdown, true);
  assert.equal(detail.source.path, ".wayfinding/sample/decisions/01-one.md");
  assert.match(detail.contentHtml, /&lt;script&gt;alert/);
  assert.match(detail.contentHtml, /图片已禁用/);
  assert.ok(detail.headings.length >= 1);
  assert.ok(Array.isArray(detail.relations.outgoing));
  assert.ok(
    detail.relations.incoming.some((relation) => relation.kind === "contains"),
  );
  const raw = rawContentProjection(index, detail.id);
  assert.ok(raw);
  assert.match(raw.content, /状态: 打开/);
  assert.match(raw.contentType, /text\/plain/);

  // 无正文实体（GitCommit）无 raw。
  const gitCommit = index.entities.find((entity) => entity.kind === "GitCommit");
  if (gitCommit) {
    assert.equal(rawContentProjection(index, gitCommit.id), null);
  }

  // 不存在的实体返回 null。
  assert.equal(entityDetailProjection(index, "Decision:missing.md"), null);
});

test("entity API serves detail and raw, rejects invalid ids and missing entities", async (t) => {
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

  const id = "Decision:.wayfinding/sample/decisions/01-one.md";
  const encoded = encodeURIComponent(id);

  const detailResponse = await fetch(`${dashboard.address}/api/entities/${encoded}`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.headers.get("x-content-type-options"), "nosniff");
  const detail = await detailResponse.json();
  assert.equal(detail.id, id);
  assert.equal(detail.kind, "Decision");
  assert.ok(detail.contentHtml);

  const rawResponse = await fetch(`${dashboard.address}/api/entities/${encoded}/raw`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(rawResponse.status, 200);
  assert.match(rawResponse.headers.get("content-type"), /text\/plain/);
  const raw = await rawResponse.text();
  assert.match(raw, /状态: 打开/);

  // 非法 ID：400。
  for (const bad of [
    encodeURIComponent("Decision:../secret.md"),
    encodeURIComponent("Decision:C:\\x"),
    encodeURIComponent("source:../x"),
    encodeURIComponent("..%2F..%2F"),
  ]) {
    const response = await fetch(`${dashboard.address}/api/entities/${bad}`, {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 400, `${bad} should be 400`);
  }

  // 不存在实体：404 且保留目标 ID。
  const missing = await fetch(`${dashboard.address}/api/entities/${encodeURIComponent("Decision:missing.md")}`, {
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(missing.status, 404);
  const missingBody = await missing.json();
  assert.equal(missingBody.entityId, "Decision:missing.md");

  // 无正文实体 raw：404。
  const gitCommit = detail.snapshot
    ? null
    : await fetch(`${dashboard.address}/api/snapshot`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
  const gitEntity = gitCommit?.entities?.find((entity) => entity.kind === "GitCommit");
  if (gitEntity) {
    const noRaw = await fetch(`${dashboard.address}/api/entities/${encodeURIComponent(gitEntity.id)}/raw`, {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(noRaw.status, 404);
  }
});

// 阅读视图：深链接实体正文（服务端受限渲染）、标题目录、原文入口、
// 复制路径与按需信息/关系检查器。无效目标保留 ID 与诊断，不静默跳转。

import { emptyState, escapeHtml, pill, sectionTitle, skeleton } from "./shared.js";

const RELATION_KIND_LABELS = {
  contains: "包含",
  "links-to": "链接",
  "depends-on": "硬依赖",
  "source-of": "来源规格",
  "current-basis": "当前依据",
  evidence: "证据",
  supersedes: "替代",
  "code-anchor": "代码锚点",
};

const RESOLUTION_LABELS = {
  resolved: "已解析",
  unresolved: "未解析",
  external: "外部",
  unsafe: "不安全",
};

// 阅读视图主渲染：detail 未加载时显示摘要骨架。
export function renderReader(snapshot, urlState, detail = null, loadError = null) {
  const target = urlState.entity ?? "";
  if (!target) {
    return `${sectionTitle("阅读")}
      <p class="empty">没有指定实体。请从列表、时间线或关系中选择一个对象。</p>
      <a class="back-link" href="?view=overview">返回概览</a>`;
  }
  if (!/^[A-Za-z][A-Za-z0-9]*:/.test(target)) {
    return `${sectionTitle("对象不可用")}
      <div class="reader-target">${escapeHtml(target)}</div>
      <p class="empty">目标不是稳定的实体 ID。</p>
      <a class="back-link" href="?view=overview">返回概览</a>`;
  }
  if (loadError === "not-found" || (detail === null && loadError === null && !isKnown(snapshot, target))) {
    return `${sectionTitle("对象不可用")}
      <div class="reader-target">${escapeHtml(target)}</div>
      <p class="empty">当前快照中不存在该实体：可能已被删除、重命名或尚未建立。未静默跳转。</p>
      <a class="back-link" href="?view=overview">返回概览</a>`;
  }
  if (loadError === "load-failed") {
    return `${sectionTitle("读取失败")}
      <div class="reader-target">${escapeHtml(target)}</div>
      <p class="empty">实体详情请求失败，显示的是摘要信息。</p>
      ${summaryView(snapshot, target)}
      <a class="back-link" href="?view=overview">返回概览</a>`;
  }
  if (detail === null) {
    return `${sectionTitle("阅读")}
      <div class="reader-target">${escapeHtml(target)}</div>
      <p class="empty">正在加载正文…</p>
      ${skeleton(6)}
      <a class="back-link" href="?view=overview">返回概览</a>`;
  }
  return detailView(detail, snapshot, urlState);
}

function isKnown(snapshot, target) {
  return snapshot.entities.some((entity) => entity.id === target);
}

function summaryView(snapshot, target) {
  const entity = snapshot.entities.find((item) => item.id === target);
  if (!entity) return "";
  return `<ul class="list">
    <li><span class="item-title">类型</span> <span class="meta">${escapeHtml(entity.kind)}</span></li>
    <li><span class="item-title">权威</span> <span class="meta">${escapeHtml(entity.authority)}</span></li>
    ${entity.path ? `<li><span class="item-title">路径</span> <span class="meta">${escapeHtml(entity.path)}</span></li>` : ""}
  </ul>`;
}

function detailView(detail, snapshot, urlState) {
  const { meta } = detail;
  const metaRows = [
    ["类型", escapeHtml(detail.kind)],
    ["权威", escapeHtml(detail.authority)],
    ["有效性", detail.validity],
  ];
  for (const key of ["state", "readiness", "owner", "scope", "date", "tag", "deliveryType", "branch", "changed", "hash"]) {
    if (meta[key] != null && meta[key] !== "") {
      metaRows.push([key, String(meta[key])]);
    }
  }
  const rawUrl = detail.hasMarkdown
    ? `/api/entities/${encodeURIComponent(detail.id)}/raw`
    : null;
  const copyPath = detail.source?.path ?? null;

  return `
    <div class="reader-head">
      <h1>${escapeHtml(detail.title)}</h1>
      <div class="reader-actions">
        ${rawUrl ? `<a class="action-link" href="${rawUrl}" target="_blank" rel="noopener noreferrer">查看原始 Markdown</a>` : ""}
        ${copyPath ? `<button type="button" class="action-link" id="copy-path" data-path="${escapeHtml(copyPath)}">复制路径</button>` : ""}
        <button type="button" class="action-link" id="inspector-toggle" aria-expanded="false" aria-controls="inspector">信息 / 关系</button>
      </div>
    </div>
    <div class="reader-meta meta">
      ${escapeHtml(detail.id)}
      ${detail.source ? ` · ${escapeHtml(detail.source.path)}` : ""}
    </div>

    <div class="reader-layout">
      <aside class="reader-side">
        <nav class="toc" aria-label="标题目录">
          ${detail.headings
            .filter((heading) => heading.level >= 1 && heading.level <= 4)
            .map(
              (heading) =>
                `<a class="toc-${heading.level}" href="#${encodeURIComponent(heading.anchor)}" data-anchor="${escapeHtml(heading.anchor)}">${escapeHtml(heading.text)}</a>`,
            )
            .join("")}
        </nav>
      </aside>
      <div class="reader-main">
        <article class="reader-content" id="reader-content">
          ${
            detail.hasMarkdown
              ? detail.contentHtml
              : `<p class="empty">该实体没有可读 Markdown 正文（${escapeHtml(detail.kind)}）。以下为结构化信息。</p>`
          }
        </article>

        <section id="inspector" class="inspector" tabindex="-1" aria-label="信息与关系检查器">
          ${sectionTitle("信息")}
          <dl class="inspector-grid">
            ${metaRows
              .map(
                ([key, value]) =>
                  `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`,
              )
              .join("")}
          </dl>

          ${sectionTitle("一跳关系")}
          ${renderRelationsList(detail.relations)}

          ${sectionTitle("诊断")}
          ${
            detail.diagnostics.length === 0
              ? '<p class="empty">无诊断。</p>'
              : detail.diagnostics
                  .map(
                    (diag) =>
                      `<div class="diag ${diag.severity === "error" ? "diag-error" : ""}">
                        <span class="diag-code">${escapeHtml(diag.code)}</span>
                        ${escapeHtml(diag.message)}
                        <span class="sub">${escapeHtml(diag.location?.path ?? "")}${diag.location?.line ? `:${diag.location.line}` : ""}</span>
                      </div>`,
                  )
                  .join("")
          }

          ${sectionTitle("快照状态")}
          <p class="sub">${snapshot.snapshot.status === "stale" ? "快照已过期；正文可能不是最新。" : "快照有效。"}</p>
        </section>
        <div id="inspector-scrim" class="inspector-scrim" hidden></div>
        <a class="back-link" href="?view=overview">返回概览</a>
      </div>
    </div>
  `;
}

function renderRelationsList(relations) {
  const items = [...relations.outgoing, ...relations.incoming];
  if (items.length === 0) {
    return '<p class="empty">未发现可验证的关系。</p>';
  }
  return `<ul class="list">${items
    .map((relation) => {
      const kindLabel = RELATION_KIND_LABELS[relation.kind] ?? relation.kind;
      const tone =
        relation.resolution === "resolved"
          ? "ok"
          : relation.resolution === "external"
            ? "neutral"
            : "warn";
      const target =
        relation.resolution === "resolved" && relation.to
          ? `<a href="?view=reader&entity=${encodeURIComponent(relation.to)}">${escapeHtml(relation.targetTitle ?? relation.to)}</a>`
          : `<span class="sub">${escapeHtml(relation.originalTarget ?? "（无目标）")}</span>`;
      const direction =
        relation.direction === "incoming"
          ? '<span class="sub">被引用</span>'
          : '<span class="sub">引用</span>';
      return `<li>
        ${direction}
        <span class="meta">${escapeHtml(kindLabel)}</span>
        ${target}
        ${pill(RESOLUTION_LABELS[relation.resolution] ?? relation.resolution, tone)}
        <span class="sub">${escapeHtml(relation.provenance?.field ?? "")}</span>
      </li>`;
    })
    .join("")}</ul>`;
}

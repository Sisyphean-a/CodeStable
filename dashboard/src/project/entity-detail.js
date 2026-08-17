// 实体详情与原始内容投影：API 只接受稳定实体 ID，不接收任意路径。

import { createMarkdownRenderer } from "../server/markdown-render.js";

// 稳定 ID 形状：`<kind>:<relpath>`、`source:<relpath>`、`file:<relpath>`、
// `HistoryEntry:<relpath>:<date>:<seq>`、`GitCommit:<hash>`、`CodeAnchor:<symbol>`。
// 拒绝绝对路径、`..` 段与盘符（路径穿越）。
export function isValidEntityId(entityId) {
  if (typeof entityId !== "string" || entityId === "" || entityId.length > 1024) {
    return false;
  }
  const rest = entityId.slice(entityId.indexOf(":") + 1);
  const restLower = rest.toLowerCase();
  if (
    rest.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(rest) ||
    rest.split("/").includes("..") ||
    rest.includes("\\") ||
    restLower.includes("%2f") ||
    restLower.includes("%5c") ||
    restLower.includes("..")
  ) {
    return false;
  }
  return /^[A-Za-z][A-Za-z0-9]*:/.test(entityId);
}

// 一跳关系：出向 + 入向（反向引用由同一关系派生）。
function oneHopRelations(relations, entitiesById, entityId) {
  const project = (relation, direction) => {
    const target = relation.to ? entitiesById.get(relation.to) : null;
    return {
      id: relation.id,
      kind: relation.kind,
      direction,
      to: relation.to,
      targetTitle: target?.title ?? null,
      targetKind: target?.kind ?? null,
      resolution: relation.resolution,
      originalTarget: relation.originalTarget ?? null,
      provenance: relation.provenance,
    };
  };
  const outgoing = relations
    .filter((relation) => relation.from === entityId)
    .map((relation) => project(relation, "outgoing"))
    .sort(byKindThenTarget);
  const incoming = relations
    .filter((relation) => relation.to === entityId)
    .map((relation) => project(relation, "incoming"))
    .sort(byKindThenTarget);
  return { outgoing, incoming };
}

// 实体详情：元信息、受限渲染正文、标题目录、一跳关系与诊断。
export function entityDetailProjection(index, entityId) {
  const entity = index.entities.find((item) => item.id === entityId);
  if (!entity) return null;

  const sourcesById = new Map(
    index.sources.map((source) => [source.id, source]),
  );
  const entitiesById = new Map(index.entities.map((item) => [item.id, item]));

  const source = entity.source ? sourcesById.get(entity.source.id) : null;

  // 正文链接映射：来源文件的 links-to 关系（resolved → 内部实体）。
  const linkMap = new Map();
  if (source) {
    for (const relation of index.relations) {
      if (
        relation.kind === "links-to" &&
        relation.from === source.id &&
        relation.originalTarget
      ) {
        linkMap.set(relation.originalTarget, {
          resolution: relation.resolution,
          targetId: relation.to ?? null,
          originalTarget: relation.originalTarget,
        });
      }
    }
  }

  const hasMarkdown = source !== null && source.content !== "";
  const renderer = createMarkdownRenderer(linkMap);
  const meta = { ...entity };
  delete meta.source;
  const detail = {
    id: entity.id,
    kind: entity.kind,
    title: entity.title,
    authority: entity.authority,
    validity: entity.validity,
    source: source
      ? {
          id: source.id,
          path: source.path,
          category: source.category,
          modifiedAt: source.modifiedAt,
        }
      : null,
    meta,
    hasMarkdown,
    headings: source?.headings ?? [],
    relations: oneHopRelations(index.relations, entitiesById, entity.id),
    diagnostics: (index.diagnostics ?? []).filter(
      (diagnostic) =>
        diagnostic.source === entity.id ||
        diagnostic.source === source?.id ||
        diagnostic.relatedTarget === entity.id,
    ),
  };
  if (hasMarkdown) {
    const renderer = createMarkdownRenderer(linkMap);
    detail.contentHtml = renderer.render(source.content, {
      headingAnchors: source.headings,
    });
  }
  return detail;
}

// 原始 Markdown：text/plain 同源只读呈现；无正文实体返回 null。
export function rawContentProjection(index, entityId) {
  const entity = index.entities.find((item) => item.id === entityId);
  if (!entity?.source) return null;
  const source = index.sources.find((item) => item.id === entity.source.id);
  if (!source) return null;
  return {
    path: source.path,
    content: source.raw ?? source.content,
    contentType: "text/plain; charset=utf-8",
  };
}

function byKindThenTarget(left, right) {
  if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
  return String(left.to ?? left.originalTarget ?? "").localeCompare(
    String(right.to ?? right.originalTarget ?? ""),
  );
}

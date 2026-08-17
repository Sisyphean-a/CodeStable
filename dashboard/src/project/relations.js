// 正式关系：只来自目录契约、规范字段、Markdown 链接、当前依据、来源、
// evidence、代码锚点和可验证 Git 事实。反向引用由同一关系派生，不重复存储。

import { lstat } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve } from "node:path";

import { extractLinks } from "./markdown.js";
import { DiagnosticCodes } from "./diagnostics.js";

const EXTERNAL_URL = /^(https?:|mailto:|ftp:|data:|tel:)/i;
const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;
const ANCHOR_ONLY = /^#/;

const RELATION_KINDS = new Set([
  "contains",
  "links-to",
  "depends-on",
  "source-of",
  "current-basis",
  "evidence",
  "supersedes",
  "code-anchor",
]);

// ctx: { projectRoot, sources, sourcesByPath, entities, entitiesByPath,
//         entityIndex, diagnostics, git: { available, headHash } }
export async function buildRelations(ctx) {
  const relations = [];
  let sequence = 0;
  const push = (from, to, kind, provenance, resolution, originalTarget) => {
    if (!from || !RELATION_KINDS.has(kind)) return;
    sequence += 1;
    relations.push({
      id: `rel:${sequence}`,
      from,
      to,
      kind,
      provenance,
      resolution,
      ...(originalTarget != null ? { originalTarget } : {}),
    });
  };

  await addDirectoryContainment(ctx, push);
  await addDependencies(ctx, push);
  await addSourceOf(ctx, push);
  await addSupersedes(ctx, push);
  await addMarkdownLinks(ctx, push);
  await addHistoryBasisAndEvidence(ctx, push);
  await addCodeAnchors(ctx, push);

  return relations.sort((left, right) => left.id.localeCompare(right.id));
}

// 目录契约包含关系：地图包含决策项与内嵌交付面；交付面包含规格与 tickets。
// 子对象 sourceOrder 优先使用父文档中的显式链接顺序，其次按规范化路径。
async function addDirectoryContainment(ctx, push) {
  const { entities, entitiesByPath, sourcesByPath } = ctx;
  for (const entity of entities) {
    if (entity.kind !== "DecisionMap") continue;
    const mapDir = dirname(entity.id.replace(/^DecisionMap:/, ""));
    const decisionPaths = [];
    for (const [path, id] of entitiesByPath) {
      if (!id.startsWith("Decision:")) continue;
      if (dirname(path) === mapDir || path.startsWith(`${mapDir}/decisions/`)) {
        decisionPaths.push(path);
      }
    }
    const linkedOrder = await linkOrderFor(ctx, entity, mapDir);
    for (const path of sortByLinkOrder(decisionPaths, linkedOrder)) {
      push(
        entity.id,
        `Decision:${path}`,
        "contains",
        { source: entity.source?.id, field: "decisions 目录" },
        "resolved",
      );
    }
    const deliveryDir = `${mapDir}/delivery`;
    if (ctx.sourcesByPath.has(`${deliveryDir}/spec.md`)) {
      push(
        entity.id,
        `Delivery:${deliveryDir}`,
        "contains",
        { source: entity.source?.id, field: "delivery 目录" },
        "resolved",
      );
    }
  }

  for (const entity of entities) {
    if (entity.kind !== "Delivery") continue;
    const deliveryPath = entity.id.replace(/^Delivery:/, "");
    const specPath = `${deliveryPath}/spec.md`;
    if (ctx.sourcesByPath.has(specPath)) {
      push(
        entity.id,
        `Specification:${specPath}`,
        "contains",
        { source: entity.source?.id, field: "spec.md" },
        "resolved",
      );
    }
    const ticketPaths = [];
    for (const [path, id] of entitiesByPath) {
      if (!id.startsWith("Ticket:")) continue;
      if (dirname(path) === deliveryPath || path.startsWith(`${deliveryPath}/tickets/`)) {
        ticketPaths.push(path);
      }
    }
    const specSourceId = ctx.sourcesByPath.get(specPath);
    const specSource = specSourceId ? ctx.sourcesById.get(specSourceId) : null;
    const linkedOrder = new Map();
    if (specSource) {
      for (const link of extractLinks(specSource.content)) {
        const resolvedPath = await resolveRelativeTarget(ctx, specPath, link.href);
        if (resolvedPath?.resolution === "resolved") {
          linkedOrder.set(resolvedPath.targetPath, link);
        }
      }
    }
    for (const path of sortByLinkOrder(ticketPaths, linkedOrder)) {
      push(
        entity.id,
        `Ticket:${path}`,
        "contains",
        { source: specPath ? `source:${specPath}` : null, field: "tickets 目录" },
        "resolved",
      );
    }
  }
}

async function linkOrderFor(ctx, entity, dir) {
  const mapSource = entity.source ? ctx.sourcesById.get(entity.source.id) : null;
  const order = new Map();
  if (!mapSource) return order;
  for (const link of extractLinks(mapSource.content)) {
    const resolvedPath = await resolveRelativeTarget(ctx, mapSource.path, link.href);
    if (resolvedPath?.resolution === "resolved") {
      const path = resolvedPath.targetPath;
      if (dirname(path) === dir) order.set(path, link);
    }
  }
  return order;
}

function sortByLinkOrder(paths, linkedOrder) {
  return [...paths].sort((left, right) => {
    const leftLink = linkedOrder.get(left);
    const rightLink = linkedOrder.get(right);
    if (leftLink && rightLink) {
      const leftIndex = leftLink.index;
      const rightIndex = rightLink.index;
      if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    }
    if (leftLink && !rightLink) return -1;
    if (rightLink && !leftLink) return 1;
    return left.localeCompare(right);
  });
}

// 硬依赖：Decision/Ticket 的 `硬依赖` 字段；缺失目标保留 unresolved 与诊断。
async function addDependencies(ctx, push) {
  const { entities, diagnostics } = ctx;
  for (const entity of entities) {
    if (entity.kind !== "Decision" && entity.kind !== "Ticket") continue;
    const source = entity.source ? ctx.sourcesById.get(entity.source.id) : null;
    const fieldValue = source?.frontmatter["硬依赖"];
    const targets = splitFieldList(fieldValue);
    for (const target of targets) {
      const fromPath = entity.id.replace(/^[^:]+:/, "");
      const resolved = await resolveRelativeTarget(ctx, fromPath, target);
      const provenance = {
        source: entity.source?.id,
        field: "硬依赖",
        ...(source ? { text: target } : {}),
      };
      if (resolved?.resolution === "resolved") {
        push(entity.id, resolved.targetId, "depends-on", provenance, "resolved");
      } else {
        const resolution = resolved?.resolution ?? "unresolved";
        push(entity.id, null, "depends-on", provenance, resolution, target);
        if (resolution === "unsafe") {
          diagnostics.error(
            DiagnosticCodes.PathEscape,
            entity.id,
            { path: fromPath },
            `硬依赖越界或不安全路径: ${target}`,
            target,
          );
        } else {
          diagnostics.error(
            DiagnosticCodes.MissingDependency,
            entity.id,
            { path: fromPath },
            `硬依赖目标不存在或无法解析: ${target}`,
            target,
          );
        }
      }
    }
  }
}

// 来源规格：Ticket 的 `来源规格` 字段指向其 Specification。
async function addSourceOf(ctx, push) {
  const { entities } = ctx;
  for (const entity of entities) {
    if (entity.kind !== "Ticket") continue;
    const source = entity.source ? ctx.sourcesById.get(entity.source.id) : null;
    const fieldValue = source?.frontmatter["来源规格"];
    if (!fieldValue) continue;
    const resolved = await resolveRelativeTarget(ctx, entity.id.replace(/^Ticket:/, ""), fieldValue);
    if (resolved?.resolution === "resolved") {
      push(entity.id, resolved.targetId, "source-of", {
        source: entity.source?.id,
        field: "来源规格",
        text: fieldValue,
      }, "resolved");
    } else {
      push(entity.id, null, "source-of", {
        source: entity.source?.id,
        field: "来源规格",
        text: fieldValue,
      }, resolved?.resolution ?? "unresolved", fieldValue);
    }
  }
}

// ADR 替代：`superseded-by` 指向的 ADR。
async function addSupersedes(ctx, push) {
  const { entities } = ctx;
  for (const entity of entities) {
    if (entity.kind !== "ADR") continue;
    const source = entity.source ? ctx.sourcesById.get(entity.source.id) : null;
    const fieldValue = source?.frontmatter["superseded-by"];
    if (!fieldValue) continue;
    const resolved = await resolveRelativeTarget(ctx, entity.id.replace(/^ADR:/, ""), fieldValue);
    if (resolved?.resolution === "resolved") {
      push(entity.id, resolved.targetId, "supersedes", {
        source: entity.source?.id,
        field: "superseded-by",
        text: fieldValue,
      }, "resolved");
    } else {
      push(entity.id, null, "supersedes", {
        source: entity.source?.id,
        field: "superseded-by",
        text: fieldValue,
      }, resolved?.resolution ?? "unresolved", fieldValue);
    }
  }
}

// Markdown 显式链接（含反向引用派生）。
async function addMarkdownLinks(ctx, push) {
  const { sources, diagnostics } = ctx;
  for (const source of sources) {
    if (!source.content) continue;
    for (const link of extractLinks(source.content)) {
      const resolved = await resolveRelativeTarget(ctx, source.path, link.href);
      const provenance = { source: source.id, field: "links", text: link.text };
      if (!resolved) {
        push(`source:${source.path}`, null, "links-to", provenance, "unresolved", link.href);
        continue;
      }
      const { resolution, targetId, targetPath } = resolved;
      if (resolution === "resolved") {
        push(`source:${source.path}`, targetId, "links-to", provenance, "resolved", link.href);
      } else if (resolution === "unresolved") {
        push(`source:${source.path}`, null, "links-to", provenance, "unresolved", link.href);
        diagnostics.warning(
          DiagnosticCodes.BadLink,
          `source:${source.path}`,
          { path: source.path, line: link.line },
          `链接目标不存在: ${link.href}`,
          link.href,
        );
      } else {
        push(`source:${source.path}`, null, "links-to", provenance, resolution, link.href);
        if (resolution === "unsafe") {
          diagnostics.error(
            DiagnosticCodes.PathEscape,
            `source:${source.path}`,
            { path: source.path, line: link.line },
            `链接越界或不安全路径: ${link.href}`,
            link.href,
          );
        }
      }
    }
  }
}

// 历史条目：当前依据（current-basis）与证据（evidence）中的可定位目标。
async function addHistoryBasisAndEvidence(ctx, push) {
  const { entities } = ctx;
  for (const entity of entities) {
    if (entity.kind !== "HistoryEntry") continue;
    const source = entity.source ? ctx.sourcesById.get(entity.source.id) : null;
    const fromPath = source?.path;
    if (!fromPath) continue;
    if (entity.currentBasis) {
      for (const basis of entity.currentBasis.items) {
        const href = basis.href ?? basis.text;
        const resolved = await resolveRelativeTarget(ctx, fromPath, href);
        if (resolved?.resolution === "resolved") {
          push(entity.id, resolved.targetId, "current-basis", {
            source: entity.source?.id,
            field: "当前依据",
            text: basis.text,
          }, "resolved");
        } else {
          push(entity.id, null, "current-basis", {
            source: entity.source?.id,
            field: "当前依据",
            text: basis.text,
          }, resolved?.resolution ?? "unresolved", href);
        }
      }
    }
    if (entity.evidence) {
      for (const item of entity.evidence.items) {
        if (item.type === "commit") {
          const commitId = `GitCommit:${item.hash}`;
          if (ctx.knownCommits.has(item.hash)) {
            push(entity.id, commitId, "evidence", {
              source: entity.source?.id,
              field: "证据",
              text: item.text,
            }, "resolved");
          } else {
            push(entity.id, null, "evidence", {
              source: entity.source?.id,
              field: "证据",
              text: item.text,
            }, "unresolved", item.text);
          }
        } else if (item.type === "path" && item.href) {
          const resolved = await resolveRelativeTarget(ctx, fromPath, item.href);
          if (resolved?.resolution === "resolved") {
            push(entity.id, resolved.targetId, "evidence", {
              source: entity.source?.id,
              field: "证据",
              text: item.text,
            }, "resolved");
          } else {
            push(entity.id, null, "evidence", {
              source: entity.source?.id,
              field: "证据",
              text: item.text,
            }, resolved?.resolution ?? "unresolved", item.text);
          }
        } else if (item.type === "external") {
          push(entity.id, null, "evidence", {
            source: entity.source?.id,
            field: "证据",
            text: item.text,
          }, "external", item.text);
        }
      }
    }
  }
}

// 代码锚点：当前态文档中 frontmatter `code-paths` 或 `## 代码锚点` 小节列出的路径。
async function addCodeAnchors(ctx, push) {
  const { entities, entitiesByPath } = ctx;
  for (const entity of entities) {
    if (!["ArchitectureIndex", "ArchitectureDocument", "RequirementIndex", "RequirementDocument", "ADR", "AttentionDocument"].includes(entity.kind)) continue;
    const source = entity.source ? ctx.sourcesById.get(entity.source.id) : null;
    if (!source) continue;
    const anchors = [];
    const codePaths = source.frontmatter["code-paths"];
    if (codePaths) {
      for (const line of codePaths.split("\n")) {
        anchors.push(stripBackticks(line));
      }
    }
    for (const line of sectionLines(source.content, "代码锚点")) {
      anchors.push(stripBackticks(line));
    }
    for (const anchor of anchors) {
      const symbol = anchor.trim();
      if (!symbol) continue;
      // 代码锚点是仓库相对路径：先按仓库相对解析，再回退相对文档目录。
      const resolved =
        (await classifyTarget(ctx, symbol)) ??
        (await resolveRelativeTarget(ctx, source.path, symbol));
      const anchorId = `CodeAnchor:${normalizeTargetPath(symbol, source.path)}`;
      if (resolved?.resolution === "resolved") {
        push(entity.id, anchorId, "code-anchor", {
          source: source.id,
          field: "代码锚点",
          text: symbol,
        }, "resolved");
      } else if (resolved?.resolution === "unresolved") {
        push(entity.id, null, "code-anchor", {
          source: source.id,
          field: "代码锚点",
          text: symbol,
        }, "unresolved", symbol);
      } else {
        push(entity.id, null, "code-anchor", {
          source: source.id,
          field: "代码锚点",
          text: symbol,
        }, resolved?.resolution ?? "unsafe", symbol);
      }
    }
  }
}

function stripBackticks(value) {
  return value
    .replace(/^[-*]\s*/, "")
    .replace(/^`|`$/g, "")
    .replace(/^\[([^\]]*)\]\(([^)]+)\)$/, "$1")
    .trim();
}

function sectionLines(body, title) {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start < 0) return [];
  const result = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line.trim())) break;
    if (line.trim().startsWith("<!--")) continue;
    const text = line.trim();
    if (text.startsWith("- ")) result.push(text.slice(2));
  }
  return result;
}

// ---- 目标解析 ----

// 解析相对来源文件的链接目标。
// 返回 { resolution, targetId?, targetPath? }；无匹配时返回 null（仅锚点时）。
async function resolveRelativeTarget(ctx, fromPath, rawTarget) {
  const target = (rawTarget ?? "").trim();
  if (!target) return null;
  if (ANCHOR_ONLY.test(target)) {
    const source = ctx.sourcesByPath.get(fromPath);
    const anchor = target.slice(1);
    const found = source?.headings.some((heading) => heading.anchor === anchor);
    return found
      ? { resolution: "resolved", targetId: ctx.entitiesByPath.get(`source:${fromPath}`) ?? `source:${fromPath}`, targetPath: fromPath }
      : { resolution: "unresolved", targetPath: fromPath };
  }
  if (EXTERNAL_URL.test(target)) {
    return { resolution: "external" };
  }
  if (target.startsWith("/") || WINDOWS_ABSOLUTE.test(target)) {
    return { resolution: "unsafe" };
  }

  const absFrom = join(ctx.projectRoot, ...fromPath.split("/"));
  const absTarget = normalize(join(dirname(absFrom), ...target.split("/")));
  const rel = relative(ctx.projectRoot, absTarget);
  if (rel.startsWith("..") || rel === "") {
    return { resolution: "unsafe" };
  }
  const targetPath = rel.replace(/\\/g, "/");
  return classifyTarget(ctx, targetPath);
}

async function classifyTarget(ctx, targetPath) {
  const entityId = ctx.entitiesByPath.get(targetPath);
  if (entityId) {
    return { resolution: "resolved", targetId: entityId, targetPath };
  }
  const sourceId = ctx.sourcesByPath.get(targetPath);
  if (sourceId) {
    return { resolution: "resolved", targetId: sourceId, targetPath };
  }
  // 非 Markdown 文件：以 file: locator 为端点；存在性经文件探测确认。
  if ((await ctx.fileProbe(targetPath)) || ctx.fileExists.has(targetPath)) {
    return { resolution: "resolved", targetId: `file:${targetPath}`, targetPath };
  }
  return { resolution: "unresolved", targetPath };
}

function normalizeTargetPath(symbol, fromPath) {
  if (WINDOWS_ABSOLUTE.test(symbol) || symbol.startsWith("/")) {
    return symbol.replace(/\\/g, "/");
  }
  if (symbol.startsWith("../") || symbol.startsWith("./")) {
    const absFrom = join(process.cwd(), ...fromPath.split("/"));
    const absTarget = normalize(join(dirname(absFrom), ...symbol.split("/")));
    return relative(process.cwd(), absTarget).replace(/\\/g, "/");
  }
  return symbol.replace(/\\/g, "/");
}

function splitFieldList(value) {
  if (value == null) return [];
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  const result = [];
  for (const line of lines) {
    if (line.startsWith("[")) {
      const inner = line.slice(1, line.endsWith("]") ? -1 : undefined);
      result.push(...inner.split(",").map((part) => part.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean));
    } else {
      result.push(line);
    }
  }
  return result;
}

export async function isSymlinkPath(projectRoot, relativePath) {
  let cursor = join(projectRoot, ...relativePath.split("/"));
  while (true) {
    try {
      const metadata = await lstat(cursor);
      return metadata.isSymbolicLink();
    } catch {
      const parent = dirname(cursor);
      if (parent === cursor) return false;
      cursor = parent;
    }
  }
}

export { extractLinks };

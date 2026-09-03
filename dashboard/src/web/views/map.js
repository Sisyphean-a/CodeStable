// 节点地图：文档是节点，明确关系是边。
// SVG 负责空间定位，下面的文字列表保证图形不是唯一的信息载体。

import { entityLink, escapeHtml, pill } from "./shared.js";

const GROUPS = ["当前态", "包与能力", "工作状态资料", "历史", "读者与技能资料"];
const GROUP_TONES = {
  "当前态": "current",
  "包与能力": "package",
  "工作状态资料": "work",
  历史: "history",
  "读者与技能资料": "reader",
};
const RELATION_LABELS = {
  contains: "归属",
  "links-to": "链接",
  "depends-on": "依赖",
  "source-of": "来源",
  "current-basis": "当前依据",
  evidence: "证据",
};

const NODE_WIDTH = 226;
const NODE_HEIGHT = 62;
const COLUMN_GAP = 70;
const ROW_GAP = 14;
const PADDING = 26;
const MAX_RENDERED_NODES = 120;
const MAX_RENDERED_EDGES = 240;

export function renderMap(snapshot, urlState = {}) {
  const map = snapshot.documentMap ?? { nodes: [], edges: [], counts: {} };
  const query = String(urlState.mapQuery ?? "").trim().toLowerCase();
  const allNodes = map.nodes ?? [];
  const matchingNodes = query
    ? allNodes.filter((node) => nodeMatches(node, query))
    : allNodes;
  const renderedNodes = matchingNodes.slice(0, MAX_RENDERED_NODES);
  const renderedNodeIds = new Set(renderedNodes.map((node) => node.id));
  const edges = (map.edges ?? []).filter((edge) => {
    if (!renderedNodeIds.has(edge.from)) return false;
    return !edge.to || renderedNodeIds.has(edge.to);
  }).slice(0, MAX_RENDERED_EDGES);
  const focused = urlState.entity ?? "";
  const focusedRelated = relatedNodeIds(focused, map.edges ?? []);

  return `<section class="map-page">
    <header class="map-header">
      <div>
        <p class="eyebrow">LIBRARY / MAP</p>
        <h1>节点地图</h1>
        <p class="library-lede">只显示可打开文档和有来源的资料关系。</p>
      </div>
      <a class="button button-quiet" href="?view=documents">返回全部文档</a>
    </header>
    <form id="map-filter" class="map-search search-form" data-target-view="map" role="search">
      <label class="sr-only" for="map-search-input">筛选地图节点</label>
      <span class="search-mark" aria-hidden="true">⌕</span>
      <input id="map-search-input" name="mapQuery" type="search" value="${escapeHtml(urlState.mapQuery ?? "")}" placeholder="按标题、路径、包或范围聚焦…">
      <button type="submit">聚焦</button>
      ${query ? '<a class="clear-link" href="?view=map">清除</a>' : ""}
    </form>
    <div class="map-summary">
      <span>${matchingNodes.length} / ${allNodes.length} 个节点</span>
      <span>${map.counts?.edges ?? (map.edges ?? []).length} 条明确关系</span>
      ${(map.counts?.unresolved ?? 0) > 0 ? `<span class="map-warning">${map.counts.unresolved} 条关系未解析</span>` : ""}
    </div>
    ${matchingNodes.length === 0
      ? '<div class="empty-panel"><p>没有匹配的文档节点。</p><a href="?view=map">清除聚焦，查看全部节点</a></div>'
      : `${renderLegend()}${renderSvg(renderedNodes, edges, focused, focusedRelated)}${renderTruncation(matchingNodes.length, renderedNodes.length, edges.length, map.edges?.length ?? 0)}${renderEdgeList(edges, map.nodes ?? [])}`}
  </section>`;
}

function nodeMatches(node, query) {
  return [node.title, node.path, node.group, node.kind, node.scope]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function relatedNodeIds(entityId, edges) {
  const ids = new Set();
  if (!entityId) return ids;
  for (const edge of edges) {
    if (edge.from === entityId && edge.to) ids.add(edge.to);
    if (edge.to === entityId) ids.add(edge.from);
  }
  return ids;
}

function renderLegend() {
  return `<div class="map-legend" aria-label="地图图例">
    ${GROUPS.map((group) => `<span><i class="legend-dot legend-${GROUP_TONES[group]}" aria-hidden="true"></i>${escapeHtml(group)}</span>`).join("")}
    <span><i class="legend-line" aria-hidden="true"></i>明确关系</span>
    <span><i class="legend-line legend-dashed" aria-hidden="true"></i>未解析目标</span>
  </div>`;
}

function renderSvg(nodes, edges, focused, related) {
  const positions = layout(nodes);
  const maxColumn = Math.max(0, ...[...positions.values()].map((position) => position.column));
  const maxRow = Math.max(0, ...[...positions.values()].map((position) => position.row));
  const width = PADDING * 2 + (maxColumn + 1) * NODE_WIDTH + maxColumn * COLUMN_GAP;
  const height = PADDING * 2 + (maxRow + 1) * NODE_HEIGHT + maxRow * ROW_GAP;
  const edgeSvg = edges.map((edge) => renderEdge(edge, positions, width)).filter(Boolean).join("");
  const nodeSvg = nodes.map((node) => renderNode(node, positions.get(node.id), focused, related)).join("");
  return `<div class="map-canvas" tabindex="0" aria-label="文档节点地图，可用下方文字列表阅读关系">
    <svg class="document-map-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="文档节点地图：${nodes.length} 个节点">
      <defs><marker id="map-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><path d="M0,0 L8,3.5 L0,7 z" class="map-arrow"/></marker></defs>
      ${edgeSvg}${nodeSvg}
    </svg>
  </div>`;
}

function layout(nodes) {
  const groups = new Map(GROUPS.map((group) => [group, []]));
  for (const node of nodes) {
    const group = groups.has(node.group) ? node.group : "读者与技能资料";
    groups.get(group).push(node);
  }
  const positions = new Map();
  let column = 0;
  for (const group of GROUPS) {
    const items = groups.get(group) ?? [];
    items.sort((left, right) => left.path.localeCompare(right.path));
    items.forEach((node, row) => {
      positions.set(node.id, {
        x: PADDING + column * (NODE_WIDTH + COLUMN_GAP),
        y: PADDING + row * (NODE_HEIGHT + ROW_GAP),
        column,
        row,
      });
    });
    column += 1;
  }
  return positions;
}

function renderEdge(edge, positions, width) {
  const from = positions.get(edge.from);
  if (!from) return "";
  if (edge.to && positions.get(edge.to)) {
    const to = positions.get(edge.to);
    const x1 = from.x + NODE_WIDTH;
    const y1 = from.y + NODE_HEIGHT / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_HEIGHT / 2;
    const midX = (x1 + x2) / 2;
    const label = RELATION_LABELS[edge.kind] ?? edge.kind;
    return `<path d="M${x1} ${y1} C${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}" class="map-edge" marker-end="url(#map-arrow)"/>
      <text x="${midX}" y="${(y1 + y2) / 2 - 5}" class="map-edge-label" text-anchor="middle">${escapeHtml(label)}</text>`;
  }
  const x1 = from.x + NODE_WIDTH;
  const y = from.y + NODE_HEIGHT / 2;
  const x2 = Math.min(width - PADDING, x1 + 70);
  const label = edge.originalTarget ?? RELATION_LABELS[edge.kind] ?? "未解析";
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="map-edge map-edge-unresolved"/>
    <text x="${Math.min(x2 + 6, width - PADDING)}" y="${y - 6}" class="map-edge-label map-edge-warning">${escapeHtml(label)}</text>`;
}

function renderNode(node, position, focused, related) {
  if (!position) return "";
  const state = node.validity === "valid" ? "" : ` · ${node.validity}`;
  const classes = [
    "map-node",
    `map-node-${GROUP_TONES[node.group] ?? "reader"}`,
    node.id === focused ? "is-focused" : "",
    related.has(node.id) ? "is-related" : "",
  ].filter(Boolean).join(" ");
  const href = `?view=reader&entity=${encodeURIComponent(node.id)}`;
  return `<a href="${escapeHtml(href)}" class="${classes}" aria-label="${escapeHtml(node.title)}，${escapeHtml(node.path)}">
    <g transform="translate(${position.x},${position.y})">
      <rect width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="6"/>
      <text x="12" y="23" class="map-node-title">${escapeHtml(truncate(node.title, 27))}</text>
      <text x="12" y="43" class="map-node-path">${escapeHtml(truncate(node.path, 31))}</text>
    </g>
  </a>`;
}

function renderTruncation(matching, rendered, edgeCount, allEdges) {
  const parts = [];
  if (rendered < matching) parts.push(`节点图显示前 ${rendered} 个节点`);
  if (edgeCount < allEdges) parts.push(`关系图显示 ${edgeCount}/${allEdges} 条边`);
  return parts.length ? `<p class="map-truncation">${escapeHtml(parts.join("；"))}。完整资料仍可从<a href="?view=documents">全部文档</a>进入。</p>` : "";
}

function renderEdgeList(edges, nodes) {
  const titles = new Map(nodes.map((node) => [node.id, node.title]));
  if (edges.length === 0) return '<p class="empty">当前可见节点之间没有明确关系。</p>';
  return `<details class="map-relations" open>
    <summary>明确关系文字列表（${edges.length}）</summary>
    <ul class="document-list relation-list">${edges.map((edge) => {
      const from = titles.get(edge.from) ?? edge.from;
      const to = edge.to
        ? entityLink(edge.to, titles.get(edge.to) ?? edge.to)
        : `<span class="unresolved-target">${escapeHtml(edge.originalTarget ?? "未解析目标")}</span>`;
      const provenance = edge.provenance?.source
        ? ` · 来源 ${escapeHtml(edge.provenance.source.replace(/^source:/, ""))}`
        : "";
      const status = edge.resolution === "resolved" ? "" : pill(edge.resolution ?? "unresolved", "warn");
      return `<li class="document-row relation-row"><span>${entityLink(edge.from, from)} <span class="relation-kind">${escapeHtml(RELATION_LABELS[edge.kind] ?? edge.kind)}</span> ${to}${status}</span><span class="meta">${provenance}</span></li>`;
    }).join("")}</ul>
  </details>`;
}

function truncate(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

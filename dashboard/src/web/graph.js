// 有界、确定性的 DAG 渲染（原生 SVG）：上游在左、被依赖对象在右；
// 图例、方向、状态、截断说明与文字等价列表始终可见；图不是唯一信息载体。
// opts.edgeLabel: (edge) => string | null，在边中点渲染关系类型文字。

import { escapeHtml } from "./views/shared.js";

const NODE_WIDTH = 230;
const NODE_HEIGHT = 56;
const COLUMN_GAP = 60;
const ROW_GAP = 18;
const PADDING = 24;

const READINESS_LABELS = {
  frontier: "当前前沿",
  ready: "Ready",
  claimed: "已认领",
  blocked: "被阻塞",
  none: "",
  unknown: "未知",
};

// data: graphProjection / relationGraphProjection 输出。
export function renderDag(data, opts = {}) {
  const nodes = data.nodes ?? [];
  const edges = data.edges ?? [];

  // 列 = layer 偏移，行 = 同层按 id 排序。
  const minLayer = Math.min(0, ...nodes.map((node) => node.layer));
  const columns = new Map();
  for (const node of nodes) {
    const column = node.layer - minLayer;
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column).push(node);
  }
  for (const group of columns.values()) group.sort((a, b) => a.id.localeCompare(b.id));

  const columnIndex = new Map();
  [...columns.keys()].sort((a, b) => a - b).forEach((key, index) => columnIndex.set(key, index));
  const positions = new Map();
  for (const [column, group] of columns) {
    const x = columnIndex.get(column) * (NODE_WIDTH + COLUMN_GAP);
    group.forEach((node, row) => {
      positions.set(node.id, { x, y: row * (NODE_HEIGHT + ROW_GAP) });
    });
  }

  const width = columnIndex.size * (NODE_WIDTH + COLUMN_GAP) - COLUMN_GAP + PADDING * 2;
  const maxRows = Math.max(1, ...nodes.map((node) => positions.get(node.id).y + NODE_HEIGHT));
  const height = maxRows + PADDING * 2;

  const edgeSvg = edges
    .map((edge) => {
      const from = positions.get(edge.from);
      if (edge.to && positions.get(edge.to)) {
        const to = positions.get(edge.to);
        const x1 = from.x + NODE_WIDTH + 4;
        const y1 = from.y + NODE_HEIGHT / 2;
        const x2 = to.x - 4;
        const y2 = to.y + NODE_HEIGHT / 2;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
        const arrowAngle = Math.atan2(y2 - y1, x2 - x1);
        const arrow = arrowPoints(x2, y2, arrowAngle);
        const label = opts.edgeLabel?.(edge);
        const labelSvg = label
          ? `<text x="${midX}" y="${midY - 6}" class="dag-edge-label" text-anchor="middle">${escapeHtml(label)}</text>`
          : "";
        return `<path d="${path}" class="dag-edge" fill="none" marker-end="url(#arrowhead)"/><polygon points="${arrow}" class="dag-edge-arrow"/>${labelSvg}`;
      }
      // 未解析/外部/不安全边：从节点右侧画到固定位置，虚线 + 文本。
      const x1 = from.x + NODE_WIDTH + 4;
      const y1 = from.y + NODE_HEIGHT / 2;
      const x2 = Math.min(width - PADDING - 40, x1 + 90);
      const label = opts.edgeLabel?.(edge);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y1}" class="dag-edge-unresolved"/>
        <text x="${x2 + 4}" y="${y1 - 6}" class="dag-unresolved-label">${escapeHtml(label ?? edge.resolution ?? "未解析")}</text>`;
    })
    .join("");

  const nodeSvg = nodes
    .map((node) => {
      const pos = positions.get(node.id);
      const stateText = node.state === "closed" ? "已关闭" : node.state ?? "";
      const readinessText = READINESS_LABELS[node.readiness] ?? node.readiness ?? "";
      const label =
        node.label ??
        `${stateText}${stateText && readinessText ? " · " : ""}${readinessText}${!stateText && !readinessText && node.kind ? node.kind : ""}`;
      const title = escapeHtml(truncate(node.title, 26));
      return `<g class="dag-node${node.isSelected ? " selected" : ""}" data-entity="${escapeHtml(node.id)}" role="img" aria-label="${escapeHtml(node.title)}：${escapeHtml(label)}">
        <rect x="${pos.x}" y="${pos.y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="3"/>
        <text x="${pos.x + 10}" y="${pos.y + 22}" class="dag-node-title">${title}</text>
        <text x="${pos.x + 10}" y="${pos.y + 42}" class="dag-node-meta">${escapeHtml(label)}</text>
        ${node.owner ? `<text x="${pos.x + 10}" y="${pos.y + 52}" class="dag-node-owner">认领：${escapeHtml(truncate(node.owner, 22))}</text>` : ""}
      </g>`;
    })
    .join("");

  const svg = `<svg class="dag" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(opts.title ?? `依赖图：${data.entity}`)}（${nodes.length} 节点，${edges.length} 边）">
    <defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><polygon points="0 0, 8 3.5, 0 7" class="dag-arrow-marker"/></marker></defs>
    ${edgeSvg}${nodeSvg}
  </svg>`;

  const truncation = data.truncated && (data.truncated.nodes > 0 || data.truncated.edges > 0)
    ? `图已截断：显示 ${nodes.length}/${data.truncated.nodes + nodes.length} 节点、${edges.length}/${data.truncated.edges + edges.length} 边；剩余节点 ${data.truncated.nodes}、边 ${data.truncated.edges}。完整文字列表见下方。`
    : "";

  const legend = opts.legend ?? `<div class="dag-legend">
    <span>箭头方向：被依赖对象在右（depends-on）</span>
    <span class="legend-state">状态：已关闭 / 打开 / 未知</span>
    <span class="legend-readiness">Readiness：当前前沿 / 已认领 / 被阻塞</span>
    <span class="legend-unresolved">虚线：未解析依赖（不伪造节点）</span>
  </div>`;

  const textListHtml = renderTextList(data.textList, opts.textListTitle);

  return { svg, legend, truncation, textListHtml };
}

function renderTextList(textList, title = "完整文字依赖列表") {
  if (!textList) return "";
  const nodes = textList.nodes ?? [];
  const edges = textList.edges ?? [];
  return `<details class="dag-text-list">
    <summary>${escapeHtml(title)}（${nodes.length} 节点 / ${edges.length} 边）</summary>
    <ul class="list">
      ${nodes
        .map(
          (node) => `<li>${escapeHtml(node.title)} <span class="meta">${escapeHtml(node.id)}</span> <span class="sub">${escapeHtml(node.kind ?? node.state ?? "")}</span>${node.owner ? ` <span class="sub">认领 ${escapeHtml(node.owner)}</span>` : ""}</li>`,
        )
        .join("")}
    </ul>
    <ul class="list">
      ${edges
        .map(
          (edge) => `<li><span class="meta">${escapeHtml(edge.kind ?? "depends-on")}</span> ${escapeHtml(shortName(edge.from))} → ${edge.to ? escapeHtml(shortName(edge.to)) : `<span class="sub">${escapeHtml(edge.originalTarget ?? "（未解析）")}</span>`} <span class="sub">${escapeHtml(edge.resolution)}</span></li>`,
        )
        .join("")}
    </ul>
  </details>`;
}

function shortName(id) {
  return String(id ?? "").split(":").slice(1).join(":").split("/").at(-1) ?? id;
}

function arrowPoints(x, y, angle) {
  const size = 7;
  const left = [x - size * Math.cos(angle - 0.4), y - size * Math.sin(angle - 0.4)];
  const right = [x - size * Math.cos(angle + 0.4), y - size * Math.sin(angle + 0.4)];
  return `${x},${y} ${left[0].toFixed(1)},${left[1].toFixed(1)} ${right[0].toFixed(1)},${right[1].toFixed(1)}`;
}

function truncate(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// 局部关系图投影：以选中实体为中心，入向关系在左、出向关系在右。
// 覆盖全部正式关系 kind；20 节点/40 边有界；确定性布局；
// unresolved/external/unsafe 保留原始目标与状态，不伪造成功节点。

const MAX_NODES = 20;
const MAX_EDGES = 40;

const ALL_KINDS = [
  "contains",
  "links-to",
  "depends-on",
  "source-of",
  "current-basis",
  "evidence",
  "supersedes",
  "code-anchor",
];

function endpointTitle(endpointId, entitiesById, sourcesById) {
  if (endpointId?.startsWith("source:")) {
    const source = sourcesById.get(endpointId);
    return source?.path ?? endpointId.slice(7);
  }
  if (endpointId?.startsWith("file:")) {
    return endpointId.slice(5);
  }
  return entitiesById.get(endpointId)?.title ?? endpointId;
}

function endpointKind(endpointId, entitiesById) {
  if (endpointId?.startsWith("source:")) return "Source";
  if (endpointId?.startsWith("file:")) return "File";
  return entitiesById.get(endpointId)?.kind ?? "Unknown";
}

// options: { entity, depth, filters }；filters: "kind:links-to,kind:evidence,direction:outgoing,resolution:resolved,authority:work-state,category:work-state"
export function relationGraphProjection(index, options = {}) {
  const entityId = options.entity ?? "";
  const depth = Math.max(1, Number(options.depth) || 1);
  const filters = parseRelationFilters(options.filters);

  const entity = index.entities.find((item) => item.id === entityId);
  if (!entity) {
    return { error: "entity not found", entity: entityId, nodes: [], edges: [], textList: [] };
  }

  const sourcesById = new Map(index.sources.map((source) => [source.id, source]));
  const entitiesById = new Map(index.entities.map((item) => [item.id, item]));

  // 关系池：全部正式关系（含指向 source/file 端点的）。
  const relations = index.relations.filter((relation) =>
    applyRelationFilters(relation, filters, entityId, entitiesById, sourcesById),
  );
  const incomingOf = new Map();
  const outgoingOf = new Map();
  for (const relation of relations) {
    if (!incomingOf.has(relation.to)) incomingOf.set(relation.to, []);
    incomingOf.get(relation.to).push(relation);
    if (!outgoingOf.has(relation.from)) outgoingOf.set(relation.from, []);
    outgoingOf.get(relation.from).push(relation);
  }

  const included = new Set([entityId]);
  const includedEdgeIds = new Set();
  const layers = new Map([[entityId, 0]]);
  // 选中实体的来源端点也是可见对象（links-to 等关系挂在 source 上）。
  if (entity.source) {
    included.add(entity.source.id);
    layers.set(entity.source.id, 0);
  }
  let frontier = [entityId];
  for (let hop = 1; hop <= depth && frontier.length > 0; hop += 1) {
    const next = [];
    for (const current of [...frontier].sort()) {
      for (const relation of incomingOf.get(current) ?? []) {
        // 入向：反向引用，位于左侧（负层）。
        if (relation.from && !included.has(relation.from)) {
          included.add(relation.from);
          layers.set(relation.from, -hop);
          next.push(relation.from);
        }
        includedEdgeIds.add(relation.id);
      }
      for (const relation of outgoingOf.get(current) ?? []) {
        // 出向：目标位于右侧（正层）。
        if (relation.to && !included.has(relation.to)) {
          included.add(relation.to);
          layers.set(relation.to, hop);
          next.push(relation.to);
        }
        includedEdgeIds.add(relation.id);
      }
    }
    frontier = next;
  }

  // 未解析/外部/不安全边：保留原始目标文本，不创建伪造节点。
  const unresolvedEdges = relations.filter(
    (relation) =>
      !relation.to && included.has(relation.from) && relation.from,
  );

  const sortedNodes = [...included].sort();
  const totalNodes = sortedNodes.length;
  const keptNodes = sortedNodes.slice(0, MAX_NODES);
  const keptNodeSet = new Set(keptNodes);
  const keptEdges = [...includedEdgeIds]
    .map((id) => relations.find((relation) => relation.id === id))
    .filter(
      (relation) =>
        relation.from &&
        keptNodeSet.has(relation.from) &&
        (!relation.to || keptNodeSet.has(relation.to)),
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, MAX_EDGES);
  const keptUnresolved = unresolvedEdges
    .filter((relation) => keptNodeSet.has(relation.from))
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, MAX_EDGES - keptEdges.length);

  const nodes = keptNodes.map((id) => ({
    id,
    title: endpointTitle(id, entitiesById, sourcesById),
    kind: endpointKind(id, entitiesById),
    layer: layers.get(id) ?? 0,
    isSelected: id === entityId,
  }));

  const edges = [
    ...keptEdges.map((relation) => ({
      id: relation.id,
      from: relation.from,
      to: relation.to,
      kind: relation.kind,
      direction: relation.to === entityId ? "incoming" : "outgoing",
      resolution: "resolved",
      provenance: relation.provenance?.field ?? null,
    })),
    ...keptUnresolved.map((relation) => ({
      id: relation.id,
      from: relation.from,
      to: null,
      kind: relation.kind,
      direction: "outgoing",
      resolution: relation.resolution,
      originalTarget: relation.originalTarget ?? null,
      provenance: relation.provenance?.field ?? null,
    })),
  ];

  return {
    entity: entityId,
    depth,
    filters: Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value.length > 0),
    ),
    nodes,
    edges,
    truncated: {
      nodes: totalNodes - keptNodes.length,
      edges:
        includedEdgeIds.size -
        keptEdges.length +
        (unresolvedEdges.length - keptUnresolved.length),
      maxNodes: MAX_NODES,
      maxEdges: MAX_EDGES,
    },
    textList: {
      nodes: [...included]
        .sort()
        .map((id) => ({
          id,
          title: endpointTitle(id, entitiesById, sourcesById),
          kind: endpointKind(id, entitiesById),
        })),
      edges: [...includedEdgeIds]
        .map((id) => relations.find((relation) => relation.id === id))
        .concat(unresolvedEdges)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((relation) => ({
          id: relation.id,
          from: relation.from,
          to: relation.to,
          kind: relation.kind,
          resolution: relation.resolution,
          originalTarget: relation.originalTarget ?? null,
        })),
    },
  };
}

const FILTER_KEYS = new Set(["kind", "direction", "resolution", "authority", "category"]);

export function parseRelationFilters(filters) {
  const result = {};
  if (!filters) return result;
  for (const part of String(filters).split(",")) {
    const index = part.indexOf(":");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (FILTER_KEYS.has(key) && value) {
      if (!result[key]) result[key] = [];
      result[key].push(value);
    }
  }
  return result;
}

function applyRelationFilters(relation, filters, entityId, entitiesById, sourcesById) {
  if (filters.kind && !filters.kind.includes(relation.kind)) return false;
  if (filters.resolution && !filters.resolution.includes(relation.resolution)) return false;
  if (filters.direction) {
    const direction = relation.to === entityId ? "incoming" : "outgoing";
    if (!filters.direction.includes(direction)) return false;
  }
  if (filters.authority) {
    const authority = relation.to
      ? entitiesById.get(relation.to)?.authority
      : null;
    if (authority && !filters.authority.includes(authority)) return false;
  }
  if (filters.category) {
    const source = relation.to?.startsWith("source:")
      ? sourcesById.get(relation.to)
      : null;
    const category = source?.category ?? null;
    if (category && !filters.category.includes(category)) return false;
  }
  return true;
}

export { ALL_KINDS };

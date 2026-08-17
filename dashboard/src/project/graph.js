// 有界局部 DAG 投影：只使用 depends-on 关系；decision 与 ticket 永不混图。
// 默认聚焦选中对象及一跳上游/下游，可逐层展开；最多 20 节点、40 条边；
// 超限时确定性截断并报告剩余数；完整文字依赖列表不受图上限影响。

const MAX_NODES = 20;
const MAX_EDGES = 40;

// kind: "decision" | "ticket"
export function graphProjection(index, options = {}) {
  const entityId = options.entity ?? "";
  const kind = options.kind === "ticket" ? "Ticket" : "Decision";
  const depth = Math.max(1, Number(options.depth) || 1);

  const entity = index.entities.find((item) => item.id === entityId);
  if (!entity) {
    return {
      error: "entity not found",
      entity: entityId,
      kind,
      nodes: [],
      edges: [],
      textList: [],
    };
  }

  const kindPrefix = `${kind}:`;
  const entitiesById = new Map(index.entities.map((item) => [item.id, item]));
  const edges = index.relations
    .filter((relation) => relation.kind === "depends-on")
    .filter(
      (relation) =>
        relation.from?.startsWith(kindPrefix) &&
        (relation.to?.startsWith(kindPrefix) || relation.resolution !== "resolved"),
    );

  // 邻接表：上游边（依赖的目标）与下游边（被依赖）。
  const upstreamOf = new Map();
  const downstreamOf = new Map();
  for (const edge of edges) {
    if (!upstreamOf.has(edge.from)) upstreamOf.set(edge.from, []);
    upstreamOf.get(edge.from).push(edge);
    if (edge.to) {
      if (!downstreamOf.has(edge.to)) downstreamOf.set(edge.to, []);
      downstreamOf.get(edge.to).push(edge);
    }
  }

  // BFS 分层（确定性：按 id 排序访问）。
  const included = new Set([entityId]);
  const includedEdges = new Set();
  const layers = new Map([[entityId, 0]]);
  let frontier = [entityId];
  for (let hop = 1; hop <= depth && frontier.length > 0; hop += 1) {
    const next = [];
    for (const current of [...frontier].sort()) {
      for (const edge of upstreamOf.get(current) ?? []) {
        if (edge.to && !included.has(edge.to)) {
          included.add(edge.to);
          layers.set(edge.to, -hop);
          next.push(edge.to);
        }
        includedEdges.add(edge.id);
      }
      for (const edge of downstreamOf.get(current) ?? []) {
        if (edge.from && !included.has(edge.from)) {
          included.add(edge.from);
          layers.set(edge.from, hop);
          next.push(edge.from);
        }
        includedEdges.add(edge.id);
      }
    }
    frontier = next;
  }

  // 未解析依赖：保留为未解析边（目标文本），不伪造节点。
  const unresolvedEdges = [];
  for (const edge of edges) {
    if (!edge.to && included.has(edge.from)) {
      unresolvedEdges.push(edge);
    }
  }

  // 确定性截断：节点按 id 排序取前 MAX_NODES；边保留与已选节点相连的前 MAX_EDGES。
  const sortedNodes = [...included].sort();
  const totalNodes = sortedNodes.length;
  const keptNodes = sortedNodes.slice(0, MAX_NODES);
  const keptNodeSet = new Set(keptNodes);
  const keptEdges = [...includedEdges]
    .map((id) => edges.find((edge) => edge.id === id))
    .filter(
      (edge) => keptNodeSet.has(edge.from) && (!edge.to || keptNodeSet.has(edge.to)),
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, MAX_EDGES);
  const keptUnresolved = unresolvedEdges
    .filter((edge) => keptNodeSet.has(edge.from))
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, MAX_EDGES - keptEdges.length);

  const truncatedNodes = totalNodes - keptNodes.length;
  const truncatedEdges =
    (includedEdges.size - keptEdges.length) + (unresolvedEdges.length - keptUnresolved.length);

  const nodes = keptNodes.map((id) => {
    const item = entitiesById.get(id);
    const layer = layers.get(id) ?? 0;
    return {
      id,
      title: item?.title ?? id,
      state: item?.state ?? null,
      readiness: item?.readiness ?? null,
      owner: item?.owner ?? null,
      layer,
      isSelected: id === entityId,
    };
  });

  const edgesOut = [
    ...keptEdges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      resolution: "resolved",
    })),
    ...keptUnresolved.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: null,
      originalTarget: edge.originalTarget ?? null,
      resolution: "unresolved",
    })),
  ];

  return {
    entity: entityId,
    kind,
    depth,
    nodes,
    edges: edgesOut,
    truncated: {
      nodes: truncatedNodes,
      edges: truncatedEdges,
      maxNodes: MAX_NODES,
      maxEdges: MAX_EDGES,
    },
    // 完整文字等价列表（不受图截断影响）。
    textList: buildTextList(
      included,
      [...includedEdges]
        .map((id) => edges.find((edge) => edge.id === id))
        .concat(unresolvedEdges),
      entitiesById,
    ),
  };
}

function buildTextList(nodeIds, edgeIds, entitiesById) {
  const nodes = [...nodeIds]
    .sort()
    .map((id) => {
      const item = entitiesById.get(id);
      return {
        id,
        title: item?.title ?? id,
        state: item?.state ?? null,
        readiness: item?.readiness ?? null,
        owner: item?.owner ?? null,
      };
    });
  const edges = [...edgeIds]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      resolution: edge.resolution ?? "resolved",
      originalTarget: edge.originalTarget ?? null,
      sourceField: edge.provenance?.field ?? null,
    }));
  return { nodes, edges };
}

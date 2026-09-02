// 工作台应用：History API 路由（view/entity/query/filters/depth）、
// SSE 局部刷新与视图分发。刷新与浏览器历史不丢失共享状态；
// SSE 触发局部重取和重绘，从不整页 reload。
// 顶层不访问 DOM，parseUrl/buildUrl 可在 Node 中直接测试。

import { renderOverview } from "./views/overview.js";
import { renderState } from "./views/state.js";
import { renderWayfinding } from "./views/wayfinding.js";
import { renderDelivery } from "./views/delivery.js";
import { renderHistory } from "./views/history.js";
import { renderDocuments } from "./views/documents.js";
import { renderRelations } from "./views/relations.js";
import { renderReader } from "./views/reader.js";
import { renderMap } from "./views/map.js";

export const VIEWS = {
  overview: renderOverview,
  state: renderState,
  wayfinding: renderWayfinding,
  delivery: renderDelivery,
  history: renderHistory,
  documents: renderDocuments,
  map: renderMap,
  relations: renderRelations,
  reader: renderReader,
};

// 首页的语义是“全部资料入口”；overview 作为旧链接的兼容别名保留。
const DEFAULT_VIEW = "documents";

// URL 状态：view / entity / query / filters / depth / mapQuery（+ 历史筛选）。
export function parseUrl(search) {
  const params = new URLSearchParams(search);
  const requestedView = params.get("view");
  const view = requestedView == null
    ? DEFAULT_VIEW
    : Object.hasOwn(VIEWS, requestedView)
      ? requestedView
      : "overview";
  return {
    view,
    entity: params.get("entity") ?? "",
    query: params.get("query") ?? "",
    filters: params.get("filters") ?? "",
    depth: params.get("depth") ?? "",
    mapQuery: params.get("mapQuery") ?? "",
    theme: params.get("theme") ?? "",
    historyFilters: params.get("historyFilters") ?? "",
    unindexed: params.get("unindexed") ?? "",
  };
}

export function buildUrl(urlState = {}) {
  const params = new URLSearchParams();
  if (urlState.view && urlState.view !== DEFAULT_VIEW) params.set("view", urlState.view);
  if (urlState.entity) params.set("entity", urlState.entity);
  if (urlState.query) params.set("query", urlState.query);
  if (urlState.filters) params.set("filters", urlState.filters);
  if (urlState.depth) params.set("depth", urlState.depth);
  if (urlState.mapQuery) params.set("mapQuery", urlState.mapQuery);
  if (urlState.theme) params.set("theme", urlState.theme);
  if (urlState.historyFilters) params.set("historyFilters", urlState.historyFilters);
  if (urlState.unindexed) params.set("unindexed", urlState.unindexed);
  const search = params.toString();
  return search ? `?${search}` : `?view=${DEFAULT_VIEW}`;
}

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&#39;";
  });
}

const CURRENT_STATE_KINDS = new Set([
  "AttentionDocument",
  "ArchitectureIndex",
  "ArchitectureDocument",
  "RequirementIndex",
  "RequirementDocument",
  "ADR",
]);

function navigationItem(label, href, options = {}) {
  const view = options.view ? ` data-view="${escapeAttribute(options.view)}"` : "";
  const entity = options.entity ? ` data-entity="${escapeAttribute(options.entity)}"` : "";
  const path = options.path
    ? `<span class="nav-path">${escapeAttribute(options.path)}</span>`
    : "";
  return `<a class="nav-link" href="${escapeAttribute(href)}"${view}${entity}>
    <span class="nav-label">${escapeAttribute(label)}${path}</span>
  </a>`;
}

function navigationGroup(title, items, index, collapsed = false) {
  if (items.length === 0) return "";
  const panelId = `nav-group-${index}`;
  return `<section class="nav-group${collapsed ? " is-collapsed" : ""}">
    <button type="button" class="nav-group-toggle" data-nav-group="${index}" aria-expanded="${String(!collapsed)}" aria-controls="${panelId}">${escapeAttribute(title)}</button>
    <div id="${panelId}" class="nav-group-items">${items.join("")}</div>
  </section>`;
}

export function buildNavigation(snapshot) {
  const documents = navigationDocuments(snapshot);
  const sorted = (items) => [...items].sort((left, right) =>
    String(left.path ?? left.title).localeCompare(String(right.path ?? right.title)),
  );
  const documentLink = (document) => navigationItem(
    document.group === "包与能力" && document.scope?.startsWith("package:")
      ? document.scope
      : document.title,
    `?view=reader&entity=${encodeURIComponent(document.id)}`,
    { entity: document.id, path: document.path },
  );
  const byGroup = (group) => sorted(documents.filter((document) => document.group === group));
  const historyItems = [
    navigationItem("历史时间线", "?view=history", {
      view: "history",
      path: ".codestable/history/",
    }),
    ...byGroup("历史").map(documentLink),
  ];
  const groups = [
    navigationGroup(
      "入口",
      [
        navigationItem("全部文档", "?view=documents", { view: "documents" }),
        navigationItem("节点地图", "?view=map", { view: "map" }),
      ],
      0,
    ),
    navigationGroup("包与能力", byGroup("包与能力").map(documentLink), 1),
    navigationGroup("当前态", byGroup("当前态").map(documentLink), 2),
    navigationGroup("工作状态资料", byGroup("工作状态资料").map(documentLink), 3, true),
    navigationGroup("历史", historyItems, 4, true),
    navigationGroup("读者与技能资料", byGroup("读者与技能资料").map(documentLink), 5, true),
  ];
  return groups.join("");
}

function navigationDocuments(snapshot) {
  if (Array.isArray(snapshot?.documents)) return snapshot.documents;
  return (snapshot?.entities ?? [])
    .filter((entity) => entity.path && entity.kind !== "HistoryEntry")
    .map((entity) => ({
      ...entity,
      group: entity.path.startsWith(".codestable/architecture/packages/")
        ? "包与能力"
        : entity.kind === "HistoryDocument"
          ? "历史"
          : entity.authority === "work-state"
            ? "工作状态资料"
            : entity.authority === "current-state"
              ? "当前态"
              : "读者与技能资料",
    }));
}

// ---- 浏览器运行时（boot 前不触碰 DOM）----

export function createWorkbench(dom) {
  // window.fetch 必须以 window 为 this 调用（否则 Illegal invocation）。
  const fetchApi =
    typeof dom.fetch === "function" ? dom.fetch.bind(dom.window) : dom.fetch;
  const app = dom.document.querySelector("#app");
  const snapshotState = dom.document.querySelector("#snapshot-state");
  const nav = dom.document.querySelector("#nav");
  const navContent = dom.document.querySelector("#nav-content");
  const navToggle = dom.document.querySelector("#nav-toggle");
  const refreshButton = dom.document.querySelector("#refresh-btn");

  let snapshot = null;
  let urlState = parseUrl(dom.window.location.search);
  let scrollY = 0;
  let loadError = null;
  let readerDetail = null;
  let readerLoadError = null;
  let searchResult = null;
  let searchError = false;
  let historyData = null;
  let historyError = false;
  let graphData = null;
  let graphError = false;
  let relationData = null;
  let relationError = null;

  let navigationDrawerOpen = false;
  let navigationTrigger = null;

  function navigationFocusables() {
    if (!nav) return [];
    return [...nav.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )];
  }

  function scheduleNavigationFocus(callback) {
    if (typeof dom.window.setTimeout === "function") {
      dom.window.setTimeout(callback, 0);
    } else {
      setTimeout(callback, 0);
    }
  }

  function setNavigationDrawer(open) {
    if (!nav || !navToggle) return;
    navigationDrawerOpen = open;
    nav.classList.toggle("is-open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "关闭导航" : "打开导航");
    if (open) {
      navigationTrigger = navToggle;
      const firstLink =
        nav.querySelector("#nav-content a[href]") ?? nav.querySelector("a[href]");
      const focusFirstLink = () => {
        if (navigationDrawerOpen) firstLink?.focus();
      };
      scheduleNavigationFocus(focusFirstLink);
    } else {
      navigationTrigger?.focus();
      scheduleNavigationFocus(() => {
        if (!navigationDrawerOpen) navigationTrigger?.focus();
      });
    }
  }

  function handleNavigationKeydown(event) {
    if (!navigationDrawerOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setNavigationDrawer(false);
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = navigationFocusables();
    if (focusable.length === 0) {
      event.preventDefault();
      navToggle?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && dom.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && dom.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function bindNavigationDrawer() {
    if (!nav || !navToggle) return;
    navToggle.addEventListener("click", () => {
      setNavigationDrawer(!navigationDrawerOpen);
    });
    navToggle.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      navToggle.click();
    });
    dom.document.addEventListener("keydown", handleNavigationKeydown);
  }

  bindNavigationDrawer();

  function renderNavigation() {
    if (!navContent || snapshot === null) return;
    navContent.innerHTML = buildNavigation(snapshot);
  }

  function bindNavigationGroups() {
    nav?.addEventListener("click", (event) => {
      const toggle = event.target.closest?.("[data-nav-group]");
      if (!toggle) return;
      const group = toggle.closest?.(".nav-group");
      const panel = group?.querySelector(".nav-group-items");
      if (!group || !panel) return;
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      group.classList.toggle("is-collapsed", !open);
    });
  }

  bindNavigationGroups();

  // 手动刷新：忙碌态旋转图标，结束后恢复。
  function setRefreshBusy(busy) {
    if (!refreshButton) return;
    if (busy) refreshButton.setAttribute("data-busy", "1");
    else refreshButton.removeAttribute("data-busy");
    refreshButton.setAttribute("aria-label", busy ? "正在刷新快照" : "手动刷新快照");
  }

  // 快捷键："/" 聚焦当前视图的搜索/筛选输入框（输入态不劫持）。
  function bindShortcuts() {
    dom.document.addEventListener("keydown", (event) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const interactive =
        target instanceof dom.window.HTMLElement
          ? target.closest("input, select, textarea, [contenteditable]")
          : null;
      if (interactive) return;
      const box = dom.document.querySelector(
        "#search-input, #map-search-input, #history-theme, #relation-entity",
      );
      if (!box) return;
      event.preventDefault();
      box.focus();
      if (typeof box.select === "function") box.select();
    });
  }

  // SSE 断线/重连提示：EventSource 自动重连，这里只更新状态文案。
  function bindEventStreamStatus(events) {
    if (!events) return;
    events.addEventListener("open", () => {
      if (snapshot && snapshot.snapshot.status !== "stale") updateSnapshotState();
    });
    events.addEventListener("error", () => {
      snapshotState.innerHTML = '<span class="stale">实时连接中断，正在重连…</span>';
    });
  }

  // 快照加载失败：显示原因与重试入口，不崩溃、不静默。
  function renderLoadFailure() {
    const detail = loadError
      ? `<p class="empty">${escapeAttribute(loadError)}</p>`
      : "";
    return `<section class="identity">
      <h1>无法加载项目快照</h1>
      <p class="empty">服务可能仍在启动，或快照请求失败。刷新页面或点击重试。</p>
      ${detail}
      <p><button type="button" class="action-link" id="retry-boot">重试</button></p>
    </section>`;
  }

  function bindRetryAction() {
    const retry = dom.document.querySelector("#retry-boot");
    retry?.addEventListener("click", () => boot());
  }

  function render() {
    if (snapshot === null) {
      app.innerHTML = renderLoadFailure();
      updateNavigation();
      updateSnapshotState();
      bindRetryAction();
      return;
    }
    renderNavigation();
    const view = VIEWS[urlState.view];
    const previousScroll = dom.window.scrollY;
    if (urlState.view === "reader") {
      app.innerHTML = renderReader(snapshot, urlState, readerDetail, readerLoadError);
    } else if (urlState.view === "documents") {
      app.innerHTML = renderDocuments(snapshot, urlState, searchResult);
    } else if (urlState.view === "map") {
      app.innerHTML = renderMap(snapshot, urlState);
    } else if (urlState.view === "history") {
      app.innerHTML = renderHistory(snapshot, urlState, historyData);
    } else if (urlState.view === "wayfinding") {
      app.innerHTML = renderWayfinding(snapshot, urlState, graphData);
    } else if (urlState.view === "delivery") {
      app.innerHTML = renderDelivery(snapshot, urlState, graphData);
    } else if (urlState.view === "relations") {
      app.innerHTML = renderRelations(snapshot, urlState, relationData, relationError);
    } else {
      app.innerHTML = view(snapshot, urlState);
    }
    bindDocumentsActions();
    if (urlState.view === "map") bindMapActions();
    if (urlState.view === "history") bindHistoryActions();
    if (urlState.view === "relations") bindRelationsActions();
    dom.document.title = `${snapshot?.overview?.identity?.name ?? "CodeStable"} · 文档阅读器`;
    dom.window.scrollTo(0, previousScroll || scrollY);
    updateNavigation();
    updateSnapshotState();
  }

  // 首页与文档目录共用搜索入口；提交后进入可复制的 documents URL。
  function bindDocumentsActions() {
    const form = dom.document.querySelector("#search-form");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = form.querySelector("#search-input");
      const query = input?.value.trim() ?? "";
      const filters = collectFilters(form);
      const unindexed = form.querySelector('input[name="unindexed"]')?.checked ? "1" : "";
      scrollY = dom.window.scrollY;
      const targetView = form.dataset.targetView ?? "documents";
      urlState = {
        ...urlState,
        view: targetView,
        entity: "",
        query,
        filters: filters.join(","),
        unindexed,
      };
      dom.window.history.pushState(urlState, "", buildUrl(urlState));
      if (targetView === "documents") loadSearch();
      else render();
    });
    for (const select of form.querySelectorAll("select[name]") ?? []) {
      select.addEventListener("change", () => form.requestSubmit());
    }
    const unindexedToggle = form.querySelector('input[name="unindexed"]');
    unindexedToggle?.addEventListener("change", () => form.requestSubmit());
  }

  function bindMapActions() {
    const form = dom.document.querySelector("#map-filter");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = form.querySelector("#map-search-input")?.value.trim() ?? "";
      scrollY = dom.window.scrollY;
      urlState = { ...urlState, view: "map", entity: "", mapQuery: query };
      dom.window.history.pushState(urlState, "", buildUrl(urlState));
      render();
    });
  }

  function collectFilters(form) {
    const parts = [];
    for (const select of form.querySelectorAll("select[name]")) {
      const key = select.name;
      const values = [...select.selectedOptions]
        .map((option) => option.value)
        .filter(Boolean);
      for (const value of values) parts.push(`${key}:${value}`);
    }
    return parts;
  }

  // 结构化搜索异步加载（文档视图专用）。
  async function loadSearch() {
    searchResult = null;
    searchError = false;
    render();
    const params = new URLSearchParams();
    if (urlState.query) params.set("q", urlState.query);
    if (urlState.filters) params.set("filters", urlState.filters);
    if (urlState.unindexed === "1") params.set("unindexed", "1");
    if (params.size === 0) return;
    try {
      const response = await fetchApi(`/api/search?${params.toString()}`, {
        signal: AbortSignal.timeout(5000),
      });
      searchResult = await response.json();
    } catch (error) {
      searchError = true;
      searchResult = {
        error: error instanceof Error ? error.message : "搜索请求失败",
        query: urlState.query,
        total: 0,
        results: [],
        filters: {},
      };
    }
    render();
  }

  // 历史筛选表单：提交写入 URL 并重新查询。
  function bindHistoryActions() {
    const form = dom.document.querySelector("#history-filter");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const theme = form.querySelector("#history-theme")?.value.trim() ?? "";
      const filters = [];
      for (const field of ["date", "tag", "range"]) {
        const value = form.querySelector(`input[name="${field}"]`)?.value.trim() ?? "";
        if (value) filters.push(`${field}:${value}`);
      }
      scrollY = dom.window.scrollY;
      urlState = { ...urlState, theme, historyFilters: filters.join(",") };
      dom.window.history.pushState(urlState, "", buildUrl(urlState));
      loadHistory();
    });
  }

  // 语义历史时间线异步加载（历史视图专用）。
  async function loadHistory() {
    historyData = null;
    historyError = false;
    render();
    const params = new URLSearchParams();
    if (urlState.theme) params.set("theme", urlState.theme);
    if (urlState.historyFilters) params.set("filters", urlState.historyFilters);
    try {
      const response = await fetchApi(`/api/history?${params.toString()}`, {
        signal: AbortSignal.timeout(5000),
      });
      historyData = await response.json();
    } catch {
      historyError = true;
    }
    render();
  }

  // 关系页：实体选择与筛选写入 URL 并重新查询。
  function bindRelationsActions() {
    const form = dom.document.querySelector("#relation-pick");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const entity = form.querySelector("#relation-entity")?.value ?? "";
      const filters = collectRelationFilters(form);
      scrollY = dom.window.scrollY;
      urlState = { ...urlState, entity, filters: filters.join(","), depth: "1" };
      dom.window.history.pushState(urlState, "", buildUrl(urlState));
      loadRelations();
    });
    for (const select of form.querySelectorAll("select[name]") ?? []) {
      select.addEventListener("change", () => form.requestSubmit());
    }
  }

  function collectRelationFilters(form) {
    const parts = [];
    for (const select of form.querySelectorAll("select[name]")) {
      if (select.name === "entity") continue;
      const key = select.name;
      const values = [...select.selectedOptions]
        .map((option) => option.value)
        .filter(Boolean);
      for (const value of values) parts.push(`${key}:${value}`);
    }
    return parts;
  }

  // 局部关系图异步加载（关系视图专用）。
  async function loadRelations() {
    relationData = null;
    relationError = null;
    render();
    if (!urlState.entity) return;
    const params = new URLSearchParams({
      entity: urlState.entity,
      depth: String(Number(urlState.depth) || 1),
    });
    if (urlState.filters) params.set("filters", urlState.filters);
    try {
      const response = await fetchApi(`/api/relations?${params.toString()}`, {
        signal: AbortSignal.timeout(5000),
      });
      relationData = await response.json();
    } catch {
      relationError = "load-failed";
    }
    render();
  }

  // 依赖图异步加载（探路/交付视图，实体选中时）。
  async function loadGraph() {
    graphData = null;
    graphError = false;
    render();
    if (!urlState.entity) return;
    const kind = urlState.view === "delivery" ? "ticket" : "decision";
    try {
      const params = new URLSearchParams({
        entity: urlState.entity,
        kind,
        depth: String(Number(urlState.depth) || 1),
      });
      const response = await fetchApi(`/api/graph?${params.toString()}`, {
        signal: AbortSignal.timeout(5000),
      });
      graphData = await response.json();
    } catch {
      graphError = true;
    }
    render();
  }

  // 实体详情异步加载（阅读页专用）。
  async function loadReaderDetail(entityId) {
    readerDetail = null;
    readerLoadError = null;
    render();
    try {
      const response = await fetchApi(`/api/entities/${encodeURIComponent(entityId)}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === 404) {
        readerLoadError = "not-found";
      } else if (!response.ok) {
        readerLoadError = "load-failed";
      } else {
        readerDetail = await response.json();
      }
    } catch {
      readerLoadError = "load-failed";
    }
    render();
  }

  function updateNavigation() {
    const links = [
      ...(nav?.querySelectorAll("a[data-view], a[data-entity]") ?? []),
      ...(dom.document.querySelectorAll?.("#primary-nav a[data-view], .topbar-brand[data-view]") ?? []),
    ];
    for (const link of links) {
      const viewMatch = link.dataset.view === urlState.view;
      const entityMatch =
        urlState.view === "reader" && link.dataset.entity === urlState.entity;
      if (viewMatch || entityMatch) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  }

  function updateSnapshotState() {
    if (!snapshot) {
      snapshotState.textContent = "";
      return;
    }
    const state = snapshot.snapshot;
    if (state.status === "stale") {
      snapshotState.innerHTML = `<span class="stale">快照已过期${state.lastError ? `：${escapeAttribute(state.lastError)}` : ""}</span>`;
    } else {
      snapshotState.innerHTML = `<span class="fresh">快照有效 · ${new Date(state.generatedAt).toLocaleTimeString()}</span>`;
    }
  }

  // 同源内链：pushState + 局部渲染，不整页 reload。
  function onLinkClick(event) {
    const anchor = event.target.closest?.("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (href === "#" && anchor.hasAttribute("aria-disabled")) {
      // 未解析/不安全目标不可导航。
      event.preventDefault();
      return;
    }
    if (!href.startsWith("?")) return;
    event.preventDefault();
    if (navigationDrawerOpen && nav?.contains(anchor)) {
      setNavigationDrawer(false);
    }
    scrollY = dom.window.scrollY;
    urlState = parseUrl(href);
    dom.window.history.pushState(urlState, "", href);
    navigate();
  }

  // 视图切换后的副作用：阅读页详情、文档搜索、历史时间线与依赖图加载。
  function navigate() {
    if (urlState.view === "reader" && urlState.entity) {
      loadReaderDetail(urlState.entity);
    } else if (urlState.view === "documents") {
      loadSearch();
    } else if (urlState.view === "map") {
      render();
    } else if (urlState.view === "history") {
      loadHistory();
    } else if (urlState.view === "wayfinding" || urlState.view === "delivery") {
      if (urlState.entity) {
        loadGraph();
      } else {
        render();
      }
    } else if (urlState.view === "relations") {
      loadRelations();
    } else {
      render();
    }
  }

  async function fetchSnapshot() {
    const response = await fetchApi("/api/snapshot", {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`快照请求失败: ${response.status}`);
    return response.json();
  }

  async function refresh() {
    setRefreshBusy(true);
    try {
      await refreshInner();
    } finally {
      setRefreshBusy(false);
    }
  }

  async function refreshInner() {
    if (snapshot === null) {
      // 首屏加载失败后的重试路径：成功则恢复渲染。
      try {
        snapshot = await fetchSnapshot();
        loadError = null;
        render();
        return;
      } catch (error) {
        loadError = error instanceof Error ? error.message : String(error);
        render();
        return;
      }
    }
    try {
      const next = await fetchSnapshot();
      snapshot = next;
      if (snapshot.snapshot.status === "stale") {
        updateSnapshotState();
        return;
      }
      if (urlState.view === "reader" && urlState.entity) {
        // 当前对象仍存在：保留选中、滚动与检查器开关，仅更新详情。
        loadReaderDetail(urlState.entity);
        updateNavigation();
        updateSnapshotState();
      } else if (urlState.view === "documents") {
        loadSearch();
      } else if (urlState.view === "map") {
        render();
      } else if (urlState.view === "history") {
        loadHistory();
      } else if (urlState.view === "wayfinding" || urlState.view === "delivery") {
        if (urlState.entity) {
          loadGraph();
        } else {
          render();
        }
      } else if (urlState.view === "relations") {
        loadRelations();
      } else {
        render();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      snapshotState.innerHTML = `<span class="stale">刷新失败：${escapeAttribute(message)}</span>`;
    }
  }

  async function boot() {
    loadError = null;
    try {
      snapshot = await fetchSnapshot();
    } catch (error) {
      loadError = error instanceof Error ? error.message : String(error);
      snapshot = null;
    }
    navigate();
    refreshButton?.addEventListener("click", () => refresh());
    bindShortcuts();
    const events = new dom.EventSource("/events");
    bindEventStreamStatus(events);
    events.addEventListener("snapshot-changed", () => refresh());
    events.addEventListener("snapshot-stale", () => {
      updateSnapshotState();
      refresh();
    });
    events.addEventListener("update", () => refresh());
  }

  dom.window.addEventListener("popstate", (event) => {
    if (navigationDrawerOpen) setNavigationDrawer(false);
    scrollY = dom.window.scrollY;
    urlState = parseUrl(dom.window.location.search);
    navigate();
  });
  dom.document.addEventListener("click", onLinkClick);
  return { boot, refresh, render, navigate };
}

// 浏览器入口。
if (typeof document !== "undefined" && typeof window !== "undefined") {
  createWorkbench({ document, window, fetch, EventSource }).boot();
}

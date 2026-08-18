// Dashboard 兼容入口：保留 `cs web`、`startDashboard`、`createSnapshot`、
// `parseWebArguments` 与 `findProjectRoot` 的既有公开边界；快照与刷新
// 全部改由 ProjectIndex 投影与 refresh-store 承担。

import { createServer } from "node:http";
import { platform } from "node:process";

import { findProjectRoot } from "./project/root.js";
import { buildProjectIndex } from "./project/index.js";
import { createSnapshotProjection } from "./project/projections.js";
import {
  entityDetailProjection,
  isValidEntityId,
  rawContentProjection,
} from "./project/entity-detail.js";
import { searchProjection } from "./project/search.js";
import { historyProjection } from "./project/history.js";
import { graphProjection } from "./project/graph.js";
import { relationGraphProjection } from "./project/relation-graph.js";
import { createRefreshStore } from "./server/refresh-store.js";
import { indexHtml, readAsset, resolveAsset, securityHeaders } from "./server/static.js";

const DEFAULT_PORT = 43173;

export function parseWebArguments(args) {
  const options = { openBrowser: true, port: DEFAULT_PORT };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--no-open") {
      options.openBrowser = false;
      continue;
    }
    if (argument === "--port") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new Error("--port must be an integer between 1 and 65535");
      }
      options.port = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  return options;
}

export { findProjectRoot };

// 兼容入口：构建一次完整 ProjectIndex 并返回其兼容快照投影。
export async function createSnapshot(projectRoot) {
  const index = await buildProjectIndex(projectRoot);
  return createSnapshotProjection(index, { status: "fresh" });
}

export async function startDashboard(startDirectory, options = {}) {
  const projectRoot = await findProjectRoot(startDirectory);
  if (!projectRoot) {
    throw new Error(
      "No .codestable directory found from the current directory upward.",
    );
  }

  const refreshStore = createRefreshStore(projectRoot, {
    pollIntervalMs: options.pollIntervalMs,
    buildIndex: options.buildIndex ?? buildProjectIndex,
    fingerprintReader: options.fingerprintReader,
  });
  await refreshStore.start();

  const clients = new Set();
  const server = createServer((request, response) => {
    try {
      handleRequest(request, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Dashboard request failed: ${message}`);
      send(response, 500, "application/json; charset=utf-8", JSON.stringify({ error: message }));
    }
  });

  async function handleRequest(request, response) {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;

    if (path === "/") {
      send(response, 200, "text/html; charset=utf-8", await indexHtml);
      return;
    }
    if (path.startsWith("/assets/")) {
      const asset = resolveAsset(path);
      if (!asset) {
        send(response, 404, "text/plain; charset=utf-8", "Not found");
        return;
      }
      try {
        send(response, 200, asset.contentType, await readAsset(asset.path));
      } catch {
        send(response, 404, "text/plain; charset=utf-8", "Not found");
      }
      return;
    }
    if (path.startsWith("/api/entities/")) {
      const rest = path.slice("/api/entities/".length);
      const isRaw = rest.endsWith("/raw");
      const encodedId = isRaw ? rest.slice(0, -4) : rest;
      let entityId;
      try {
        entityId = decodeURIComponent(encodedId);
      } catch {
        entityId = "";
      }
      if (!isValidEntityId(entityId)) {
        send(response, 400, "application/json; charset=utf-8", JSON.stringify({ error: "invalid entity id" }));
        return;
      }
      if (isRaw) {
        const raw = rawContentProjection(refreshStore.index, entityId);
        if (!raw) {
          send(response, 404, "application/json; charset=utf-8", JSON.stringify({ error: "entity has no raw markdown" }));
          return;
        }
        send(response, 200, raw.contentType, raw.content);
        return;
      }
      const detail = entityDetailProjection(refreshStore.index, entityId);
      if (!detail) {
        send(
          response,
          404,
          "application/json; charset=utf-8",
          JSON.stringify({ error: "entity not found", entityId }),
        );
        return;
      }
      send(response, 200, "application/json; charset=utf-8", JSON.stringify(detail));
      return;
    }
    if (path === "/api/relations") {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const result = relationGraphProjection(refreshStore.index, {
        entity: url.searchParams.get("entity") ?? "",
        depth: url.searchParams.get("depth") ?? "1",
        filters: url.searchParams.get("filters") ?? "",
      });
      send(response, 200, "application/json; charset=utf-8", JSON.stringify(result));
      return;
    }
    if (path === "/api/graph") {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const result = graphProjection(refreshStore.index, {
        entity: url.searchParams.get("entity") ?? "",
        kind: url.searchParams.get("kind") ?? "decision",
        depth: url.searchParams.get("depth") ?? "1",
      });
      send(response, 200, "application/json; charset=utf-8", JSON.stringify(result));
      return;
    }
    if (path === "/api/history") {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const result = historyProjection(refreshStore.index, {
        filters: url.searchParams.get("filters") ?? "",
        theme: url.searchParams.get("theme") ?? "",
      });
      send(response, 200, "application/json; charset=utf-8", JSON.stringify(result));
      return;
    }
    if (path === "/api/search") {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const result = searchProjection(refreshStore.index, {
        query: url.searchParams.get("q") ?? "",
        filters: url.searchParams.get("filters") ?? "",
        includeUnindexed: url.searchParams.get("unindexed") === "1",
      });
      send(response, 200, "application/json; charset=utf-8", JSON.stringify(result));
      return;
    }
    if (path === "/api/snapshot") {
      const projection = createSnapshotProjection(
        refreshStore.index,
        refreshStore.state,
      );
      send(
        response,
        200,
        "application/json; charset=utf-8",
        JSON.stringify(projection),
      );
      return;
    }
    if (path === "/events") {
      response.writeHead(200, {
        ...securityHeaders(),
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      });
      response.write("retry: 1000\n\n");
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }
    send(response, 404, "text/plain; charset=utf-8", "Not found");
  }

  const unsubscribe = refreshStore.subscribe((event) => {
    if (event.type === "changed") {
      for (const client of clients) {
        client.write("event: snapshot-changed\ndata: changed\n\n");
        client.write("event: update\ndata: changed\n\n");
      }
    } else if (event.type === "stale") {
      const payload = JSON.stringify({
        staleSince: refreshStore.state.staleSince,
        lastError: refreshStore.state.lastError,
      });
      for (const client of clients) {
        client.write(`event: snapshot-stale\ndata: ${payload}\n\n`);
        client.write("event: update\ndata: stale\n\n");
      }
    }
  });

  const requestedPort = options.port ?? DEFAULT_PORT;
  await listen(server, requestedPort);
  const listeningAddress = server.address();
  const port =
    typeof listeningAddress === "object" && listeningAddress
      ? listeningAddress.port
      : requestedPort;
  const address = `http://127.0.0.1:${port}`;
  console.log(`CodeStable dashboard: ${address}`);
  console.log(`Project: ${projectRoot}`);
  console.log("Press Ctrl+C to stop.");

  const stop = () =>
    new Promise((resolveStop) => {
      refreshStore.stop();
      unsubscribe();
      for (const client of clients) client.end();
      server.close(resolveStop);
    });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  if (options.openBrowser !== false) openBrowser(address);
  return { address, projectRoot, server, stop };
}

function send(response, status, contentType, body) {
  response.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": contentType,
  });
  response.end(body);
}

function listen(server, port) {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
}

function openBrowser(address) {
  let command = "xdg-open";
  let args = [address];
  if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", address];
  } else if (platform === "darwin") {
    command = "open";
  }
  import("node:child_process")
    .then(({ spawn }) => {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      child.unref();
    })
    .catch(() => {});
}


// 结构化诊断模型。诊断保留原始对象，错误不是日志旁路。

const ERROR = "error";
const WARNING = "warning";
const INFO = "info";

export const DiagnosticCodes = {
  MissingField: "missing-field",
  UnknownEnum: "unknown-enum",
  DuplicateId: "duplicate-id",
  Conflict: "conflict",
  BadLink: "bad-link",
  MissingDependency: "missing-dependency",
  PathEscape: "path-escape",
  HistoryFormat: "history-format",
  ReadFailed: "read-failed",
  GitUnavailable: "git-unavailable",
  StaleSnapshot: "stale-snapshot",
  NotIndexed: "not-indexed",
};

export class DiagnosticCollector {
  constructor() {
    this.items = [];
  }

  // source: 来源 source id 或实体 id；location: 仓库相对路径或 {path, line}。
  add(severity, code, source, location, message, relatedTarget) {
    const id = `diag:${this.items.length + 1}`;
    this.items.push({
      id,
      severity,
      code,
      source,
      location: normalizeLocation(location),
      message,
      ...(relatedTarget != null ? { relatedTarget } : {}),
    });
  }

  error(code, source, location, message, relatedTarget) {
    this.add(ERROR, code, source, location, message, relatedTarget);
  }

  warning(code, source, location, message, relatedTarget) {
    this.add(WARNING, code, source, location, message, relatedTarget);
  }

  info(code, source, location, message, relatedTarget) {
    this.add(INFO, code, source, location, message, relatedTarget);
  }
}

function normalizeLocation(location) {
  if (typeof location === "string") return { path: location };
  return location;
}

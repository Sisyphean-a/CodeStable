// 规模 fixture：可重复、不依赖外部绝对路径。
// 至少 250 个 SourceDocument、100 个 decision/ticket、2000 条历史条目和
// 1000 条正式关系，并包含 Colombia 形状的已闭合 decision DAG 与进行中 ticket DAG。

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function createScaleFixture(root) {
  // ---- 当前态文档（含链接关系）：100 个 ----
  await mkdir(join(root, ".codestable", "architecture", "packages"), {
    recursive: true,
  });
  await mkdir(join(root, ".codestable", "architecture", "shared"), {
    recursive: true,
  });
  await mkdir(join(root, ".codestable", "requirements", "contexts"), {
    recursive: true,
  });
  await writeFile(
    join(root, ".codestable", "architecture", "INDEX.md"),
    "# Scale Project\n\n## 范围地图\n",
  );
  const currentStateDocs = [];
  for (let i = 1; i <= 40; i += 1) {
    const path = `.codestable/architecture/packages/package-${String(i).padStart(2, "0")}.md`;
    currentStateDocs.push(path);
    await writeFile(
      join(root, ...path.split("/")),
      `---\nscope: package:package-${i}\ncode-paths:\n  - dashboard/src/dashboard.js\n---\n\n# Package ${i}\n\n## 代码锚点\n- \`dashboard/src/dashboard.js\`\n`,
    );
  }
  for (let i = 1; i <= 30; i += 1) {
    const path = `.codestable/architecture/shared/contract-${String(i).padStart(2, "0")}.md`;
    currentStateDocs.push(path);
    await writeFile(
      join(root, ...path.split("/")),
      `---\nscope: shared:contract-${i}\n---\n\n# Contract ${i}\n`,
    );
  }
  for (let i = 1; i <= 30; i += 1) {
    const path = `.codestable/requirements/contexts/context-${String(i).padStart(2, "0")}.md`;
    currentStateDocs.push(path);
    await writeFile(
      join(root, ...path.split("/")),
      `---\nscope: context:context-${i}\n---\n\n# Context ${i}\n`,
    );
  }

  // ---- 技能：20 个 ----
  for (let i = 1; i <= 20; i += 1) {
    await mkdir(join(root, "skills", `skill-${i}`), { recursive: true });
    await writeFile(
      join(root, "skills", `skill-${i}`, "SKILL.md"),
      `---\nname: skill-${i}\ndescription: Skill ${i}\n---\n\n# Skill ${i}\n`,
    );
  }

  // ---- 探路：Colombia 形状 decision DAG（60 个，含并行分支与已闭合链）----
  await mkdir(join(root, ".wayfinding", "colombia", "decisions"), {
    recursive: true,
  });
  await writeFile(
    join(root, ".wayfinding", "colombia", "map.md"),
    "# Colombia Map\n",
  );
  const decisionCount = 60;
  for (let i = 1; i <= decisionCount; i += 1) {
    // 形状：d1 关闭；d2-d10 并行依赖 d1（打开）；d11-d20 链式依赖前一项（关闭）；
    // d21-d60 两两成链（奇数打开依赖偶数关闭 → 奇数 frontier）。
    const number = String(i).padStart(2, "0");
    const deps = [];
    if (i === 2) deps.push("01-d1.md");
    else if (i >= 3 && i <= 10) deps.push("01-d1.md");
    else if (i >= 11 && i <= 20) deps.push(`${String(i - 1).padStart(2, "0")}-d${i - 1}.md`);
    else if (i >= 22) deps.push(`${String(i - 1).padStart(2, "0")}-d${i - 1}.md`);
    const status = i === 1 || (i >= 11 && i <= 20) || (i >= 22 && i % 2 === 0) ? "关闭" : "打开";
    const owner = i === 25 || i === 40 ? "scale-agent" : "";
    await writeFile(
      join(root, ".wayfinding", "colombia", "decisions", `${number}-d${i}.md`),
      `---\n处理方式: 裁决\n状态: ${status}\n认领者: "${owner}"\n硬依赖: ${deps.length ? `[${deps.join(",")}]` : "[]"}\n---\n\n# Decision ${i}\n`,
    );
  }

  // ---- 交付：Colombia 形状 ticket DAG（60 个）----
  await mkdir(join(root, ".delivery", "colombia", "tickets"), { recursive: true });
  await writeFile(join(root, ".delivery", "colombia", "spec.md"), "# Spec\n");
  for (let i = 1; i <= 60; i += 1) {
    const number = String(i).padStart(2, "0");
    const deps = [];
    if (i === 2) deps.push("01-t1.md");
    else if (i >= 3 && i <= 10) deps.push("01-t1.md");
    else if (i >= 12) deps.push(`${String(i - 1).padStart(2, "0")}-t${i - 1}.md`);
    const status = i === 1 || (i >= 12 && i % 2 === 0) ? "关闭" : "打开";
    const owner = i === 15 ? "scale-agent" : "";
    await writeFile(
      join(root, ".delivery", "colombia", "tickets", `${number}-t${i}.md`),
      `---\n交付类型: ${i % 3 === 0 ? "缺陷" : "功能"}\n状态: ${status}\n认领者: "${owner}"\n硬依赖: ${deps.length ? `[${deps.join(",")}]` : "[]"}\n来源规格: spec.md\n---\n\n# Ticket ${i}\n`,
    );
  }

  // ---- 历史：2000 条（10 个月文件）----
  await mkdir(join(root, ".codestable", "history"), { recursive: true });
  for (let month = 1; month <= 10; month += 1) {
    const yearMonth = `2026-${String(month).padStart(2, "0")}`;
    const day = Math.min(28, month + 1);
    const lines = [`# ${yearMonth}`, ""];
    for (let i = 1; i <= 200; i += 1) {
      const date = `${yearMonth}-${String(day).padStart(2, "0")}`;
      lines.push(
        `- ${date} · [${["功能", "缺陷", "重构", "演进"][i % 4]}] Scale change ${month}-${i}. 范围：workspace、package:scale`,
        `  原因：reason ${month}-${i}`,
        `  当前依据：[架构索引](../architecture/INDEX.md)。`,
        `  证据：代码锚点 \`dashboard/src/dashboard.js\`。`,
        "",
      );
    }
    await writeFile(
      join(root, ".codestable", "history", `${yearMonth}.md`),
      lines.join("\n"),
    );
  }

  // ---- 未索引文档：50 个（贡献 SourceDocument 数量）----
  await mkdir(join(root, "notes"), { recursive: true });
  for (let i = 1; i <= 50; i += 1) {
    await writeFile(
      join(root, "notes", `draft-${String(i).padStart(2, "0")}.md`),
      `# Draft ${i}\n\nBody with [link](../.codestable/architecture/INDEX.md).\n`,
    );
  }

  return {
    decisionCount,
    currentStateDocs,
  };
}

// 统计 fixture 中的数量（供测试断言）。
export function countFixture(root) {
  // 调用方通过 ProjectIndex 统计。
  void root;
}

---
交付类型: 功能
状态: 关闭
认领者: "01a00f46-db9f-7b8a-887d-b7fcd0e175b8"
硬依赖: [03-document-reader.md]
来源规格: ../spec.md
---

# 交付有界的显式关系探索

## 交付结果

用户可从阅读页或关系页查看实体的一跳显式关系、完整文字列表和按需局部关系图，并沿已解析的安全目标继续阅读。

## 当前行为

现有 dashboard 不暴露文档链接、反向引用、当前依据、evidence、代码锚点或关系解析状态。

## 期望行为

阅读检查器先提供一跳文字关系；关系页以选中实体为中心，将入向关系置左、当前对象置中、出向关系置右，并支持 relation kind、方向、来源类别、authority 和解析状态筛选。

## 关键契约

- 只显示 `contains`、`links-to`、`depends-on`、`source-of`、`current-basis`、`evidence`、`supersedes` 和 `code-anchor` 等正式关系。
- `unresolved`、`external` 和 `unsafe` 保留原始目标和状态，不伪造节点或成功跳转。
- 布局确定、有界、可键盘访问；图不是唯一信息载体。

## 验收标准

- [x] 阅读检查器可显示一跳来源、反向引用、当前依据、evidence、替代关系、代码锚点和诊断。
- [x] 关系页局部图有确定性布局、关系类型/方向/解析状态文字、20 节点/40 边限制和完整文字列表。
- [x] 用户可筛选关系投影而不改变原始关系事实，手动逐层展开并保持选中状态。
- [x] unresolved/external/unsafe 关系可见但不可错误导航为成功页面。
- [x] 无正式关系时明确显示未发现可验证关系，不提供推测连接。

## 范围外

- 启发式相似度、AI 推荐、默认全局知识图和物理模拟网络。

## 实施结果

- `src/project/relation-graph.js`：局部关系图投影——以选中实体为中心覆盖全部 8 种正式关系；入向（反向引用）层为负（左侧）、出向为正（右侧），选中实体与来源端点居中层 0；BFS 确定性分层（id 排序访问）；`unresolved/external/unsafe` 保留原始目标文本为不可导航边，不创建伪造节点；20 节点/40 边确定性截断与剩余数；完整文字关系列表不受截断影响；筛选（kind/direction/resolution/authority/category）只改变投影不改变关系事实。
- `src/dashboard.js`：`GET /api/relations?entity=&depth=&filters=`。
- `src/web/graph.js`：通用化——节点 label 可自定义、边中点渲染关系类型文字（未解析/外部/不安全标注状态）、图例与文字列表标题可注入。
- `src/web/views/relations.js`：关系页——实体选择（全部实体下拉）、关系图（入向左/出向右、边带 kind 与解析状态文字、图例、截断说明、逐层展开、重置筛选）、kind/解析状态可见筛选（URL `filters` 承载）、无实体时提示选择；`unresolved/external/unsafe` 虚线边不可导航。
- `src/web/app.js`：关系视图异步加载 `/api/relations`，URL 承载 entity/depth/filters，Back/Forward 恢复。
- 修复：代码锚点按仓库相对路径解析（原按文档相对路径导致全 unresolved）；关系图包含选中实体的来源端点（links-to 等挂在 source 上）；direction 筛选按边端点判定。

## 验证证据

- `npm test`：44 项全部通过，约 1.7 秒（新增 5 项：入向左/出向右与确定性、unresolved/external 可见但无伪造节点、筛选不改变事实与 50 节点截断、无关系空状态、HTTP API 与视图渲染）。
- 真实 CodeStable 项目：`/api/relations?entity=ArchitectureIndex:...INDEX.md&depth=1` 返回 12 节点 21 边（current-basis/code-anchor/links-to/evidence），层 -1/0/1；`filters=kind:code-anchor` 只返回 code-anchor。
- 测试命令：`cd dashboard && npm test`。

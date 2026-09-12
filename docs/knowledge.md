# 版本化菜单与业务知识

关联 [Issue #8](https://github.com/GuoMonth/dsh-erp/issues/8)。2026-09-11：已实现可持久化和原生查询的知识契约，进入 M1 基础开发。使用现有 Node 24、dsh rc2 原生 Schema 和 SQLite；没有新增数据库服务或运行依赖。

本增量打通“观察 → AI 解释记录 → 菜单/业务关联 → 查询与修订 → 重启后复用”。解释由已有 dsh Agent 生成，插件负责契约、来源、版本、证据和查询；合成测试中的解释由固定测试数据提供。尚未交付自动全局探索、真实模型的认知效果验收或图形文档界面。

## 两套模型及关系

| 类别 | kind | 身份与语义 |
| --- | --- | --- |
| 界面 | menu、page、tab、control、window | 菜单、页面类型、Tab、控件/按钮和子窗口 |
| 业务 | domain、object、field、rule、operation | 业务域、对象类型、字段语义、规则和操作定义 |
| 映射 | relation | 独立版本的有向关系，两端引用实体 ID 和版本 |

ID 在完整 `scope`（site/account/tenant/role）内稳定，名称、别名、URL 和上下文可以修订。省略企业或角色会形成不同范围，不视为已核实身份。记录和确认结果也携带规范化 scope。节点种类不能改写；名称变化不要求新建节点。

页面必须提供 `context.pageType`，可附 URL、Tab、子窗口和必要上下文；同 URL 的列表和详情可用不同稳定 ID。当前由 Agent 负责检索已有身份并合并别名，存储不会自动判断页面语义相同。没有单据实例种类，但仍不能仅凭 Schema 防止 Agent 错建重复页面；有界采样和去重属于 #9/#10。

| predicate | 起点 → 终点 |
| --- | --- |
| contains | 菜单 → 菜单/页面；页面/Tab/子窗口 → Tab/控件/子窗口；对象 → 字段 |
| opens | 菜单/控件 → 页面/Tab/子窗口 |
| belongs-to | 对象/字段/规则/操作 → 业务域 |
| references | 业务概念 → 业务概念 |
| displays | 页面/Tab/子窗口 → 对象 |
| represents | 控件 → 字段 |
| supports | 菜单/页面/Tab/子窗口 → 业务域 |
| triggers | 控件 → 操作 |
| governed-by | 对象/字段/操作 → 规则 |

同一领域可对应多个菜单，同一页面可关联多个领域，多个控件可表示同一业务字段。关系语义及端点类型会校验，`contains` 不允许形成环。`triggers` 只是知识关系，不会执行按钮，也不是授权。

## 来源、进度与指定命题

原始观察保持不可变。知识修订的 `origin` 区分 `ai` 和 `user`；一般积累用 AI 写入工具，自动保存，不逐条询问。明确的用户修订走宿主确认后才能记为 user。

`stage` 为 discovered / observed / interpreted；blocked / conflict / needs-review 是独立 flags，active / retired 是生命周期。原生 Schema 不允许直接把实体设为 verified。指定命题另存 proposition、conditions、method、verdict、target ID/version 和时间；verdict 可为 supported / refuted / inconclusive。

当前验证来源仅为 **user-confirmation**：用户确认这段命题和条件，并不代表插件已实测 ERP 行为。未配置 Agent/确认通道、用户拒绝、批准期间目标版本变化，均不写入该确认。确认不会升级整个实体的 stage，也不授予业务权限；未来行为验证需接入实际执行和回读证据。

证据引用包含 observationId 和逐字 quote。必须在同范围的原始观察标题或正文中找到引文；无法引用另一企业/角色的观察。引用存在只证明来源可追溯，不能自动证明推断成立。无证据假设可保存为 discovered/interpreted；observed 必须有引用。知识和页面文字都作为不可信数据返回模型，不能作为操作授权。

字段 `definition` 是数据：valueType、observedValues 和 completeness。目前 completeness 只允许 unknown；样本值不变成排他枚举，也不生成或执行 Zod 源码。结构约束、类型、跨记录语义和业务真假是不同检查。

## 原生工具

| 工具 | 用途 |
| --- | --- |
| erp_observation_get / erp_observation_search | 按范围回查历史原始观察；搜索最多 100 条，不能由结果数量推断完整性 |
| erp_knowledge_record | 自动保存 1–50 条 AI 记录的完整新版本；新 ID 的 expectedVersion 为 0 |
| erp_knowledge_correct | 用户确认具体修订后，以 user 来源保存；普通 AI 学习不使用此工具 |
| erp_knowledge_confirm | 用户确认明确命题、适用条件、方法及结论，绑定当前精确版本 |
| erp_knowledge_get | 读取当前或历史版本、直接失效依赖、最近最多 10 条确认及截断标记 |
| erp_knowledge_search | 按名称/别名/说明搜索，可过滤 kind，包含 retired 记录 |
| erp_knowledge_neighbors | 按方向和关系种类查询相邻的 active 关系，再按端点 ID/version 查询实体 |
| erp_knowledge_history | 分页读取不可变修订历史 |
| erp_knowledge_verifications | 分页读取指定版本的全部确认，包括反驳和不确定结果 |

查询必须显式带完整范围。分页 limit 为 1–50；字符串游标从 `after: ""` 开始，历史从 `afterVersion: 0` 开始，以 hasMore 和返回游标继续。并发修订期间分页不是固定快照，不能用它宣称探索覆盖。`verificationsTruncated` 为真时，应继续查询完整确认，不能忽略未返回的反驳。

一个合成的新菜单参数（假设已存在同范围观察 `obs-demo`，原文含 Purchasing）：

```json
{
  "scope": { "site": "fixture", "account": "reader", "tenant": "demo", "role": "read-only" },
  "records": [{
    "id": "menu-purchasing", "kind": "menu", "expectedVersion": 0,
    "name": "Purchasing", "aliases": ["采购"], "description": "已观察到的采购入口",
    "stage": "observed", "flags": [], "lifecycle": "active",
    "evidence": [{ "observationId": "obs-demo", "quote": "Purchasing" }],
    "dependencies": []
  }]
}
```

业务域假设另建 domain；用 relation 的 `supports` 连接菜单和域。批次内可以先写关系，后写实体，但引用版本必须是本批次提交后的版本。端点依赖自动写入 dependencies；其他解释依据也可显式引用版本。原生契约定义在 `src/knowledge/contract.ts`，文档示例不维护另一套 Schema。

## 修订与恢复

批次要么全部提交，要么全部回滚；expectedVersion 不匹配必须先回查，不盲目重试。ID 的每个版本独立保留，修订不覆盖原始观察或历史关系。

依赖目标改名、变化或停用后，查询会返回 staleDependencies。依赖版本不偷偷推进，引用旧版本的关系仍可追溯。当前只报告直接依赖的变化，不传播多跳失效、不自动解决语义冲突、不重建能力；这些属于 #13。新 active 记录的依赖须指向当前 active 版本；停用旧关系时允许保留其历史端点版本，不要求恢复已停用的端点。

SQLite 升到 v3；v1/v2 升级前备份，失败事务回滚；原有观察、证据和检查点保留。备份恢复同时包含知识、历史、关系、确认和引用的证据。检索索引可从权威记录重建。通信异常不等于未提交；用稳定 ID 和版本回查后再决定如何继续。

每条知识最多 64,000 JSON 字符，批次最多 50 条；字段样本最多 100 项；单条确认最多 32,000 JSON 字符。普通视图只载入最近 10 条确认。知识正文、路径及自由文本仍需采集/生成端清理，存储不识别所有秘密。低层 StorageClient 是可信插件内部接口，不是对恶意同机代码的权限沙箱。

## 验证与下一步

`npm run verify` 通过 50 项测试，含 8 项知识专项：多对多与上下文、来源与版本、错误引用和环的原子回滚、范围隔离、样本与禁用可执行定义、迁移/恢复、宿主确认及完整分页。独立 tarball 消费者验证“观察 → 关系 → 查询 → 备份恢复”；真实 dsh rc2 CLI 通过固定模型发出知识写入/查询工具调用。

上述结果证明工程链路，不证明 AI 对真实 ERP 的理解正确。真实验收准备见 [首轮知识验收](testing/knowledge-round.md)。随后推进已知无写入副作用的交互边界 #7、执行器对照 #4 和 L1/L2 广度队列 #9/#10；完整地图阅读视图属于 #11。#8 保持打开，待真实范围与独立样本完成验收后再判断关闭。

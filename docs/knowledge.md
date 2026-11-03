# 本地知识

[English](knowledge.en.md) · [指南目录](index.zh-CN.md)

知识使用 `erp_system_status` 返回的精确 scope：系统、账号，以及可选的公司和角色。无需浏览器登录即可读取已保存知识；当前业务数据需要重新观察。

## 记录与证据

界面记录描述菜单、页面、Tab、控件和窗口；业务记录描述领域、对象、字段、规则和操作。带版本的有向关系连接二者，同一页面可以服务多个业务域。

原始观察不可改写。知识引文必须逐字引用同范围的观察。证据说明结论来自哪里，不证明解释正确。字段样本是示例，不是完整枚举或可执行 Schema。

记录阶段为 `discovered`、`observed`、`interpreted`，另有 `blocked`、`conflict`、`needs-review` 标记；生命周期为 `active`、`retired`。用户确认绑定具体版本的命题和条件，不授予业务权限。

## 默认读取

探索完成一层后，默认读取是 `erp_index_read`：最多返回 30 条紧凑摘要，再返回一页有证据的叶子记录。工具结果会先给出这段摘要和这一页，并说明在实时观察之前先读它们。尚未绑定站点的对话拿不到另一个站点的这一页。摘要超过 30 条时带截断标记。省略节点时读取最新一层的叶子。`after` 从空字符串开始，按 `nextAfter` 和 `hasMore` 翻页，每页 1–20 条。完整记录用 `erp_knowledge_get`。搜索、邻居和历史是查找路径。更新比读取少：`erp_knowledge_record` 只修订本地知识，不改变 ERP。层级摘要留在本机索引中，不进入分享的 Skill。ERP 业务写入走浏览器动作的 `effect: mutate`，并需要一次 DSH 批准。

## 工具

| 工具 | 用途 |
| --- | --- |
| `erp_observation_get/search` | 回查或检索已保存观察 |
| `erp_knowledge_record` | 保存带证据的 AI 解释 |
| `erp_knowledge_correct` | 保存经用户确认的修正 |
| `erp_knowledge_confirm` | 确认具体版本的命题 |
| `erp_index_read` | 默认读取摘要和一页叶子 |
| `erp_knowledge_get/search/neighbors` | 查询单条记录、名称和关系 |
| `erp_knowledge_history/verifications` | 读取修订与确认 |

每次写入 1–50 条记录，在一个事务中提交。新 ID 使用 `expectedVersion: 0`，更新使用当前版本。版本冲突时先回查，再决定修改。检索和历史分页使用返回的游标与 `hasMore`；并发变化可能影响后续页。

依赖保留引用时的版本。依赖变化后，查询返回 `staleDependencies`，不会悄悄更新引用、传播所有间接变化或解决语义冲突。保留旧证据，按需重新观察。

SQLite 保存知识、修订、关系和确认。Markdown/JSON 导出是视图，编辑后不会回写数据库。跨用户复用采用 [Skill 导出/导入](native-and-sharing.md)，恢复采用[备份](storage.md)。精确记录与关系契约见[源码](https://github.com/GuoMonth/dsh-erp/blob/main/src/knowledge/contract.ts)。

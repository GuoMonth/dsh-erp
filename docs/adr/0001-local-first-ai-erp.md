# ADR 0001：效果优先的本地 ERP 插件

日期：2026-09-11。状态：技术决策仍有效；学习策略由 [ADR 0002](0002-menu-first-domain-learning.md) 补充并替代相关条目。当前执行方案见 [第一版规划](../v1-plan.md)。

## 背景与优先级

产品供用户本机运行 dsh 后安装使用。核心原则是效果第一、信任 AI 能力、方便单机启动。允许较大安装包，但不把 Python、数据库、容器或浏览器服务的部署工作交给用户。ERP 业务写入仍须逐次确认具体变更。

此前规划偏向 Python 服务与 PostgreSQL；后续纯 Node 讨论又有将 Playwright 等同于完整浏览器代理的倾向。本次决策纠正这两个方向，避免用技术偏好代替任务效果。

## 对抗式审查

| 被审查的方案 | 反驳 | 决定 |
| --- | --- | --- |
| 必须纯 Node | 可能为了语言统一牺牲成熟方案的效果 | Node 为主路线，实测证明必要时允许打包 Python 执行器 |
| Playwright 足够 | 执行 API 不自动解决页面理解、上下文压缩和恢复 | 保留执行基础，复用并验证浏览器智能 |
| 增加完整代理编排 | dsh 已有代理、模型和会话，重复管理会增加复杂度 | 复用 dsh，首版不引入 LangGraph |
| 所有知识人工确认 | 字段和菜单学习会频繁打断用户 | 自动积累事实与推断，关键歧义和冲突才集中询问 |
| 提示词保证写入确认 | 自动保存、任意脚本或网络路径可能绕过 | 执行层验证具体业务授权，未知副作用暂停 |
| 建完图谱再使用 | 初次价值慢，且容易全站空转 | 原决定为任务驱动与有限勘察；现由 ADR 0002 调整为首次全局菜单探索，再按业务域深入，不等待所有深层行为验证 |
| 插件必须极小 | 容易把依赖安装成本转嫁给用户 | 预构建或自动准备资源，保证安装可恢复 |
| 首版必须 iframe | 画面传输与输入转发可能掩盖核心效果问题 | 本机窗口优先，内嵌展示后续增强 |

## 已接受的技术决策

1. 目标宿主为 DeepSeek Harness `dsh-v0.1.5-rc.2`，运行时只支持 Node 24 LTS。
2. TypeScript 开发，发布编译后的 JavaScript；构建锁定具体版本，持续更新 Node 24 安全补丁。
3. 使用 dsh 原生插件服务与工具管线，复用模型配置、代理循环、审批和会话；首版不额外套 MCP。
4. 本地工作进程负责浏览器与耗时任务；模型和宿主审批留在插件侧，通过 IPC 或 stdio 交互，不复制凭据。
5. SQLite 为插件知识与执行记录的权威来源，优先 `node:sqlite`；独立文件保存证据。dsh 会话历史仍由 dsh 管理，不复制出另一份对话真相。
6. Playwright 是首个执行基础，浏览器智能以真实 ERP 任务验收；browser-use 作为效果对照。
7. 第一版不要求 PostgreSQL、Python、Docker、云浏览器或图谱服务，不引入 Graphiti 与 LangGraph。
8. 专用本机浏览器会话承载登录和人工接管；内嵌浏览器不进入首版发布阻断项。

## 效果优先的例外

不同时建设两套生产执行器。若固定任务集上的重复测试证明 browser-use 在关键任务正确率、恢复和人工介入方面持续明显优于 Node 方案，而差距需要重建复杂能力才能补齐，可采用随插件管理的 Python 执行器。

启用例外前必须记录任务结果、模型配置、失败证据、安装与维护成本，以及动作审批覆盖情况。不能仅凭一次演示、上游宣传或语言偏好变更选型。用户仍不需要手动安装或管理额外运行时。

Stagehand 可作为 Node 智能浏览器能力候选，需验证所选版本的本地运行、模型适配和授权控制。browser-harness-js 当前 CLI 使用 Bun，主要提供底层 CDP，不作为现成的 Node 完整代理替代品。

## 后果与边界

- 获得单机交付、统一开发基线和宿主能力复用，但浏览器资源仍需按支持平台准备。
- `node:sqlite` 在本次查阅的 Node 24 文档中为 Release candidate，必须按具体发行版本验证；数据库访问集中在小模块中。
- AI 可自主学习、组合操作和生成方法，不能通过生成代码自行获得业务写入授权。
- 对未知 ERP 不能承诺仅凭模型分类就发现所有隐含写入；初次探索优先只读权限，未知副作用暂停。
- 本地浏览器与本地存储不代表离线模型；使用远程模型时需清楚呈现页面内容的使用范围。
- 资料核对不等于插件已兼容或浏览器方案已胜出，发布必须完成真实任务与干净环境安装验证。

## 决策依据

- [目标宿主架构](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/docs/architecture.md)
- [目标宿主工具管线](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/docs/tool-execution-pipeline.md)
- [目标宿主模型服务](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/packages/llm/llm/README.md)
- [Playwright Library](https://playwright.dev/docs/library)
- [browser-use](https://github.com/browser-use/browser-use)、[browser-harness-js](https://github.com/browser-use/browser-harness-js)、[Stagehand](https://github.com/browserbase/stagehand)
- [Node 24 SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)

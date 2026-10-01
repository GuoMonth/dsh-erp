# DSH 原生操作与经验分享

源码候选 `0.1.0-alpha.9` 对齐 [DSH 0.2.0-rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2)。两者均为预发布版本；本轮未发布 npm。安装候选需先 `npm pack`，再用 TGZ 绝对路径执行 DSH 标准插件安装。

## 原生操作

标准插件入口为 `@guosheng_047/dsh-erp/native`，继续使用 DSH 的工具、Agent、Session、审批、附件和 Skill 服务。已有 Browser Use 提供方时直接复用；没有时加载官方 Playwright MCP，不额外实现浏览器操作协议。Deskwork 使用自己的 Electron 页面和任务确认，由宿主注册 `deskwork` 提供方；不会另开一套浏览器。

独立 DSH 配置：

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/app/"
      account: "my-work-account"
    # browserExecutablePath: "/absolute/path/to/chromium"
    # browserEndpoint: "http://127.0.0.1:9222"
    # computerUse: true
```

先调用 `erp_system_status`、`erp_native_status`，按配置入口导航，自行登录并核对公司、账号与角色。Playwright 工具保留上游名称和参数；当前点击工具使用 `target`，不要套用旧版 `ref` 参数。浏览器会话、窗口和临时元素引用由原生提供方维护。连接外部浏览器时，结束 Session 释放连接但保留宿主浏览器。

网页观察后，立即调用 `erp_native_observation_save`，再用返回的证据 ID 和原文引文调用 `erp_knowledge_record`。此工具只接收同一个 Agent 最近成功的快照结果，不能提交模型编造的观察文字。执行其他操作会使旧快照失效；保存的文字是历史证据，不是活元素引用。继续使用 `erp_learning_start/status/extend/finish_unit` 保存探索队列；原生文本快照的结构理解和知识记录由模型完成，不沿用旧 DOM 自动导入器。

`computerUse: true` 显式加载官方 Cua Driver Native，需要其可选 npm 依赖和操作系统权限。复用已注册的 Computer Use 提供方时不会再注册第二个。它适合原生窗口或视觉控件；不把桌面坐标当作可分享的固定操作步骤。首次检查权限可用 `cua_driver_native__check_permissions` 的 `prompt: false`；其余原生工具每次请求 DSH 确认，保存窗口证据时还需确认其属于配置的 ERP。

原生工具本身具有宿主级能力，ERP URL 校验只约束证据入库；它不把原生浏览器或桌面工具变成站点沙箱。截图和工具结果沿用 DSH 原生附件/模型能力规则。实际原生截图未套用旧版 ERP DOM 快照的脱敏器，应核对画面是否包含私人信息。

## 一次调用导出、导入

分享者可直接说：“把这个 ERP 积累的经验导出成可分享的 Skill。”模型查询 `erp_system_status` 后，用精确 scope 调用 `erp_experience_export`。返回 Skill 目录、导入文件、记录数量、省略数量和名称预览。

```text
erp-experience-<摘要>-<导出 ID>/
  SKILL.md
  references/knowledge.json
```

分享整个目录即可。支持原生 Skill 的其他 DSH 可将它放入配置的 Skill 根目录，使用普通 `skill` 工具加载并阅读引用；不必安装另一套知识平台。插件不会上传、发消息或发布这个目录。

接收者配置并自行登录自己的 ERP，将目录放在本机，再说：“导入这个 Skill 的 references/knowledge.json，作为当前 ERP 待核验的经验。”模型取接收者 scope，调用 `erp_experience_import`，展示准确文件路径与范围并请求一次确认。DSH Web 使用其原生审批界面；Deskwork 使用原生确认对话框作为 DSH approval answerer。无审批服务或无人响应时拒绝导入。

导入后，知识节点和关系在单个事务中写入接收者范围，同时自动进入 DSH 原生 Skill 目录。菜单、业务域与方法可以用 `erp_knowledge_search/neighbors` 查询；重新观察接收者页面后再判断哪些经验适用。

## 分享边界

- 导出保留名称、别名、描述、知识类型、字段类型和有效关系；省略过期关系及依赖缺失的记录，不擅自把旧关系绑定到新解释。
- 排除发送者 scope、原始节点 ID、结构化 URL、字段样本、观察证据、截图、用户确认与登录资料。自由文本仍可能包含客户名、地址等私人信息，分享前检查 `SKILL.md` 和 JSON。
- 导入只读取有界 JSON，校验格式、引用与关系，不执行对方的 `SKILL.md` 或代码；本地 Skill 说明由插件重新生成。文件必须为绝对路径、普通文件，最多 16 MB、2000 条记录。
- 所有导入记录重新标为 `interpreted`、`needs-review`；不携带发送者确认，不授予读写或登录权限。账号、权限和 ERP 版本差异需要重新验证。
- 相同内容重复导入不会覆盖本地修正、确认及其他知识。改变的经验生成另一组导入记录；本版没有自动跨版本合并。
- 分享是当前知识的可复用投影，分页可能发生并发变化；引用版本不匹配时省略相关记录。它不是备份。完整本机恢复继续使用 `erp_storage_backup`。

## 验证范围

确定性测试覆盖跨用户导入、关系重绑定、重复导入保留修正、重启读取、大批量原子导入、损坏/循环/私密字段拒绝，以及原生 Skill 发现。真实 Chromium 覆盖官方 Playwright MCP 的确认拒绝、点击、重新观察、证据入库和 Session 释放。Linux x64 已实际加载 Cua Driver 原生二进制并读取无提示权限状态；真实桌面点击、截图、用户 macOS 和真实 ERP 业务验收仍待完成。

旧受控浏览器仍可通过 `browserMode: managed` 显式选择，其流程见[通用浏览器学习](adaptive-learning.md)。两条路径的观察和元素引用不能互换。

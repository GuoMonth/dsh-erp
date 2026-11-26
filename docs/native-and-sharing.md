# 原生操作与经验分享

[English](native-and-sharing.en.md) · [指南目录](index.zh-CN.md)

## 观察、操作、保存

标准安装写入的是包 `@guosheng_047/dsh-erp`。桌面客户端挂在这一行上。宿主入口与 `./native` 导出的是同一个：复用 DSH 工具、会话、审批、附件和 Skill。已有 Browser Use 提供方时直接复用，否则加载官方 Playwright MCP。

1. 从 ERP 助手打开站点会话。单站点 profile 也可在当前会话调用 `erp_system_status` 建立关联。用 `erp_native_status` 查看作用域与快照工具，再打开配置入口并手动登录。
2. 使用 `browserSnapshotTool` 获取快照，随即调用 `erp_native_observation_save`。证据只来自同一 Agent、同一站点作用域和当前提供方。后续原生操作会使旧快照失效。
3. 保存的快照会转成可导入的 `browser-learning-v1` 证据。用 `erp_learning_begin` 把前沿交给控制器；用 `erp_knowledge_record` 记录本地修订，并引用观察 ID 和原文。
4. 操作后重新获取快照，核对结果。已保存的观察是历史证据，元素引用不能复用。

ERP 浏览器快照支持官方 Playwright MCP 和 Chrome DevTools MCP。Stagehand 和其他未适配的提供方可按 DSH 自身规则运行，`browserSnapshotTool` 显示为 `null`，ERP 探索会提示当前提供方缺少快照工具。Playwright 保留上游工具名称与参数，点击工具使用 `target`。结束 Playwright 附加会话会释放连接，保留外部浏览器。

ERP 为已关联站点会话内的 Playwright MCP、Chrome DevTools MCP、Stagehand 和 Cua Driver Native 工具调用加上逐次确认。其他会话沿用宿主的审批策略。宿主拒绝或取消时，ERP 保留该结果。打开页面与 ERP 写入都需要确认，本地知识修订只写本地索引。ERP 在证据入库时校验浏览器 URL。截图和工具结果沿用 DSH 附件处理，可能包含私人信息。

`computerUse: true` 加载官方 Cua Driver Native，需要可选依赖和操作系统权限。用 `desktopSnapshotTool` 查看窗口快照工具。权限状态检查可用 `cua_driver_native__check_permissions` 的 `prompt: false`。保存窗口证据还需单独确认该次快照属于配置的 ERP。若确认期间快照变化，需按新的快照确认。

## 分享包

主分享是 `erp_share_export` 写出的 zip。在桌面上，对一个站点选择「分享」，会下载同一份包。先看过自由文本再发出去。插件不会上传。

```text
erp-share-pack.zip
  manifest.json
  knowledge.jsonl
```

`manifest.json` 的 `format` 是 `dsh-erp-share-pack`，`schemaVersion` 从 1 开始。里面有生产者应用和版本、整理后的入口、显示名、工作区标识、内容清单和 `knowledge.jsonl` 的 sha256。`knowledge.jsonl` 一行一条记录，带 `format`、`schemaVersion`、`kind` 和该记录自己的版本。默认排除登录、Cookie、凭据、原始观察、截图、字段样本和确认。这不是[存储备份](storage.md)。

## 导入分享包

在桌面上选择本机 zip，或让 `erp_share_import` 读取绝对路径。导入前会请求一次确认。记录标为 `interpreted` 和 `needs-review`，并改绑到接收方自己的 scope。不执行包内代码，不授予登录或写入权限。

读者接受 `schemaVersion` 1。未知键忽略。未知 `kind` 跳过并给出警告，其余记录继续导入。更高的 `schemaVersion` 或无法识别的 `format` 整包拒绝，不写入一部分。相同内容再次导入保留本地修正。

## Skill 目录

`erp_experience_export` 仍可写出一个 Skill 目录，这是次要路径，不是主分享：

```text
erp-experience-<summary>-<export-ID>/
  SKILL.md
  references/knowledge.json
```

`erp_experience_import` 读取其中的 `references/knowledge.json`。它同样不执行代码，也不授予登录或操作权限。恢复数据使用[存储备份](storage.md)。测试命令与覆盖范围见[开发指南](development.md)。

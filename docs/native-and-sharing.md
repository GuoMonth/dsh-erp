# 原生操作与经验分享

[English](native-and-sharing.en.md) · [指南目录](https://github.com/GuoMonth/dsh-erp/blob/main/docs/index.zh-CN.md)

## 观察、操作、保存

标准安装加载 `@guosheng_047/dsh-erp/native`，复用 DSH 工具、会话、审批、附件和 Skill。Deskwork 提供任务浏览器；独立 DSH 复用已有 Browser Use 提供方，或加载官方 Playwright MCP。

1. 调用 `erp_system_status`、`erp_native_status`，打开配置入口，由你登录。
2. 获取原生快照，随即调用 `erp_native_observation_save`。只接受同一 Agent 最近成功的快照；其他操作会使它失效。
3. 用 `erp_knowledge_record` 记录知识，引用已保存的观察 ID 和原文。未完成工作保存在学习队列中。
4. 操作后重新获取快照，核对结果。已保存的观察是历史证据，元素引用不能复用。

Playwright 工具保留上游名称与参数，当前点击工具使用 `target`。浏览器提供方管理会话和元素引用；结束附加会话会释放连接，保留外部浏览器。

原生浏览器和桌面调用逐次请求 DSH 确认；Deskwork 使用任务页面确认规则。ERP 的 URL 校验限制证据入库，原生工具仍有宿主级访问能力。截图和工具结果沿用 DSH 附件处理，可能包含私人信息。

`computerUse: true` 加载官方 Cua Driver Native，需要可选依赖和操作系统权限；已有提供方时直接复用。权限检查可用 `cua_driver_native__check_permissions` 的 `prompt: false`；保存窗口证据还需确认该窗口属于配置的 ERP。

## 分享 Skill

说“把这个 ERP 的经验导出为 Skill”。`erp_experience_export` 返回目录：

```text
erp-experience-<summary>-<export-ID>/
  SKILL.md
  references/knowledge.json
```

检查两个文件后分享整个目录。导出保留名称、描述、类型和有效关系，排除结构化身份、URL、字段样本、原始观察、截图、登录资料和确认。自由文本仍可能包含私人信息；插件不会上传目录。

## 导入 Skill

配置接收方 ERP，要求导入本地 `references/knowledge.json`。`erp_experience_import` 针对文件和 scope 请求一次确认，在一个事务中写入知识，并注册原生 Skill。

输入必须是普通 JSON 文件的绝对路径，最多 16 MB、2000 条记录。导入校验引用和关系，不执行发送者的 Skill 或代码。记录标为 `interpreted`、`needs-review`。相同内容重复导入保留本地修正；内容变化时产生另一组记录。

使用前在接收方页面上复核经验。导入不授予登录或操作权限。Skill 导出用于分享，恢复数据使用[存储备份](storage.md)。测试命令与覆盖范围见[开发指南](https://github.com/GuoMonth/dsh-erp/blob/main/docs/development.md)。

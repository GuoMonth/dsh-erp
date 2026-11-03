# 已审查的只读路由

[English](controlled-read-navigation.en.md) · [受控浏览器](adaptive-learning.md)

`browserMode: managed` 的可选入口，默认关闭。标准路径是原生 Browser Use / Playwright MCP。Agent 不能创建或扩充契约。

## 启用

在 `erp` 配置里填写本机绝对路径。目标必须是普通文件，不能是符号链接，不超过 128 KB。`siteUrl` 和 `scope` 必须与 `erp_system_status` 一致。最多 50 条路由、200 条请求，没有通配符。

```yaml
- id: erp
  config:
    browserReadPolicyFile: /absolute/local/path/reviewed-read-policy.json
```

1. `erp_browser_open` 打开空白窗口，由你在应用内登录。
2. `erp_browser_read_policy` 查看契约和 digest；`erp_browser_status` 取得 sessionId 与 revision。
3. `erp_browser_read_enable` 提交这三项。DSH 确认后许可 10 分钟、最多 20 次。不必先做被动 resume。
4. `erp_browser_read` 只接受许可中的 routeId。成功则保存观察。

## 硬限制

每次读取使用临时上下文，不把页面改动写回人工 profile，也不批准 ERP 写入。契约若把会写入的请求标成只读，服务器仍会被修改。失败、取消、到期、人工操作或契约变更都会使许可失效，且不自动重试。单次最多 200 个匹配请求；导航等待 10 秒，整次读取在 12 秒内结束。

实现见 [read-policy.ts](../src/browser/read-policy.ts)、[read-navigation.ts](../src/browser/read-navigation.ts) 和 [runtime.ts](../src/browser/runtime.ts)。测试见 [read-navigation.test.mjs](../tests/read-navigation.test.mjs)。

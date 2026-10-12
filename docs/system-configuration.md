# 配置 ERP

[English](system-configuration.en.md) · [指南目录](index.zh-CN.md)

配置写在当前 DSH profile 的 `cordis.patch.yml` 中。文件位置与安装见[快速开始](README.zh-CN.md#配置-erp)。修改后重启 DSH。

## 网站与身份

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/app/login"
      baseUrl: "https://erp.example.com/app/"
      name: "My ERP"
      account: "work-account"
      tenant: "company-a"
      role: "purchasing"
```

只有 `url` 必填。入口路径不以 `/` 结尾时，还需填写 `baseUrl`。Base URL 必须以 `/` 结尾，并在同源路径范围内包含入口。路径与 hash 路由原样保留；拒绝内嵌账号密码和查询参数，包括 hash 中的查询参数。使用 SSO 时填写长期入口，在浏览器中完成登录。

名称默认域名，账号默认 `default`。账号、公司和角色标签用于隔离本地知识。不同身份使用不同标签，并与实际登录身份核对。`erp_system_status` 返回知识和学习工具需要的精确 scope。

每个插件实例配置一个 ERP。规范化 Base URL 对应一个持久 ID。改名保留 ID；更换域名或应用路径会选择另一系统，改回原 Base URL 可找回原 ID。

## Deskwork

插件从 `DESKWORK_SITE_CONTEXT` 读取网站身份、名称和 URL，默认数据目录为 `DESKWORK_DATA_DIRECTORY/plugins/erp`。显式填写的 `system`、`dataDir` 覆盖这些默认值。独立使用 DSH 时按上面的 profile 配置。

## 浏览器选项

默认[原生模式](native-and-sharing.md)复用宿主浏览器提供方，或加载官方 Playwright MCP。`browserExecutablePath` 指定已安装的 Chromium；`browserEndpoint` 连接已有浏览器；`computerUse: true` 启用官方 Cua Driver Native。

使用独立的[受控浏览器](adaptive-learning.md)时设置 `browserMode: managed`。它的工具和元素引用与原生模式不同。本地存储、迁移和备份见[存储指南](storage.md)。

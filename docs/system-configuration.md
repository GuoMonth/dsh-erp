# 配置 ERP

[English](system-configuration.en.md) · [指南目录](index.zh-CN.md)

配置写在当前 DSH profile 的 `cordis.patch.yml` 中。文件位置与安装见[快速开始](README.zh-CN.md#快速开始)。修改后重启 DSH。

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

规范化 Base URL 对应一个持久 ID。改名保留 ID；更换域名或应用路径会选择另一系统，改回原 Base URL 可找回原 ID。同一个插件可以放多个站点。同一 Base URL 上不同的账户标签是另一份索引。

## 多个站点

在桌面上从 ERP 助手添加站点。还没有站点时，那一页就是设置。有站点之后，「继续」会恢复上次打开的站点的对话和入口网址；那一行已经不在列表里时，不会改去打开另一个站点。编辑可以改名称、入口网址或账户标签。新的账户标签或应用根是另一份索引，原先绑定的对话不会被挪过去。补丁里也可以声明。`system` 是一个站点，`sites` 再增加其他站点。改完补丁后重启。在桌面入口里移除的站点会保持移除，直到你再次添加。

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/app/"
      account: "work-account"
    sites:
      - url: "https://other.example.com/app/"
        name: "Other ERP"
        account: "buyer"
```

每个站点有自己的对话和自己的 SQLite scope。切换站点不会把它们混在一起。这里仍然没有密码栏。

## 浏览器选项

默认[原生模式](native-and-sharing.md)复用宿主浏览器提供方，或加载官方 Playwright MCP。`browserExecutablePath` 指定已安装的 Chromium；`browserEndpoint` 连接已有浏览器；`computerUse: true` 启用官方 Cua Driver Native。

使用独立的[受控浏览器](adaptive-learning.md)时设置 `browserMode: managed`。它的工具和元素引用与原生模式不同。已审查只读路由默认关闭，见[只读契约](controlled-read-navigation.md)。本地存储、迁移和备份见[存储指南](storage.md)。

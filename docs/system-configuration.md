# 配置 ERP

[English](system-configuration.en.md) · [指南目录](index.zh-CN.md)

配置写在当前 DSH profile 的 `cordis.patch.yml` 中。文件位置与安装见[快速开始](README.zh-CN.md#快速开始)。修改后重启 DSH。

## 网站

桌面上，一个站点就是一个书签：一个网址，一个可选的显示名。深链会整理成站点入口，稳定应用根记在内部，不用另填 `baseUrl`。登录留在右侧浏览器。这里没有密码栏。

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/web/login"
      name: "My ERP"
```

只有 `url` 必填。粘贴只接受 `http` 或 `https`。账号和密码会被去掉，不回显、不落盘。一次性查询和一次性 hash 也会去掉。单据、记录和回调收到应用首页，也就是源站点加上以 `/` 结尾的稳定应用根。若这个 ERP 的稳定首页本身在 hash 上，保留这个首页，只去掉其中的一次性片段。

显示名默认主机名。改显示名不会换成另一个站点。规范化后的应用根对应一个持久 ID。更换域名或应用路径会选择另一系统，改回原应用根可找回原 ID。

已有补丁里的 `baseUrl`、`account`、`tenant`、`role` 仍会加载，用来保持原来的索引。这些字段不出现在桌面主表单上。同一应用根上不同的账户标签仍是另一份索引，只作为已有配置的内部范围。`erp_system_status` 返回知识和学习工具需要的精确 scope。

## 多个站点

在桌面上从 ERP 助手添加站点。还没有站点时，那一页就是设置。有站点之后，「继续」会恢复上次打开的站点的对话和入口；那一行已经不在列表里时，不会改去打开另一个站点。编辑可以改显示名或网址。添加时就会建立该 ERP 的工作区文件夹，其下可以再开一段对话。补丁里也可以声明。`system` 是一个站点，`sites` 再增加其他站点。改完补丁后重启。在桌面入口里移除的站点会保持移除，直到你再次添加。

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/app/"
    sites:
      - url: "https://other.example.com/app/"
        name: "Other ERP"
```

每个站点有自己的工作区文件夹、自己的对话和自己的 SQLite scope。切换站点不会把它们混在一起。这里仍然没有密码栏。

## 浏览器选项

默认[原生模式](native-and-sharing.md)复用宿主浏览器提供方，或加载官方 Playwright MCP。`browserExecutablePath` 指定已安装的 Chromium；`browserEndpoint` 连接已有浏览器；`computerUse: true` 启用官方 Cua Driver Native。

使用独立的[受控浏览器](adaptive-learning.md)时设置 `browserMode: managed`。它的工具和元素引用与原生模式不同。已审查只读路由默认关闭，见[只读契约](controlled-read-navigation.md)。本地存储、迁移和备份见[存储指南](storage.md)。

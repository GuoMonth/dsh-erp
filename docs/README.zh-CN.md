# Adapt ERP

[English](../README.md) · [版本发布](https://github.com/GuoMonth/dsh-erp/releases)

通过浏览器学习你的 ERP，把知识留在自己的电脑上。Adapt ERP 是 DeepSeek Harness（DSH）插件：你负责登录，DSH 观察页面，保存的知识可在后续对话中继续使用。初次安装没有你的站点知识。

当前版本 **0.1.1**，使用 **DSH 0.2.0-rc.2**（上游预发布版），需要 Node **>=24.18.0 <25**。桌面测试覆盖 Linux x64；Windows/macOS 验收待完成。

## 安装

已有 DSH，并已配置模型：

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@latest
```

只有 Node：

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.2.0-rc.2 --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@latest
```

使用完整包名。固定版本时，将 `@latest` 换成 `@0.1.1`。浏览器提供方会准备 Chromium；Linux 还需要图形会话和 Chromium 系统库。

## 配置 ERP

退出 DSH，编辑 `~/.dsh/profiles/web/cordis.patch.yml`；设置 `DSH_HOME` 时使用 `$DSH_HOME/profiles/web/cordis.patch.yml`。替换空列表 `[]`；已有 `id: erp` 时合并配置，保留其他插件。

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/app/"
      account: "work-account"
```

只有 `url` 必填。`account` 是本地身份标签，不是密码。运行 `dsh --profile web`，让它用 `erp_system_status` 核对配置，再打开 ERP，由你登录。登录路径、公司和角色设置见[配置指南](system-configuration.md)。

在 Deskwork 中，将插件绑定到网站即可使用该网站的上下文和任务浏览器；显式填写的 `system`、`dataDir` 优先。

## 学习与复用

让 DSH 先梳理菜单，再了解页面和业务关系。观察与知识保存在本机。原生浏览器和桌面调用逐次确认；Deskwork 按任务规则确认。操作后在页面上核对结果。

将有用的经验导出为 Skill，检查文本后把目录交给其他用户。接收者需在自己的 ERP 中复核导入知识。详见[原生操作与分享](native-and-sharing.md)。

已保存的知识无需登录即可查询；当前库存和订单需要重新观察。截图和页面内容可能发送给你配置的模型供应商。发布包不包含你的数据库、登录资料或观察记录。

## 升级与卸载

调用 `erp_storage_backup`，退出 DSH，重复安装命令并重启，保留原配置和数据目录。早期 Alpha 版本迁移与恢复见[存储指南](storage.md)。

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web remove @guosheng_047/dsh-erp
```

卸载前退出 DSH。卸载保留本地数据。

## 文档

[指南目录](index.zh-CN.md) · [开发](development.md) · [更新记录](../CHANGELOG.md) · [MIT](../LICENSE) · [第三方声明](../NOTICE.md)

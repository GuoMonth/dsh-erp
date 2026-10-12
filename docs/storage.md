# 存储与恢复

[English](storage.en.md) · [指南目录](https://github.com/GuoMonth/dsh-erp/blob/main/docs/index.zh-CN.md)

每个配置的 ERP 在 `systems/<持久ID>/` 下保存 SQLite、证据、导出和备份。`erp_system_status` 返回实际目录。`systems/by-url/` 将应用地址映射到 ID；换电脑时一并保留。

## 数据目录

显式填写的绝对路径 `dataDir` 优先。Deskwork 默认目录见[配置指南](system-configuration.md)，独立 DSH 的默认目录如下：

| 环境 | 目录 |
| --- | --- |
| 设置 `DSH_HOME` | `<DSH_HOME>/plugins/dsh-erp/data` |
| Windows | `<LOCALAPPDATA>/dsh-erp`，或用户的 `AppData/Local/dsh-erp` |
| macOS | `~/Library/Application Support/dsh-erp` |
| Linux | `<XDG_DATA_HOME>/dsh-erp`，或 `~/.local/share/dsh-erp` |

使用本机非同步目录。同一数据库只允许一个进程持有，同时运行的 DSH profile 需使用不同目录。禁用和卸载保留数据。原生浏览器提供方管理登录资料；受控模式的私有浏览器资料独立于知识备份。

## 备份与恢复

升级前调用 `erp_storage_backup`。备份包含一致的 SQLite 快照、引用证据和经校验的 manifest。只复制活动 `store.sqlite` 可能遗漏 WAL 中已提交的数据。系统索引、DSH 配置和浏览器登录资料另行保留。

离线恢复前停止数据库所有者，使用导出的 `restoreBackup` API。目标父目录必须存在，目标目录必须是新目录：

```js
import { restoreBackup } from '@guosheng_047/dsh-erp'

await restoreBackup(
  '/absolute/path/to/system-directory',
  'backup-ID',
  '/absolute/path/to/new-system-directory',
)
```

恢复校验数据库、Schema、引用和证据哈希，拒绝已有目标，校验失败时清理新建目录。重启前保留恢复系统的 ID 和索引，将数据根目录指向对应的 `systems/<ID>/` 布局；插件不会自动切换目录。

Schema 迁移先生成经校验的备份，再以事务提交，拒绝不支持的更高版本。`erp_storage_check` 报告损坏、缺失和孤立证据，不自动删除文件。检索索引可从保存的记录重建。

## 中断与重启

排队请求取消后不再派发；已派发的持久化操作结算后才关闭。回复丢失时写入可能已成功，重试前按固定 ID 和版本回查。重启会暂停学习任务并保留进度，不重放网站动作。

## 早期 Alpha 版本

alpha.5 起的系统 ID 和知识保留。固定 `erp_scm_*` 工具已移除，旧 SCM 记录仍可作为历史证据查询。

alpha.4 及更早的根目录数据库留在原位，不自动导入。退出 DSH，临时移除 `system`，用原 scope 查询、导出或备份旧库；此模式禁用浏览器连接。恢复配置并重启后回到系统库。早期无 scope 的 TGZ 安装还需移除旧插件条目。

备份包含与数据库相同的私人业务信息。分享 Skill 使用单独的精简[导出](native-and-sharing.md)。

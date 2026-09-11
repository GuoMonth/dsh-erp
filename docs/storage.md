# 本地存储与恢复

关联 [Issue #6](https://github.com/GuoMonth/dsh-erp/issues/6)。实现基线：Linux x64、Node `24.18.0` 内置 SQLite `3.53.1`。不安装 PostgreSQL、外部图数据库、向量服务或原生 npm 数据库扩展。

本阶段保存不可变观察、证据引用和任务检查点，提供隔离检索与可恢复迁移。菜单、业务域、多对多映射、命题/能力的演进契约属于 #8；四级调度属于 #9。本存储层不把页面文字自动提升为已验证知识。

## 所有者与数据目录

`ctx.erp.storage` 懒启动独立 Node worker thread，通过固定 Schema 请求串行处理数据库和文件操作；可取消的执行进程不拥有 SQLite。宿主线程不执行 SQLite、迁移或文件备份。一次最多接收 16 项请求，超限返回 `STORAGE_QUEUE_FULL`。

SQLite 采用 `locking_mode=EXCLUSIVE`、WAL、`synchronous=FULL`。连接保留 SQLite 自身的排他锁，同一目录第二个所有者在 250 ms 锁等待后返回 `STORAGE_ALREADY_OPEN`；首个所有者退出后可重新打开。每次更新使用短事务，备份/浏览器/模型/用户等待期间不持有应用写事务。保留连接锁与长期持有应用事务是两回事。

WAL 的实测收益与边界：已提交、尚在 WAL 的观察可通过原生备份接口变成独立快照，并经恢复校验；它不用于允许其他进程直接读取活动库。所有调用都走同一所有者。选择依据为 [Node 24.18 SQLite API](https://nodejs.org/download/release/v24.18.0/docs/api/sqlite.html)、[SQLite locking_mode](https://www.sqlite.org/pragma.html#pragma_locking_mode) 与 [备份接口](https://www.sqlite.org/backup.html)，实际行为有本仓库用例覆盖。

默认目录按以下顺序选取，独立于安装目录：

| 条件 | 目录 |
| --- | --- |
| 设置 `DSH_HOME` | `<DSH_HOME>/plugins/dsh-erp/data` |
| Windows | `<LOCALAPPDATA>/dsh-erp`，无变量时取用户 `AppData/Local` |
| macOS | `~/Library/Application Support/dsh-erp` |
| Linux | `<XDG_DATA_HOME>/dsh-erp`，无变量时取 `~/.local/share/dsh-erp` |

可在 dsh patch 中覆盖插件 `erp` 配置：

```yaml
- id: erp
  config:
    dataDir: /absolute/local/path/dsh-erp-data
```

必须使用本机绝对路径。已拒绝直接符号链接目录、UNC、已知同步目录名称，以及 Linux 上识别出的 NFS/SMB 文件系统；无法自动识别任意第三方同步软件或全部挂载类型，配置者仍需选择本机非同步目录。Unix 目录权限为 `700`、数据库/证据/备份文件为 `600`；不对 Windows ACL 作未验证承诺。禁用或卸载插件不会删除用户数据。

目录包括 `store.sqlite`、运行时的 WAL 文件、`evidence/<sha256>` 和 `backups/<backup-id>/`。同一账号在多个 dsh profile 中同时使用同一目录会被拒绝；需要并行时显式配置不同目录，当前不支持跨进程共享知识。

## 数据契约与隔离

`src/storage/contract.ts` 使用宿主原生 Schema，同时推导 TypeScript 类型并校验消息输入/输出。`StorageClient` 通过插件主入口导出；宿主工具目前只暴露 `erp_storage_status`，不开放原始 SQL 或任意文件写入工具。

| 方法 | 契约与行为 |
| --- | --- |
| `observe` / `observation` | 记录 ID、站点/账号/可选企业与角色、URL、语言、上下文、观察时间和原文；同 ID 同内容幂等返回，同 ID 改值或改范围拒绝 |
| `checkpoint` / `task` | 保存探索边界 `frontier`、游标、状态、原因；以 `expectedVersion` 比较更新，过期版本不覆盖新进度 |
| `search` | 显式指定完整范围，返回原始观察；三字符以上用 FTS5 trigram 短语匹配，短查询用子串匹配，支持中文两字查询 |
| `rebuildIndex` | 从权威观察重建派生全文索引，不改观察内容 |
| `check` | SQLite 快速检查、外键检查，以及证据缺失、损坏和孤立文件报告 |
| `backup` / `restore` | 一致性备份与仅向新目录恢复 |

范围使用稳定别名，不能拿登录密码、Cookie 或令牌充当标识。读取、检索、任务更新均按完整范围限定；省略的企业/角色不等同于已确认的企业/角色。观察 ID 全库唯一，生产调用者应生成 UUID，而非以菜单名称或 URL 单独作为 ID。观察当前版本为 1；修改应写新观察并在未来知识模型中表达关联，不覆盖证据。

证据使用内容哈希寻址，先持久化临时文件并原子改名，再提交数据库引用。文件成功而事务失败可能留下孤立文件；检查会列出它们，不自动删除。相同内容复用同一证据文件；已存在文件哈希不符时拒绝使用。当前支持声明为文本、JSON、PNG 的原始字节，MIME 不是内容安全检测器。

敏感内容必须在采集端按需脱敏后提交。存储层自动移除 URL 查询串和 hash 路由中的查询串，并拒绝 URL 内嵌账号密码；路径、标题、正文、游标、截图仍由生产者负责清理。不会自动识别图片中的秘密，也不把页面证据写进错误消息。备份保留相同敏感等级。浏览器会话独立保存在私有 profile 中，不进入 SQLite 备份或知识证据；当前不采集截图，见 [浏览器说明](browser-observation.md)。

## 取消与重启

排队中取消的请求在派发前退出，不发生写入。已派发的持久化请求等待实际成功/失败结果，不因调用者取消就杀线程或自动重试。插件卸载停止接收新请求，等待队列结算，然后关闭数据库。

重启时把遗留 `running` 任务改成 `paused`，原因设为 `storage-restarted`，递增版本并保留 frontier/游标。不会自动恢复浏览器动作或 ERP 写入。存储线程崩溃使在途请求失败并停止接收该实例的新请求，需要显式重新加载；已提交但未收到回执的观察可按原 ID 回查，检查点按当前版本回查，不能把通信失败直接解释为未提交。

## 备份、迁移与恢复

原生 `node:sqlite.backup` 生成数据库快照，包含已提交 WAL。串行队列在备份期间推迟后续写入；备份边界明确，不保证备份期间新提交给队列的请求已经入快照。备份再复制快照引用的不可变证据，检查数据库、外键与哈希，写入 manifest，最后原子发布完整目录。不能只复制活动库的 `store.sqlite`。

当前 schema v1 建立观察/证据/任务表，v2 添加派生全文索引。已有版本升级前生成并校验完整备份；迁移 SQL 和版本变更在同一事务中完成，失败回滚并保留旧数据及备份。高于当前代码支持的版本直接拒绝。进程意外退出留下的 `.pending-*` 目录不是有效备份，不能拿它恢复；自动清理/保留策略尚未实现。

下面是在可导入已安装 `dsh-erp` 的 Node 环境中的维护示例；目录必须替换为用户实际目录。在线插件已拥有库时，应通过 `ctx.erp.storage` 调用，不另开第二个客户端：

```js
import { StorageClient, restoreBackup } from 'dsh-erp'

const directory = '/absolute/local/path/dsh-erp-data'
const store = new StorageClient({ directory })
let backup
try {
  console.log(await store.call('check', {}))
  backup = await store.call('backup', {})
} finally {
  await store.dispose()
}

// 目标父目录必须存在，目标目录必须不存在；不会覆盖原数据。
await restoreBackup(directory, backup.id, '/absolute/local/path/dsh-erp-restored')
```

`restoreBackup` 使用独立的离线恢复入口，不打开原数据库，原库损坏时也可用既有 backup ID 恢复。恢复校验 manifest、数据库哈希/版本、外键和完整证据集合；失败清理本次新建的目标目录，现有目录一律拒绝。成功后人工切换 `dataDir` 并重新加载插件；代码不会自动切换或覆盖原库。备份目录中必须保留完整的数据库、manifest 与 evidence，可整体离线复制到本机保存。

## 验证与实际限制

执行 `npm run verify`：当前共 42 项测试，包括 14 项存储专项测试、执行进程取消隔离、安装产物中的恢复链路、真实 dsh CLI 的 SQLite 工具调用。存储用例覆盖建库/重启、范围隔离、不可变观察、任务版本冲突、迁移成功/失败、未来版本拒绝、WAL 备份边界、原库损坏的离线恢复、坏证据、2 MB 证据、排队取消与背压。

性能复现：`npm run build && node scripts/storage-benchmark.mjs`。2026-09-11 本机单次合成基准为 1,000 条观察（每条约 2 KB 文本、独立小证据），逐条提交并执行 100 次中文两字/四字查询：

| 项目 | 本次结果 |
| --- | --- |
| 首次打开 | 45 ms |
| 1,000 次持久提交 | 2,281 ms |
| 100 次检索 | 215 ms |
| 完整备份 | 736 ms |
| 恢复、打开及完整检查 | 861 ms |
| 宿主事件循环延迟 P99 / 最大值 | 10.9 / 10.9 ms（10 ms 采样分辨率） |

这些是本机单次样本，不是跨平台 SLA 或大规模知识库结论。短查询会扫描当前范围，备份占用串行队列，文本/消息和证据有大小上限（文本 100 万字符、单条消息 1,600 万 JSON 字符、Base64 证据 1,200 万字符）。大型库、持续增长的保留策略、语义检索、物理断电恢复、Windows/macOS 和真实 ERP 脱敏仍需后续验收。

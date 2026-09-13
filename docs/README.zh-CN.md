# Adapt ERP · dsh-erp

[English](https://github.com/GuoMonth/dsh-erp/blob/main/README.md) · [npm](https://www.npmjs.com/package/@guosheng_047/dsh-erp) · [版本发布](https://github.com/GuoMonth/dsh-erp/releases) · [更新记录](https://github.com/GuoMonth/dsh-erp/blob/main/CHANGELOG.md)

**通过浏览器学习你的 ERP，将知识保存在自己的电脑上。** Adapt ERP 是 DeepSeek Harness（DSH）的插件。配置自己的 ERP、自己登录，然后让 DSH 观察菜单、页面、字段和业务数据，建立有证据的知识，并在后续对话中复用、核验和补充。

插件从没有站点知识的状态开始，不要求特定 ERP 厂商、API 路径或登录令牌格式。实际兼容性取决于网站界面和认证流程；本预览版不承诺已经成功操作所有 ERP。

**当前交互规则：**确认登录身份后，页面观察与本地知识积累自动进行；每次点击、填写、选择或滚动都单独请求确认，包括查询，因为陌生控件可能自动保存。这是带确认的 AI 学习流程，尚不是无人值守爬取或业务事务引擎。

## 安装

| 要求 | 当前基线 |
| --- | --- |
| Node.js | `>=24.18.0 <25` |
| DSH | `0.1.5-rc.2`，模型在 DSH 中配置 |
| 桌面 | Linux x64、图形会话及 Chromium 系统库 |
| 其他平台 | Windows/macOS 桌面验收待完成 |

已有 DSH：

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.7
```

只有 Node：

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.1.5-rc.2 --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.7
```

从 alpha.7 开始，`@latest` 指向最新发布版本，包括预览版。以上示例固定本版本，便于复现安装。

使用完整 scope 包名，npm 上无 scope 的 `dsh-erp` 属于其他项目。Adapt ERP 是产品名称，安装包名保持不变。源码文档可能先于发布：PR 验证可构建 TGZ 并以绝对路径安装；版本出现在 Releases 后再使用上述 npm 命令。

安装包包含预编译 JavaScript，首次打开浏览器时准备 Chromium。不需要 Python、PostgreSQL、Docker 或独立浏览器服务；Linux 缺少浏览器系统库时仍需安装这些库。

## 配置一次，自己登录

退出 DSH，编辑 `~/.dsh/profiles/web/cordis.patch.yml`；设置 `DSH_HOME` 时使用 `$DSH_HOME/profiles/web/cordis.patch.yml`。如果文件是注释加 `[]`，用下面的配置替换空列表。保留其他条目，已有 `id: erp` 时合并 config，不重复添加。

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/app/#/login"
      name: "我的 ERP"
      account: "我的工作账号"
      # tenant: "我的公司"
      # role: "采购"
```

只有 `url` 必填；名称默认域名，账号别名默认 `default`。身份别名用于隔离知识，不是登录凭据。不同账号、公司或角色使用不同别名，并核对实际登录身份。

入口若为 `https://erp.example.com/app/login`，另填 `baseUrl: "https://erp.example.com/app/"`。否则只在入口路径以 `/` 结尾时推导应用范围。保留原始路径与 hash，使用不带内嵌账号密码或查询参数的长期 HTTP(S) 入口；Base URL 必须以 `/` 结尾且包含入口。详见[配置说明](https://github.com/GuoMonth/dsh-erp/blob/main/docs/system-configuration.md)。

启动：

```sh
dsh web
# 只有 Node 时：
npm exec --yes --package=@deepseek-ai/dsh@0.1.5-rc.2 -- dsh web
```

首次使用 DSH 时，确认预览提示、选择工作区并在 Settings 配置模型。让它通过 `erp_system_status` 核对系统，使用 `erp_connect` 打开入口。你在独立 Chromium 窗口里登录，再在 DSH 确认观察范围。密码、验证码和网站扫码均由你处理；插件不接管日常浏览器，也不管理登录凭据。

## 第一次全面学习

可以发送：

```text
使用 Adapt ERP，先检查配置好的系统及已有知识。
打开 ERP，等我自己登录并确认账号和企业。
开始全面学习：先建立全局菜单框架，再按功能页面、Tab、字段和窗口深入。
依据证据理解业务域，并建立与菜单的关联。持续保存探索队列和发现。
页面交互先请求确认，可能产生写入的失败不要自动重试。
分别报告已观察、待处理和阻塞部分。
```

DSH 驱动以下循环：

1. `erp_system_status → erp_connect → 人工登录 → erp_browser_status → 确认 erp_browser_resume`。
2. `erp_browser_snapshot` 保存可见文字、表格、菜单、字段和选项样本；`erp_learning_import_snapshot` 形成初步界面知识，不依赖厂商菜单 API。
3. AI 决定下一步，通过 `erp_learning_start/status/extend/finish_unit` 维护队列；使用 `erp_browser_action` 请求对精确目标的单次交互确认。动作返回新证据和新的临时引用。
4. `erp_knowledge_record` 保存解释、菜单与业务域关联及学到的方法。后续任务先检索知识，再观察当前页面，按新证据修订。

“全面”指当前账号可访问结构的整体探索，不是下载全部订单或证明所有可能状态。新发现可加入队列，暂停后保留进度。规划由 DSH 模型驱动，安装或登录本身不会启动独立的自动后台爬虫。初步导入只记录可见结构和选项样本，菜单层级、业务含义及跨页关系仍需 AI 依据证据建立。

后续可以问：

- “只用已有知识说明库存流程，展示菜单关联和证据。”
- “在这个 ERP 页面查找商品 `<编码>`，查看库存和相关订单，记录步骤与不确定性。”
- “继续未完成的探索，复核变化的字段，并导出 Markdown 和 JSON。”

第二个例子是模型规划的界面任务，不是内置的商品/订单 API，也不保证完成库存对账。

## 知识属于用户本机

每个系统在数据根目录下对应 `systems/<固定ID>/`，保存 SQLite、证据、导出和私有浏览器资料。`erp_system_status` 返回准确范围和位置。保持配置与目录不变，新对话无需登录即可查询已有知识；实时数据需要当前登录，过去的余额或订单仍是历史观察。

**npm 发布不包含用户知识、浏览器登录资料、测试站点或验收答案。** 安装包只提供学习工具、通用结构和用户指南。SCM/USA 已回到开发测试基准中。分享知识是用户主动导出的独立动作，不属于插件发布。Markdown/JSON 是可读视图，SQLite 保留修订及证据关联。

DSH 使用的观察可能发送给所配置的模型供应商。快照排除密码、隐藏、文件输入、明显凭据字段及 `data-erp-private` 区域，但脱敏不能保证发现所有敏感内容；表格与普通字段可能包含业务数据。交互工具不接受账号密码管理任务。

## 控制与限制

- 每次页面交互单独请求 DSH 确认，包括写入按钮和自动保存输入框；拒绝后不发送交互。观察许可不授予操作权限。
- 操作绑定短期快照引用，不接受模型提供的选择器、JavaScript 或请求 URL。目标变化、导航、过期版本和重复引用均拒绝。动作失败可能已经影响网站，应先检查结果再决定下一步。
- 观察许可最多 10 分钟，人工输入/导航会暂停。动作确认包括读取结果并开启新的有时限观察窗口；重启后重新检查登录和授权。
- 每实例一个配置系统、一个浏览器页面。支持应用内 iframe；跨域 iframe、Canvas、封闭 Shadow DOM、多窗口登录及扫码/SSO 可能需要人工处理，尚未广泛验收。原生浏览器对话框由人处理。
- 快照是有界、非事务性采样。不提供多步骤业务事务、自动重试、无人值守写入或多个 ERP 自动选库。

## 升级与卸载

升级前调用 `erp_storage_backup`，退出 DSH，重复安装命令后重启。保持相同的数据根目录和配置。

**从 alpha.5 升级：**系统 ID 与知识保留。移除 `erp_scm_*` 和 SCM 菜单导入工具，改用通用浏览器学习流程。已有 SCM 记录是历史证据，不是另一套 ERP 的已验证方法；复用步骤前重新观察页面。

**从 alpha.4 或更早升级：**配置 system 会使用独立存储，旧根目录知识保留但不自动导入。退出 DSH 后临时移除 system，可按原 scope 查询、导出或备份旧库，该模式禁用浏览器连接。详见[存储恢复](https://github.com/GuoMonth/dsh-erp/blob/main/docs/storage.md)。alpha.1/alpha.2 TGZ 用户需先移除旧无 scope 插件入口，只启用新包。

退出 DSH 后卸载：

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web remove @guosheng_047/dsh-erp
```

卸载保留数据。同一库只允许一个进程持有，不支持多个独立 DSH 进程同时共享。

## 开发与验证

```sh
npm ci --ignore-scripts
npx playwright install chromium --no-shell
npm run verify
npm pack
```

构建先清理 dist，避免已删除适配器残留进发布包。完整测试在本地执行；手动 Release Action 构建、Trusted Publishing 发布并核验 npm/GitHub 字节。

通用流程通过不同合成 ERP 界面、空知识库、真实 Chromium/IPC 和原生 DSH 确认进行测试。确定性的测试决策不等于真实模型兼容性基准；历史 SCM 实测单独保留，不能据此声称新流程已验证所有 ERP。详见[学习流程与边界](https://github.com/GuoMonth/dsh-erp/blob/main/docs/adaptive-learning.md)和[开发文档](https://github.com/GuoMonth/dsh-erp/blob/main/docs/development.md)。

[MIT](https://github.com/GuoMonth/dsh-erp/blob/main/LICENSE)。依赖保留各自许可，见[第三方声明](https://github.com/GuoMonth/dsh-erp/blob/main/NOTICE.md)。browser-use 与 browser-harness 是前期参考，目前浏览器运行时使用 Playwright。

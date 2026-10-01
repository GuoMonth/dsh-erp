# Adapt ERP · dsh-erp

**0.1.0-alpha.9** 对齐 **DSH `0.2.0-rc.2`（预发布版本）**；标准安装复用原生 Browser Use，显式启用 Computer Use，并支持原生 Skill 经验分享。当前为未发布的源码候选，发布前使用本地 TGZ。

[English](https://github.com/GuoMonth/dsh-erp/blob/main/README.md) · [npm](https://www.npmjs.com/package/@guosheng_047/dsh-erp) · [版本发布](https://github.com/GuoMonth/dsh-erp/releases) · [更新记录](https://github.com/GuoMonth/dsh-erp/blob/main/CHANGELOG.md)

**通过浏览器学习你的 ERP，将知识保存在自己的电脑上。** Adapt ERP 是 DeepSeek Harness（DSH）的插件。配置自己的 ERP、自己登录，然后让 DSH 观察菜单、页面、字段和业务数据，建立有证据的知识，并在后续对话中复用、核验和补充。

插件从没有站点知识的状态开始，不要求特定 ERP 厂商、API 路径或登录令牌格式。实际兼容性取决于网站界面和认证流程；本预览版不承诺已经成功操作所有 ERP。

**当前交互规则：**确认登录身份后，页面观察与本地知识积累自动进行；每次点击、填写、选择或滚动都单独请求确认，包括查询，因为陌生控件可能自动保存。这是带确认的 AI 学习流程，尚不是无人值守爬取或业务事务引擎。

## 安装

| 要求 | 当前基线 |
| --- | --- |
| Node.js | `>=24.18.0 <25` |
| DSH | `0.2.0-rc.2`，模型在 DSH 中配置 |
| 桌面 | Linux x64、图形会话及 Chromium 系统库 |
| 其他平台 | Windows/macOS 桌面验收待完成 |

已有 DSH：

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.9
```

只有 Node：

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.2.0-rc.2 --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.9
```

npm `latest` 包含预览版；需要可复现安装时使用上述精确版本。同时升级宿主与插件；alpha.9 发布前使用本地候选 TGZ。

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
npm exec --yes --package=@deepseek-ai/dsh@0.2.0-rc.2 -- dsh web
```

首次使用 DSH 时，确认预览提示、选择工作区并在 Settings 配置模型。让它通过 `erp_system_status` 核对系统，使用当前原生浏览器工具打开入口。你自行登录并核对账号、公司和角色。密码、验证码和网站扫码均由你处理；插件不管理登录凭据。

## 原生学习与分享

先调用 `erp_system_status` 和 `erp_native_status`，使用宿主原生 Browser Use 打开配置入口，自行登录并核对账号、公司与角色。原生快照之后立即用 `erp_native_observation_save` 保存证据，再记录菜单、业务域与关联。每次操作后重新观察，学习队列和本地知识可跨对话复用。

没有宿主提供方时加载官方 Playwright MCP；Deskwork 复用当前 Electron 网站页面。配置 `computerUse: true` 可显式加载官方 Cua Driver Native，适用于原生窗口或视觉控件，需要操作系统权限及逐次确认。

分享时说“把当前 ERP 的经验导出成 Skill”，一次 `erp_experience_export` 返回标准 Skill 目录。检查自由文本后将整个目录交给别人。接收者说“将这个 Skill 的 references/knowledge.json 导入当前 ERP”，一次确认后由 `erp_experience_import` 重绑定本地知识关系，标记待核验并进入原生 Skill 目录。

不复制账号、登录、原始观察、字段样本和发送者确认；重复导入保留接收者修正。名称和描述仍可能包含私密信息，分享前需检查。导入经验不授予操作权限，应在自己的 ERP 上重新验证。

详见[原生操作与经验分享](native-and-sharing.md)。旧流程需显式设置 `browserMode: managed`，再使用[通用浏览器学习](adaptive-learning.md)中的工具。原生工具结果、截图和附件使用上游处理，不套用旧 DOM 快照脱敏器；原生操作能力并非站点沙箱。

当前完成 Linux x64 真实 Chromium 操作及 Cua Driver 无提示权限检查。真实桌面点击、截图、用户 macOS 和真实业务验收尚未完成。

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

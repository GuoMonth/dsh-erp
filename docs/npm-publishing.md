# npm 与 GitHub Release 发布

包名为 `@guosheng_047/dsh-erp`。当前准备首个 npm 版本 `0.1.0-alpha.3`，公开访问，dist-tag 为 `alpha`；是否已发布以 npm registry 和对应 Release Action 的实际结果为准。无 scope 的 npm 包 `dsh-erp` 不属于本仓库。

## 日常发布

使用 [Release npm package](https://github.com/GuoMonth/dsh-erp/actions/workflows/release.yml)。工作流仅 `workflow_dispatch` 手动触发，且只从 `main` 发布；没有 push、PR、tag 自动触发，也不在 Action 中重复运行完整测试或下载 Chromium。

1. 在本地完成 [交付检查](development.md#本地交付检查)，记录对应提交的命令和结果。更新 package.json、package-lock.json、CHANGELOG 和安装示例，将变更合并到 main。
2. 打开 Actions → Release npm package → Run workflow，选择 main，填写与 package.json 完全一致的 `version`。
3. 首次可保留 `dry_run=true`：只安装构建依赖、编译、打包，检查名称/版本、已有 tag/registry 产物；不向 npm 或 GitHub 发布。
4. 正式执行时取消 dry_run，日常认证 `auth=trusted`。工作流发布同一个预编译 TGZ 到 npm，下载 registry TGZ 比对 SHA512，再建立 GitHub tag 和 Release，附 TGZ 与 SHA256SUMS。

版本为 `x.y.z-alpha.N`、`beta.N` 或 `rc.N` 时，publishConfig.tag 须分别是 alpha、beta、rc；稳定版本使用 latest。发布参数来自受检查的 package.json，不执行输入框内的脚本。

同版本重复运行只接受相同 TGZ 且 dist-tag 仍指向该版本；遇到不同内容、其他提交的 Git tag 或冲突附件时失败，不覆盖版本或附件。npm 成功而 GitHub 发布中断时，可在同一提交重跑补齐附件。此时不要为了改文档再把同一版本从新提交发布；后续变更应升级版本。

发布 Action 的编译和字节校验不代替本地业务验收；未配置 npm 授权时预演仍能运行，预演成功不代表 npm 发布权限已经验证。

## 首次发布：一次性 Token

npm Trusted Publisher 要绑定已存在的包；本包尚未创建，因此第一次选择 `auth=bootstrap-token`。工作流会拒绝用该模式给已经存在的包发布新版本，之后必须改用 trusted。

1. 用 `guosheng_047` 登录 npm，创建 Granular Access Token。Packages and scopes 选择 `Read and write (publish and stage)`，范围限定 `@guosheng_047` scope；新包不存在时选择 scope 权限。勾选 `Bypass two-factor authentication`，Organizations 为 No access，有效期建议 1 天。[npm 权限说明](https://docs.npmjs.com/creating-and-viewing-access-tokens/)
2. 在本仓库 Settings → Environments → **npm-release** → Environment secrets 中添加 **NPM_TOKEN**，值为这个 Token。不需要在开发机配置环境变量，不需要把 Token 发给维护代理。
3. 手动运行 Release Action，version 填 `0.1.0-alpha.3`，dry_run 取消，auth 选择 bootstrap-token。
4. 首次成功后，按下一节配置 npm Trusted Publisher，然后撤销临时 Token 并删除 GitHub 中的 NPM_TOKEN Secret。

Token 只注入首次发布步骤，npmrc 使用环境变量占位符并在该步骤退出时清理；构建、依赖安装及日常 OIDC 发布不接收 NPM_TOKEN。

## 后续发布：Trusted Publishing

在 npm 的 `@guosheng_047/dsh-erp` 包 Settings → Trusted Publisher 中选择 GitHub Actions：

| 配置项 | 值 |
| --- | --- |
| Organization or user | GuoMonth |
| Repository | dsh-erp |
| Workflow filename | release.yml |
| Environment name | npm-release |
| Allowed actions | 允许直接 npm publish |

这是包级授权，不能复用另一个仓库的绑定。配置后选 auth=trusted，使用 GitHub OIDC 短期身份及 npm provenance，不需要长期 npm Token。[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)

工作流使用固定 Node 24 基线和 npm 11.16.0。GitHub Actions 的 contents:write 用于创建版本 tag/Release，id-token:write 用于 OIDC；npm-release Environment 将首次 Secret 与发布任务关联。

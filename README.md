# dsh-erp

[简体中文](https://github.com/GuoMonth/dsh-erp/blob/main/docs/README.zh-CN.md) · [npm](https://www.npmjs.com/package/@guosheng_047/dsh-erp) · [Releases](https://github.com/GuoMonth/dsh-erp/releases) · [Changelog](https://github.com/GuoMonth/dsh-erp/blob/main/CHANGELOG.md)

Build a menu map of your ERP, connect menus to business concepts, and trace a product through stock, purchase orders and sales orders from DeepSeek Harness (DSH). Keep observations, supporting evidence and revisable knowledge in local SQLite and files.

**This is a read-only preview for an adapted SCM/USA system family.** It runs as a plugin inside your local DSH installation. Support for other ERP systems and automatic exploration of every page, tab and dialog remain future work.

## Install and start

You need:

| Requirement | Supported setup |
| --- | --- |
| Node.js | `>=24.18.0 <25` |
| DSH | `0.1.5-rc.2` |
| Desktop | Linux x64 with a graphical session and Chromium system libraries; Windows/macOS desktop acceptance is pending |
| Services | Access to a compatible SCM site and a model configured in DSH; real ERP validation used `deepseek-flash` |

With DSH already installed, add the plugin to your `web` profile:

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.4
dsh web
```

The commands pin the verified preview. The `alpha` tag may resolve through cached package-manager metadata immediately after a release. Use the full scoped name: the unscoped npm package `dsh-erp` belongs to another project. Replace `web` with your own profile if needed.

If only Node is installed, npm can prepare the pinned DSH and pnpm versions:

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.1.5-rc.2 --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.4
npm exec --yes --package=@deepseek-ai/dsh@0.1.5-rc.2 -- dsh web
```

Configure a model in DSH before asking it to use the plugin. Installation fetches npm dependencies; the plugin prepares its pinned Chromium on first browser use. The TGZ contains precompiled JavaScript, so users do not need TypeScript, Python, PostgreSQL, Docker or a separate browser service. Linux browser libraries must already be available or be installed by the user.

For a local TGZ from [GitHub Releases](https://github.com/GuoMonth/dsh-erp/releases), replace the package spec in the install command with its absolute file path.

## Your first session

On a fresh DSH installation, acknowledge the preview notice, choose a workspace and configure a model in Settings. Then give DSH a task like this, replacing the placeholder with your site root URL:

```text
Use the ERP plugin to connect to <my SCM site root URL>.
I will log in in the browser window. Use local aliases for the site,
account, company and role so knowledge stays in the right scope.
First import the global menu structure, then explain how the menus
relate to products, inventory, purchasing and sales. Mark unnamed
entries and pages that have not been visited. Save explanations
with their supporting evidence. Only perform read queries.
```

The plugin opens a separate local Chromium window for manual login. Enter your password and verification code there. Approve the plugin's read access in DSH after login. A permission grant is bound to the current session and scope, and lasts up to 10 minutes or 250 queries. Taking over the browser or losing the session revokes the grant; reconnecting requires a fresh check and approval.

Then try:

- “Find product code `<code>`, show its shared stock balance and related purchase/sales orders. Report how much of the order history you scanned.”
- “Which menus support the inventory domain? Show the evidence for those links.”
- “Export what you have learned as Markdown and JSON, and list conclusions that still need review.”

To check installation before accessing an ERP, ask DSH to call `erp_runtime_status` and `erp_storage_status`. They report the local worker and storage state without accessing the ERP.

## What the preview provides

| Capability | Current behavior |
| --- | --- |
| Menu map | Import the current account's menu metadata into a versioned hierarchy; retain unnamed entries and retired relationships |
| Business understanding | Let DSH relate menus to domains, objects and fields, with evidence, revisions and distinctions between AI inference and user confirmation |
| Product trace | Join product SKU IDs to purchase/sales order lines; report shared product-level (SPU) stock, scan limits and original order states |
| Learning continuity | Persist an explicitly listed, breadth-first task queue, observations and blocked outcomes across restarts |
| Local knowledge | Search and follow relationships, export Markdown/JSON, and create consistent SQLite/evidence backups |

Menu metadata discovery does not mean every page has been visited. The task queue preserves listed work; it does not automatically discover and operate every tab, button or nested window.

## Supported scope and data

Business reads use a fixed adapter for the SCM/USA interfaces under `/api/loveinway-admin`. The browser supplies login state and page observations; API responses are recorded as API evidence. This version does not learn arbitrary ERP APIs or register ERP business-write tools.

Product traces scan at most 100 purchase orders and 100 sales orders per call and explicitly report partial coverage. An order's cancelled/draft status or historical quantities do not establish actual stock movement. Inventory reconciliation, returns and unit conversion need further validation.

Knowledge and browser data stay on your machine; observations used by DSH may be sent to your configured model provider. Local storage does not imply offline AI processing. The adapter keeps its login token in the browser worker and excludes it from model-facing results. Other DSH tools and plugins retain their own permissions.

The recorded baseline used Linux x64, real DSH and `deepseek-flash`, and one SCM site. It established menu/domain links and matched a product trace against independently read orders. It is not a cross-platform or general ERP benchmark. See the [acceptance report (简体中文)](https://github.com/GuoMonth/dsh-erp/blob/main/docs/assessments/2026-09-12-v1-acceptance.md).

## Update, restart and remove

Before updating, ask DSH to call `erp_storage_backup`, then stop DSH and repeat the install command. Restart DSH afterward. Knowledge and tasks persist; browser login and read permission must be checked again.

To remove the plugin from the same profile after stopping DSH:

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web remove @guosheng_047/dsh-erp
```

Removal retains your knowledge, evidence and browser data. See the [storage guide (简体中文)](https://github.com/GuoMonth/dsh-erp/blob/main/docs/storage.md) for data locations and recovery.

**Migrating from the alpha.1/alpha.2 TGZ:** back up, stop DSH and remove the old `dsh-erp` package from the profile before installing `@guosheng_047/dsh-erp`. Both use the same plugin entry and data directory; enable only one. The remove command above can be used with the old name for this migration.

## Development and documentation

From a source checkout with Node 24.18+ and the browser system libraries:

```sh
npm ci --ignore-scripts
npx playwright install chromium --no-shell
npm run verify
npm pack
```

Full tests run locally. The manual Release Action builds the TGZ, publishes it to npm and verifies matching GitHub assets. A dry run does not prove OIDC publishing permission. Report bugs through [GitHub Issues](https://github.com/GuoMonth/dsh-erp/issues), including versions and reproduction steps; keep credentials and private ERP records out of public reports.

Detailed guides are currently in Simplified Chinese:

- [SCM queries and session behavior](https://github.com/GuoMonth/dsh-erp/blob/main/docs/scm-readonly.md)
- [Knowledge, evidence and revisions](https://github.com/GuoMonth/dsh-erp/blob/main/docs/knowledge.md)
- [Development and local checks](https://github.com/GuoMonth/dsh-erp/blob/main/docs/development.md)
- [Release configuration](https://github.com/GuoMonth/dsh-erp/blob/main/docs/npm-publishing.md)
- [Roadmap](https://github.com/GuoMonth/dsh-erp/blob/main/docs/v1-plan.md)

## License

[MIT](https://github.com/GuoMonth/dsh-erp/blob/main/LICENSE). Dependencies keep their own licenses; see [third-party notices](https://github.com/GuoMonth/dsh-erp/blob/main/NOTICE.md). Chromium is downloaded separately. `browser-use` and `browser-harness` informed the research and are not bundled runtime dependencies.

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
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.5
dsh web
```

This guide describes **0.1.0-alpha.5**. Source/PR documentation can precede publication: use the npm commands once that version appears in Releases, or build and install this checkout’s TGZ for PR testing. Published alpha.4 does not include the configuration flow below. The commands pin the preview version. The `alpha` tag may resolve through cached package-manager metadata immediately after a release. Use the full scoped name: the unscoped npm package `dsh-erp` belongs to another project. Replace `web` with your own profile if needed.

If only Node is installed, npm can prepare the pinned DSH and pnpm versions:

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.1.5-rc.2 --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.5
npm exec --yes --package=@deepseek-ai/dsh@0.1.5-rc.2 -- dsh web
```

Configure a model in DSH before asking it to use the plugin. Installation fetches npm dependencies; the plugin prepares its pinned Chromium on first browser use. The TGZ contains precompiled JavaScript, so users do not need TypeScript, Python, PostgreSQL, Docker or a separate browser service. Linux browser libraries must already be available or be installed by the user.

For a local TGZ from [GitHub Releases](https://github.com/GuoMonth/dsh-erp/releases), replace the package spec in the install command with its absolute file path.

## Configure your ERP once

After installing the plugin, stop DSH. Add the following entry to `~/.dsh/profiles/web/cordis.patch.yml` (or `$DSH_HOME/profiles/web/cordis.patch.yml` if you set `DSH_HOME`). If the file contains comments followed by `[]`, replace that empty list with the block below. Preserve existing entries; if an `id: erp` override already exists, merge its config rather than adding another one. Replace the example URL with your own ERP entry. Restart with `dsh web`.

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/#/login"
      name: "My ERP"
      account: "my-work-account"
      # tenant: "my-company"
      # role: "purchasing"
```

Only `url` is required. The name defaults to the hostname and the local account alias to `default`. These are labels for knowledge isolation, **not login credentials**. Configure distinct account/company/role aliases before using a different identity. This preview uses DSH's existing patch file; it does not add an ERP settings page or a system-switcher UI.

The entry is opened unchanged, including its path and hash. For `https://erp.example.com/app/login`, also set `baseUrl: "https://erp.example.com/app/"` in `system`. Otherwise the application root is inferred only when the entry's path ends in `/`, such as `/app/#/login`. The base must end in `/` and contain the entry. Use a durable HTTP(S) entry without embedded credentials or query parameters, including queries inside the hash. Transient SSO links are not configuration values; complete login manually in the browser.

**A configurable URL does not make arbitrary ERPs compatible.** Business reads still require the SCM/USA adapter described below.

## Your first session

On a fresh DSH installation, acknowledge the preview notice, choose a workspace and configure a model in Settings. Then ask:

```text
Check my configured ERP system and any existing knowledge first.
Open that ERP so I can log in manually. After I confirm the identity
and approve read access, import the global menu structure and explain
its links to products, inventory, purchasing and sales. Mark unnamed
entries and unvisited pages. Save explanations with supporting evidence.
Only perform read queries.
```

The flow is `erp_system_status → erp_scm_connect → manual login → erp_browser_status → erp_scm_enable`. Enter passwords, verification codes or scan the site's QR code in the separate local Chromium window; the plugin does not attach to your everyday browser. QR/SSO behavior depends on the website and has not been separately accepted. If login opens multiple tabs, finish login and leave one ERP page within the configured application before approving reads.

Confirm that the account/company/role shown in the DSH read-approval request matches your login. Detection of a missing password field or a token does not verify your business identity. Read permission lasts up to 10 minutes or 250 queries. Taking over the browser, navigation or losing the session revokes it. A missing SCM token can mean login is incomplete or the ERP is incompatible; it does not authorize an alternative API or an automated login attempt.

In later conversations, ask DSH to call `erp_system_status` and reuse its exact `scope`. Saved knowledge, evidence and listed exploration tasks survive restart with the same configuration and data root. You can ask about them **without opening or logging into the ERP**. Live stock/order queries require login and current approval; historical observations are not current balances. Login may expire, and read grants never survive restart. One system is configured per plugin instance; automatic conversation-based routing between multiple ERPs is future work.

Then try:

- “Find product code `<code>`, show its shared stock balance and related purchase/sales orders. Report how much of the order history you scanned.”
- “Using saved knowledge only, which menus support inventory? Show the evidence and when it was observed.”
- “Export what you have learned as Markdown and JSON, and list conclusions that still need review.”

`erp_system_status`, `erp_runtime_status` and `erp_storage_status` check configuration, the local worker and storage without accessing the ERP. If no system is configured, browser tools give configuration guidance; they do not accept an address from the model.

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

## Local system files and changes

`erp_system_status` reports the actual data directory. Under the plugin's data root, each application gets `systems/<permanent-ID>/` with `system.json`, `store.sqlite`, `evidence/`, `exports/`, `backups/` and private `browser-profiles/`. URL lookup records live in `systems/by-url/`; the URL itself is not a directory name. Account/company/role knowledge is isolated inside that system, and browser profiles are isolated by identity. SQLite is authoritative; Markdown/JSON exports are readable projections, not a second editable database.

Renaming the system or changing only its login hash within the same base keeps its ID and knowledge. A different application base creates a separate system; changing back recovers the previous one. A domain migration, URL alias merge or legacy-data import needs an explicit future migration, not an automatic guess. Restart DSH after configuration changes. Keep the same data root across updates. One DSH process owns a store at a time; independent DSH processes cannot concurrently share it.

## Update, restart and remove

Before updating, ask DSH to call `erp_storage_backup`, then stop DSH and repeat the install command. Restart DSH afterward. Knowledge and tasks persist; browser login and read permission must be checked again.

To remove the plugin from the same profile after stopping DSH:

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web remove @guosheng_047/dsh-erp
```

Removal retains your knowledge, evidence and browser data. See the [storage guide (简体中文)](https://github.com/GuoMonth/dsh-erp/blob/main/docs/storage.md) for data locations and recovery.

**Upgrading from alpha.4 or earlier:** back up with the old configuration before changing it. Configuring `system` creates a separate system store; existing root-level knowledge is preserved but not automatically copied or reassigned. Without `system`, the new plugin can still query/export/back up that legacy store using its original scopes, but browser connections are disabled. To revisit legacy data, stop DSH, temporarily remove the `system` config, query/export, then restore the config and restart. Do not move live SQLite/WAL files or change scope IDs manually. Automatic legacy import is deferred. See [system configuration and migration](https://github.com/GuoMonth/dsh-erp/blob/main/docs/system-configuration.md).

**Migrating from the alpha.1/alpha.2 TGZ:** back up, stop DSH and remove the old `dsh-erp` package from the profile before installing `@guosheng_047/dsh-erp`. Both use the same plugin entry and data root; enable only one. The system-store migration note above also applies. The remove command above can be used with the old name for this migration.

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

- [System configuration, local files and future multi-ERP design](https://github.com/GuoMonth/dsh-erp/blob/main/docs/system-configuration.md)
- [SCM queries and session behavior](https://github.com/GuoMonth/dsh-erp/blob/main/docs/scm-readonly.md)
- [Knowledge, evidence and revisions](https://github.com/GuoMonth/dsh-erp/blob/main/docs/knowledge.md)
- [Development and local checks](https://github.com/GuoMonth/dsh-erp/blob/main/docs/development.md)
- [Release configuration](https://github.com/GuoMonth/dsh-erp/blob/main/docs/npm-publishing.md)
- [Roadmap](https://github.com/GuoMonth/dsh-erp/blob/main/docs/v1-plan.md)

## License

[MIT](https://github.com/GuoMonth/dsh-erp/blob/main/LICENSE). Dependencies keep their own licenses; see [third-party notices](https://github.com/GuoMonth/dsh-erp/blob/main/NOTICE.md). Chromium is downloaded separately. `browser-use` and `browser-harness` informed the research and are not bundled runtime dependencies.

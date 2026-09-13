# Adapt ERP · dsh-erp

[简体中文](https://github.com/GuoMonth/dsh-erp/blob/main/docs/README.zh-CN.md) · [npm](https://www.npmjs.com/package/@guosheng_047/dsh-erp) · [Releases](https://github.com/GuoMonth/dsh-erp/releases) · [Changelog](https://github.com/GuoMonth/dsh-erp/blob/main/CHANGELOG.md)

**Learn your ERP through its browser interface, and keep the knowledge on your machine.** Adapt ERP is a plugin for DeepSeek Harness (DSH). Configure your ERP, log in yourself, and let DSH observe menus, pages, fields and business data, build evidence-backed knowledge, and reuse it in later conversations.

The plugin starts without site-specific knowledge. It does not require a particular ERP vendor, API path or login-token format. Compatibility depends on the site's interface and authentication; this preview does not claim successful operation on every ERP.

**Preview interaction policy:** page observation and local knowledge accumulation are automatic after you confirm your login scope. Every click, fill, selection or scroll asks for individual approval, including queries—an unfamiliar control may save data. This is AI-guided learning with confirmations, not unattended crawling or a transaction engine.

## Install

| Requirement | Current baseline |
| --- | --- |
| Node.js | `>=24.18.0 <25` |
| DSH | `0.1.5-rc.2`, with a model configured in DSH |
| Desktop | Linux x64, a graphical session and Chromium system libraries |
| Other platforms | Windows/macOS desktop acceptance pending |

With DSH installed:

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.7
```

With only Node installed:

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.1.5-rc.2 --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.7
```

From alpha.7 onward, `@latest` selects the newest published release, including previews. The examples pin this version for reproducibility.

Use the full scoped name; the unscoped npm package `dsh-erp` is another project. Adapt ERP is the product name; the package name stays unchanged. Source documentation can precede publication: for PR testing, build a TGZ and replace the package spec with its absolute path. Use the npm command once the version appears in Releases.

The package contains compiled JavaScript. Chromium is prepared on first browser use. No Python, PostgreSQL, Docker or separate browser service is required; missing Linux browser libraries still need to be installed.

## Configure once, then log in yourself

Stop DSH and edit `~/.dsh/profiles/web/cordis.patch.yml`, or `$DSH_HOME/profiles/web/cordis.patch.yml` when `DSH_HOME` is set. If the file contains comments and `[]`, replace that empty list with the block below. Preserve existing entries and merge an existing `id: erp` config instead of duplicating it.

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/app/#/login"
      name: "My ERP"
      account: "my-work-account"
      # tenant: "my-company"
      # role: "purchasing"
```

Only `url` is required. The name defaults to the hostname, account to `default`. Identity aliases isolate knowledge; they are not credentials. Use distinct aliases for different accounts, companies or roles and confirm they match your actual login.

For an entry such as `https://erp.example.com/app/login`, also set `baseUrl: "https://erp.example.com/app/"`. Otherwise the base is inferred only if the entry path ends in `/`. Entry paths and hash routes are preserved. Use a durable HTTP(S) entry without embedded credentials or query parameters; the base must end in `/` and contain the entry. See [configuration details](https://github.com/GuoMonth/dsh-erp/blob/main/docs/system-configuration.md).

Start DSH:

```sh
dsh web
# With only Node:
npm exec --yes --package=@deepseek-ai/dsh@0.1.5-rc.2 -- dsh web
```

On a fresh DSH installation, acknowledge its preview notice, choose a workspace and configure a model in Settings. Ask it to check `erp_system_status` and open your ERP with `erp_connect`. Log in in the dedicated Chromium window, then confirm the observation scope in DSH. Passwords, codes and QR login stay with you; the plugin does not attach to your everyday browser or manage credentials.

## First learning round

Try this task:

```text
Use Adapt ERP with my configured system. Check existing knowledge first.
Open the ERP and wait for me to log in and confirm the account/company.
Start a comprehensive learning round: map global menus before going deeper,
then explore functional pages, tabs, fields and windows. Build business-domain
understanding from the evidence and link it back to menus. Persist the queue
and discoveries as you go. Ask before page interactions; never auto-retry a
possible write. Report observed, pending and blocked areas separately.
```

DSH uses this loop:

1. `erp_system_status` → `erp_connect` → manual login → `erp_browser_status` → confirmed `erp_browser_resume`.
2. `erp_browser_snapshot` saves visible text/tables, menus, fields and option samples. `erp_learning_import_snapshot` builds initial UI knowledge without a vendor-specific menu API.
3. DSH plans the next step, maintains `erp_learning_start/status/extend/finish_unit`, and requests `erp_browser_action` for an exact observed target. Each approved action returns fresh evidence and new target refs.
4. `erp_knowledge_record` saves interpretations, menu/domain relationships and learned methods. Later tasks retrieve that knowledge, inspect the current UI and revise it when evidence changes.

“Comprehensive” means working across the current account's accessible structure. It does not mean downloading every order or proving every possible state. New discoveries extend the queue; pause/resume retains known work. The DSH model drives planning—installation or login does not independently start an autonomous background crawler. The initial importer records visible structure and option samples; the model still has to establish hierarchy, business meaning and cross-page relationships from evidence.

Then ask:

- “Using saved knowledge only, explain the inventory workflow and show the menu links and evidence.”
- “Find product `<code>` in this ERP's UI, inspect its stock and related orders, and record the steps and uncertainty.”
- “Continue the unfinished learning round. Review changed fields and export the knowledge as Markdown and JSON.”

The second example is a model-planned UI task, not a built-in product/order API or a guaranteed accounting reconciliation.

## Knowledge belongs to your installation

Each system has `systems/<permanent-ID>/` under the local data root, containing SQLite, evidence, exports and private browser profiles. `erp_system_status` reports its exact scope and directory. With the same configuration/data root, later conversations can read saved knowledge without opening a browser. Live data requires a current login; old balances and orders remain historical observations.

**User knowledge, browser login data, test fixtures and benchmark answers are not included in npm releases.** The package ships the learning tools, generic schemas and user guides. SCM/USA examples now live only in the development test baseline. Local knowledge sharing is an explicit user export, not part of publishing the plugin. Markdown/JSON exports are readable projections; SQLite retains revisions and evidence links.

Observations supplied to DSH may be sent to your configured model provider. Snapshots exclude password/hidden/file inputs, obvious credential fields and `data-erp-private` regions, but redaction is best effort. Tables and ordinary fields can contain business data. No credentials are requested through the interaction tool.

## Controls and limits

- Every page interaction needs a separate DSH approval. This also covers write buttons and autosaving inputs; denying the request sends no interaction. Observation authorization alone never permits an action.
- Actions use short-lived snapshot refs, not model-provided selectors, JavaScript or request URLs. Changed targets, navigation, stale revisions or reused refs are rejected. A failed action may already have reached the site: inspect the result before trying again.
- Observation grants expire after 10 minutes and pause on human input/navigation. Action approval includes reading its result and a renewed bounded observation window. Login and grants are rechecked after restart.
- One configured system and one browser page per instance. Same-application frames are supported; cross-origin frames, canvas/closed-shadow interfaces, multi-window login and QR/SSO flows may require manual handling and are not broadly accepted yet. Native browser dialogs remain for the human.
- Snapshots are bounded, non-transactional samples. Multi-step business transactions, automatic retries, unattended write workflows and automatic selection among multiple ERPs are not provided.

## Upgrade and remove

Before upgrading, call `erp_storage_backup`, stop DSH, repeat the install command and restart. Keep the same data root and configuration.

**From alpha.5:** system IDs and stored knowledge remain. Fixed `erp_scm_*` tools and SCM menu import are removed; use the browser learning flow. Existing SCM-derived records are historical evidence, not preverified methods for another ERP. Reobserve pages before using an old procedure.

**From alpha.4 or earlier:** configuring `system` uses a separate store. The original root-level data is retained, not automatically imported. With DSH stopped, temporarily omit `system` to query/export/back up the old store under its original scope; browser connection is disabled in that mode. See [storage and recovery](https://github.com/GuoMonth/dsh-erp/blob/main/docs/storage.md). For alpha.1/alpha.2 TGZ installations, first remove the old unscoped plugin entry and enable only the scoped package.

After stopping DSH:

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web remove @guosheng_047/dsh-erp
```

Uninstalling retains your data. One process owns a store at a time; independent DSH processes cannot concurrently share it.

## Development and validation

```sh
npm ci --ignore-scripts
npx playwright install chromium --no-shell
npm run verify
npm pack
```

The build cleans `dist` so removed adapters cannot survive into a later package. Full tests run locally; the manual Release Action builds, publishes through Trusted Publishing and checks registry/GitHub bytes.

The generic path is exercised with distinct synthetic ERP UIs, empty stores, real Chromium/worker IPC and native DSH approvals. Deterministic test decisions are not a real-model compatibility benchmark. Historical live SCM acceptance is retained as a separate baseline and is not proof that the new UI workflow works on every ERP. See [learning and boundaries](https://github.com/GuoMonth/dsh-erp/blob/main/docs/adaptive-learning.md) and [development documentation](https://github.com/GuoMonth/dsh-erp/blob/main/docs/development.md).

[MIT](https://github.com/GuoMonth/dsh-erp/blob/main/LICENSE). Dependencies retain their own licenses; see [notices](https://github.com/GuoMonth/dsh-erp/blob/main/NOTICE.md). `browser-use` and `browser-harness` informed the research; Playwright is the current browser runtime.

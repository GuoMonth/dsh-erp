# Adapt ERP · dsh-erp

[简体中文](https://github.com/GuoMonth/dsh-erp/blob/main/docs/README.zh-CN.md) · [npm](https://www.npmjs.com/package/@guosheng_047/dsh-erp) · [Releases](https://github.com/GuoMonth/dsh-erp/releases) · [Changelog](https://github.com/GuoMonth/dsh-erp/blob/main/CHANGELOG.md)

**Learn your ERP through its browser interface, and keep the knowledge on your machine.** Adapt ERP is a plugin for DeepSeek Harness (DSH). Configure your ERP, log in yourself, and let DSH observe menus, pages, fields and business data, build evidence-backed knowledge, and reuse it in later conversations.

The plugin starts without site-specific knowledge. It does not require a particular ERP vendor, API path or login-token format. Compatibility depends on the site's interface and authentication; this preview does not claim successful operation on every ERP.

**Preview interaction policy:** native browser and desktop calls request individual DSH approval. Deskwork follows its task-owned page confirmation policy. Log in manually, build local knowledge on demand, and reobserve after operations. Shared experience never transfers operation authority.

Version **0.1.0-alpha.9** targets **DSH `0.2.0-rc.2` (prerelease)**. Standard installation now uses native DSH Browser Use and supports opt-in Computer Use, with reusable experience exported as native Skills. This source candidate is not published yet.

## Install

| Requirement | Current baseline |
| --- | --- |
| Node.js | `>=24.18.0 <25` |
| DSH | `0.2.0-rc.2`, with a model configured in DSH |
| Desktop | Linux x64, a graphical session and Chromium system libraries |
| Other platforms | Windows/macOS desktop acceptance pending |

With DSH installed:

```sh
npm exec --yes --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.9
```

With only Node installed:

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.2.0-rc.2 --package=pnpm@11.7.0 -- dsh plugin --profile web add @guosheng_047/dsh-erp@0.1.0-alpha.9
```

The npm `latest` tag includes previews. Pin the exact version above for reproducible installation. Upgrade the host and plugin together. Use a local candidate TGZ until alpha.9 is published.

Use the full scoped name; the unscoped npm package `dsh-erp` is another project. Adapt ERP is the product name; the package name stays unchanged. Source documentation can precede publication: for PR testing, build a TGZ and replace the package spec with its absolute path. Use the npm command once the version appears in Releases.

The package contains compiled JavaScript. The official Playwright MCP provider prepares Chromium; you can also configure an installed executable or attach to a host-owned browser. No Python, PostgreSQL, Docker or separate browser service is required; missing Linux browser libraries still need to be installed.

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
dsh --profile web
# With only Node:
npm exec --yes --package=@deepseek-ai/dsh@0.2.0-rc.2 -- dsh --profile web
```

On a fresh DSH installation, acknowledge its preview notice, choose a workspace and configure a model. Ask for `erp_system_status` and `erp_native_status`, open the configured ERP with the native browser tools, and log in yourself. ERP reuses the host's Browser Use provider; otherwise it loads official Playwright MCP. Enable `computerUse: true` explicitly for the official native Cua Driver.

## Learn and share

Ask DSH to map accessible menus first, then explore pages, fields and business domains. Check saved knowledge before operating, obtain current observations and approvals, and verify the result afterwards. Immediately after a native snapshot, `erp_native_observation_save` retains evidence for `erp_knowledge_record`. DSH drives planning; the local learning queue preserves unfinished work.

Ask “Export this ERP's experience as a shareable Skill.” `erp_experience_export` creates a standard `SKILL.md` directory with a JSON reference. Review its free text, then give the directory to another user. A DSH filesystem Skill provider can discover it directly.

The recipient can ask “Import this Skill's references/knowledge.json into my configured ERP.” `erp_experience_import` asks for one confirmation, rebinds knowledge and relations to their local scope, marks everything `needs-review`, and registers the native Skill. Reimporting the same content preserves local edits. It copies no login, field samples, raw evidence or user confirmations; imported experience grants no operation authority.

See [native operation and sharing](docs/native-and-sharing.md) for exact configuration, tools and limitations. The old controlled browser is still selectable with `browserMode: managed`; its flow is documented in [adaptive learning](docs/adaptive-learning.md).

## Knowledge belongs to your installation

Each system has `systems/<permanent-ID>/` under the local data root, containing SQLite, evidence and exports. Native providers own browser resources; the explicit managed mode also keeps private browser profiles. `erp_system_status` reports its exact scope and directory. With the same configuration/data root, later conversations can read saved knowledge without opening a browser. Live data requires a current login; old balances and orders remain historical observations.

**User knowledge, browser login data, test fixtures and benchmark answers are not included in npm releases.** The package ships the learning tools, generic schemas and user guides. SCM/USA examples now live only in the development test baseline. Local knowledge sharing is an explicit user export, not part of publishing the plugin. Markdown/JSON exports are readable projections; SQLite retains revisions and evidence links.

Observations and screenshots may be sent to your configured model provider. Native tools use upstream result and attachment handling, and do not use the old ERP DOM redaction filter. Review business information before observing or sharing.

## Controls and limits

Native browser and computer calls require individual DSH approval. Deskwork retains its task-owned browser confirmation policy. Native providers own live element references, browser sessions, attachments and cleanup; ERP URL matching controls evidence admission, not the tools' host-level capabilities. Imported claims remain historical until revalidated. No unattended transaction engine or multi-ERP automatic routing is provided.

Linux x64 Chromium and native Cua Driver permission-status checks are verified. Real OS input, screenshots, user macOS and real ERP acceptance remain pending.

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

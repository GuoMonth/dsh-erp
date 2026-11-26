# Native operation and sharing

[简体中文](native-and-sharing.md) · [Guides](index.md)

## Observe, operate, save

Standard installation inserts the package `@guosheng_047/dsh-erp`. The desktop client attaches to that row. The host entry is the same one exported from `./native`: it reuses DSH tools, Sessions, approvals, attachments and Skills. An existing Browser Use provider is reused; otherwise official Playwright MCP is loaded.

1. Open the site conversation from Adapt ERP. In a single-site profile, call `erp_system_status` to associate the current conversation. Use `erp_native_status` to see its scope and snapshot tools, then open the configured entry and sign in manually.
2. Take a snapshot with `browserSnapshotTool`, then call `erp_native_observation_save` immediately. Evidence belongs to the same Agent, site scope, and active provider. A subsequent native operation invalidates the capture.
3. A saved snapshot is normalized into importable `browser-learning-v1` evidence. Use `erp_learning_begin` so the controller owns the frontier, and `erp_knowledge_record` for a local revision that cites the observation ID and an exact quote.
4. After an operation, take a fresh snapshot and check the outcome. Saved observations are historical evidence; their element references cannot be reused.

ERP supports snapshots from official Playwright MCP and Chrome DevTools MCP. Stagehand and other providers without an ERP adapter can still run under DSH policy. Their `browserSnapshotTool` is `null`, and exploration reports that the active provider lacks an ERP snapshot tool. Playwright keeps its upstream tool names and arguments. Its click tool uses `target`. Ending an attached Playwright session releases the connection and retains the external browser.

ERP adds per-call approval for Playwright MCP, Chrome DevTools MCP, Stagehand, and native Cua Driver tools in a site-associated conversation. Other conversations use the host's approval policy. A host denial or cancellation stands. Navigation and ERP writes require confirmation. A local knowledge revision affects the index on this machine. ERP checks browser URLs when admitting evidence. Screenshots and tool results follow DSH attachment handling and may contain private information.

`computerUse: true` loads the official native Cua Driver, requiring its optional package and OS permissions. Check `desktopSnapshotTool` for the window snapshot tool. A permissions check can use `cua_driver_native__check_permissions` with `prompt: false`. Saving window evidence requires a separate confirmation for the exact captured window. A replacement capture needs its own confirmation.

## Share pack

The primary share is the zip from `erp_share_export`. On the desktop, Share on a site downloads that same pack. Read the free text before sending it. The plugin does not upload it.

```text
erp-share-pack.zip
  manifest.json
  knowledge.jsonl
```

`manifest.json` uses `format` `dsh-erp-share-pack` and starts at `schemaVersion` 1. It carries the producer app and version, the normalized entry, the display name, the workspace id, the inventory, and the sha256 of `knowledge.jsonl`. Each line of `knowledge.jsonl` is one record with `format`, `schemaVersion`, `kind`, and that record's own version. Login, cookies, credentials, raw observations, screenshots, field samples, and confirmations stay out. This is not a [storage backup](storage.en.md).

## Import a pack

Pick a local zip on the desktop, or give `erp_share_import` an absolute path. Import asks for one confirmation. Records are marked `interpreted` and `needs-review`, and they are rebound to the receiver's own scope. The pack's code is not executed. It grants no login or write permission.

Readers accept `schemaVersion` 1. Unknown keys are ignored. An unknown `kind` is skipped with a warning and the remaining records continue. A newer `schemaVersion`, or a `format` that is not recognized, refuses the whole pack and writes nothing. Importing the same content again preserves local corrections.

## Skill directory

`erp_experience_export` can still write a Skill directory. That path is secondary, not the primary share:

```text
erp-experience-<summary>-<export-ID>/
  SKILL.md
  references/knowledge.json
```

`erp_experience_import` reads `references/knowledge.json` from that directory. It does not execute code and grants no login or operation permission. Use [storage backup](storage.en.md) for recovery. Test commands and coverage are in [development](development.en.md).

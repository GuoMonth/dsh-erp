# Native operation and sharing

[简体中文](native-and-sharing.md) · [Guides](index.md)

## Observe, operate, save

Standard installation inserts the package `@guosheng_047/dsh-erp`. The desktop client attaches to that row. The host entry is the same one exported from `./native`: it reuses DSH tools, Sessions, approvals, attachments and Skills. An existing Browser Use provider is reused; otherwise official Playwright MCP is loaded.

1. Call `erp_system_status` and `erp_native_status`, open the configured entry and sign in manually.
2. Take a native snapshot, then immediately call `erp_native_observation_save`. Only the same Agent's latest successful snapshot is accepted; another operation invalidates it.
3. A saved snapshot is normalized into importable `browser-learning-v1` evidence. Use `erp_learning_begin` so the controller owns the frontier, and `erp_knowledge_record` for a local revision that cites the observation ID and an exact quote.
4. After an operation, take a fresh snapshot and check the outcome. Saved observations are historical evidence; their element references cannot be reused.

Playwright tools keep their upstream names and arguments; the current click tool uses `target`. Browser providers own sessions and element references. Ending an attached session releases the connection and retains the external browser.

Native browser and desktop calls request individual DSH approval. Opening a page and an ERP business write both need that approval; a local knowledge revision does not change the ERP. ERP's URL checks limit evidence admission; native tools retain host-level access. Screenshots and tool results follow DSH attachment handling and may contain private information.

`computerUse: true` loads the official native Cua Driver, requiring its optional package and OS permissions. It reuses an existing provider when available. A permissions check can use `cua_driver_native__check_permissions` with `prompt: false`; saving window evidence also requires confirmation that it belongs to the configured ERP.

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

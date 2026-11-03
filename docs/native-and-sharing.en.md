# Native operation and sharing

[简体中文](native-and-sharing.md) · [Guides](index.md)

## Observe, operate, save

Standard installation loads `@guosheng_047/dsh-erp/native`. It reuses DSH tools, Sessions, approvals, attachments and Skills. An existing Browser Use provider is reused; otherwise official Playwright MCP is loaded.

1. Call `erp_system_status` and `erp_native_status`, open the configured entry and sign in manually.
2. Take a native snapshot, then immediately call `erp_native_observation_save`. Only the same Agent's latest successful snapshot is accepted; another operation invalidates it.
3. A saved snapshot is normalized into importable `browser-learning-v1` evidence. Use `erp_learning_begin` so the controller owns the frontier, and `erp_knowledge_record` for a local revision that cites the observation ID and an exact quote.
4. After an operation, take a fresh snapshot and check the outcome. Saved observations are historical evidence; their element references cannot be reused.

Playwright tools keep their upstream names and arguments; the current click tool uses `target`. Browser providers own sessions and element references. Ending an attached session releases the connection and retains the external browser.

Native browser and desktop calls request individual DSH approval. Opening a page and an ERP business write both need that approval; a local knowledge revision does not change the ERP. ERP's URL checks limit evidence admission; native tools retain host-level access. Screenshots and tool results follow DSH attachment handling and may contain private information.

`computerUse: true` loads the official native Cua Driver, requiring its optional package and OS permissions. It reuses an existing provider when available. A permissions check can use `cua_driver_native__check_permissions` with `prompt: false`; saving window evidence also requires confirmation that it belongs to the configured ERP.

## Share a Skill

`erp_experience_export` returns a directory:

```text
erp-experience-<summary>-<export-ID>/
  SKILL.md
  references/knowledge.json
```

Review both files, then share the whole directory. Export keeps names, descriptions, types and valid relationships. It excludes structured identities, URLs, samples, raw observations, screenshots, login data and confirmations. Free text can still contain private information. The plugin does not upload the directory.

## Import a Skill

Configure the recipient's ERP and ask to import the local `references/knowledge.json`. `erp_experience_import` requests one confirmation for the file and scope, writes knowledge in one transaction, and registers a native Skill.

The input must be an absolute path to a regular JSON file: at most 16 MB and 2000 records. Import validates references and relationships; it does not execute the sender's Skill or code. Records are marked `interpreted` and `needs-review`. Reimporting identical content preserves local corrections; changed content creates a separate set of records.

Check imported experience on the recipient's pages before using it. It grants no login or operation permission. Skill export is for sharing; use [storage backup](storage.en.md) for recovery. Test commands and coverage are in [development](development.en.md).

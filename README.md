# Adapt ERP

[简体中文](docs/README.zh-CN.md) · [Releases](https://github.com/GuoMonth/dsh-erp/releases)

An ERP assistant is useful after it has seen your screens. Adapt ERP is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin: it learns one ERP from the browser you sign into, keeps that map in a local SQLite index, and waits for approval before it changes the system.

You log in. DSH observes the pages you allow it to open. Later conversations read a short summary and one page of evidence, instead of starting again from a blank site. The plugin ships with no knowledge of your company.

Current release: **0.1.3**, for **DSH 0.2.1-rc.5** (upstream prerelease). Requires Node **>=24.18.0 <25**. Desktop checks cover Linux x64. Windows and macOS acceptance is still pending. `npm run verify` does not include a live model or a real ERP.

## When the assistant does not know the ERP

People who work in an ERP, and the operators who run dsh for them, hit the same walls:

- **The menus are local.** Purchasing, stock, and approvals sit behind names, tabs, and roles a general model has not seen. A new chat starts at the login screen again. A screenshot pasted into the prompt leaves with that conversation.
- **The whole site is a poor memory.** After the first look, the next question is usually where a screen is and what was already observed. Putting every menu into the prompt makes that answer slower and less reliable.
- **Looking and posting get tangled.** Opening a page, typing into a field, and saving can happen in one wander. A query that autosaves is still a write. Operators need the open and the change as separate, visible steps.
- **The record has to stay on this machine.** Login state, observations, and the database are working material. A colleague needs a reviewed note, not a copy of the session.

Adapt ERP sits in dsh for that job. It builds a depth-3 index from what the browser actually showed, hands that index back in short pages, and puts an ERP write behind a fresh approval.

### A user looking for a transaction

You signed in once and let the plugin snapshot the entry and the pages you approved. Next week you ask where goods receipt sits and which fields were on that screen. DSH reads the saved summaries and one page of records. It can do that without opening the browser. A question about today's quantities still needs a new observation. The index is what was seen, not a live ledger.

### An operator connecting one site

You have a URL and an account label. You put them in the DSH profile, start `dsh --profile web`, and sign in yourself. You ask for an entry snapshot, then approve each page the controller wants to open. The walk stops at the fields, tabs, and windows already visible. The model is not given a goal of finishing the ERP.

### A builder staying on native dsh

You want the model to call ordinary dsh browser tools, keep the host's approval and Skill machinery, and read a local index. The installed row is `@guosheng_047/dsh-erp` on DSH 0.2.1-rc.5, which is what attaches the desktop entry. Set `browserMode: managed` when you want the plugin's own browser. The current plugin does not use Deskwork.

## Who it is for

- ERP users who want later dsh conversations to remember menus, pages, and fields from their own site.
- Operators who configure one system URL, leave the password in the browser, and approve opens and writes one at a time.
- Builders who put that behavior in DeepSeek Harness and need the storage and approval boundaries to stay explicit.

## What it does not do

- It ships no vendor connector, industry template, or knowledge of your site.
- It does not crawl an ERP unattended. A finished round is not coverage of every permission or business rule. Depth stops at 3. Counts describe that round.
- Editing local knowledge does not change the ERP. Filling a field, choosing an option, or a click marked as a mutation each needs its own dsh approval. Scrolling is navigation. After an action, check the page.
- It does not require Deskwork, bind to a Deskwork website, or resume an older exploration queue supplied by the model. The host path is native Browser Use, official Playwright MCP, dsh approvals, and Skills.
- It does not claim Windows, macOS, live-model, or real-ERP acceptance. Smoke installs the packed plugin and exercises the DSH 0.2.1-rc.5 CLI, approvals, SQLite, and Chromium with a deterministic test provider.

Text inside pages and summaries is evidence. It is not an instruction to the model, and it is not permission to post a document.

## Install

With DSH installed and a model configured:

```sh
npm exec --yes --package=pnpm@11.28.5 -- dsh plugin --profile web add @guosheng_047/dsh-erp@latest
```

With only Node installed:

```sh
npm exec --yes --package=@deepseek-ai/dsh@0.2.1-rc.5 --package=pnpm@11.28.5 -- dsh plugin --profile web add @guosheng_047/dsh-erp@latest
```

Use the full package name. For a fixed release, replace `@latest` with `@0.1.3`. The browser provider prepares Chromium. Linux also needs a graphical session and Chromium system libraries.

## Desktop

Install into the desktop profile, then restart the DeepSeek Harness app. The left navigation shows **ERP 助手** in Chinese and **Adapt ERP** in English. The package name stays `@guosheng_047/dsh-erp`.

```sh
npm exec --yes --package=pnpm@11.28.5 -- dsh plugin --profile desktop add @guosheng_047/dsh-erp@latest
```

Open that entry. With no sites yet, the page is a short setup: an entry URL, an optional application root when that path does not end in `/`, and an optional account label. There is no password field.

After a site exists, the same entry lists the sites and offers Continue for the one you opened last. Continue restores that site's conversation and opens its entry URL in the official sidebar Browser. Sign in yourself. If that site was removed, Continue does not switch you to a different one. Edit can change the name, the entry URL, or the account label. A new account label or application root is another index, and conversations that were bound to the previous row are not moved. Remove only takes a site off the list. Its index stays on this machine.

Add another site the same way. It gets its own conversation and its own local index. A conversation that is not bound to a site does not read either index. Later questions should read the level summary and one page of evidence before a live observation.

## Quick start

On the desktop you can add sites from ERP 助手 and skip this file. To declare them for a profile, stop DSH and edit `~/.dsh/profiles/desktop/cordis.patch.yml` or `~/.dsh/profiles/web/cordis.patch.yml` (or the same path under `$DSH_HOME`). Replace an empty `[]`. Merge an existing `id: erp` entry and preserve other plugins.

```yaml
- id: erp
  config:
    system:
      url: "https://erp.example.com/app/"
      account: "work-account"
```

Only `url` is required. `account` is a local identity label, not a password. Login paths, companies, and roles are covered in [configuration](docs/system-configuration.en.md).

1. Start `dsh --profile web` and ask it to call `erp_system_status`.
2. Open the configured entry and sign in yourself. The plugin does not take the password.
3. Ask for an entry snapshot, then `erp_learning_begin`. The controller owns the frontier. Level 1 can be that snapshot alone.
4. Approve each later page open. Level 3 records fields, tabs, and windows already visible, then stops.
5. Ask later questions with `erp_index_read`. Until a level summary exists, that read reports the index as not initialized.

To hand the map to someone else, ask for a Skill export, read the text, and share the directory. The recipient imports it as needs-review and checks it on their own ERP. The export omits structured identity, URLs, field samples, raw observations, screenshots, login data, and confirmations. Free text can still contain private information. The plugin does not upload the directory. Details are in [native operation and sharing](docs/native-and-sharing.en.md).

## How the index works

The plugin is a DSH service. A standard install loads the native entry. It reuses a Browser Use provider when one is already present, and otherwise loads official Playwright MCP. Computer Use loads only when `computerUse: true` is set. That path needs the optional native Cua Driver package and the operating system's permissions. Tool results are short Markdown with a title. An OpenUI payload is added only when that host service is present. DSH 0.2.1-rc.5 does not require one.

A native snapshot is normalized into a `browser-learning-v1` document before it is stored, so the same import path can read it. Exploration is breadth-first and owned by the controller: `erp_learning_begin`, `erp_learning_accept`, `erp_learning_block`, `erp_learning_status`, and `erp_learning_pause`. Callers submit observations. They do not submit the next unit.

| Level | What it records | Approval |
| --- | --- | --- |
| 1 | The entry snapshot, including menus and pages visible there. | This level is the snapshot. Opening another page is the next level. |
| 2 | Pages opened from what level 1 showed. | Each open is a separate approval. |
| 3 | Fields, tabs, and windows visible on those snapshots. | The walk stops. There is no further business-behavior level. |

When a level's frontier is empty, the controller writes one summary, then places the next level on the frontier. A round holds at most 2000 items and accepts at most 200 discoveries at a time. Restart pauses a running round and does not replay website actions.

SQLite is the physical store (schema 4), with evidence files beside the database. There is no graph database. After initialization, `erp_index_read` returns up to 30 compact summaries, with a truncation flag when more exist, and one page of evidence-backed leaves. Omit the node to page the newest summary. Start `after` at an empty string and follow `nextAfter` while `hasMore` is set. Each page holds 1–20 leaves. `erp_knowledge_get` loads one full record. Search, neighbors, and history are the lookup path. `erp_knowledge_record` writes the local database and leaves the ERP unchanged. Level summaries stay in the local index and are omitted from a shared Skill.

Native browser and desktop calls request individual dsh approval. On the managed browser, `effect: navigate` is an open or a scroll, and `effect: mutate` is an ERP write. Fill and select have to be marked mutate. Local corrections and confirmations stay local: they attribute a statement to you and grant no ERP permission.

Saved knowledge is readable without a browser login. Current balances and orders need a fresh observation. Screenshots and page content may be sent to the model provider you configured. The published package does not contain your database, login data, or observations.

The decision record is [ADR 0003](docs/adr/0003-controller-bfs-index.md). Field-level contracts stay in the [knowledge](docs/knowledge.en.md) and [native operation](docs/native-and-sharing.en.md) guides.

## Update or remove

Call `erp_storage_backup`, stop DSH, repeat the installation command, and restart. Keep the same configuration and data root. This index does not continue an exploration queue that an older build accepted from the model. Opening an older SQLite file makes a checked backup and then migrates it. That migration does not mean the old queue still runs, and it does not mean Deskwork compatibility. Older Alpha layout and recovery are covered in [storage](docs/storage.en.md).

```sh
npm exec --yes --package=pnpm@11.28.5 -- dsh plugin --profile web remove @guosheng_047/dsh-erp
```

Stop DSH before removing the plugin. Removal retains your data.

## Documentation

[Guides](docs/index.md) · [Development](docs/development.en.md) · [Changelog](CHANGELOG.md) · [MIT](LICENSE) · [Third-party notices](NOTICE.md)

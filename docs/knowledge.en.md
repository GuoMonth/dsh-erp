# Local knowledge

[简体中文](knowledge.md) · [Guides](index.md)

Knowledge uses the exact scope returned by `erp_system_status`: system, account, optional company and role. It remains readable without a browser login. Current business data requires a fresh observation.

## Records and evidence

UI records describe menus, pages, tabs, controls and windows. Business records describe domains, objects, fields, rules and operations. Versioned, directed relations connect them; one page can support several business domains.

Observations are immutable. Knowledge citations must quote the same scope's observation exactly. Evidence traces a claim to its source; it does not prove the interpretation. Field samples are examples, not a complete enum or executable schema.

Records use `discovered`, `observed` or `interpreted`, with separate `blocked`, `conflict` and `needs-review` flags. Lifecycle is `active` or `retired`. User confirmation records a specific proposition and conditions at one version; it grants no business permission.

## Default read

After a level is finished, the default read is `erp_index_read`: compact summaries for each level, then one page of evidence-backed leaves. Omitting the node pages the newest summary's leaves. Start `after` at an empty string and follow `nextAfter` while `hasMore` is set; each page holds 1–20 leaves. Use `erp_knowledge_get` for one full record. Search, neighbors and history are lookup paths. Updates are the smaller path: `erp_knowledge_record` revises local knowledge and does not change the ERP. Level summaries stay in the local index and are not part of a shared Skill. An ERP business write is a browser action with `effect: mutate` and needs one DSH approval.

## Tools

| Tool | Purpose |
| --- | --- |
| `erp_observation_get/search` | Read or search saved observations |
| `erp_knowledge_record` | Save an AI interpretation with evidence |
| `erp_knowledge_correct` | Save a user-confirmed correction |
| `erp_knowledge_confirm` | Confirm a proposition at an exact version |
| `erp_index_read` | Default read of summaries and one page of leaves |
| `erp_knowledge_get/search/neighbors` | Query one record, names and relationships |
| `erp_knowledge_history/verifications` | Read revisions and confirmations |

Writes accept 1–50 records in one transaction. New IDs use `expectedVersion: 0`; updates use the current version. On a version conflict, read again before changing anything. Search/history pagination uses the returned cursor and `hasMore`; concurrent changes can affect later pages.

Dependencies retain their referenced version. Queries report `staleDependencies` after a dependency changes; they do not silently rebind it, propagate every indirect change or resolve semantic conflicts. Keep the old evidence and reobserve as needed.

SQLite stores records, revisions, relationships and confirmations. Markdown/JSON exports are views; editing them does not update the database. Use [Skill export/import](native-and-sharing.en.md) for another user and [backup](storage.en.md) for recovery. Exact record and relation contracts live in [the source](https://github.com/GuoMonth/dsh-erp/blob/main/src/knowledge/contract.ts).

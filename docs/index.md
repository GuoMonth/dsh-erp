# Guides

[简体中文](index.zh-CN.md) · [Scenarios and quick start](../README.md)

Adapt ERP learns one browser ERP inside DeepSeek Harness and keeps the result on the machine that runs dsh. Read the [scenarios](../README.md#when-the-assistant-does-not-know-the-erp) first, then [install](../README.md#install) and the [first session](../README.md#quick-start). The [index](../README.md#how-the-index-works) is a depth-3 walk owned by the controller, stored in local SQLite, and read as summaries plus one page of evidence. ERP writes stay on approved browser actions. The standard path is native dsh. Deskwork is not a dependency. The plugin's own browser is an explicit option.

| You are about to | Guide |
| --- | --- |
| See which ERP jobs this plugin takes | [Scenarios](../README.md#when-the-assistant-does-not-know-the-erp) |
| Install and run the first session | [Quick start](../README.md#quick-start) |
| Set the website and identity | [Configuration](system-configuration.en.md) |
| Observe, approve a write, share a Skill | [Native operation](native-and-sharing.en.md) |
| Read the index or revise local knowledge | [Knowledge](knowledge.en.md) |
| Back up or recover SQLite | [Storage](storage.en.md) |
| Use the plugin's own browser | [Managed browser](adaptive-learning.en.md) |
| Develop or test | [Development](development.en.md) |
| Publish a package | [Publishing](npm-publishing.en.md) |

The table describes the current product. [ADR 0003](adr/0003-controller-bfs-index.md) records the depth-3 index decision. The other decisions stay in `docs/adr`. Earlier planning documents stay in Git history.

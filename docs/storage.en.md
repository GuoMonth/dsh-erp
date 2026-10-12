# Storage and recovery

[简体中文](storage.md) · [Guides](index.md)

Each configured ERP stores SQLite, evidence, exports and backups under `systems/<stable-ID>/`. `erp_system_status` reports the actual directory. The URL index in `systems/by-url/` maps application bases to IDs; preserve it when moving to another machine.

## Data root

An explicit absolute `dataDir` takes precedence. Deskwork supplies its default as described in [configuration](system-configuration.en.md). Standalone defaults are:

| Environment | Directory |
| --- | --- |
| `DSH_HOME` set | `<DSH_HOME>/plugins/dsh-erp/data` |
| Windows | `<LOCALAPPDATA>/dsh-erp`, or the user's `AppData/Local/dsh-erp` |
| macOS | `~/Library/Application Support/dsh-erp` |
| Linux | `<XDG_DATA_HOME>/dsh-erp`, or `~/.local/share/dsh-erp` |

Use a local, unsynchronized directory. One process owns a database at a time; concurrent DSH profiles need separate directories. Disable/uninstall retains data. Native browser providers own login resources; managed mode keeps a private browser profile separately from knowledge backups.

## Backup and restore

Call `erp_storage_backup` before upgrading. The backup contains a consistent SQLite snapshot, its referenced evidence and a checked manifest. Copying only an active `store.sqlite` can miss committed WAL data. System indexes, DSH configuration and browser login resources need separate preservation.

For offline recovery, stop the database owner and use the exported `restoreBackup` API. The parent must exist and the destination must be new:

```js
import { restoreBackup } from '@guosheng_047/dsh-erp'

await restoreBackup(
  '/absolute/path/to/system-directory',
  'backup-ID',
  '/absolute/path/to/new-system-directory',
)
```

Recovery verifies database, schema, references and evidence hashes. It refuses existing destinations and removes a newly created destination if validation fails. Preserve the recovered system ID/index and point the data root at the matching `systems/<ID>/` layout before restarting; the plugin does not switch directories automatically.

Schema migration makes a checked backup first, then commits changes in one transaction. A newer unsupported schema is rejected. `erp_storage_check` reports damaged, missing and orphaned evidence; it does not delete files automatically. Search indexes can be rebuilt from stored records.

## Interrupted work

Queued cancellations exit before dispatch. Dispatched persistence operations settle before shutdown. A lost reply can follow a successful write: read by stable ID/version before retrying. Restart pauses running learning tasks and retains their progress; it does not replay website actions.

## Older Alpha versions

From alpha.5 onward, system IDs and knowledge are retained. Fixed `erp_scm_*` tools were removed; old SCM records remain historical evidence.

Alpha.4 and earlier root-level databases stay in place and are not imported automatically. Stop DSH, temporarily omit `system`, and use the original scope to query/export/back up the old store; browser connection is disabled in this mode. Restore the configuration and restart for the system store. Old unscoped TGZ installations also need their plugin entry removed.

Backups contain the same private business information as the database. Sharing a Skill is a separate, reduced [export](native-and-sharing.en.md).

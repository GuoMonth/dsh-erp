import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { chmodSync, lstatSync, mkdirSync, realpathSync, statfsSync } from 'node:fs'
import { StorageError } from './contract.js'

export function defaultDataDir(): string {
  if (process.env.DSH_HOME) return resolve(process.env.DSH_HOME, 'plugins', 'dsh-erp', 'data')
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'dsh-erp')
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'dsh-erp')
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'dsh-erp')
}
export function privateDirectory(path: string): string {
  if (!isAbsolute(path) || /^[/\\]{2}/.test(path)) throw new StorageError('LOCAL_DATA_DIRECTORY_REQUIRED')
  mkdirSync(path, { recursive: true, mode: 0o700 })
  if (lstatSync(path).isSymbolicLink()) throw new StorageError('DATA_DIRECTORY_SYMLINK')
  const actual = realpathSync(path)
  if (/(^|[/\\])(onedrive|dropbox|google drive|mobile documents)([/\\]|$)/i.test(actual)) {
    throw new StorageError('SYNC_DIRECTORY_UNSUPPORTED')
  }
  if (process.platform === 'linux') {
    const type = Number(statfsSync(actual).type) >>> 0
    if ([0x6969, 0x517b, 0xff534d42].includes(type)) throw new StorageError('NETWORK_FILESYSTEM_UNSUPPORTED')
  }
  chmodSync(actual, 0o700)
  return actual
}

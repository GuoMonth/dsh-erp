export const DSH_TARGET = '0.1.5-rc.2'
export const NODE_BASELINE = '24.18.0'

export function assertRuntime(version = process.versions.node): void {
  const [major, minor, patch] = version.split('.').map(Number)
  if (!/^\d+\.\d+\.\d+$/.test(version) || major !== 24 || minor === undefined || patch === undefined
    || !Number.isInteger(minor) || !Number.isInteger(patch) || minor < 18 || patch < 0) {
    throw new Error(`dsh-erp requires Node >=${NODE_BASELINE} <25; found ${version}. Restart dsh with Node 24 LTS.`)
  }
}

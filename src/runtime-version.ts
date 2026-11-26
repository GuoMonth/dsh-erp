export const DSH_TARGET = '0.2.2-rc.5'

export function assertRuntime(version = process.versions.node): void {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version)
  if (match) {
    const major = Number(match[1])
    const minor = Number(match[2])
    const patch = Number(match[3])
    if (major === 24 && (minor > 22 || minor === 22 && patch >= 3)) return
    if (major > 26 || major === 26 && (minor > 13 || minor === 13 && patch >= 1)) return
  }
  throw new Error(`dsh-erp requires Node.js 24.22.3 or later in the 24.x series, or 26.13.1 or later. Found ${version}.`)
}

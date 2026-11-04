import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50
const MAX_FILES = 8
const MAX_BYTES = 16_000_000

export interface ZipFile { name: string; data: Buffer }

function dosTime(date = new Date()): [number, number] {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return [time, day]
}

/** Write a zip of named byte files. Names are the archive root, not paths. */
export function zipArchive(files: readonly ZipFile[]): Buffer {
  if (!files.length || files.length > MAX_FILES) throw new Error('SHARE_PACK_LIMIT')
  const [time, day] = dosTime()
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const file of files) {
    if (!file.name || file.name.includes('/') || file.name.includes('\\') || file.name.includes('..')) throw new Error('SHARE_PACK_PATH')
    const name = Buffer.from(file.name)
    const data = file.data
    if (data.length > MAX_BYTES) throw new Error('SHARE_PACK_LIMIT')
    const compressed = deflateRawSync(data)
    const useStore = compressed.length >= data.length
    const payload = useStore ? data : compressed
    const local = Buffer.alloc(30 + name.length)
    local.writeUInt32LE(LOCAL, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(useStore ? 0 : 8, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(day, 12)
    local.writeUInt32LE(crc32(data) >>> 0, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    name.copy(local, 30)
    locals.push(local, payload)
    const central = Buffer.alloc(46 + name.length)
    central.writeUInt32LE(CENTRAL, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(useStore ? 0 : 8, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(day, 14)
    central.writeUInt32LE(crc32(data) >>> 0, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    name.copy(central, 46)
    centrals.push(central)
    offset += local.length + payload.length
  }
  const central = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  const archive = Buffer.concat([...locals, central, end])
  if (archive.length > MAX_BYTES) throw new Error('SHARE_PACK_LIMIT')
  return archive
}

function findEnd(data: Buffer): number {
  const min = Math.max(0, data.length - 22 - 65_535)
  for (let offset = data.length - 22; offset >= min; offset--) {
    if (data.readUInt32LE(offset) === END) return offset
  }
  throw new Error('SHARE_PACK_FORMAT')
}

/** Read a zip already in memory. Rejects encryption, odd methods, and paths that leave the root. */
export function unzipArchive(data: Buffer): Map<string, Buffer> {
  if (data.length > MAX_BYTES) throw new Error('SHARE_PACK_LIMIT')
  const end = findEnd(data)
  const count = data.readUInt16LE(end + 10)
  const size = data.readUInt32LE(end + 12)
  let offset = data.readUInt32LE(end + 16)
  if (count > MAX_FILES || size > MAX_BYTES || offset > data.length) throw new Error('SHARE_PACK_LIMIT')
  const files = new Map<string, Buffer>()
  for (let index = 0; index < count; index++) {
    if (offset + 46 > data.length || data.readUInt32LE(offset) !== CENTRAL) throw new Error('SHARE_PACK_FORMAT')
    const flags = data.readUInt16LE(offset + 8)
    const method = data.readUInt16LE(offset + 10)
    const compressedSize = data.readUInt32LE(offset + 20)
    const uncompressedSize = data.readUInt32LE(offset + 24)
    const nameLength = data.readUInt16LE(offset + 28)
    const extra = data.readUInt16LE(offset + 30)
    const comment = data.readUInt16LE(offset + 32)
    const localOffset = data.readUInt32LE(offset + 42)
    const name = data.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    offset += 46 + nameLength + extra + comment
    if ((flags & 1) !== 0 || (method !== 0 && method !== 8)) throw new Error('SHARE_PACK_FORMAT')
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw new Error('SHARE_PACK_PATH')
    if (localOffset + 30 > data.length || data.readUInt32LE(localOffset) !== LOCAL) throw new Error('SHARE_PACK_FORMAT')
    const localName = data.readUInt16LE(localOffset + 26)
    const localExtra = data.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + localName + localExtra
    if (compressedSize > MAX_BYTES || uncompressedSize > MAX_BYTES || start + compressedSize > data.length) throw new Error('SHARE_PACK_LIMIT')
    const payload = data.subarray(start, start + compressedSize)
    let bytes: Buffer
    try { bytes = method === 0 ? Buffer.from(payload) : inflateRawSync(payload) } catch { throw new Error('SHARE_PACK_FORMAT') }
    if (bytes.length !== uncompressedSize || bytes.length > MAX_BYTES) throw new Error('SHARE_PACK_LIMIT')
    files.set(name, bytes)
  }
  return files
}

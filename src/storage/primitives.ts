import type { InferValue } from '@deepseek-ai/dsh-tools'
const str = { type: 'string', required: true } as const
export const scopeSchema = { type: 'object', additionalProperties: false, properties: {
  site: str, account: str, tenant: { type: 'string' }, role: { type: 'string' },
} } as const
export type Scope = InferValue<typeof scopeSchema>
export class StorageError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'StorageError' }
}
export function scopeKey(value: Scope): string {
  for (const s of Object.values(value)) if (!s.trim() || s.length > 500) throw new StorageError('INVALID_SCOPE')
  return JSON.stringify([value.site, value.account, value.tenant ?? null, value.role ?? null])
}
export function canonicalScope(value: Scope): Scope {
  scopeKey(value)
  return { site: value.site, account: value.account,
    ...(value.tenant === undefined ? {} : { tenant: value.tenant }),
    ...(value.role === undefined ? {} : { role: value.role }) }
}

export function checkedId(id: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id)) throw new StorageError('INVALID_RECORD_ID')
  return id
}

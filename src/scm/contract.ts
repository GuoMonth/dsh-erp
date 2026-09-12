import type { InferValue } from '@deepseek-ai/dsh-tools'
const str = { type: 'string', required: true } as const
export const queries = ['menu', 'products', 'product', 'stock', 'purchases', 'purchase', 'sales', 'sale', 'transactions'] as const
export const scmReadSchema = { type: 'object', additionalProperties: false, properties: {
  sessionId: str, revision: { type: 'integer', required: true },
  query: { type: 'string', enum: queries, required: true },
  id: { type: 'string' }, keyword: { type: 'string' }, page: { type: 'integer' }, limit: { type: 'integer' },
} } as const
export type ScmRead = InferValue<typeof scmReadSchema>
export const scmResultSchema = { type: 'object', additionalProperties: false, properties: {
  query: scmReadSchema.properties.query, url: str, observedAt: str, data: { type: 'json', required: true },
  limitations: { type: 'array', items: { type: 'string' }, required: true },
} } as const
export type ScmResult = InferValue<typeof scmResultSchema>
export const SCM_ADAPTER = 'scm-usa-read-v1'

import type { InferValue, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import { scopeSchema } from '../storage/primitives.js'

const str = { type: 'string', required: true } as const
const num = { type: 'integer', required: true } as const
const strings = { type: 'array', items: { type: 'string' }, required: true } as const
export const kinds = ['menu', 'page', 'tab', 'control', 'window', 'domain', 'object', 'field', 'rule', 'operation', 'relation'] as const
const kind = { type: 'string', enum: kinds, required: true } as const
const ref = { type: 'object', additionalProperties: false, properties: { id: str, version: num } } as const
const evidence = { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
  observationId: str, quote: str,
} } } as const
const predicates = ['contains', 'opens', 'belongs-to', 'references', 'displays', 'represents', 'supports', 'triggers', 'governed-by'] as const
const fields = {
  id: str, kind, name: str, aliases: strings, description: str,
  stage: { type: 'string', enum: ['discovered', 'observed', 'interpreted'], required: true },
  flags: { type: 'array', items: { type: 'string', enum: ['blocked', 'conflict', 'needs-review'] }, required: true },
  lifecycle: { type: 'string', enum: ['active', 'retired'], required: true },
  evidence, dependencies: { type: 'array', items: ref, required: true },
  context: { type: 'object', additionalProperties: false, properties: {
    url: { type: 'string' }, pageType: { type: 'string' }, tab: { type: 'string' }, window: { type: 'string' }, detail: { type: 'string' },
  } },
  definition: { type: 'object', additionalProperties: false, properties: {
    valueType: { type: 'string', enum: ['unknown', 'string', 'number', 'boolean', 'date', 'object'], required: true },
    observedValues: { type: 'array', items: { type: 'json' }, required: true },
    completeness: { type: 'string', const: 'unknown', required: true },
  } },
  from: ref, to: ref, predicate: { type: 'string', enum: predicates },
} as const
export const knowledgeWriteSchema = { type: 'object', additionalProperties: false, properties: { ...fields, expectedVersion: num } } as const satisfies ValueSchemaSpec
export const knowledgeRecordSchema = { type: 'object', additionalProperties: false, properties: {
  ...fields, scope: { ...scopeSchema, required: true }, version: num, origin: { type: 'string', enum: ['ai', 'user'], required: true }, createdAt: str, recordedAt: str,
} } as const satisfies ValueSchemaSpec
export type KnowledgeWrite = InferValue<typeof knowledgeWriteSchema>
export type KnowledgeRecord = InferValue<typeof knowledgeRecordSchema>
export type KnowledgeKind = typeof kinds[number]
export const claimSchema = { type: 'object', additionalProperties: false, properties: {
  id: str, target: { ...ref, required: true }, proposition: str, conditions: str, method: str,
  verdict: { type: 'string', enum: ['supported', 'refuted', 'inconclusive'], required: true }, evidence,
} } as const satisfies ValueSchemaSpec
export const verificationSchema = { type: 'object', additionalProperties: false, properties: {
  ...claimSchema.properties, scope: { ...scopeSchema, required: true }, origin: { type: 'string', const: 'user-confirmation', required: true }, recordedAt: str,
} } as const satisfies ValueSchemaSpec
export type Verification = InferValue<typeof verificationSchema>
export const viewSchema = { type: 'object', additionalProperties: false, properties: {
  record: { ...knowledgeRecordSchema, required: true },
  staleDependencies: { type: 'array', items: ref, required: true },
  verifications: { type: 'array', items: verificationSchema, required: true },
  verificationsTruncated: { type: 'boolean', required: true },
} } as const satisfies ValueSchemaSpec
export type KnowledgeView = InferValue<typeof viewSchema>
const scope = { ...scopeSchema, required: true } as const
export const commitParameters = { scope, records: { type: 'array', items: knowledgeWriteSchema, required: true } } as const
const page = { type: 'object', additionalProperties: false, properties: {
  items: { type: 'array', items: viewSchema, required: true }, hasMore: { type: 'boolean', required: true }, nextAfter: str,
} } as const
export const knowledgeContracts = {
  knowledgeCommit: { input: { type: 'object', additionalProperties: false, properties: {
    ...commitParameters, origin: { type: 'string', enum: ['ai', 'user'], required: true },
  } }, output: { type: 'array', items: knowledgeRecordSchema } },
  knowledgeGet: { input: { type: 'object', additionalProperties: false, properties: { scope, id: str, version: { type: 'integer' } } },
    output: { oneOf: [viewSchema, { type: 'null' }] } },
  knowledgeSearch: { input: { type: 'object', additionalProperties: false, properties: {
    scope, query: str, kind: { type: 'string', enum: kinds }, after: str, limit: num,
  } }, output: page },
  knowledgeNeighbors: { input: { type: 'object', additionalProperties: false, properties: {
    scope, id: str, direction: { type: 'string', enum: ['in', 'out', 'both'], required: true },
    predicate: { type: 'string', enum: predicates }, after: str, limit: num,
  } }, output: page },
  knowledgeHistory: { input: { type: 'object', additionalProperties: false, properties: {
    scope, id: str, afterVersion: num, limit: num,
  } }, output: { type: 'object', additionalProperties: false, properties: {
    items: { type: 'array', items: viewSchema, required: true }, hasMore: { type: 'boolean', required: true }, nextVersion: num,
  } } },
  knowledgeVerifications: { input: { type: 'object', additionalProperties: false, properties: {
    scope, id: str, version: num, after: str, limit: num,
  } }, output: { type: 'object', additionalProperties: false, properties: {
    items: { type: 'array', items: verificationSchema, required: true }, hasMore: { type: 'boolean', required: true }, nextAfter: str,
  } } },
  knowledgeVerify: { input: { type: 'object', additionalProperties: false, properties: { scope, ...claimSchema.properties } }, output: verificationSchema },
} as const satisfies Record<string, { input: ValueSchemaSpec; output: ValueSchemaSpec }>
export type KnowledgeMethod = keyof typeof knowledgeContracts
export type KnowledgeInput<K extends KnowledgeMethod> = InferValue<(typeof knowledgeContracts)[K]['input']>
export type KnowledgeOutput<K extends KnowledgeMethod> = InferValue<(typeof knowledgeContracts)[K]['output']>

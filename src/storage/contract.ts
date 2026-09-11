import { validateJsonSchemaValue, valueSchemaSpecToJsonSchema } from '@deepseek-ai/dsh-tools'
import type { InferValue, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import { knowledgeContracts } from '../knowledge/contract.js'
import { scopeSchema, StorageError } from './primitives.js'
export { scopeSchema, StorageError, scopeKey, canonicalScope } from './primitives.js'

const str = { type: 'string', required: true } as const
const num = { type: 'integer', required: true } as const
const scope = scopeSchema
const evidence = { type: 'object', additionalProperties: false, properties: {
  mime: { type: 'string', enum: ['text/plain', 'application/json', 'image/png'], required: true },
  base64: str,
} } as const
export const observationSchema = { type: 'object', additionalProperties: false, properties: {
  id: str, scope: { ...scope, required: true }, url: str, title: str, text: str, locale: str,
  context: str, observedAt: str, evidence,
} } as const satisfies ValueSchemaSpec
export type Observation = InferValue<typeof observationSchema>
export const storedObservationSchema = { type: 'object', additionalProperties: false, properties: {
  id: str, scope: { ...scope, required: true }, url: str, title: str, text: str, locale: str,
  context: str, observedAt: str, evidenceHash: { type: 'string' }, evidenceMime: { type: 'string' }, version: num,
} } as const
const storedObservation = storedObservationSchema
const checkpoint = { type: 'object', additionalProperties: false, properties: {
  id: str, scope: { ...scope, required: true }, expectedVersion: num,
  state: { type: 'string', enum: ['running', 'paused', 'round-ended', 'cancelled'], required: true },
  frontier: { type: 'array', items: { type: 'string' }, required: true },
  cursor: { type: 'json', required: true }, reason: str,
} } as const
const storedCheckpoint = { type: 'object', additionalProperties: false, properties: {
  id: str, scope: { ...scope, required: true }, version: num,
  state: checkpoint.properties.state, frontier: checkpoint.properties.frontier,
  cursor: checkpoint.properties.cursor, reason: str,
} } as const
const scopedId = { type: 'object', additionalProperties: false, properties: { scope: { ...scope, required: true }, id: str } } as const
const empty = { type: 'object', additionalProperties: false } as const
const ok = { type: 'boolean', const: true } as const
export const storageStatusSchema = { type: 'object', additionalProperties: false, properties: {
  schemaVersion: num, sqliteVersion: str, journalMode: str, lockingMode: str,
  observations: num, tasks: num, evidenceFiles: num,
} } as const
export const contracts = {
  ...knowledgeContracts,
  status: { input: empty, output: storageStatusSchema },
  observe: { input: observationSchema, output: storedObservation },
  observation: { input: scopedId, output: { oneOf: [storedObservation, { type: 'null' }] } },
  search: { input: { type: 'object', additionalProperties: false, properties: {
    scope: { ...scope, required: true }, query: str, limit: num,
  } }, output: { type: 'array', items: storedObservation } },
  checkpoint: { input: checkpoint, output: storedCheckpoint },
  task: { input: scopedId, output: { oneOf: [storedCheckpoint, { type: 'null' }] } },
  backup: { input: empty, output: { type: 'object', additionalProperties: false, properties: { id: str, schemaVersion: num } } },
  restore: { input: { type: 'object', additionalProperties: false, properties: { backupId: str, destination: str } }, output: ok },
  check: { input: empty, output: { type: 'object', additionalProperties: false, properties: {
    databaseOk: { type: 'boolean', required: true },
    missing: { type: 'array', items: { type: 'string' }, required: true },
    corrupt: { type: 'array', items: { type: 'string' }, required: true },
    orphaned: { type: 'array', items: { type: 'string' }, required: true },
  } } },
  rebuildIndex: { input: empty, output: ok },
} as const satisfies Record<string, { input: ValueSchemaSpec; output: ValueSchemaSpec }>
export type Method = keyof typeof contracts
export type Input<K extends Method> = InferValue<(typeof contracts)[K]['input']>
export type Output<K extends Method> = InferValue<(typeof contracts)[K]['output']>
const schemas = Object.fromEntries(Object.entries(contracts).map(([method, spec]) => [method, {
  input: valueSchemaSpecToJsonSchema(spec.input), output: valueSchemaSpecToJsonSchema(spec.output),
}]))
export function validate<K extends Method>(method: K, direction: 'input' | 'output', data: unknown): void {
  const schema = schemas[method]?.[direction]
  if (!schema || validateJsonSchemaValue(schema, data, '').length) throw new StorageError('INVALID_STORAGE_MESSAGE')
}

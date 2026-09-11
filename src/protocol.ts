import { validateJsonSchemaValue, valueSchemaSpecToJsonSchema } from '@deepseek-ai/dsh-tools'
import { browserStatusSchema, browserOpenSchema, captureSchema } from './browser/contract.js'
import type { InferValue, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'

export const PROTOCOL = 1
const version = { type: 'integer', const: PROTOCOL, required: true } as const
const id = { type: 'string', required: true } as const

export const healthSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    pid: { type: 'integer', required: true },
    node: { type: 'string', required: true },
    protocol: version,
  },
} as const satisfies ValueSchemaSpec
export type Health = InferValue<typeof healthSchema>

const empty = { type: 'object', additionalProperties: false } as const
const revision = { type: 'object', additionalProperties: false, properties: {
  revision: { type: 'integer', required: true }, sessionId: { type: 'string', required: true },
} } as const
export const operations = {
  'browser.open': { input: browserOpenSchema, output: browserStatusSchema },
  'browser.status': { input: empty, output: browserStatusSchema },
  'browser.resume': { input: revision, output: browserStatusSchema },
  'browser.pause': { input: empty, output: browserStatusSchema },
  'browser.capture': { input: empty, output: captureSchema },
  'browser.close': { input: empty, output: browserStatusSchema },
} as const
export type BrowserMethod = keyof typeof operations
export type BrowserInput<K extends BrowserMethod> = InferValue<(typeof operations)[K]['input']>
export type BrowserOutput<K extends BrowserMethod> = InferValue<(typeof operations)[K]['output']>
const browserRequests = Object.entries(operations).map(([method, spec]) => ({
  type: 'object', additionalProperties: false, properties: {
    v: version, id, kind: { type: 'string', const: 'browser', required: true },
    method: { type: 'string', const: method, required: true }, input: { ...spec.input, required: true },
  },
} as const))
const requestSchema = {
  oneOf: [
    { type: 'object', additionalProperties: false, properties: {
      v: version, id, kind: { type: 'string', const: 'request', required: true },
      method: { type: 'string', const: 'health', required: true },
      delayMs: { type: 'integer', required: true },
    } },
    { type: 'object', additionalProperties: false, properties: {
      v: version, id, kind: { type: 'string', const: 'cancel', required: true },
    } },
    ...browserRequests,
  ],
} as const satisfies ValueSchemaSpec
const responseSchema = {
  oneOf: [
    { type: 'object', additionalProperties: false, properties: {
      v: version, kind: { type: 'string', const: 'progress', required: true },
      phase: { type: 'string', enum: ['preparing', 'downloading', 'launching', 'ready'], required: true },
      percent: { type: 'integer', required: true },
    } },
    { type: 'object', additionalProperties: false, properties: {
      v: version, kind: { type: 'string', const: 'ready', required: true },
    } },
    { type: 'object', additionalProperties: false, properties: {
      v: version, id, kind: { type: 'string', const: 'result', required: true },
      value: { oneOf: [healthSchema, browserStatusSchema, captureSchema], required: true },
    } },
    { type: 'object', additionalProperties: false, properties: {
      v: version, id, kind: { type: 'string', const: 'error', required: true },
      code: { type: 'string', required: true },
    } },
  ],
} as const satisfies ValueSchemaSpec
export type Request =
  | { v: 1; kind: 'request'; id: string; method: 'health'; delayMs: number }
  | { v: 1; kind: 'cancel'; id: string }
  | { [K in BrowserMethod]: { v: 1; kind: 'browser'; id: string; method: K; input: BrowserInput<K> } }[BrowserMethod]
export type Response = InferValue<typeof responseSchema>

function parser<S extends ValueSchemaSpec>(schema: S): (input: unknown) => InferValue<S> {
  const json = valueSchemaSpecToJsonSchema(schema)
  return input => {
    if (validateJsonSchemaValue(json, input, '').length > 0) {
      // Do not echo untrusted payloads into diagnostics.
      throw new Error('INVALID_PROTOCOL_MESSAGE')
    }
    return input as InferValue<S>
  }
}
export const parseRequest = parser(requestSchema) as (raw: unknown) => Request
export const parseResponse = parser(responseSchema)

export function validateBrowser<K extends BrowserMethod>(method: K, direction: 'input' | 'output', value: unknown): void {
  const schema = operations[method]?.[direction]
  if (!schema || validateJsonSchemaValue(valueSchemaSpecToJsonSchema(schema), value, '').length) throw new Error('INVALID_BROWSER_MESSAGE')
}

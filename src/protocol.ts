import { validateJsonSchemaValue, valueSchemaSpecToJsonSchema } from '@deepseek-ai/dsh-tools'
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
  ],
} as const satisfies ValueSchemaSpec
const responseSchema = {
  oneOf: [
    { type: 'object', additionalProperties: false, properties: {
      v: version, kind: { type: 'string', const: 'ready', required: true },
    } },
    { type: 'object', additionalProperties: false, properties: {
      v: version, id, kind: { type: 'string', const: 'result', required: true },
      value: { ...healthSchema, required: true },
    } },
    { type: 'object', additionalProperties: false, properties: {
      v: version, id, kind: { type: 'string', const: 'error', required: true },
      code: { type: 'string', enum: ['CANCELLED', 'BUSY', 'INVALID_REQUEST', 'WORKER_ERROR'], required: true },
    } },
  ],
} as const satisfies ValueSchemaSpec
export type Request = InferValue<typeof requestSchema>
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
export const parseRequest = parser(requestSchema)
export const parseResponse = parser(responseSchema)

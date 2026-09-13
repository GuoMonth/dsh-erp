// Frozen alpha.5 validation baseline only. Never import from production or ship in npm.
const str = { type: 'string', required: true };
export const queries = ['menu', 'products', 'product', 'stock', 'purchases', 'purchase', 'sales', 'sale', 'transactions'];
export const scmReadSchema = { type: 'object', additionalProperties: false, properties: {
        sessionId: str, revision: { type: 'integer', required: true },
        query: { type: 'string', enum: queries, required: true },
        id: { type: 'string' }, keyword: { type: 'string' }, page: { type: 'integer' }, limit: { type: 'integer' },
    } };
export const scmResultSchema = { type: 'object', additionalProperties: false, properties: {
        query: scmReadSchema.properties.query, url: str, observedAt: str, data: { type: 'json', required: true },
        limitations: { type: 'array', items: { type: 'string' }, required: true },
    } };
export const SCM_ADAPTER = 'scm-usa-read-v1';

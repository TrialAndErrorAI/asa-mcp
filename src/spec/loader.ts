/**
 * OpenAPI spec loader for ASA MCP.
 * Resolves $refs shallow for `search` tool sandbox traversal.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ResolvedSpec {
  info: { title: string; version: string; description?: string };
  paths: Record<string, any>;
  pathCount: number;
  schemaCount: number;
}

export function loadSpec(): ResolvedSpec {
  const raw = JSON.parse(readFileSync(join(__dirname, 'openapi.json'), 'utf-8'));
  const schemas = raw.components?.schemas || {};

  const paths: Record<string, any> = {};
  for (const [path, methods] of Object.entries(raw.paths as Record<string, any>)) {
    paths[path] = {};
    for (const [method, op] of Object.entries(methods as Record<string, any>)) {
      if (method === 'parameters') continue;
      paths[path][method] = {
        summary: op.summary || '',
        description: op.description || '',
        operationId: op.operationId || '',
        tags: op.tags || [],
        parameters: (op.parameters || []).map((p: any) =>
          p.$ref ? resolveRef(p.$ref, raw) : {
            name: p.name,
            in: p.in,
            required: p.required || false,
            description: p.description || '',
            schema: resolveSchemaShallow(p.schema, schemas),
          }
        ),
        requestBody: op.requestBody ? summarizeRequestBody(op.requestBody, schemas) : undefined,
        responses: summarizeResponses(op.responses || {}, schemas),
      };
    }
  }

  return {
    info: raw.info,
    paths,
    pathCount: Object.keys(paths).length,
    schemaCount: Object.keys(schemas).length,
  };
}

function resolveRef(ref: string, root: any): any {
  const parts = ref.replace('#/', '').split('/');
  let cur = root;
  for (const p of parts) {
    cur = cur?.[p];
    if (!cur) return { $ref: ref, _unresolved: true };
  }
  return cur;
}

function resolveSchemaShallow(schema: any, schemas: Record<string, any>): any {
  if (!schema) return undefined;
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop();
    const r = schemas[name!];
    if (!r) return { type: 'unknown', ref: name };
    return {
      type: r.type || 'object',
      properties: r.properties
        ? Object.fromEntries(
            Object.entries(r.properties).map(([k, v]: [string, any]) => [
              k,
              { type: v.type || (v.$ref ? 'object' : 'unknown'), description: v.description || '' },
            ])
          )
        : undefined,
      enum: r.enum,
      required: r.required,
      description: r.description,
    };
  }
  if (schema.type === 'array' && schema.items) {
    return { type: 'array', items: resolveSchemaShallow(schema.items, schemas) };
  }
  return schema;
}

function summarizeRequestBody(body: any, schemas: Record<string, any>): any {
  const content = body.content?.['application/json'];
  if (!content?.schema) return { description: body.description || '' };
  return {
    required: body.required || false,
    schema: resolveSchemaShallow(content.schema, schemas),
  };
}

function summarizeResponses(responses: Record<string, any>, schemas: Record<string, any>): any {
  const result: Record<string, any> = {};
  for (const [status, resp] of Object.entries(responses)) {
    const content = (resp as any).content?.['application/json'];
    result[status] = {
      description: (resp as any).description || '',
      schema: content?.schema ? resolveSchemaShallow(content.schema, schemas) : undefined,
    };
  }
  return result;
}

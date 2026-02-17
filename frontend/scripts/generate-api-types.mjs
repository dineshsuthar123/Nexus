#!/usr/bin/env node
/**
 * Generate TypeScript types from OpenAPI specification
 *
 * Usage: node scripts/generate-api-types.mjs
 *
 * This script reads the OpenAPI spec from docs/openapi.yaml
 * and generates TypeScript types at apps/web/src/types/api.generated.ts
 *
 * It performs real YAML parsing to extract schemas, paths, enums, and
 * request/response mappings — keeping generated types in sync with the spec.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..', '..');

const openapiPath = resolve(rootDir, 'docs', 'openapi.yaml');
const outputPath = resolve(
  __dirname,
  '..',
  'apps',
  'web',
  'src',
  'types',
  'api.generated.ts'
);

// =============================================================================
// Minimal YAML parser (handles OpenAPI subset without external deps)
// =============================================================================

function parseYaml(text) {
  const lines = text.split('\n');
  return parseBlock(lines, 0, -1).value;
}

function parseBlock(lines, start, parentIndent) {
  const result = {};
  let i = start;

  while (i < lines.length) {
    const raw = lines[i];
    if (raw.trim() === '' || raw.trim().startsWith('#')) { i++; continue; }

    const indent = raw.search(/\S/);
    if (indent <= parentIndent) break;

    // Establish block indent from first line
    if (Object.keys(result).length === 0) {
      // first key sets expected indent
    }

    const trimmed = raw.trim();

    // Array item at this level?
    if (trimmed.startsWith('- ')) {
      break; // arrays handled by caller
    }

    const colonMatch = trimmed.match(/^([^:]+?):\s*(.*)/);
    if (!colonMatch) { i++; continue; }

    const key = colonMatch[1].replace(/^['"]|['"]$/g, '');
    let afterColon = colonMatch[2].trim();

    // Remove inline comment
    if (afterColon && !afterColon.startsWith("'") && !afterColon.startsWith('"')) {
      const commentIdx = afterColon.indexOf(' #');
      if (commentIdx > 0) afterColon = afterColon.substring(0, commentIdx).trim();
    }

    if (afterColon === '' || afterColon === '|' || afterColon === '>') {
      // Look at next non-empty line
      const nextIdx = skipEmpty(lines, i + 1);
      if (nextIdx >= lines.length || lines[nextIdx].search(/\S/) <= indent) {
        result[key] = null;
        i++;
        continue;
      }
      const nextIndent = lines[nextIdx].search(/\S/);
      if (nextIndent <= indent) {
        result[key] = null;
        i++;
        continue;
      }
      const nextTrimmed = lines[nextIdx].trim();

      if (afterColon === '|' || afterColon === '>') {
        // Multiline string
        let str = '';
        let j = nextIdx;
        while (j < lines.length) {
          if (lines[j].trim() === '') { str += '\n'; j++; continue; }
          if (lines[j].search(/\S/) < nextIndent) break;
          str += (str && !str.endsWith('\n') ? '\n' : '') + lines[j].substring(nextIndent);
          j++;
        }
        result[key] = str;
        i = j;
      } else if (nextTrimmed.startsWith('- ')) {
        const arr = parseArray(lines, nextIdx, nextIndent);
        result[key] = arr.value;
        i = arr.nextIdx;
      } else {
        const block = parseBlock(lines, nextIdx, indent);
        result[key] = block.value;
        i = block.nextIdx;
      }
    } else if (afterColon.startsWith('[')) {
      result[key] = parseInlineArray(afterColon);
      i++;
    } else if (afterColon.startsWith("'") || afterColon.startsWith('"')) {
      const q = afterColon[0];
      result[key] = afterColon.slice(1, afterColon.lastIndexOf(q) > 0 ? afterColon.lastIndexOf(q) : afterColon.length);
      i++;
    } else if (afterColon === 'true') {
      result[key] = true; i++;
    } else if (afterColon === 'false') {
      result[key] = false; i++;
    } else if (afterColon === 'null') {
      result[key] = null; i++;
    } else if (/^-?\d+(\.\d+)?$/.test(afterColon)) {
      result[key] = Number(afterColon); i++;
    } else {
      // Bare string value (includes $ref values like "#/components/schemas/X")
      result[key] = afterColon.replace(/^['"]|['"]$/g, '');
      i++;
    }
  }

  return { value: result, nextIdx: i };
}

function parseArray(lines, start, expectedIndent) {
  const result = [];
  let i = start;

  while (i < lines.length) {
    const raw = lines[i];
    if (raw.trim() === '' || raw.trim().startsWith('#')) { i++; continue; }

    const indent = raw.search(/\S/);
    if (indent < expectedIndent) break;

    const trimmed = raw.trim();
    if (!trimmed.startsWith('- ')) break;

    const itemContent = trimmed.substring(2).trim();

    if (itemContent === '' || itemContent === '|') {
      // Nested block under array item
      const next = skipEmpty(lines, i + 1);
      if (next < lines.length && lines[next].search(/\S/) > indent) {
        const block = parseBlock(lines, next, indent);
        result.push(block.value);
        i = block.nextIdx;
      } else {
        result.push(null);
        i++;
      }
    } else if (itemContent.includes(': ') || itemContent.endsWith(':')) {
      // Object item starting on same line as dash
      const colonM = itemContent.match(/^([^:]+?):\s*(.*)/);
      if (colonM) {
        const obj = {};
        const k = colonM[1].replace(/^['"]|['"]$/g, '');
        const v = colonM[2].trim();

        if (v === '' || v === '|') {
          const next = skipEmpty(lines, i + 1);
          if (next < lines.length && lines[next].search(/\S/) > indent + 2) {
            const nested = parseBlock(lines, next, indent + 2);
            obj[k] = nested.value;
            i = nested.nextIdx;
          } else {
            obj[k] = null;
            i++;
          }
        } else if (v.startsWith('[')) {
          obj[k] = parseInlineArray(v);
          i++;
        } else if (v.startsWith("'") || v.startsWith('"')) {
          const q = v[0];
          obj[k] = v.slice(1, v.lastIndexOf(q) > 0 ? v.lastIndexOf(q) : v.length);
          i++;
        } else {
          obj[k] = v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
          i++;
        }

        // Read additional keys at indent+2
        while (i < lines.length) {
          const sl = lines[i];
          if (sl.trim() === '' || sl.trim().startsWith('#')) { i++; continue; }
          const si = sl.search(/\S/);
          if (si <= indent) break;
          if (sl.trim().startsWith('- ')) break;
          if (si <= indent + 1) break;

          const sm = sl.trim().match(/^([^:]+?):\s*(.*)/);
          if (!sm) { i++; continue; }
          const sk = sm[1].replace(/^['"]|['"]$/g, '');
          let sv = sm[2].trim();

          if (sv === '' || sv === '|' || sv === '>') {
            const next = skipEmpty(lines, i + 1);
            if (next < lines.length && lines[next].search(/\S/) > si) {
              const nextTrimmed = lines[next].trim();
              if (nextTrimmed.startsWith('- ')) {
                const arr = parseArray(lines, next, lines[next].search(/\S/));
                obj[sk] = arr.value;
                i = arr.nextIdx;
              } else {
                const nested = parseBlock(lines, next, si);
                obj[sk] = nested.value;
                i = nested.nextIdx;
              }
            } else {
              obj[sk] = null;
              i++;
            }
          } else if (sv.startsWith('[')) {
            obj[sk] = parseInlineArray(sv);
            i++;
          } else if (sv.startsWith("'") || sv.startsWith('"')) {
            const q = sv[0];
            obj[sk] = sv.slice(1, sv.lastIndexOf(q) > 0 ? sv.lastIndexOf(q) : sv.length);
            i++;
          } else {
            obj[sk] = sv === 'true' ? true : sv === 'false' ? false : /^-?\d+(\.\d+)?$/.test(sv) ? Number(sv) : sv;
            i++;
          }
        }

        result.push(obj);
      } else {
        result.push(itemContent);
        i++;
      }
    } else {
      // Simple scalar
      let val = itemContent.replace(/^['"]|['"]$/g, '');
      result.push(val);
      i++;
    }
  }

  return { value: result, nextIdx: i };
}

function parseInlineArray(str) {
  const inner = str.replace(/^\[|\]$/g, '').trim();
  if (!inner) return [];
  return inner.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
}

function skipEmpty(lines, start) {
  let i = start;
  while (i < lines.length && (lines[i].trim() === '' || lines[i].trim().startsWith('#'))) i++;
  return i;
}

// =============================================================================
// OpenAPI → TypeScript conversion
// =============================================================================

function resolveSchemaName(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const clean = ref.replace(/^['"]|['"]$/g, '');
  const match = clean.match(/#\/components\/schemas\/(\w+)/);
  return match ? match[1] : null;
}

function schemaToTs(schema, spec, indent = 0) {
  if (!schema || typeof schema !== 'object') return 'unknown';

  // Handle $ref
  if (schema['$ref']) {
    const name = resolveSchemaName(schema['$ref']);
    return name || 'unknown';
  }

  if (schema.enum && Array.isArray(schema.enum)) {
    return schema.enum.map((v) => `'${v}'`).join(' | ');
  }

  const type = schema.type;

  if (type === 'string') {
    if (schema.format === 'date-time' || schema.format === 'date') return 'string';
    if (schema.format === 'uuid') return 'string';
    if (schema.format === 'email') return 'string';
    return 'string';
  }
  if (type === 'number' || type === 'integer') return 'number';
  if (type === 'boolean') return 'boolean';

  if (type === 'array') {
    const itemType = schema.items ? schemaToTs(schema.items, spec, indent) : 'unknown';
    return `${itemType}[]`;
  }

  if (type === 'object' || schema.properties) {
    const props = schema.properties || {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    const pad = '  '.repeat(indent + 1);
    const closePad = '  '.repeat(indent);
    const entries = Object.entries(props);
    if (entries.length === 0) return 'Record<string, unknown>';

    const propLines = entries.map(([name, propSchema]) => {
      const opt = required.includes(name) ? '' : '?';
      const tsType = schemaToTs(propSchema, spec, indent + 1);
      return `${pad}${name}${opt}: ${tsType};`;
    });
    return `{\n${propLines.join('\n')}\n${closePad}}`;
  }

  return 'unknown';
}

function generateInterfaces(spec) {
  const schemas = spec?.components?.schemas || {};
  const lines = [];

  for (const [name, schema] of Object.entries(schemas)) {
    if (!schema || typeof schema !== 'object') continue;

    // Enum-only type
    if (schema.enum && !schema.properties) {
      const vals = schema.enum.map((v) => `'${v}'`).join(' | ');
      lines.push(`export type ${name} = ${vals};\n`);
      continue;
    }

    const required = Array.isArray(schema.required) ? schema.required : [];
    const properties = schema.properties || {};

    lines.push(`export interface ${name} {`);

    for (const [propName, propSchema] of Object.entries(properties)) {
      if (!propSchema) continue;
      const opt = required.includes(propName) ? '' : '?';
      const tsType = schemaToTs(propSchema, spec, 1);
      const desc = propSchema.description;
      if (desc) lines.push(`  /** ${desc} */`);
      lines.push(`  ${propName}${opt}: ${tsType};`);
    }

    lines.push('}\n');
  }

  return lines.join('\n');
}

function generateEndpointMap(spec) {
  const paths = spec?.paths || {};
  const lines = ['export interface ApiEndpoints {'];

  for (const [path, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== 'object') continue;

    for (const [method, operation] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      if (!operation || typeof operation !== 'object') continue;

      const httpMethod = method.toUpperCase();
      const tsPath = path.replace(/\{(\w+)\}/g, ':$1');
      const key = `${httpMethod} ${tsPath}`;

      // Request body type
      let reqType = 'void';
      const rb = operation.requestBody;
      if (rb && rb.content) {
        const jsonSchema = rb.content['application/json']?.schema;
        if (jsonSchema) {
          reqType = schemaToTs(jsonSchema, spec, 2);
        }
      }

      // Response type (200 or 201)
      let resType = 'void';
      const responses = operation.responses || {};
      for (const code of ['200', '201', "'200'", "'201'"]) {
        const resp = responses[code];
        if (resp?.content?.['application/json']?.schema) {
          resType = schemaToTs(resp.content['application/json'].schema, spec, 2);
          break;
        }
      }

      const opId = operation.operationId || '';
      const summary = operation.summary || '';
      if (summary) {
        lines.push(`  /** ${summary}${opId ? ' (' + opId + ')' : ''} */`);
      }
      lines.push(`  '${key}': { req: ${reqType}; res: ${resType} };`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

function generatePathConstants(spec) {
  const paths = spec?.paths || {};
  const lines = ['export const API_PATHS = {'];

  for (const [path, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== 'object') continue;
    for (const [method, operation] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const opId = operation?.operationId;
      if (opId) {
        lines.push(`  ${opId}: '${path}',`);
      }
    }
  }

  lines.push('} as const;');
  return lines.join('\n');
}

function extractEnums(spec) {
  const schemas = spec?.components?.schemas || {};
  const enums = {};

  for (const [schemaName, schema] of Object.entries(schemas)) {
    if (!schema?.properties) continue;
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      if (propSchema?.enum && Array.isArray(propSchema.enum)) {
        const enumName = `${schemaName}_${propName}`;
        enums[enumName] = propSchema.enum;
      }
    }
  }

  const lines = ['// Extracted enum values for runtime validation'];
  lines.push('export const API_ENUMS = {');
  for (const [name, values] of Object.entries(enums)) {
    const valStr = values.map((v) => `'${v}'`).join(', ');
    lines.push(`  ${name}: [${valStr}] as const,`);
  }
  lines.push('} as const;');
  return lines.join('\n');
}

function extractSecuritySchemes(spec) {
  const schemes = spec?.components?.securitySchemes || {};
  const lines = ['export const SECURITY_SCHEMES = {'];
  for (const [name, scheme] of Object.entries(schemes)) {
    if (!scheme || typeof scheme !== 'object') continue;
    lines.push(`  ${name}: {`);
    lines.push(`    type: '${scheme.type || 'unknown'}',`);
    if (scheme.scheme) lines.push(`    scheme: '${scheme.scheme}',`);
    if (scheme.bearerFormat) lines.push(`    bearerFormat: '${scheme.bearerFormat}',`);
    if (scheme.in) lines.push(`    in: '${scheme.in}',`);
    if (scheme.name) lines.push(`    name: '${scheme.name}',`);
    lines.push('  },');
  }
  lines.push('} as const;');
  return lines.join('\n');
}

// =============================================================================
// Main
// =============================================================================

try {
  console.log(`📖 Reading OpenAPI spec from: ${openapiPath}`);
  const yamlContent = readFileSync(openapiPath, 'utf-8');
  const spec = parseYaml(yamlContent);

  if (!spec?.openapi) {
    throw new Error('Failed to parse OpenAPI spec — missing "openapi" field');
  }

  console.log(`✅ Parsed OpenAPI ${spec.openapi} — "${spec.info?.title || 'Untitled'}"`);

  const header = `// =============================================================================
// Auto-generated from docs/openapi.yaml
// Do NOT edit manually. Run: pnpm run generate:types
// Generated: ${new Date().toISOString()}
// OpenAPI: ${spec.openapi} — ${spec.info?.title || 'Untitled'} v${spec.info?.version || '0.0.0'}
// =============================================================================

/* eslint-disable */
/* tslint:disable */

`;

  const sections = [
    '// =============================================================================',
    '// Schema Types (from components/schemas)',
    '// =============================================================================\n',
    generateInterfaces(spec),
    '\n// =============================================================================',
    '// API Endpoint Type Map',
    '// =============================================================================\n',
    generateEndpointMap(spec),
    '\n// =============================================================================',
    '// Path Constants (operationId → path)',
    '// =============================================================================\n',
    generatePathConstants(spec),
    '\n// =============================================================================',
    '// Enum Values (for runtime validation)',
    '// =============================================================================\n',
    extractEnums(spec),
    '\n// =============================================================================',
    '// Security Schemes',
    '// =============================================================================\n',
    extractSecuritySchemes(spec),
    '\n// =============================================================================',
    '// Helper Types',
    '// =============================================================================\n',
    `/** Extract request type for an endpoint */`,
    `export type EndpointRequest<K extends keyof ApiEndpoints> = ApiEndpoints[K]['req'];`,
    ``,
    `/** Extract response type for an endpoint */`,
    `export type EndpointResponse<K extends keyof ApiEndpoints> = ApiEndpoints[K]['res'];`,
    ``,
    `/** All API endpoint keys */`,
    `export type ApiEndpointKey = keyof ApiEndpoints;`,
  ];

  mkdirSync(dirname(outputPath), { recursive: true });
  const output = header + sections.join('\n') + '\n';
  writeFileSync(outputPath, output, 'utf-8');
  console.log(`✅ Generated API types at: ${outputPath}`);

  // Summary
  const schemaCount = Object.keys(spec?.components?.schemas || {}).length;
  const pathCount = Object.keys(spec?.paths || {}).length;
  let endpointCount = 0;
  for (const methods of Object.values(spec?.paths || {})) {
    for (const m of Object.keys(methods || {})) {
      if (['get', 'post', 'put', 'patch', 'delete'].includes(m)) endpointCount++;
    }
  }
  console.log(`   Schemas: ${schemaCount}`);
  console.log(`   Paths: ${pathCount}`);
  console.log(`   Endpoints: ${endpointCount}`);
} catch (err) {
  console.error('❌ Failed to generate types:', err.message);
  console.error(err.stack);
  process.exit(1);
}

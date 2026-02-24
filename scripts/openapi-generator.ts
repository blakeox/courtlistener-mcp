/**
 * OpenAPI Specification Generator — build-time convenience re-export.
 * Canonical source: src/infrastructure/openapi-generator.ts
 *
 * Use this from scripts that run via `tsx` (not compiled by tsc).
 */
export {
  OpenAPIGenerator,
  type OpenAPIParameter,
  type OpenAPIOperation,
  type OpenAPISpec,
} from '../src/infrastructure/openapi-generator.js';

/**
 * Schema Resource Provider
 * Phase 3: Surface Expansion
 * 
 * Provides access to API schemas, data models, and documentation
 */

import { Resource } from '@modelcontextprotocol/sdk/types.js';
import { BaseResourceProvider } from './resource-provider.js';

/**
 * Provides access to CourtListener API schemas and data models
 */
export class SchemaResourceProvider extends BaseResourceProvider {
  constructor() {
    super('schema');
  }

  async listResources(): Promise<Resource[]> {
    return [
      {
        uri: this.createUri('opinion'),
        name: 'Opinion Schema',
        description: 'Schema for opinion/case data structure',
        mimeType: 'application/json',
      },
      {
        uri: this.createUri('docket'),
        name: 'Docket Schema',
        description: 'Schema for docket data structure',
        mimeType: 'application/json',
      },
      {
        uri: this.createUri('court'),
        name: 'Court Schema',
        description: 'Schema for court data structure',
        mimeType: 'application/json',
      },
      {
        uri: this.createUri('judge'),
        name: 'Judge Schema',
        description: 'Schema for judge profile data structure',
        mimeType: 'application/json',
      },
      {
        uri: this.createUri('search-params'),
        name: 'Search Parameters',
        description: 'Available search parameters and filters',
        mimeType: 'application/json',
      },
    ];
  }

  async readResource(uri: string): Promise<{
    contents: Array<{
      uri: string;
      mimeType?: string;
      text?: string;
    }>;
  }> {
    const path = uri.replace(`${this.name}://`, '');

    const schemas: Record<string, object> = {
      opinion: {
        type: 'object',
        description: 'Legal opinion/case document',
        properties: {
          id: { type: 'number', description: 'Opinion cluster ID' },
          case_name: { type: 'string', description: 'Name of the case' },
          date_filed: { type: 'string', format: 'date', description: 'Filing date' },
          court: { type: 'string', description: 'Court identifier' },
          citation: { type: 'string', description: 'Legal citation' },
          text: { type: 'string', description: 'Opinion full text' },
          judges: { type: 'array', items: { type: 'string' }, description: 'Judge names' },
          precedential_status: { type: 'string', description: 'Precedential status' },
        },
        required: ['id', 'case_name', 'court'],
      },
      docket: {
        type: 'object',
        description: 'Court docket information',
        properties: {
          id: { type: 'number', description: 'Docket ID' },
          docket_number: { type: 'string', description: 'Docket number' },
          case_name: { type: 'string', description: 'Case name' },
          court: { type: 'string', description: 'Court identifier' },
          date_filed: { type: 'string', format: 'date' },
          parties: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'docket_number', 'court'],
      },
      court: {
        type: 'object',
        description: 'Court information',
        properties: {
          id: { type: 'string', description: 'Court identifier' },
          full_name: { type: 'string', description: 'Full court name' },
          short_name: { type: 'string', description: 'Short court name' },
          jurisdiction: { type: 'string', description: 'Jurisdiction type' },
          start_date: { type: 'string', format: 'date' },
          end_date: { type: 'string', format: 'date', nullable: true },
        },
        required: ['id', 'full_name'],
      },
      judge: {
        type: 'object',
        description: 'Judge profile information',
        properties: {
          id: { type: 'number', description: 'Judge ID' },
          name: { type: 'string', description: 'Judge full name' },
          court: { type: 'string', description: 'Current court' },
          appointer: { type: 'string', description: 'Appointing authority' },
          date_appointed: { type: 'string', format: 'date' },
          schools: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'name'],
      },
      'search-params': {
        type: 'object',
        description: 'Available search parameters',
        properties: {
          query: { type: 'string', description: 'Search query text' },
          court: { type: 'string', description: 'Court filter' },
          judge: { type: 'string', description: 'Judge filter' },
          date_filed_after: { type: 'string', format: 'date' },
          date_filed_before: { type: 'string', format: 'date' },
          page: { type: 'number', minimum: 1, default: 1 },
          page_size: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          order_by: { type: 'string', description: 'Sort field' },
        },
      },
    };

    const schema = schemas[path];
    if (!schema) {
      throw new Error(`Schema not found: ${path}`);
    }

    return {
      contents: [
        this.createTextResource(uri, JSON.stringify(schema, null, 2), 'application/json'),
      ],
    };
  }
}


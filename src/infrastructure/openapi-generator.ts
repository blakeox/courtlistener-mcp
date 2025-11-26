/**
 * OpenAPI Specification Generator for Legal MCP Server
 * Automatically generates Swagger/OpenAPI documentation for all endpoints
 */

import { Logger } from './logger.js';

// OpenAPI types
export interface OpenAPIParameter {
  name: string;
  in: string;
  description?: string;
  required?: boolean;
  schema?: Record<string, unknown>;
  example?: unknown;
}

export interface OpenAPIOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: Record<string, unknown>;
  responses?: Record<string, unknown>;
}

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
    contact: {
      name: string;
      url: string;
      email: string;
    };
    license: {
      name: string;
      url: string;
    };
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  paths: Record<string, Record<string, OpenAPIOperation>>;
  components: {
    schemas: Record<string, unknown>;
    responses: Record<string, unknown>;
    parameters: Record<string, unknown>;
    securitySchemes: Record<string, unknown>;
  };
  tags: Array<{
    name: string;
    description: string;
  }>;
}

export class OpenAPIGenerator {
  private logger: Logger;
  private spec: OpenAPISpec;

  constructor(logger: Logger) {
    this.logger = logger;
    this.spec = this.initializeSpec();
  }

  private initializeSpec(): OpenAPISpec {
    return {
      openapi: '3.0.3',
      info: {
        title: 'Legal MCP Server API',
        description: `
## Legal Model Context Protocol Server

A comprehensive legal research API providing access to CourtListener's extensive legal database with advanced features:

### Features
- **Case Search**: Search legal cases by citation, case name, court, judge, and more
- **Opinion Retrieval**: Access full text of legal opinions and decisions  
- **Court Information**: Browse courts, jurisdictions, and court hierarchies
- **Legal Analysis**: Advanced legal argument analysis and precedent research
- **Caching & Performance**: Intelligent caching with rate limiting
- **Enterprise Features**: Authentication, audit logging, and advanced monitoring

### Rate Limits
- **Public API**: 100 requests per minute
- **Enterprise**: Custom rate limits available

### Authentication  
- **Public Endpoints**: No authentication required for basic search
- **Detailed Data**: API key required for full case details and opinions
- **Enterprise**: OAuth 2.0 and API key authentication

### Data Sources
Powered by [CourtListener](https://www.courtlistener.com/), the most comprehensive legal database with:
- 50+ million legal documents
- Federal and state courts
- Historical cases back to 1760s
- Real-time updates from courts
        `.trim(),
        version: '2.0.0',
        contact: {
          name: 'Legal MCP Support',
          url: 'https://github.com/blakeox/courtlistener-mcp',
          email: 'support@legal-mcp.com',
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT',
        },
      },
      servers: [
        {
          url: 'http://localhost:3001',
          description: 'Development server',
        },
        {
          url: 'https://api.legal-mcp.com',
          description: 'Production server',
        },
      ],
      paths: {},
      components: {
        schemas: this.generateSchemas(),
        responses: this.generateResponses(),
        parameters: this.generateParameters(),
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'API key for authenticated endpoints',
          },
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT token for enterprise authentication',
          },
        },
      },
      tags: [
        {
          name: 'Health',
          description: 'System health and monitoring endpoints',
        },
        {
          name: 'Search',
          description: 'Legal case and document search operations',
        },
        {
          name: 'Cases',
          description: 'Legal case information and details',
        },
        {
          name: 'Opinions',
          description: 'Legal opinion text and metadata',
        },
        {
          name: 'Courts',
          description: 'Court information and jurisdictions',
        },
        {
          name: 'Analysis',
          description: 'Legal argument analysis and research tools',
        },
        {
          name: 'Metrics',
          description: 'Performance metrics and analytics',
        },
      ],
    };
  }

  private generateSchemas(): Record<string, unknown> {
    return {
      HealthStatus: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['healthy', 'degraded', 'unhealthy'],
            description: 'Overall system health status',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'Health check timestamp',
          },
          uptime: {
            type: 'number',
            description: 'Server uptime in seconds',
          },
          version: {
            type: 'string',
            description: 'Server version',
          },
          dependencies: {
            type: 'object',
            properties: {
              courtlistener: {
                $ref: '#/components/schemas/DependencyStatus',
              },
              cache: {
                $ref: '#/components/schemas/DependencyStatus',
              },
              database: {
                $ref: '#/components/schemas/DependencyStatus',
              },
            },
          },
        },
        required: ['status', 'timestamp', 'uptime', 'version'],
      },
      DependencyStatus: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['healthy', 'degraded', 'unhealthy'],
          },
          responseTime: {
            type: 'number',
            description: 'Response time in milliseconds',
          },
          lastCheck: {
            type: 'string',
            format: 'date-time',
          },
          error: {
            type: 'string',
            description: 'Error message if unhealthy',
          },
        },
        required: ['status', 'lastCheck'],
      },
      Metrics: {
        type: 'object',
        properties: {
          requests: {
            type: 'object',
            properties: {
              total: { type: 'number' },
              successful: { type: 'number' },
              failed: { type: 'number' },
              averageResponseTime: { type: 'number' },
            },
          },
          cache: {
            type: 'object',
            properties: {
              hits: { type: 'number' },
              misses: { type: 'number' },
              hitRate: { type: 'number' },
              size: { type: 'number' },
            },
          },
          system: {
            type: 'object',
            properties: {
              uptime: { type: 'number' },
              memoryUsage: { type: 'number' },
              cpuUsage: { type: 'number' },
            },
          },
        },
      },
      SearchRequest: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query text',
            example: 'constitutional law',
          },
          citation: {
            type: 'string',
            description: 'Legal citation to search for',
            example: '410 U.S. 113',
          },
          case_name: {
            type: 'string',
            description: 'Case name to search for',
            example: 'Brown v. Board of Education',
          },
          court: {
            type: 'string',
            description: 'Court identifier or name',
            example: 'scotus',
          },
          judge: {
            type: 'string',
            description: 'Judge name',
            example: 'John Roberts',
          },
          date_filed_after: {
            type: 'string',
            format: 'date',
            description: 'Filed after this date',
            example: '2020-01-01',
          },
          date_filed_before: {
            type: 'string',
            format: 'date',
            description: 'Filed before this date',
            example: '2023-12-31',
          },
          page: {
            type: 'integer',
            minimum: 1,
            default: 1,
            description: 'Page number for pagination',
          },
          page_size: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20,
            description: 'Number of results per page',
          },
        },
      },
      SearchResponse: {
        type: 'object',
        properties: {
          count: {
            type: 'integer',
            description: 'Total number of results',
          },
          next: {
            type: 'string',
            nullable: true,
            description: 'URL for next page',
          },
          previous: {
            type: 'string',
            nullable: true,
            description: 'URL for previous page',
          },
          results: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/CaseResult',
            },
          },
        },
        required: ['count', 'results'],
      },
      CaseResult: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            description: 'Unique case identifier',
          },
          cluster_id: {
            type: 'integer',
            description: 'Opinion cluster identifier',
          },
          case_name: {
            type: 'string',
            description: 'Full case name',
          },
          citation: {
            type: 'string',
            description: 'Primary citation',
          },
          court: {
            type: 'string',
            description: 'Court name',
          },
          date_filed: {
            type: 'string',
            format: 'date',
            description: 'Date case was filed',
          },
          judge: {
            type: 'string',
            description: 'Presiding judge',
          },
          snippet: {
            type: 'string',
            description: 'Text snippet from opinion',
          },
          opinions: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/OpinionSummary',
            },
          },
        },
        required: ['id', 'case_name', 'court'],
      },
      OpinionSummary: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            description: 'Opinion identifier',
          },
          type: {
            type: 'string',
            enum: ['majority', 'dissenting', 'concurring', 'plurality'],
            description: 'Type of opinion',
          },
          author: {
            type: 'string',
            description: 'Opinion author',
          },
          word_count: {
            type: 'integer',
            description: 'Word count of opinion text',
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            description: 'Error type',
          },
          message: {
            type: 'string',
            description: 'Human-readable error message',
          },
          details: {
            type: 'object',
            description: 'Additional error details',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
          },
          request_id: {
            type: 'string',
            description: 'Unique request identifier for tracking',
          },
        },
        required: ['error', 'message', 'timestamp'],
      },
    };
  }

  private generateResponses(): Record<string, unknown> {
    return {
      Success: {
        description: 'Operation successful',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: true },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      BadRequest: {
        description: 'Bad request - invalid parameters',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse',
            },
            example: {
              error: 'validation_error',
              message: 'Invalid parameter: page must be a positive integer',
              timestamp: '2023-09-23T10:30:00Z',
              request_id: 'req_123456789',
            },
          },
        },
      },
      Unauthorized: {
        description: 'Unauthorized - authentication required',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse',
            },
            example: {
              error: 'unauthorized',
              message: 'Authentication credentials were not provided.',
              timestamp: '2023-09-23T10:30:00Z',
              request_id: 'req_123456789',
            },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse',
            },
            example: {
              error: 'not_found',
              message: 'Case with ID 999999 not found',
              timestamp: '2023-09-23T10:30:00Z',
              request_id: 'req_123456789',
            },
          },
        },
      },
      RateLimit: {
        description: 'Rate limit exceeded',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse',
            },
            example: {
              error: 'rate_limit_exceeded',
              message: 'Rate limit of 100 requests per minute exceeded',
              timestamp: '2023-09-23T10:30:00Z',
              request_id: 'req_123456789',
            },
          },
        },
      },
      InternalError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ErrorResponse',
            },
            example: {
              error: 'internal_server_error',
              message: 'An unexpected error occurred',
              timestamp: '2023-09-23T10:30:00Z',
              request_id: 'req_123456789',
            },
          },
        },
      },
    };
  }

  private generateParameters(): Record<string, unknown> {
    return {
      PageParam: {
        name: 'page',
        in: 'query',
        description: 'Page number for pagination',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          default: 1,
        },
      },
      PageSizeParam: {
        name: 'page_size',
        in: 'query',
        description: 'Number of results per page',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20,
        },
      },
      ClusterIdParam: {
        name: 'cluster_id',
        in: 'path',
        description: 'Opinion cluster identifier',
        required: true,
        schema: {
          type: 'integer',
          minimum: 1,
        },
      },
      OpinionIdParam: {
        name: 'opinion_id',
        in: 'path',
        description: 'Opinion identifier',
        required: true,
        schema: {
          type: 'integer',
          minimum: 1,
        },
      },
    };
  }

  public addPath(path: string, method: string, operation: Record<string, unknown>): void {
    if (!this.spec.paths[path]) {
      this.spec.paths[path] = {};
    }
    this.spec.paths[path][method.toLowerCase()] = operation;
    this.logger.debug('Added OpenAPI path', { path, method });
  }

  public generateHealthEndpoints(): void {
    this.addPath('/health', 'GET', {
      tags: ['Health'],
      summary: 'System health check',
      description: 'Check the overall health of the system and its dependencies',
      operationId: 'getHealth',
      responses: {
        '200': {
          description: 'System is healthy',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/HealthStatus',
              },
              example: {
                status: 'healthy',
                timestamp: '2023-09-23T10:30:00Z',
                uptime: 86400,
                version: '2.0.0',
                dependencies: {
                  courtlistener: {
                    status: 'healthy',
                    responseTime: 150,
                    lastCheck: '2023-09-23T10:30:00Z',
                  },
                  cache: {
                    status: 'healthy',
                    responseTime: 5,
                    lastCheck: '2023-09-23T10:30:00Z',
                  },
                },
              },
            },
          },
        },
        '503': {
          $ref: '#/components/responses/InternalError',
        },
      },
    });

    this.addPath('/metrics', 'GET', {
      tags: ['Metrics'],
      summary: 'System metrics',
      description: 'Get performance metrics and system statistics',
      operationId: 'getMetrics',
      responses: {
        '200': {
          description: 'System metrics',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Metrics',
              },
            },
          },
        },
      },
    });

    this.addPath('/status', 'GET', {
      tags: ['Health'],
      summary: 'Server status',
      description: 'Get basic server status and uptime information',
      operationId: 'getStatus',
      responses: {
        '200': {
          description: 'Server status',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'online' },
                  uptime: { type: 'number' },
                  version: { type: 'string' },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
      },
    });
  }

  public generateSearchEndpoints(): void {
    this.addPath('/api/search', 'GET', {
      tags: ['Search'],
      summary: 'Search legal cases',
      description:
        'Search for legal cases using various criteria including citation, case name, court, and date ranges',
      operationId: 'searchCases',
      parameters: [
        {
          name: 'query',
          in: 'query',
          description: 'General search query',
          required: false,
          schema: { type: 'string' },
          example: 'constitutional law',
        },
        {
          name: 'citation',
          in: 'query',
          description: 'Legal citation',
          required: false,
          schema: { type: 'string' },
          example: '410 U.S. 113',
        },
        {
          name: 'case_name',
          in: 'query',
          description: 'Case name',
          required: false,
          schema: { type: 'string' },
          example: 'Brown v. Board',
        },
        {
          name: 'court',
          in: 'query',
          description: 'Court identifier',
          required: false,
          schema: { type: 'string' },
          example: 'scotus',
        },
        {
          name: 'judge',
          in: 'query',
          description: 'Judge name',
          required: false,
          schema: { type: 'string' },
        },
        {
          name: 'date_filed_after',
          in: 'query',
          description: 'Filed after date (YYYY-MM-DD)',
          required: false,
          schema: { type: 'string', format: 'date' },
        },
        {
          name: 'date_filed_before',
          in: 'query',
          description: 'Filed before date (YYYY-MM-DD)',
          required: false,
          schema: { type: 'string', format: 'date' },
        },
        { $ref: '#/components/parameters/PageParam' },
        { $ref: '#/components/parameters/PageSizeParam' },
      ],
      responses: {
        '200': {
          description: 'Search results',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SearchResponse',
              },
            },
          },
        },
        '400': { $ref: '#/components/responses/BadRequest' },
        '429': { $ref: '#/components/responses/RateLimit' },
        '500': { $ref: '#/components/responses/InternalError' },
      },
    });
  }

  public generateCaseEndpoints(): void {
    this.addPath('/api/cases/{cluster_id}', 'GET', {
      tags: ['Cases'],
      summary: 'Get case details',
      description: 'Retrieve detailed information about a specific case by cluster ID',
      operationId: 'getCaseDetails',
      parameters: [{ $ref: '#/components/parameters/ClusterIdParam' }],
      responses: {
        '200': {
          description: 'Case details',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CaseResult',
              },
            },
          },
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '404': { $ref: '#/components/responses/NotFound' },
        '500': { $ref: '#/components/responses/InternalError' },
      },
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    });
  }

  public generateOpinionEndpoints(): void {
    this.addPath('/api/opinions/{opinion_id}', 'GET', {
      tags: ['Opinions'],
      summary: 'Get opinion text',
      description: 'Retrieve the full text of a legal opinion',
      operationId: 'getOpinionText',
      parameters: [{ $ref: '#/components/parameters/OpinionIdParam' }],
      responses: {
        '200': {
          description: 'Opinion text and metadata',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  type: { type: 'string' },
                  author: { type: 'string' },
                  text: { type: 'string' },
                  word_count: { type: 'integer' },
                  cluster_id: { type: 'integer' },
                },
              },
            },
          },
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '404': { $ref: '#/components/responses/NotFound' },
        '500': { $ref: '#/components/responses/InternalError' },
      },
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    });
  }

  public generateFullSpec(): OpenAPISpec {
    // Generate all endpoint documentation
    this.generateHealthEndpoints();
    this.generateSearchEndpoints();
    this.generateCaseEndpoints();
    this.generateOpinionEndpoints();

    this.logger.info('Generated complete OpenAPI specification', {
      paths: Object.keys(this.spec.paths).length,
      schemas: Object.keys(this.spec.components.schemas).length,
    });

    return this.spec;
  }

  public exportToJson(): string {
    return JSON.stringify(this.generateFullSpec(), null, 2);
  }

  public exportToYaml(): string {
    // Simple YAML export - in production, use a proper YAML library
    const spec = this.generateFullSpec();
    return this.convertToYaml(spec, 0);
  }

  private convertToYaml(obj: unknown, indent: number): string {
    const spaces = '  '.repeat(indent);
    let yaml = '';

    if (Array.isArray(obj)) {
      for (const item of obj) {
        yaml += `${spaces}- ${this.convertToYaml(item, indent + 1)}\n`;
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
          yaml += `${spaces}${key}:\n${this.convertToYaml(value, indent + 1)}`;
        } else {
          yaml += `${spaces}${key}: ${JSON.stringify(value)}\n`;
        }
      }
    } else {
      return JSON.stringify(obj);
    }

    return yaml;
  }
}

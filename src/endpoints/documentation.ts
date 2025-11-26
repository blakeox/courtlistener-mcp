/**
 * API Documentation Service
 * Serves interactive Swagger UI and OpenAPI specifications
 */

import { Request, Response, Router } from 'express';
import {
  OpenAPIGenerator,
  OpenAPISpec,
  OpenAPIOperation,
  OpenAPIParameter,
} from '../infrastructure/openapi-generator.js';
import { Logger } from '../infrastructure/logger.js';

// Postman collection types
interface PostmanCollection {
  info: {
    name: string;
    description: string;
    version: string;
    schema: string;
  };
  auth: Record<string, unknown>;
  variable: Array<{ key: string; value: string; type: string }>;
  item: Array<Record<string, unknown>>;
}

interface PostmanQueryParam {
  key: string;
  value: string;
  description: string;
  disabled: boolean;
}

export class DocumentationService {
  private openAPIGenerator: OpenAPIGenerator;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.openAPIGenerator = new OpenAPIGenerator(logger);
  }

  public getRouter(): Router {
    const router = Router();

    // OpenAPI JSON specification
    router.get('/openapi.json', this.getOpenAPISpec.bind(this));

    // OpenAPI YAML specification
    router.get('/openapi.yaml', this.getOpenAPIYaml.bind(this));

    // Swagger UI HTML page
    router.get('/docs', this.getSwaggerUI.bind(this));

    // API documentation landing page
    router.get('/', this.getDocumentationHome.bind(this));

    // Redoc documentation
    router.get('/redoc', this.getRedocUI.bind(this));

    // Postman collection export
    router.get('/postman.json', this.getPostmanCollection.bind(this));

    return router;
  }

  private async getOpenAPISpec(req: Request, res: Response): Promise<void> {
    try {
      const spec = this.openAPIGenerator.generateFullSpec();
      res.json(spec);
      this.logger.info('Served OpenAPI JSON specification');
    } catch (error) {
      this.logger.error(
        'Failed to generate OpenAPI spec',
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        error: 'internal_server_error',
        message: 'Failed to generate API specification',
      });
    }
  }

  private async getOpenAPIYaml(req: Request, res: Response): Promise<void> {
    try {
      const yaml = this.openAPIGenerator.exportToYaml();
      res.set('Content-Type', 'text/yaml');
      res.send(yaml);
      this.logger.info('Served OpenAPI YAML specification');
    } catch (error) {
      this.logger.error(
        'Failed to generate OpenAPI YAML',
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        error: 'internal_server_error',
        message: 'Failed to generate YAML specification',
      });
    }
  }

  private async getSwaggerUI(req: Request, res: Response): Promise<void> {
    const swaggerHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Legal MCP Server API Documentation</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.7.2/swagger-ui.css" />
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .swagger-ui .topbar { display: none; }
      .custom-header { 
        background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
        color: white; 
        padding: 20px; 
        text-align: center;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .custom-header h1 { margin: 0; font-size: 2rem; font-weight: 700; }
      .custom-header p { margin: 10px 0 0 0; opacity: 0.9; font-size: 1.1rem; }
      .api-info { 
        background: #f8fafc; 
        padding: 20px; 
        border-left: 4px solid #3b82f6;
        margin: 20px;
        border-radius: 8px;
      }
      .api-info h3 { color: #1e40af; margin-top: 0; }
      .feature-grid { 
        display: grid; 
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
        gap: 20px; 
        margin: 20px;
      }
      .feature-card { 
        background: white; 
        padding: 20px; 
        border-radius: 8px; 
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        border: 1px solid #e5e7eb;
      }
      .feature-card h4 { color: #1f2937; margin-top: 0; }
      .feature-card ul { margin: 0; padding-left: 20px; }
      .quick-links { 
        margin: 20px; 
        text-align: center; 
      }
      .quick-links a { 
        display: inline-block; 
        margin: 5px 10px; 
        padding: 10px 20px; 
        background: #3b82f6; 
        color: white; 
        text-decoration: none; 
        border-radius: 6px;
        font-weight: 500;
        transition: background-color 0.2s;
      }
      .quick-links a:hover { 
        background: #2563eb; 
      }
    </style>
</head>
<body>
    <div class="custom-header">
        <h1>🏛️ Legal MCP Server API</h1>
        <p>Comprehensive Legal Research API • Powered by CourtListener</p>
    </div>

    <div class="api-info">
        <h3>📚 About This API</h3>
        <p>The Legal MCP Server provides programmatic access to one of the most comprehensive legal databases available, featuring over 50 million legal documents from federal and state courts. This API enables developers to build powerful legal research applications with advanced search capabilities, case analysis tools, and real-time legal data.</p>
    </div>

    <div class="feature-grid">
        <div class="feature-card">
            <h4>🔍 Advanced Search</h4>
            <ul>
                <li>Full-text case search</li>
                <li>Citation-based lookup</li>
                <li>Judge and court filtering</li>
                <li>Date range queries</li>
                <li>Boolean search operators</li>
            </ul>
        </div>
        <div class="feature-card">
            <h4>⚖️ Legal Data</h4>
            <ul>
                <li>Supreme Court decisions</li>
                <li>Federal circuit opinions</li>
                <li>State court cases</li>
                <li>Historical precedents</li>
                <li>Real-time updates</li>
            </ul>
        </div>
        <div class="feature-card">
            <h4>🚀 Enterprise Features</h4>
            <ul>
                <li>Rate limiting & caching</li>
                <li>Authentication & security</li>
                <li>Performance monitoring</li>
                <li>Audit logging</li>
                <li>Custom integrations</li>
            </ul>
        </div>
        <div class="feature-card">
            <h4>🛡️ Production Ready</h4>
            <ul>
                <li>Health monitoring</li>
                <li>Error handling</li>
                <li>Circuit breakers</li>
                <li>Graceful shutdowns</li>
                <li>Comprehensive metrics</li>
            </ul>
        </div>
    </div>

    <div class="quick-links">
        <a href="/api/docs/openapi.json">📄 Download OpenAPI JSON</a>
        <a href="/api/docs/openapi.yaml">📄 Download OpenAPI YAML</a>
        <a href="/api/docs/postman.json">📮 Postman Collection</a>
        <a href="/api/docs/redoc">📖 ReDoc Documentation</a>
    </div>

    <div id="swagger-ui"></div>
    
    <script src="https://unpkg.com/swagger-ui-dist@5.7.2/swagger-ui-bundle.js"></script>
    <script>
      window.onload = function() {
        SwaggerUIBundle({
          url: '/api/docs/openapi.json',
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIBundle.presets.standalone
          ],
          plugins: [
            SwaggerUIBundle.plugins.DownloadUrl
          ],
          layout: "StandaloneLayout",
          tryItOutEnabled: true,
          filter: true,
          supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
          onComplete: function() {
            console.log('Swagger UI loaded successfully');
          },
          onFailure: function(error) {
            console.error('Swagger UI failed to load:', error);
          }
        });
      };
    </script>
</body>
</html>`;

    res.send(swaggerHTML);
    this.logger.info('Served Swagger UI documentation');
  }

  private async getDocumentationHome(req: Request, res: Response): Promise<void> {
    res.redirect('/api/docs/docs');
  }

  private async getRedocUI(req: Request, res: Response): Promise<void> {
    const redocHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Legal MCP Server API Documentation</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
    <style>
        body { margin: 0; padding: 0; }
        redoc { font-family: 'Roboto', sans-serif; }
    </style>
</head>
<body>
    <redoc spec-url='/api/docs/openapi.json'></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body>
</html>`;

    res.send(redocHTML);
    this.logger.info('Served ReDoc documentation');
  }

  private async getPostmanCollection(req: Request, res: Response): Promise<void> {
    try {
      const openApiSpec = this.openAPIGenerator.generateFullSpec();
      const postmanCollection = this.convertOpenAPIToPostman(openApiSpec);

      res.json(postmanCollection);
      this.logger.info('Served Postman collection');
    } catch (error) {
      this.logger.error(
        'Failed to generate Postman collection',
        error instanceof Error ? error : new Error(String(error)),
      );
      res.status(500).json({
        error: 'internal_server_error',
        message: 'Failed to generate Postman collection',
      });
    }
  }

  private convertOpenAPIToPostman(spec: OpenAPISpec): PostmanCollection {
    const collection: PostmanCollection = {
      info: {
        name: spec.info.title,
        description: spec.info.description,
        version: spec.info.version,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      auth: {
        type: 'apikey',
        apikey: [
          {
            key: 'key',
            value: 'X-API-Key',
            type: 'string',
          },
          {
            key: 'value',
            value: '{{api_key}}',
            type: 'string',
          },
          {
            key: 'in',
            value: 'header',
            type: 'string',
          },
        ],
      },
      variable: [
        {
          key: 'base_url',
          value: 'http://localhost:3001',
          type: 'string',
        },
        {
          key: 'api_key',
          value: 'your_api_key_here',
          type: 'string',
        },
      ],
      item: [],
    };

    // Convert OpenAPI paths to Postman requests
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(
        methods as Record<string, OpenAPIOperation>,
      )) {
        const operationData = operation;

        const request = {
          name: operationData.summary || `${method.toUpperCase()} ${path}`,
          request: {
            method: method.toUpperCase(),
            header: [
              {
                key: 'Content-Type',
                value: 'application/json',
              },
            ],
            url: {
              raw: `{{base_url}}${path}`,
              host: ['{{base_url}}'],
              path: path.split('/').filter(Boolean),
              query: this.extractQueryParams(operationData.parameters || []),
            },
            description: operationData.description || '',
          },
          response: [],
        };

        collection.item.push(request);
      }
    }

    return collection;
  }

  private extractQueryParams(parameters: OpenAPIParameter[]): PostmanQueryParam[] {
    return parameters
      .filter((param) => param.in === 'query')
      .map((param) => ({
        key: param.name,
        value: String(param.example ?? ''),
        description: param.description || '',
        disabled: !param.required,
      }));
  }
}

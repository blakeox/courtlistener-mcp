# Legal MCP Server - CourtListener Integration

A **best practice Model Context Protocol (MCP) server** providing comprehensive
access to legal case data via the CourtListener API. Built with enterprise-grade
features including intelligent caching, structured logging, metrics collection,
rate limiting, and robust error handling.

## 🏆 Production-Ready Features

This implementation demonstrates **MCP server best practices** and
enterprise-grade features:

### 🏗️ **Modular Architecture**

- **Separation of concerns**: Clean module boundaries (config, cache, logger,
  metrics, API client)
- **Dependency injection**: Configurable components for different environments
- **Type safety**: Comprehensive TypeScript interfaces and validation
- **Testable design**: Each module is independently testable

### 📊 **Performance & Reliability**

- **Intelligent caching**: LRU cache with legal-specific TTL strategies
- **Rate limiting**: Automatic API rate limiting with queue management
- **Error handling**: Graceful degradation and detailed error context
- **Health monitoring**: Real-time health checks and performance metrics

### 🔍 **Observability**

- **Structured logging**: JSON-formatted logs with contextual metadata
- **Metrics collection**: Request rates, success rates, cache effectiveness
- **Health endpoints**: HTTP endpoints for monitoring and debugging
- **Performance tracking**: Response times and system resource usage

### ⚙️ **Configuration Management**

- **Environment-based config**: Flexible configuration via environment variables
- **Validation**: Configuration validation with helpful error messages
- **Multi-environment**: Development, staging, and production configurations
- **Documentation**: Clear configuration examples and recommendations

## 🎯 MCP Compliance

This server strictly follows the
[Model Context Protocol](https://modelcontextprotocol.io/) specification and the
[official TypeScript SDK guidelines](https://github.com/modelcontextprotocol/typescript-sdk#writing-mcp-clients):

- ✅ **Pure MCP Implementation** - No external APIs or separate applications
- ✅ **Official SDK Patterns** - Uses `@modelcontextprotocol/sdk` with
  recommended patterns
- ✅ **Resources Support** - Implements dynamic resources for direct data access
- ✅ **Proper Error Handling** - Implements McpError with appropriate ErrorCodes
- ✅ **JSON Schema Validation** - Enhanced input schemas with validation
  patterns
- ✅ **Best Practice Structure** - Follows official server architecture
  guidelines
- ✅ **Graceful Startup/Shutdown** - Proper process management and signal
  handling
- ✅ **Comprehensive API Coverage** - Complete CourtListener API v4 integration

## Quick Start

### Option 1: Remote URL (Easiest — Nothing to Install)

If someone has already deployed the server to Cloudflare Workers, you just add a
single URL to your MCP client config — **no install, no API key, nothing**:

```json
{
  "mcpServers": {
    "courtlistener": {
      "url": "https://courtlistener-mcp.<subdomain>.workers.dev/sse"
    }
  }
}
```

### Option 2: npx (Recommended for Self-Hosting)

```bash
npx courtlistener-mcp --setup
```

This runs an interactive wizard that detects your MCP client and configures
everything automatically. Alternatively, run directly:

```bash
npx courtlistener-mcp
```

### Option 3: Docker

```bash
# Copy the environment template
cp .env.production .env

# Edit .env with your settings
# Then start the server
docker compose -f docker-compose.prod.yml up -d
```

The Docker setup exposes:

- **Port 3001**: Health check endpoint
- **Port 3002**: HTTP/SSE transport for remote MCP clients

### Option 4: From Source

```bash
git clone https://github.com/blakeox/courtlistener-mcp.git
cd courtlistener-mcp
pnpm install
pnpm build
node dist/index.js
```

### Deploy to Cloudflare Workers

To host the MCP server on Cloudflare's edge network (so users only need a URL):

```bash
# Clone and install
git clone https://github.com/blakeox/courtlistener-mcp.git
cd courtlistener-mcp && pnpm install

# Set your CourtListener API key as a Cloudflare secret
wrangler secret put COURTLISTENER_API_KEY

# Optional: restrict access with a bearer token
wrangler secret put MCP_AUTH_TOKEN

# Deploy
wrangler deploy
```

Your server is now live at
`https://courtlistener-mcp.<subdomain>.workers.dev/sse`. Share this URL with
users — they add it to their MCP client and start querying legal data
immediately.

## Configuration

### Getting a CourtListener API Key

1. Create an account at [courtlistener.com](https://www.courtlistener.com/)
2. Go to Profile → API Keys
3. Generate a new token
4. Set it as `COURTLISTENER_API_KEY` in your environment

The server works without an API key for public endpoints, but authenticated
access provides higher rate limits.

### Client Configuration

Pre-built configuration files for popular MCP clients are available in the
[`configs/`](./configs/) directory:

- `claude-desktop.json` — Claude Desktop (local stdio)
- `claude-desktop-remote.json` — Claude Desktop (remote SSE via Cloudflare)
- `cursor.json` — Cursor
- `continue-dev.json` — Continue
- `vscode-copilot.json` — VS Code GitHub Copilot
- `zed.json` — Zed
- `openai-chatgpt.json` — OpenAI ChatGPT

Run `npx courtlistener-mcp --setup` to automatically configure your client, or
copy the appropriate config manually.

### Diagnostics

```bash
npx courtlistener-mcp --doctor
```

Checks Node.js version, API key, API connectivity, and dependencies.

For all available options, run:

```bash
npx courtlistener-mcp --help
```

## Features

### 📚 Core Legal Research Tools

- **Case Search**: Advanced search with pagination, sorting, and filtering
- **Case Details**: Comprehensive case information with full metadata
- **Opinion Text**: Full legal opinion text with citations and formatting
- **Citation Lookup**: Legal citation resolution and case finding
- **Related Cases**: Citation network analysis and case relationships
- **Court Information**: Complete court directory and jurisdictional data
- **Legal Argument Analysis**: AI-assisted case law research and analysis

### 🏛️ Comprehensive Court Data Access

- **Dockets**: Case procedural information and docket entries
- **Judges**: Judicial officer information, appointments, and career data
- **Oral Arguments**: Audio recordings and argument metadata
- **Financial Disclosures**: Judge conflict of interest analysis
- **Parties & Attorneys**: Legal representation and party information
- **RECAP Documents**: Full court filing access and document analysis

### 📊 Advanced Research Features

- **Advanced Search**: Multi-type search across all data types with filtering
- **Bulk Data Access**: Efficient large dataset retrieval with auto-pagination
- **Citation Networks**: Precedent mapping and influence analysis
- **Case Authorities**: Legal authority analysis and citation patterns
- **Visualization Data**: Network analysis and judicial analytics
- **Real-time Alerts**: Legal development monitoring and notifications
- **Bankruptcy Data**: Specialized bankruptcy court information

### 🔧 Enhanced Functionality

- **Smart Caching**: Legal-intelligent caching with age-based TTLs
- **Pagination Support**: Comprehensive pagination with metadata
- **Parameter Validation**: Enhanced input validation and error handling
- **Bulk Operations**: Efficient handling of large datasets
- **Research Insights**: Built-in analysis suggestions and tips

## Available Tools (33 Total)

### Core Research (7 tools)

1. `search_cases` - Advanced case search with comprehensive filtering
2. `get_case_details` - Detailed case information and metadata
3. `get_opinion_text` - Full opinion text retrieval
4. `lookup_citation` - Citation-based case lookup
5. `get_related_cases` - Citation network and related case analysis
6. `list_courts` - Court directory and jurisdictional information
7. `analyze_legal_argument` - AI-assisted legal research and analysis

### Comprehensive Data Access (11 tools)

1. `get_dockets` - Case procedural information
2. `get_docket` - Specific docket details
3. `get_judges` - Judicial officer search
4. `get_judge` - Individual judge information
5. `get_oral_arguments` - Oral argument recordings
6. `get_oral_argument` - Specific argument details
7. `get_financial_disclosures` - Judge financial information
8. `get_financial_disclosure` - Specific disclosure details
9. `get_parties_and_attorneys` - Legal representation data
10. `get_recap_documents` - Court document access
11. `get_recap_document` - Individual document details

### Advanced Features (7 tools)

1. `advanced_search` - Multi-type search with enhanced filtering
2. `get_bulk_data` - Large dataset retrieval
3. `get_visualization_data` - Network analysis data
4. `get_citation_network` - Citation relationship mapping
5. `analyze_case_authorities` - Legal authority analysis
6. `manage_alerts` - Real-time monitoring setup
7. `get_bankruptcy_data` - Specialized bankruptcy information

## � Testing & Quality Assurance

### **Enhanced MCP Inspector Integration** 🆕

This project features **enterprise-grade CI/CD integration** with the official
MCP Inspector:

#### **Comprehensive Testing Modes**

```bash
# Enhanced automated testing with performance monitoring
npm run ci:test-inspector:enhanced

# Extended testing including all 25 tools
npm run ci:test-inspector:enhanced:extended

# Visual regression testing of Inspector web interface
npm run ci:test-inspector:visual

# Performance benchmarking and analysis
npm run ci:test-inspector:performance
```

#### **Advanced Features**

- ✅ **Compatibility Matrix** - Tests across multiple Inspector & Node.js
  versions
- ✅ **Performance Analytics** - Detailed timing and success rate monitoring
- ✅ **Visual Regression Testing** - Automated Inspector UI validation
- ✅ **Categorized Testing** - Priority-based test execution
  (Critical/High/Medium/Low)
- ✅ **Multi-format Reporting** - JSON, Markdown, and JUnit reports
- ✅ **GitHub Actions Integration** - Automated CI/CD with artifact collection

### **Quick Testing**

#### **Automated Test Suite**

```bash
# Complete validation test suite
npm run test:mcp

# Enhanced Inspector integration testing
npm run ci:test-inspector:enhanced
```

#### **Visual Testing with MCP Inspector**

```bash
# Local development testing
npm run inspect:local

# Remote server testing
npm run inspect:remote

# Background testing
npm run inspect
```

### **GitHub Actions CI/CD**

The project includes **3 comprehensive GitHub Actions workflows**:

1. **`ci.yml`** - Enhanced CI with Inspector integration testing
2. **`release.yml`** - Release validation with extended Inspector testing
3. **`performance.yml`** - Scheduled performance monitoring

Each workflow includes:

- Multi-version compatibility testing
- Performance regression detection
- Comprehensive reporting and artifact collection

### Enhanced Configuration

The server supports extensive configuration via environment variables:

```bash
# Production configuration example
CACHE_ENABLED=true
CACHE_TTL=600
LOG_LEVEL=info
LOG_FORMAT=json
METRICS_ENABLED=true
METRICS_PORT=3001
NODE_ENV=production

# Remote SSE gateway (Cloudflare Worker)
# Keep upstream key only on Cloudflare (never in client configs)
COURTLISTENER_API_KEY=your_courtlistener_api_key
# Static token (fallback when OIDC is not configured)
SSE_AUTH_TOKEN=your_shared_secret
# (optional alias in some deployments)
MCP_SSE_AUTH_TOKEN=your_shared_secret

# OAuth/OIDC (preferred)
OIDC_ISSUER=https://your-issuer.example.com
OIDC_AUDIENCE=api://legal-mcp
OIDC_JWKS_URL=https://your-issuer.example.com/.well-known/jwks.json # optional override
OIDC_REQUIRED_SCOPE=mcp:connect

# Connection limiting (protect remote SSE endpoint)
MAX_SSE_CONNECTIONS=100             # global concurrent SSE connections (default 100)
MAX_SSE_CONNECTIONS_PER_IP=5        # per-client IP concurrent connections (default 5)
```

### Health Monitoring

When metrics are enabled, the server provides HTTP endpoints for monitoring:

- **Health Check**: `GET http://localhost:3001/health`
- **Metrics**: `GET http://localhost:3001/metrics`
- **Cache Stats**: `GET http://localhost:3001/cache`

Example health check response:

```json
{
  "status": "healthy",
  "checks": {
    "uptime": { "status": "pass", "value": 3600 },
    "failure_rate": { "status": "pass", "value": 0.02 },
    "response_time": { "status": "pass", "value": 245 },
    "cache_performance": { "status": "pass", "value": 0.67 }
  },
  "metrics": {
    "requests_total": 1250,
    "requests_successful": 1225,
    "cache_hits": 837,
    "average_response_time": 245
  }
}
```

## Usage

### Running the MCP Server

The server runs on stdio and communicates using the Model Context Protocol:

```bash
npm run mcp
```

### MCP Client Configuration

Add this server to your MCP client configuration:

```json
{
  "mcpServers": {
    "legal-mcp": {
      "command": "node",
      "args": ["/path/to/legal-mcp/dist/index.js"],
      "env": {
        "COURTLISTENER_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Multi-LLM Client Support

### Supported Clients

This MCP server works with any MCP-compatible client over **stdio** or **HTTP**
transports:

| Client                        | Transport    | Notes                            |
| ----------------------------- | ------------ | -------------------------------- |
| **Claude Desktop** (local)    | stdio        | Local connection, no auth needed |
| **Claude Desktop** (remote)   | HTTP         | StreamableHTTP transport         |
| **OpenAI ChatGPT**            | HTTP         | OAuth 2.1 authentication         |
| **Cursor**                    | stdio        | Local connection                 |
| **Continue.dev**              | stdio        | Local connection                 |
| **Zed**                       | stdio        | Local connection                 |
| **VS Code GitHub Copilot**    | stdio        | Local connection                 |
| **Any MCP-compatible client** | stdio / HTTP | Both transports supported        |

### Transport Modes

**Stdio (default)** — For local MCP clients:

```bash
node dist/index.js
```

**HTTP (remote)** — For remote/web-based MCP clients:

```bash
node dist/index.js --http
# or
TRANSPORT=http node dist/index.js
```

### Client Configuration

Pre-built configuration files for each supported client are available in the
[`configs/`](./configs/) directory:

- [`claude-desktop.json`](./configs/claude-desktop.json) — Claude Desktop
  (stdio)
- [`claude-desktop-remote.json`](./configs/claude-desktop-remote.json) — Claude
  Desktop (remote)
- [`openai-chatgpt.json`](./configs/openai-chatgpt.json) — OpenAI ChatGPT
- [`cursor.json`](./configs/cursor.json) — Cursor
- [`continue-dev.json`](./configs/continue-dev.json) — Continue.dev
- [`vscode-copilot.json`](./configs/vscode-copilot.json) — VS Code GitHub
  Copilot
- [`zed.json`](./configs/zed.json) — Zed

### OAuth Setup (Remote Deployments)

For HTTP transport with OAuth-enabled clients (e.g., ChatGPT), set the following
environment variables:

```bash
OAUTH_ENABLED=true
OAUTH_ISSUER_URL=https://your-deployment.example.com
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
```

### Docker

```bash
# Stdio mode (default)
docker compose up

# HTTP mode
docker compose --profile http up
```

## Available Tools

This Legal MCP Server provides **25 comprehensive tools** for legal research
through the CourtListener API:

### Core Research Tools (7)

1. **search_cases** - Search for legal cases using various criteria
2. **get_case_details** - Get detailed information about specific cases
3. **get_opinion_text** - Retrieve full text of legal opinions
4. **lookup_citation** - Look up cases by legal citations
5. **get_related_cases** - Find citing and related cases
6. **list_courts** - Browse available courts and jurisdictions
7. **analyze_legal_argument** - Analyze legal arguments with case support

### Advanced Research Tools (18)

1. **get_dockets** - Search dockets and case procedural history
2. **get_docket** - Get specific docket with full details
3. **get_judges** - Search judicial officers and appointments
4. **get_judge** - Get individual judge information and career
5. **get_oral_arguments** - Access oral argument recordings
6. **get_oral_argument** - Get specific argument details
7. **get_financial_disclosures** - Access judge financial disclosures
8. **get_financial_disclosure** - Get specific disclosure details
9. **get_parties_and_attorneys** - Research case participants and representation
10. **get_recap_documents** - Search court documents and filings
11. **get_recap_document** - Get specific document with full text
12. **advanced_search** - Multi-type search across all data types
13. **get_bulk_data** - Large dataset retrieval with pagination
14. **get_visualization_data** - Network analysis and judicial analytics
15. **get_citation_network** - Map case citation relationships
16. **analyze_case_authorities** - Analyze cited authorities in cases
17. **manage_alerts** - Set up legal monitoring alerts
18. **get_bankruptcy_data** - Specialized bankruptcy court information

## Tool Examples

### Basic Case Search

```json
{
  "name": "search_cases",
  "arguments": {
    "query": "privacy rights",
    "court": "scotus",
    "date_filed_after": "2020-01-01"
  }
}
```

### Get Case Details

```json
{
  "name": "get_case_details",
  "arguments": {
    "cluster_id": 108713
  }
}
```

### Citation Lookup

```json
{
  "name": "lookup_citation",
  "arguments": {
    "citation": "410 U.S. 113"
  }
}
```

### Financial Conflict Analysis

```json
{
  "name": "get_financial_disclosures",
  "arguments": {
    "judge": "John Roberts",
    "year": 2023
  }
}
```

### Citation Network Analysis

```json
{
  "name": "get_citation_network",
  "arguments": {
    "opinion_id": 108713,
    "depth": 2
  }
}
```

For complete tool documentation and parameters, use the MCP `tools/list` method

## Remote Deployment (Cloudflare Workers)

The server deploys to Cloudflare Workers using Durable Objects for per-session
state management. Once deployed, users connect with a single URL — no local
install required.

- **Health**: `GET https://<subdomain>.workers.dev/health`
- **MCP endpoint**: `https://<subdomain>.workers.dev/sse`

### Authentication

Optional bearer-token auth can be enabled by setting `MCP_AUTH_TOKEN`:

```bash
wrangler secret put MCP_AUTH_TOKEN
```

When set, all MCP requests must include `Authorization: Bearer <token>`. When
not set, the endpoint is open.

### Deployment

```bash
# Set your CourtListener API key (stored server-side, never exposed to clients)
wrangler secret put COURTLISTENER_API_KEY

# Deploy to Cloudflare
wrangler deploy
```

The `COURTLISTENER_API_KEY` stays on the server — clients never see it.

## MCP Integration

This server implements the
[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) specification
using the
[official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk),
enabling seamless integration with AI chat applications that support MCP.

### How Chat Apps Connect

1. **MCP Client Configuration**: Add this server to your MCP-compatible chat
   application
2. **Tool Discovery**: The app automatically discovers all 15 legal research
   tools
3. **Natural Language**: Ask legal questions naturally - the AI will use
   appropriate tools
4. **Rich Responses**: Get comprehensive legal data formatted for easy
   understanding

### Supported MCP Clients

- Claude Desktop (Anthropic)
- Continue.dev
- Zed Editor
- Any application implementing MCP protocol

### Official MCP Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [TypeScript SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Client Implementation Guide](https://github.com/modelcontextprotocol/typescript-sdk#writing-mcp-clients)

## API Reference

The server uses CourtListener's REST API v4 for all legal data. No additional
APIs or services required.

## Contributing

Quick start for local development and CI simulation:

- Prerequisites: Node 20+, pnpm, Docker (for act), optional: act
- Common tasks (VS Code: "Run Task…"):
  - 🔍 Type Check → runs `pnpm run typecheck`
  - 🔨 Build TypeScript → runs `pnpm run build`
  - 👀 Watch TypeScript → runs `pnpm run dev`
  - 🧪 Run All Tests → runs unit + integration
  - 🔍 MCP Inspector (Local) → quick local Inspector sanity check
  - 📊 Analyze Test Coverage → local coverage analysis
- NPM scripts (CLI):
  - Unit: `pnpm run test:unit`
  - Integration: `pnpm run test:integration`
  - All tests: `pnpm test`
  - Coverage reports: `pnpm run coverage`
  - Enforce coverage thresholds: `pnpm run coverage:check`

Run GitHub Actions locally with act (optional):

```bash
# Install (macOS)
brew install act

# Run the main CI workflow
act -W .github/workflows/ci.yml

# Run a specific job (faster inner loop)
act -W .github/workflows/ci.yml -j test

# Simulate a pull request event
act pull_request -W .github/workflows/ci.yml -j required-checks-gate
```

Tips:

- If act prompts for an image, pick a recent ubuntu image (or pass -P to pin
  one)
- Ensure Docker is running; act uses containers to mirror GitHub Actions runners

**Rate Limiting**: CourtListener API has rate limits. Consider getting a free
API token for higher limits.

**Data Coverage**:

- Federal and state court opinions
- Supreme Court cases back to 1754
- Circuit and district court cases
- Judge information and financial disclosures
- Case parties, attorneys, and documents

## Development

### Project Structure

```text
legal-mcp/
├── src/
│   └── index.ts          # Main MCP server implementation
├── test/
│   └── test-server.js    # Basic functionality tests
├── dist/                 # Compiled TypeScript output
└── README.md            # This file
```

### Testing

#### Automated Test Suite

Run the comprehensive MCP validation test suite:

```bash
npm run test:mcp
```

#### Visual Testing with MCP Inspector

Launch the MCP Inspector web interface for interactive testing:

**Test Remote Server (Recommended):**

```bash
npm run inspect
```

**Test Local Server:**

```bash
npm run inspect:local
```

The inspector provides a visual interface to:

- Browse and test all available tools
- View JSON-RPC protocol messages
- Test with form inputs and see responses
- Debug MCP protocol compliance

#### Test Specific Tools

Test individual functions:

```bash
npm run test:mcp:tool search_cases '{"query":"privacy rights","court":"scotus","page_size":3}'
npm run test:mcp:tool list_courts '{"jurisdiction":"F"}'
```

#### Complete Test Suite

Run all tests (unit, integration, and MCP validation):

```bash
npm test
```

For detailed testing documentation, see [TESTING.md](TESTING.md).

### Contribution Guidelines

This is a focused MCP server implementation following official guidelines.
Contributions should:

- Maintain strict MCP protocol compliance
- Follow
  [official TypeScript SDK patterns](https://github.com/modelcontextprotocol/typescript-sdk)
- Add legal research functionality via CourtListener API only
- Keep the codebase simple and maintainable per MCP best practices
- Include comprehensive tests for new tools
- Follow JSON schema validation patterns

**References**:

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Client Guidelines](https://github.com/modelcontextprotocol/typescript-sdk#writing-mcp-clients)

### License

MIT License - see LICENSE file for details.

**Note**: This is a pure MCP server focused on legal research capabilities. It
integrates with chat applications through the MCP protocol only.

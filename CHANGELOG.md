# Changelog

All notable changes to the CourtListener MCP Server project.

## [Unreleased]

### Cloudflare Workers MCP v2 modernization (2026-08-18)

- Migrated production ingress to stateless MCP 2026-07-28 over Cloudflare
  Workers Streamable HTTP.
- Split public Edge, private MCP, and auth-limiter Workers with service binding,
  Workers Assets, SQLite Durable Object exports, queues, and observability.
- Removed direct production deployment shortcuts; production changes now use the
  staged Cloudflare Release Controller with canary, promotion, rollback, and
  receipt validation.
- Removed the obsolete middleware execution path and unenforced circuit-breaker
  configuration so runtime configuration describes active controls only.
- Kept the local HTTP/stdio compatibility paths because they remain covered by
  CI and release parity gates.
- Current production Cloudflare pins are validated in
  `test/unit/test-mcp-sdk-compatibility.ts`; TypeScript 7 remains deferred until
  the current `@typescript-eslint` peer range supports it.

### Historical refactoring (2024-11-01, archived)

Complete codebase refactoring and modernization across 3 phases:

#### Added

- **Type Safety Infrastructure**
  - Zod schema validation for configuration
    (`src/infrastructure/config-schema.ts`)
  - Error Factory for consistent error handling
  - Type Guards for runtime type checking
  - Branded Types for ID safety
  - ResponseBuilder utility

- **Testing**
  - 100% TypeScript test migration (57 test files)
  - Enhanced test configuration (`tsconfig.test.json`)
  - Comprehensive test coverage

- **Documentation**
  - JSDoc documentation (~90% coverage)
  - Comprehensive improvement reports
  - TypeScript migration guides

#### Changed

- **Architecture**
  - Consolidated 6 server implementations into 1
  - Single entry point (`src/index.ts`)
  - Simplified package.json (5 CLI commands → 1)

- **Code Quality**
  - Removed duplicate files
  - Removed redundant code
  - Added quality infrastructure
  - TypeScript migration

- **Dependencies**
  - Clean dependency installation
  - Security audit: 0 vulnerabilities

#### Removed

- Redundant server implementations (5 servers)
- 63 duplicate JavaScript test files
- 10 empty test files
- Legacy .js demo files

#### Fixed

- All ESLint issues
- Type safety improvements (replaced 12+ `any` types)
- Build and test compatibility (100% passing)

### Security and performance

The historical refactor established the original security and performance
baseline; current security and dependency status is verified by CI rather than
preserved as an Unreleased claim.

---

## Version History

### [0.1.0] - Initial Release

- Core MCP server functionality
- CourtListener API integration
- Basic caching and logging
- 24 legal research tools

---

Historical migration reports are retained under `docs/archive/`.

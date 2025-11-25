# MCP Resources Implementation

## Overview

This update implements the Model Context Protocol (MCP) Resources primitive, allowing clients to fetch data directly via URI patterns (e.g., `courtlistener://opinion/{id}`) instead of just using Tools.

## Changes

### 1. Resource Architecture

- **`src/server/resource-handler.ts`**: Created `ResourceHandlerRegistry` and `ResourceHandler` interface, mirroring the existing Tool architecture.
- **`src/server/best-practice-server.ts`**: Updated to support `resources/list` and `resources/read` requests.
- **`src/infrastructure/bootstrap.ts`**: Updated to register the Resource Registry and handlers.

### 2. New Resources

- **`src/resources/opinion.ts`**: Implemented `OpinionResourceHandler` which exposes opinions via `courtlistener://opinion/{id}`.

### 3. Worker Modernization

- **`src/worker.ts`**: Updated to route `resources/*` requests to the `LegalMCPServer` instance, ensuring Cloudflare Workers support the new capability.

### 4. Testing

- **`test/unit/test-resource.ts`**: Added unit tests for the Opinion resource.
- **`test/unit/test-best-practice-server.ts`**: Updated mocks to support the new Resource Registry dependency.

## Verification

- `npx tsx test/unit/test-resource.ts` ✅ Passed
- `npx tsx test/unit/test-best-practice-server.ts` ✅ Passed

## Next Steps

- Add more resources (e.g., Dockets, People).
- Implement Resource Templates for dynamic discovery.

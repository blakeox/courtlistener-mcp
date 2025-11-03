# MCP Modernization Roadmap 🚀

**Date**: November 3, 2025  
**Status**: Planning Phase  
**Goal**: Upgrade to Modern Model Context Protocol

---

## 🎯 Overview

This roadmap outlines the comprehensive modernization of the CourtListener MCP implementation to leverage the latest `@modelcontextprotocol/sdk` features and best practices.

---

## 📋 Phase 1: Protocol Core Modernization (Week 1)

### Priority 1.1: SDK Upgrade
**Estimated Time**: 4-6 hours

**Tasks**:
- [ ] Upgrade `@modelcontextprotocol/sdk` to latest version
- [ ] Review breaking changes and migration guide
- [ ] Update type imports and interfaces
- [ ] Derive server metadata from `package.json`
- [ ] Update version negotiation logic

**Files**:
- `package.json` - SDK version
- `src/infrastructure/server-factory.ts` (line 19)
- `src/types.ts` - Type updates

**Success Criteria**:
- ✅ Latest SDK installed
- ✅ Build passing
- ✅ Version from package.json
- ✅ No type errors

---

### Priority 1.2: Server Factory Rebuild
**Estimated Time**: 6-8 hours

**Tasks**:
- [ ] Adopt `createMcpServer` patterns
- [ ] Advertise full capability sets:
  - Tools
  - Logging
  - Prompts
  - Resources
  - Sampling
- [ ] Replace tools-only contract
- [ ] Update capability negotiation

**Files**:
- `src/infrastructure/server-factory.ts` (line 22)
- `src/server/best-practice-server.ts`

**Success Criteria**:
- ✅ Full capability advertisement
- ✅ Modern server factory
- ✅ Capability negotiation working
- ✅ Tests passing

---

### Priority 1.3: Protocol Constants Centralization
**Estimated Time**: 2-3 hours

**Tasks**:
- [ ] Create `src/infrastructure/protocol-constants.ts`
- [ ] Centralize:
  - Protocol version
  - Feature switches
  - Capability flags
- [ ] Share across CLI, worker, server
- [ ] Prevent stdio/HTTP drift

**Files**:
- `src/infrastructure/protocol-constants.ts` (NEW)
- `src/index.ts` (line 15)
- `src/worker.ts` (line 1)

**Success Criteria**:
- ✅ Single source of truth
- ✅ No duplicated constants
- ✅ CLI and worker aligned
- ✅ Easy feature toggles

---

### Priority 1.4: Lifecycle & Session Management
**Estimated Time**: 4-5 hours

**Tasks**:
- [ ] Register initialize/shutdown handlers
- [ ] Emit server/heartbeat events
- [ ] Surface session properties via DI
- [ ] Add notifications handlers
- [ ] Implement graceful backpressure

**Files**:
- `src/server/best-practice-server.ts` (lines 333, 355, 360)
- `src/infrastructure/metrics.ts`

**Success Criteria**:
- ✅ Initialize/shutdown working
- ✅ Heartbeat events
- ✅ Session properties in DI
- ✅ Backpressure handling

---

## 📋 Phase 2: Tool Surface Modernization (Week 2)

### Priority 2.1: Schema Generation from Zod
**Estimated Time**: 4-6 hours

**Tasks**:
- [ ] Generate input schemas from Zod definitions
- [ ] Auto-generate examples
- [ ] Collapse duplicate metadata
- [ ] Replace static table in `tool-definitions.ts`
- [ ] Enrich `ToolHandlerRegistry.getToolDefinitions()`

**Files**:
- `src/tool-definitions.ts` (line 15)
- `src/server/tool-handler.ts` (line 94)

**Success Criteria**:
- ✅ Single source of truth (Zod schemas)
- ✅ Auto-generated examples
- ✅ No duplicate metadata
- ✅ Registry enriched

---

### Priority 2.2: Structured JSON Content
**Estimated Time**: 3-4 hours

**Tasks**:
- [ ] Update handlers to emit `{type:'json'}`
- [ ] Add optional markdown summaries
- [ ] Replace JSON-in-text blobs
- [ ] Update response helpers

**Files**:
- `src/server/tool-handler.ts` (lines 150, 164)
- `src/common/response-builder.ts`

**Success Criteria**:
- ✅ Structured JSON content
- ✅ Markdown summaries
- ✅ Client-friendly responses
- ✅ No string serialization

---

### Priority 2.3: Streaming Support
**Estimated Time**: 6-8 hours

**Tasks**:
- [ ] Add streaming/partial-response support
- [ ] Use async iterables
- [ ] Leverage SDK progress notifications
- [ ] Create streaming decorators
- [ ] Wrap retry/caching logic

**Files**:
- `src/domains/search/handlers.ts` (line 15)
- `src/domains/enhanced/handlers.ts` (line 18)
- `src/server/handler-decorators.ts`

**Success Criteria**:
- ✅ Streaming support
- ✅ Progress notifications
- ✅ Decorators work with streaming
- ✅ Large result handling

---

### Priority 2.4: Error Standardization
**Estimated Time**: 4-5 hours

**Tasks**:
- [ ] Create `McpError` subclasses
- [ ] Map CourtListener HTTP errors
- [ ] Standardize error surfaces
- [ ] Update tests

**Files**:
- `src/server/best-practice-server.ts` (line 370)
- `src/courtlistener.ts` (line 68)
- `src/common/error-factory.ts`

**Success Criteria**:
- ✅ `McpError` hierarchy
- ✅ HTTP error mapping
- ✅ Consistent error format
- ✅ Tests updated

---

### Priority 2.5: Tool Metadata
**Estimated Time**: 2-3 hours

**Tasks**:
- [ ] Add tool-level metadata:
  - Rate weights
  - Categories
  - Auth scopes
- [ ] Update registry
- [ ] Advertise in `listTools`
- [ ] Add throttling hints

**Files**:
- `src/tool-definitions.ts` (line 21)
- `src/server/tool-handler.ts` (line 53)

**Success Criteria**:
- ✅ Rich tool metadata
- ✅ Rate hints
- ✅ Auth requirements clear
- ✅ Category organization

---

## 📋 Phase 3: MCP Surface Expansion (Week 3)

### Priority 3.1: Resource Providers
**Estimated Time**: 6-8 hours

**Tasks**:
- [ ] Implement `resources/list` endpoint
- [ ] Implement `resources/read` endpoint
- [ ] Expose:
  - Schemas
  - Sample opinions
  - Policy documents
- [ ] Add cached fetches
- [ ] Create resource handlers

**Files**:
- `src/domains/` (new resource handlers)
- `src/server/best-practice-server.ts` (line 333)

**Success Criteria**:
- ✅ Resources exposed
- ✅ List endpoint working
- ✅ Read endpoint working
- ✅ Caching integrated

---

### Priority 3.2: Prompt Templates
**Estimated Time**: 4-6 hours

**Tasks**:
- [ ] Create curated prompts:
  - Statute summarization
  - Precedent comparison
  - Case analysis
- [ ] Implement `prompts/list`
- [ ] Implement `prompts/get`
- [ ] Add supporting tests

**Files**:
- `src/tool-definitions.ts` (line 15)
- `src/prompts/` (NEW)
- `test/unit/test-prompts.ts` (NEW)

**Success Criteria**:
- ✅ Prompts available
- ✅ List/get working
- ✅ Curated templates
- ✅ Tests passing

---

### Priority 3.3: Resource Snapshots
**Estimated Time**: 4-5 hours

**Tasks**:
- [ ] Evaluate resource snapshot model
- [ ] Implement incremental updates
- [ ] Add `notifications/resources/delta`
- [ ] Wire to cache invalidation

**Files**:
- `src/courtlistener.ts` (line 40)
- `src/infrastructure/cache.ts`

**Success Criteria**:
- ✅ Snapshot model defined
- ✅ Delta notifications
- ✅ Cache integration
- ✅ Real-time updates

---

### Priority 3.4: Sampling Capabilities (Optional)
**Estimated Time**: 6-8 hours

**Tasks**:
- [ ] Evaluate LLM-derived assistance
- [ ] Design sampling interface
- [ ] Add feature flags
- [ ] Document capabilities
- [ ] Isolate behind flags

**Files**:
- `src/infrastructure/config.ts` (line 4)
- `src/types.ts` (line 5)

**Success Criteria**:
- ✅ Sampling interface defined
- ✅ Feature flags working
- ✅ Optional capability
- ✅ Documented

---

### Priority 3.5: Configuration Validation
**Estimated Time**: 2-3 hours

**Tasks**:
- [ ] Extend config validator
- [ ] Add prompts/resources validation
- [ ] Add auth scope validation
- [ ] Fail fast on misconfiguration

**Files**:
- `src/infrastructure/config.ts` (line 101)
- `src/infrastructure/config-validator.ts`

**Success Criteria**:
- ✅ New surfaces validated
- ✅ Fast failure
- ✅ Clear error messages
- ✅ Complete validation

---

## 📋 Phase 4: Cloud & Transport (Week 4)

### Priority 4.1: Official Worker Transport
**Estimated Time**: 6-8 hours

**Tasks**:
- [ ] Replace hand-rolled SSE bridge
- [ ] Use SDK's Worker transport
- [ ] Implement keepalives
- [ ] Add session IDs
- [ ] Follow heartbeat spec

**Files**:
- `src/worker.ts` (line 39)
- `scripts/dev/mcp-remote.js`

**Success Criteria**:
- ✅ Official transport
- ✅ Spec compliance
- ✅ Keepalives working
- ✅ Session management

---

### Priority 4.2: Unified Auth Middleware
**Estimated Time**: 4-5 hours

**Tasks**:
- [ ] Share auth across transports
- [ ] Remove Worker-only branches
- [ ] Consistent OIDC checks
- [ ] Stdio + HTTP parity

**Files**:
- `src/security/oidc.ts`
- `src/infrastructure/middleware-factory.ts` (line 12)

**Success Criteria**:
- ✅ Shared auth middleware
- ✅ No transport-specific code
- ✅ OIDC everywhere
- ✅ Consistent behavior

---

### Priority 4.3: Manifest Generation
**Estimated Time**: 3-4 hours

**Tasks**:
- [ ] Generate MCP manifest
- [ ] Create Inspector profile
- [ ] Publish with Cloudflare deployment
- [ ] Enable discovery

**Files**:
- `scripts/dev/inspect.js`
- `analysis/enhanced-coverage-analysis.js`

**Success Criteria**:
- ✅ Manifest generated
- ✅ Inspector compatible
- ✅ Published manifest
- ✅ Easy discovery

---

### Priority 4.4: Config Harmonization
**Estimated Time**: 2-3 hours

**Tasks**:
- [ ] Update `mcp-config.json`
- [ ] Support new transports
- [ ] Use env defaults
- [ ] Remove hard-coded URLs

**Files**:
- `mcp-config.json`
- `scripts/dev/mcp-remote.js` (line 5)

**Success Criteria**:
- ✅ Config updated
- ✅ Env defaults
- ✅ No hard-coding
- ✅ Transport support

---

### Priority 4.5: Build & CI Updates
**Estimated Time**: 4-5 hours

**Tasks**:
- [ ] Update Docker build
- [ ] Update Workers build
- [ ] Bundle prompt/resource assets
- [ ] Add protocol smoke tests
- [ ] Run in CI

**Files**:
- `Dockerfile`
- `.github/workflows/ci.yml`

**Success Criteria**:
- ✅ Builds updated
- ✅ Assets bundled
- ✅ Smoke tests
- ✅ CI integration

---

## 📋 Phase 5: Testing & Documentation (Week 5)

### Priority 5.1: Integration Test Extensions
**Estimated Time**: 6-8 hours

**Tasks**:
- [ ] Test `listResources`
- [ ] Test `prompts/list`
- [ ] Test structured JSON payloads
- [ ] Test Worker transports
- [ ] Add new test suites

**Files**:
- `test/integration/test-mcp-protocol.ts` (line 16)
- `test/integration/test-resources.ts` (NEW)
- `test/integration/test-prompts.ts` (NEW)

**Success Criteria**:
- ✅ Full coverage
- ✅ All endpoints tested
- ✅ Transport tests
- ✅ Passing tests

---

### Priority 5.2: Unit Test Updates
**Estimated Time**: 4-5 hours

**Tasks**:
- [ ] Update content type assertions
- [ ] Test new error semantics
- [ ] Test streaming responses
- [ ] Update mocks

**Files**:
- `test/unit/test-tool-handler-registry.ts`
- `test/unit/test-search-handlers.ts`

**Success Criteria**:
- ✅ Tests updated
- ✅ New formats covered
- ✅ Errors tested
- ✅ All passing

---

### Priority 5.3: Documentation Updates
**Estimated Time**: 4-6 hours

**Tasks**:
- [ ] Update `ARCHITECTURE.md`
- [ ] Add "Modern MCP Compatibility" section
- [ ] Document version guarantees
- [ ] Document feature flags
- [ ] Add migration notes

**Files**:
- `ARCHITECTURE.md`
- `REFACTORING_ROADMAP.md`
- `MCP_MODERNIZATION_ROADMAP.md` (this file)

**Success Criteria**:
- ✅ Complete docs
- ✅ Migration guide
- ✅ Version info
- ✅ Feature flags documented

---

### Priority 5.4: Legacy Server Deprecation
**Estimated Time**: 2-3 hours

**Tasks**:
- [ ] Add deprecation warnings
- [ ] Provide migration notes
- [ ] Flag for removal
- [ ] Update docs

**Files**:
- `src/server/optimized-server.ts`
- `src/server/refactored-server.ts`

**Success Criteria**:
- ✅ Warnings added
- ✅ Migration path clear
- ✅ Removal scheduled
- ✅ Docs updated

---

### Priority 5.5: Roadmap Integration
**Estimated Time**: 1-2 hours

**Tasks**:
- [ ] Integrate into main roadmap
- [ ] Add milestones
- [ ] Assign timelines
- [ ] Track ownership

**Files**:
- `REFACTORING_ROADMAP.md`

**Success Criteria**:
- ✅ Single source of truth
- ✅ Clear timelines
- ✅ Ownership clear
- ✅ Trackable progress

---

## 📊 Implementation Timeline

### Week 1: Protocol Core (24-27 hours)
- SDK upgrade
- Server factory rebuild
- Constants centralization
- Lifecycle management

### Week 2: Tool Surface (19-26 hours)
- Schema generation
- Structured content
- Streaming support
- Error standardization
- Tool metadata

### Week 3: Surface Expansion (22-30 hours)
- Resource providers
- Prompt templates
- Resource snapshots
- Sampling (optional)
- Config validation

### Week 4: Cloud & Transport (19-25 hours)
- Worker transport
- Unified auth
- Manifest generation
- Config harmonization
- Build/CI updates

### Week 5: Testing & Docs (17-24 hours)
- Integration tests
- Unit test updates
- Documentation
- Legacy deprecation
- Roadmap integration

**Total Estimated Time**: 101-132 hours (3-4 weeks full-time)

---

## 🎯 Success Criteria

### Technical
- ✅ Latest SDK integrated
- ✅ Full capability advertisement
- ✅ Structured JSON responses
- ✅ Resources & prompts available
- ✅ Worker transport spec-compliant
- ✅ All tests passing

### Quality
- ✅ Zero breaking changes for clients
- ✅ Backward compatibility maintained
- ✅ Performance maintained or improved
- ✅ Complete test coverage
- ✅ Comprehensive documentation

### Deployment
- ✅ Stdio mode works
- ✅ HTTP mode works
- ✅ Worker mode works
- ✅ CI pipeline green
- ✅ Production deployed

---

## 🚀 Next Steps

1. **Lock SDK Version**: Determine target `@modelcontextprotocol/sdk` version
2. **Prioritize Surfaces**: Choose resources/prompts/sampling for first pass
3. **Schedule Tests**: Plan protocol regression tests (Inspector + CLI)
4. **Assign Ownership**: Determine who implements each phase
5. **Set Milestones**: Create trackable milestones in project management

---

## 📝 Notes

### Feature Flags
- Use `ENABLE_MCP_RESOURCES`
- Use `ENABLE_MCP_PROMPTS`
- Use `ENABLE_MCP_SAMPLING`
- Use `ENABLE_MCP_STREAMING`

### Backward Compatibility
- Maintain legacy endpoints during transition
- Deprecate gradually with warnings
- Provide migration period (3-6 months)

### Risk Mitigation
- Feature flags for gradual rollout
- Comprehensive testing before deployment
- Canary deployments for validation
- Rollback plan ready

---

*Roadmap created: November 3, 2025*  
*Status: Ready for implementation*  
*Estimated completion: 3-4 weeks*


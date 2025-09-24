/**
 * Service Bootstrap
 * Sets up dependency injection container and service registrations
 */

import { CourtListenerAPI } from '../courtlistener.js';
import { DefaultApiClientFactory } from '../infrastructure/api-client-factory.js';
import { CacheManager } from '../infrastructure/cache.js';
import { CircuitBreakerManager } from '../infrastructure/circuit-breaker.js';
import { ConfigurationValidator } from '../infrastructure/config-validator.js';
import { getConfig } from '../infrastructure/config.js';
import { container } from '../infrastructure/container.js';
import { createLogger } from '../infrastructure/logger.js';
import { MetricsCollector } from '../infrastructure/metrics.js';
import { MiddlewareFactory } from '../infrastructure/middleware-factory.js';
import { MCPServerFactory } from '../infrastructure/server-factory.js';
import { ToolHandlerRegistry } from '../server/tool-handler.js';

// Import all domain handlers
import {
  AnalyzeCaseAuthoritiesHandler,
  GetCaseDetailsHandler,
  GetRelatedCasesHandler,
} from '../domains/cases/handlers.js';
import { GetJudgeHandler, GetJudgesHandler, ListCourtsHandler } from '../domains/courts/handlers.js';
import {
  GetDocketEntriesHandler,
  GetDocketHandler,
  GetDocketsHandler,
  GetRecapDocumentHandler,
  GetRecapDocumentsHandler,
} from '../domains/dockets/handlers.js';
import {
  GetBankruptcyDataHandler,
  GetBulkDataHandler,
  GetComprehensiveCaseAnalysisHandler,
  GetComprehensiveJudgeProfileHandler,
  GetEnhancedRECAPDataHandler,
  GetFinancialDisclosureDetailsHandler,
  GetVisualizationDataHandler,
  ValidateCitationsHandler,
} from '../domains/enhanced/handlers.js';
import {
  GetFinancialDisclosureHandler,
  GetFinancialDisclosuresHandler,
  GetPartiesAndAttorneysHandler,
  ManageAlertsHandler,
} from '../domains/miscellaneous/handlers.js';
import {
  AnalyzeLegalArgumentHandler,
  GetCitationNetworkHandler,
  GetOpinionTextHandler,
  LookupCitationHandler,
} from '../domains/opinions/handlers.js';
import { GetOralArgumentHandler, GetOralArgumentsHandler } from '../domains/oral-arguments/handlers.js';
import { AdvancedSearchHandler, SearchCasesHandler, SearchOpinionsHandler } from '../domains/search/handlers.js';

export function bootstrapServices(): void {
  // Register configuration with validation
  container.register('config', {
    factory: () => {
      const config = getConfig();
      const validator = new ConfigurationValidator();
      validator.validateAndThrow(config);
      return config;
    },
    singleton: true,
  });

  // Register logger
  container.register('logger', {
    factory: config => createLogger(config.logging, 'LegalMCP'),
    dependencies: ['config'],
    singleton: true,
  });

  // Register cache
  container.register('cache', {
    factory: (config, logger) => new CacheManager(config.cache, logger),
    dependencies: ['config', 'logger'],
    singleton: true,
  });

  // Register metrics
  container.register('metrics', {
    factory: logger => new MetricsCollector(logger),
    dependencies: ['logger'],
    singleton: true,
  });

  // Register API client factory
  container.register('apiClientFactory', {
    factory: (cache, logger, metrics) => new DefaultApiClientFactory(cache, logger, metrics),
    dependencies: ['cache', 'logger', 'metrics'],
    singleton: true,
  });

  // Register server factory
  container.register('serverFactory', {
    factory: logger => new MCPServerFactory(logger),
    dependencies: ['logger'],
    singleton: true,
  });

  // Register middleware factory
  container.register('middlewareFactory', {
    factory: logger => new MiddlewareFactory(logger),
    dependencies: ['logger'],
    singleton: true,
  });

  // Register circuit breaker manager
  container.register('circuitBreakerManager', {
    factory: logger => new CircuitBreakerManager(logger),
    dependencies: ['logger'],
    singleton: true,
  });

  // Register CourtListener API client
  container.register('courtListenerApi', {
    factory: (config, apiClientFactory) => {
      return apiClientFactory.createCourtListenerClient(config.courtListener);
    },
    dependencies: ['config', 'apiClientFactory'],
    singleton: true,
  });

  // Register tool registry
  container.register('toolRegistry', {
    factory: () => new ToolHandlerRegistry(),
    singleton: true,
  });

  // Register tool handlers
  registerToolHandlers();
}

function registerToolHandlers(): void {
  const toolRegistry = container.get<ToolHandlerRegistry>('toolRegistry');
  const courtListenerApi = container.get<CourtListenerAPI>('courtListenerApi');

  // Register search handlers
  toolRegistry.register(new SearchOpinionsHandler(courtListenerApi));
  toolRegistry.register(new SearchCasesHandler(courtListenerApi));
  toolRegistry.register(new AdvancedSearchHandler(courtListenerApi));

  // Register case handlers
  toolRegistry.register(new GetCaseDetailsHandler(courtListenerApi));
  toolRegistry.register(new GetRelatedCasesHandler(courtListenerApi));
  toolRegistry.register(new AnalyzeCaseAuthoritiesHandler(courtListenerApi));

  // Register opinion handlers
  toolRegistry.register(new GetOpinionTextHandler(courtListenerApi));
  toolRegistry.register(new AnalyzeLegalArgumentHandler(courtListenerApi));
  toolRegistry.register(new GetCitationNetworkHandler(courtListenerApi));
  toolRegistry.register(new LookupCitationHandler(courtListenerApi));

  // Register court handlers
  toolRegistry.register(new ListCourtsHandler(courtListenerApi));
  toolRegistry.register(new GetJudgesHandler(courtListenerApi));
  toolRegistry.register(new GetJudgeHandler(courtListenerApi));

  // Register docket handlers
  toolRegistry.register(new GetDocketsHandler(courtListenerApi));
  toolRegistry.register(new GetDocketHandler(courtListenerApi));
  toolRegistry.register(new GetDocketEntriesHandler(courtListenerApi));
  toolRegistry.register(new GetRecapDocumentsHandler(courtListenerApi));
  toolRegistry.register(new GetRecapDocumentHandler(courtListenerApi));

  // Register miscellaneous handlers
  toolRegistry.register(new GetFinancialDisclosuresHandler(courtListenerApi));
  toolRegistry.register(new GetFinancialDisclosureHandler(courtListenerApi));
  toolRegistry.register(new GetPartiesAndAttorneysHandler(courtListenerApi));
  toolRegistry.register(new ManageAlertsHandler(courtListenerApi));

  // Register oral argument handlers
  toolRegistry.register(new GetOralArgumentsHandler(courtListenerApi));
  toolRegistry.register(new GetOralArgumentHandler(courtListenerApi));

  // Register enhanced analytics handlers
  toolRegistry.register(new GetVisualizationDataHandler(courtListenerApi));
  toolRegistry.register(new GetBulkDataHandler(courtListenerApi));
  toolRegistry.register(new GetBankruptcyDataHandler(courtListenerApi));
  toolRegistry.register(new GetComprehensiveJudgeProfileHandler(courtListenerApi));
  toolRegistry.register(new GetComprehensiveCaseAnalysisHandler(courtListenerApi));
  toolRegistry.register(new GetFinancialDisclosureDetailsHandler(courtListenerApi));
  toolRegistry.register(new ValidateCitationsHandler(courtListenerApi));
  toolRegistry.register(new GetEnhancedRECAPDataHandler(courtListenerApi));
}

export function getServiceContainer() {
  return container;
}

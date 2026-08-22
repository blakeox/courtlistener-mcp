/**
 * Service Bootstrap
 * Sets up dependency injection container and service registrations
 */

import type { ServerConfig } from '../types.js';
import { CourtListenerAPI } from '../courtlistener.js';
import { DefaultApiClientFactory } from '../infrastructure/api-client-factory.js';
import { CacheManager } from '../infrastructure/cache.js';
import { getConfig, type ConfigEnvironment } from '../infrastructure/config.js';
import { container, DIContainer } from '../infrastructure/container.js';
import type { Logger } from '../infrastructure/logger.js';
import { createLogger } from '../infrastructure/logger.js';
import type { MetricsCollector } from '../infrastructure/metrics.js';
import { MetricsCollector as MetricsCollectorClass } from '../infrastructure/metrics.js';
import { ToolHandlerRegistry } from '../server/tool-handler.js';
import { ResourceHandlerRegistry } from '../server/resource-handler.js';
import { PromptHandlerRegistry } from '../server/prompt-handler.js';
import { OpinionResourceHandler } from '../resources/opinion.js';
import { SchemaResourceHandler } from '../resources/schema.js';
import { CaseResourceHandler } from '../resources/case.js';
import { DocketResourceHandler } from '../resources/docket.js';
import { CourtResourceHandler } from '../resources/court.js';
import { JudgeResourceHandler } from '../resources/judge.js';
import { RecentOpinionsResourceHandler } from '../resources/recent-opinions.js';
import { ApiStatusResourceHandler } from '../resources/api-status.js';
import { LegalAssistantPromptHandler } from '../prompts/legal-assistant.js';
import {
  SummarizeStatutePromptHandler,
  ComparePrecedentsPromptHandler,
  AnalyzeCasePromptHandler,
  DraftBriefSectionPromptHandler,
  IdentifyIssuesPromptHandler,
  LegalResearchWorkflowPromptHandler,
  CitationAnalysisPromptHandler,
  JurisdictionComparisonPromptHandler,
  CaseBriefPromptHandler,
  MotionDraftingPromptHandler,
  JudicialDueDiligencePromptHandler,
} from '../prompts/legal-prompts.js';

// Import all domain handlers
import {
  AnalyzeCaseAuthoritiesHandler,
  GetCaseDetailsHandler,
  GetRelatedCasesHandler,
} from '../domains/cases/handlers.js';
import {
  GetAbaRatingsHandler,
  GetJudgeHandler,
  GetJudgeEducationsHandler,
  GetJudgePoliticalAffiliationsHandler,
  GetJudgesHandler,
  GetJudicialPositionHandler,
  GetJudicialPositionsHandler,
  GetMembershipsHandler,
  GetRetentionEventsHandler,
  GetSchoolsHandler,
  ListCourtsHandler,
} from '../domains/courts/handlers.js';
import {
  CreateDocketAlertHandler,
  GetDocketEntryHandler,
  GetDocketEntriesHandler,
  GetDocketHandler,
  GetDocketAlertsHandler,
  GetDocketsHandler,
  GetOriginatingCourtInfoHandler,
  GetRecapDocumentHandler,
  GetRecapDocumentsHandler,
  GetTagsHandler,
} from '../domains/dockets/handlers.js';
import {
  GetBankruptcyDataHandler,
  GetBulkDataHandler,
  GetComprehensiveCaseAnalysisHandler,
  GetComprehensiveJudgeProfileHandler,
  GetEnhancedRECAPDataHandler,
  GetFinancialDisclosureDetailsHandler,
  GetVisualizationDataHandler,
  GetVisualizationMetadataHandler,
  ValidateCitationsHandler,
  SmartSearchHandler,
} from '../domains/enhanced/handlers.js';
import {
  GetFinancialDisclosureHandler,
  GetFinancialDisclosuresHandler,
  GetPartiesAndAttorneysHandler,
  ManageAlertsHandler,
} from '../domains/miscellaneous/handlers.js';
import {
  AnalyzeLegalArgumentHandler,
  GetAuthoritiesHandler,
  GetCitationNetworkHandler,
  GetOpinionCitationsHandler,
  GetOpinionTextHandler,
  LookupCitationHandler,
} from '../domains/opinions/handlers.js';
import {
  GetOralArgumentHandler,
  GetOralArgumentsHandler,
} from '../domains/oral-arguments/handlers.js';
import {
  AdvancedSearchHandler,
  SearchCasesHandler,
  SearchOpinionsHandler,
} from '../domains/search/handlers.js';

export function bootstrapServices(
  environment: ConfigEnvironment,
  serviceContainer: DIContainer = container,
): void {
  // Worker and test runtimes may invoke bootstrap multiple times in the same
  // process. Keep initialization idempotent to avoid duplicate registrations.
  if (serviceContainer.has('config')) {
    return;
  }

  // Register configuration with validation
  serviceContainer.register('config', {
    factory: () => {
      return getConfig(environment);
    },
    singleton: true,
  });

  // Register logger
  serviceContainer.register('logger', {
    factory: (...deps: unknown[]) => {
      const config = deps[0] as ServerConfig;
      return createLogger(config.logging, 'LegalMCP');
    },
    dependencies: ['config'],
    singleton: true,
  });

  // Register cache
  serviceContainer.register('cache', {
    factory: (...deps: unknown[]) => {
      const config = deps[0] as ServerConfig;
      const logger = deps[1] as Logger;
      return new CacheManager(config.cache, logger);
    },
    dependencies: ['config', 'logger'],
    singleton: true,
  });

  // Register metrics
  serviceContainer.register('metrics', {
    factory: (...deps: unknown[]) => {
      const logger = deps[0] as Logger;
      return new MetricsCollectorClass(logger);
    },
    dependencies: ['logger'],
    singleton: true,
  });

  // Register API client factory
  serviceContainer.register('apiClientFactory', {
    factory: (...deps: unknown[]) => {
      const cache = deps[0] as CacheManager;
      const logger = deps[1] as Logger;
      const metrics = deps[2] as MetricsCollector;
      return new DefaultApiClientFactory(cache, logger, metrics, environment);
    },
    dependencies: ['cache', 'logger', 'metrics'],
    singleton: true,
  });

  // Register CourtListener API client
  serviceContainer.register('courtListenerApi', {
    factory: (...deps: unknown[]) => {
      const config = deps[0] as ServerConfig;
      const apiClientFactory = deps[1] as DefaultApiClientFactory;
      return apiClientFactory.createCourtListenerClient(config.courtListener);
    },
    dependencies: ['config', 'apiClientFactory'],
    singleton: true,
  });

  // Register tool registry
  serviceContainer.register('toolRegistry', {
    factory: () => new ToolHandlerRegistry(),
    singleton: true,
  });

  // Register resource registry
  serviceContainer.register('resourceRegistry', {
    factory: () => new ResourceHandlerRegistry(),
    singleton: true,
  });

  // Register prompt registry
  serviceContainer.register('promptRegistry', {
    factory: () => new PromptHandlerRegistry(),
    singleton: true,
  });

  // Register tool handlers
  registerToolHandlers(serviceContainer);

  // Register resource handlers
  registerResourceHandlers(serviceContainer, environment);

  // Register prompt handlers
  registerPromptHandlers(serviceContainer);
}

function registerResourceHandlers(
  serviceContainer: DIContainer,
  environment: ConfigEnvironment,
): void {
  const resourceRegistry = serviceContainer.get<ResourceHandlerRegistry>('resourceRegistry');
  const courtListenerApi = serviceContainer.get<CourtListenerAPI>('courtListenerApi');

  resourceRegistry.register(new OpinionResourceHandler(courtListenerApi));
  resourceRegistry.register(new SchemaResourceHandler());
  resourceRegistry.register(new CaseResourceHandler(courtListenerApi));
  resourceRegistry.register(new DocketResourceHandler(courtListenerApi));
  resourceRegistry.register(new CourtResourceHandler(courtListenerApi));
  resourceRegistry.register(new JudgeResourceHandler(courtListenerApi));
  resourceRegistry.register(new RecentOpinionsResourceHandler(courtListenerApi));

  const cache = serviceContainer.get<CacheManager>('cache');
  const metrics = serviceContainer.get<MetricsCollector>('metrics');
  resourceRegistry.register(new ApiStatusResourceHandler(cache, metrics, environment));
}

function registerPromptHandlers(serviceContainer: DIContainer): void {
  const promptRegistry = serviceContainer.get<PromptHandlerRegistry>('promptRegistry');

  promptRegistry.register(new LegalAssistantPromptHandler());
  promptRegistry.register(new SummarizeStatutePromptHandler());
  promptRegistry.register(new ComparePrecedentsPromptHandler());
  promptRegistry.register(new AnalyzeCasePromptHandler());
  promptRegistry.register(new DraftBriefSectionPromptHandler());
  promptRegistry.register(new IdentifyIssuesPromptHandler());
  promptRegistry.register(new LegalResearchWorkflowPromptHandler());
  promptRegistry.register(new CitationAnalysisPromptHandler());
  promptRegistry.register(new JurisdictionComparisonPromptHandler());
  promptRegistry.register(new CaseBriefPromptHandler());
  promptRegistry.register(new MotionDraftingPromptHandler());
  promptRegistry.register(new JudicialDueDiligencePromptHandler());
}

function registerToolHandlers(serviceContainer: DIContainer): void {
  const toolRegistry = serviceContainer.get<ToolHandlerRegistry>('toolRegistry');
  const courtListenerApi = serviceContainer.get<CourtListenerAPI>('courtListenerApi');

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
  toolRegistry.register(new GetOpinionCitationsHandler(courtListenerApi));
  toolRegistry.register(new GetAuthoritiesHandler(courtListenerApi));

  // Register court handlers
  toolRegistry.register(new ListCourtsHandler(courtListenerApi));
  toolRegistry.register(new GetJudgesHandler(courtListenerApi));
  toolRegistry.register(new GetJudgeHandler(courtListenerApi));
  toolRegistry.register(new GetJudicialPositionsHandler(courtListenerApi));
  toolRegistry.register(new GetJudicialPositionHandler(courtListenerApi));
  toolRegistry.register(new GetJudgeEducationsHandler(courtListenerApi));
  toolRegistry.register(new GetJudgePoliticalAffiliationsHandler(courtListenerApi));
  toolRegistry.register(new GetAbaRatingsHandler(courtListenerApi));
  toolRegistry.register(new GetRetentionEventsHandler(courtListenerApi));
  toolRegistry.register(new GetSchoolsHandler(courtListenerApi));
  toolRegistry.register(new GetMembershipsHandler(courtListenerApi));

  // Register docket handlers
  toolRegistry.register(new GetDocketsHandler(courtListenerApi));
  toolRegistry.register(new GetDocketHandler(courtListenerApi));
  toolRegistry.register(new GetDocketEntriesHandler(courtListenerApi));
  toolRegistry.register(new GetDocketEntryHandler(courtListenerApi));
  toolRegistry.register(new GetRecapDocumentsHandler(courtListenerApi));
  toolRegistry.register(new GetRecapDocumentHandler(courtListenerApi));
  toolRegistry.register(new GetOriginatingCourtInfoHandler(courtListenerApi));
  toolRegistry.register(new GetTagsHandler(courtListenerApi));
  toolRegistry.register(new GetDocketAlertsHandler(courtListenerApi));
  toolRegistry.register(new CreateDocketAlertHandler(courtListenerApi));

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
  toolRegistry.register(new GetVisualizationMetadataHandler(courtListenerApi));
  toolRegistry.register(new SmartSearchHandler(courtListenerApi));
}

export function getServiceContainer() {
  return container;
}

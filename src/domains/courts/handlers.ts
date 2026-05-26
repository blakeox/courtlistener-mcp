import { TypedToolHandler, ToolContext } from '../../server/tool-handler.js';
import { CourtListenerAPI } from '../../courtlistener.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { withDefaults } from '../../server/handler-decorators.js';
import type { Court } from '../../types.js';
import {
  createPaginationInfo,
  PaginatedApiResponse,
  resolveOffsetLimit,
} from '../../common/pagination-utils.js';

/**
 * Zod schemas for courts handlers
 */
const listCourtsSchema = z.object({
  jurisdiction: z.string().optional(),
  court_type: z.enum(['federal', 'state', 'appellate', 'district', 'supreme']).optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z
    .string()
    .optional()
    .describe('Pagination cursor from previous response (alternative to page/page_size)'),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe('Number of results to return (used with cursor)'),
});

const getJudgesSchema = z.object({
  court: z.string().optional(),
  name: z.string().optional(),
  active: z.boolean().optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z
    .string()
    .optional()
    .describe('Pagination cursor from previous response (alternative to page/page_size)'),
  limit: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe('Number of results to return (used with cursor)'),
});

const getJudgeSchema = z.object({
  judge_id: z.union([z.string(), z.number()]).transform(String),
});

const getJudicialPositionsSchema = z.object({
  person: z.union([z.string(), z.number()]).transform(String).optional(),
  court: z.string().optional(),
  position_type: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

const getJudicialPositionSchema = z.object({
  position_id: z.union([z.string(), z.number()]).transform(String),
});

const getJudgeEducationsSchema = z.object({
  person: z.union([z.string(), z.number()]).transform(String).optional(),
  school: z.string().optional(),
  degree_level: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

const getJudgePoliticalAffiliationsSchema = z.object({
  person: z.union([z.string(), z.number()]).transform(String).optional(),
  political_party: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

const getAbaRatingsSchema = z.object({
  person: z.union([z.string(), z.number()]).transform(String).optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

const getRetentionEventsSchema = z.object({
  person: z.union([z.string(), z.number()]).transform(String).optional(),
  court: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

const getSchoolsSchema = z.object({
  name: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

const getMembershipsSchema = z.object({
  person: z.union([z.string(), z.number()]).transform(String).optional(),
  organization: z.string().optional(),
  page: z.number().min(1).optional().default(1),
  page_size: z.number().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
});

function buildJudgeQueryParams(input: z.infer<typeof getJudgesSchema>): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  if (input.court) params.court = input.court;
  if (input.active !== undefined) params.active = input.active;

  const normalizedName = input.name?.trim();
  if (normalizedName) {
    const parts = normalizedName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      params.name_last = parts[0];
    } else {
      params.name_first = parts.slice(0, -1).join(' ');
      params.name_last = parts[parts.length - 1];
    }
  }

  return params;
}

function resolvePagination(input: {
  cursor?: string | undefined;
  limit?: number | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
}): { page: number; pageSize: number } {
  const { offset, limit: resolvedLimit } = resolveOffsetLimit(input);
  return {
    page: input.cursor ? Math.floor(offset / resolvedLimit) + 1 : (input.page ?? 1),
    pageSize: input.cursor ? resolvedLimit : (input.page_size ?? 20),
  };
}

type ListCourtsInput = z.infer<typeof listCourtsSchema>;

function buildListCourtsApiParams(input: ListCourtsInput): Record<string, unknown> {
  const params: Record<string, unknown> = {
    page: input.page,
    page_size: input.page_size,
  };

  if (input.jurisdiction?.trim()) {
    params.jurisdiction = input.jurisdiction.trim();
  }

  if (input.cursor) {
    params.cursor = input.cursor;
  }
  if (input.limit !== undefined) {
    params.limit = input.limit;
  }

  return params;
}

function matchesCourtType(court: Court, courtType: ListCourtsInput['court_type']): boolean {
  if (!courtType) {
    return true;
  }

  const courtId = court.id.toLowerCase();
  const jurisdiction = court.jurisdiction?.toLowerCase() ?? '';
  const fullName = court.full_name.toLowerCase();

  switch (courtType) {
    case 'supreme':
      return courtId === 'scotus' || fullName.includes('supreme court');
    case 'appellate':
      return (
        /^(ca\d|usapp|cadc|cafc)/.test(courtId) ||
        fullName.includes('court of appeals') ||
        fullName.includes('circuit')
      );
    case 'district':
      return courtId.endsWith('d') || fullName.includes('district court');
    case 'federal':
      return jurisdiction === 'f' || jurisdiction.includes('federal') || courtId.startsWith('us');
    case 'state':
      return jurisdiction === 's' || jurisdiction.includes('state');
    default:
      return true;
  }
}

/**
 * Handler for listing courts
 */
export class ListCourtsHandler extends TypedToolHandler<typeof listCourtsSchema> {
  readonly name = 'list_courts';
  readonly description = 'List courts with optional filtering';
  readonly category = 'courts';
  protected readonly schema = listCourtsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof listCourtsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Listing courts', {
      jurisdiction: input.jurisdiction,
      courtType: input.court_type,
      requestId: context.requestId,
    });

    const response = (await this.apiClient.listCourts(
      buildListCourtsApiParams(input),
    )) as PaginatedApiResponse;

    const courts = (response.results ?? []) as Court[];
    const filteredCourts = input.court_type
      ? courts.filter((court) => matchesCourtType(court, input.court_type))
      : courts;
    const pagination = createPaginationInfo(response, input.page, input.page_size);
    if (input.court_type) {
      delete pagination.count;
      delete pagination.total_pages;
      delete pagination.has_next;
      delete pagination.nextCursor;
    }

    return this.success({
      summary: `Retrieved ${filteredCourts.length} courts`,
      courts: filteredCourts,
      pagination,
      filters_applied: {
        jurisdiction: input.jurisdiction,
        court_type: input.court_type,
      },
    });
  }
}

/**
 * Handler for getting judges information
 */
export class GetJudgesHandler extends TypedToolHandler<typeof getJudgesSchema> {
  readonly name = 'get_judges';
  readonly description = 'Get information about judges';
  readonly category = 'courts';
  protected readonly schema = getJudgesSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getJudgesSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Getting judges', {
      court: input.court,
      name: input.name,
      requestId: context.requestId,
    });

    const { offset, limit: resolvedLimit } = resolveOffsetLimit(input);
    const page = input.cursor ? Math.floor(offset / resolvedLimit) + 1 : input.page;
    const pageSize = input.cursor ? resolvedLimit : input.page_size;
    const queryParams = buildJudgeQueryParams(input);

    const response = await this.apiClient.getJudges({
      ...queryParams,
      page,
      page_size: pageSize,
    });

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} judges`,
      judges: response.results,
      pagination: createPaginationInfo(response, page, pageSize),
    });
  }
}

/**
 * Handler for getting specific judge information
 */
export class GetJudgeHandler extends TypedToolHandler<typeof getJudgeSchema> {
  readonly name = 'get_judge';
  readonly description = 'Get detailed information about a specific judge';
  readonly category = 'courts';
  protected readonly schema = getJudgeSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getJudgeSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Getting judge details', {
      judgeId: input.judge_id,
      requestId: context.requestId,
    });

    const response = await this.apiClient.getJudge(parseInt(input.judge_id));

    return this.successWithResource(
      {
        summary: `Retrieved details for judge ${input.judge_id}`,
        judge: response,
      },
      `courtlistener://judge/${input.judge_id}`,
      response,
    );
  }
}

export class GetJudicialPositionsHandler extends TypedToolHandler<
  typeof getJudicialPositionsSchema
> {
  readonly name = 'get_judicial_positions';
  readonly description = 'Get judicial positions and appointments for a person';
  readonly category = 'courts';
  protected readonly schema = getJudicialPositionsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getJudicialPositionsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const { page, pageSize } = resolvePagination(input);
    context.logger.info('Getting judicial positions', {
      person: input.person,
      court: input.court,
      requestId: context.requestId,
    });

    const response = (await this.apiClient.getJudicialPositions({
      ...input,
      page,
      page_size: pageSize,
    })) as PaginatedApiResponse;

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} judicial positions`,
      positions: response.results,
      pagination: createPaginationInfo(response, page, pageSize),
    });
  }
}

export class GetJudicialPositionHandler extends TypedToolHandler<typeof getJudicialPositionSchema> {
  readonly name = 'get_judicial_position';
  readonly description = 'Get detailed information about a specific judicial position';
  readonly category = 'courts';
  protected readonly schema = getJudicialPositionSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getJudicialPositionSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    context.logger.info('Getting judicial position', {
      positionId: input.position_id,
      requestId: context.requestId,
    });

    const response = await this.apiClient.getJudicialPosition(parseInt(input.position_id, 10));

    return this.success({
      summary: `Retrieved judicial position ${input.position_id}`,
      position: response,
    });
  }
}

export class GetJudgeEducationsHandler extends TypedToolHandler<typeof getJudgeEducationsSchema> {
  readonly name = 'get_judge_educations';
  readonly description = 'Get education history for judges and judicial figures';
  readonly category = 'courts';
  protected readonly schema = getJudgeEducationsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getJudgeEducationsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const { page, pageSize } = resolvePagination(input);
    context.logger.info('Getting judge educations', {
      person: input.person,
      school: input.school,
      requestId: context.requestId,
    });

    const response = (await this.apiClient.getJudgeEducations({
      ...input,
      page,
      page_size: pageSize,
    })) as PaginatedApiResponse;

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} judge education records`,
      educations: response.results,
      pagination: createPaginationInfo(response, page, pageSize),
    });
  }
}

export class GetJudgePoliticalAffiliationsHandler extends TypedToolHandler<
  typeof getJudgePoliticalAffiliationsSchema
> {
  readonly name = 'get_judge_political_affiliations';
  readonly description = 'Get political affiliation records for judges';
  readonly category = 'courts';
  protected readonly schema = getJudgePoliticalAffiliationsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getJudgePoliticalAffiliationsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const { page, pageSize } = resolvePagination(input);
    context.logger.info('Getting judge political affiliations', {
      person: input.person,
      requestId: context.requestId,
    });

    const response = (await this.apiClient.getJudgePoliticalAffiliations({
      ...input,
      page,
      page_size: pageSize,
    })) as PaginatedApiResponse;

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} political affiliation records`,
      political_affiliations: response.results,
      pagination: createPaginationInfo(response, page, pageSize),
    });
  }
}

export class GetAbaRatingsHandler extends TypedToolHandler<typeof getAbaRatingsSchema> {
  readonly name = 'get_aba_ratings';
  readonly description = 'Get ABA ratings for judges';
  readonly category = 'courts';
  protected readonly schema = getAbaRatingsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getAbaRatingsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const { page, pageSize } = resolvePagination(input);
    context.logger.info('Getting ABA ratings', {
      person: input.person,
      requestId: context.requestId,
    });

    const response = (await this.apiClient.getABARatings({
      ...input,
      page,
      page_size: pageSize,
    })) as PaginatedApiResponse;

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} ABA ratings`,
      ratings: response.results,
      pagination: createPaginationInfo(response, page, pageSize),
    });
  }
}

export class GetRetentionEventsHandler extends TypedToolHandler<typeof getRetentionEventsSchema> {
  readonly name = 'get_retention_events';
  readonly description = 'Get judicial retention and re-election event records';
  readonly category = 'courts';
  protected readonly schema = getRetentionEventsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getRetentionEventsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const { page, pageSize } = resolvePagination(input);
    context.logger.info('Getting retention events', {
      person: input.person,
      court: input.court,
      requestId: context.requestId,
    });

    const response = (await this.apiClient.getRetentionEvents({
      ...input,
      page,
      page_size: pageSize,
    })) as PaginatedApiResponse;

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} retention events`,
      retention_events: response.results,
      pagination: createPaginationInfo(response, page, pageSize),
    });
  }
}

export class GetSchoolsHandler extends TypedToolHandler<typeof getSchoolsSchema> {
  readonly name = 'get_schools';
  readonly description = 'Get educational institutions referenced by CourtListener judicial data';
  readonly category = 'courts';
  protected readonly schema = getSchoolsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getSchoolsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const { page, pageSize } = resolvePagination(input);
    context.logger.info('Getting schools', {
      name: input.name,
      requestId: context.requestId,
    });

    const response = (await this.apiClient.getSchools({
      ...input,
      page,
      page_size: pageSize,
    })) as PaginatedApiResponse;

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} schools`,
      schools: response.results,
      pagination: createPaginationInfo(response, page, pageSize),
    });
  }
}

export class GetMembershipsHandler extends TypedToolHandler<typeof getMembershipsSchema> {
  readonly name = 'get_memberships';
  readonly description = 'Get professional memberships for judges and judicial figures';
  readonly category = 'courts';
  protected readonly schema = getMembershipsSchema;

  constructor(private apiClient: CourtListenerAPI) {
    super();
  }

  @withDefaults({ cache: { ttl: 3600 } })
  async execute(
    input: z.infer<typeof getMembershipsSchema>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const { page, pageSize } = resolvePagination(input);
    context.logger.info('Getting memberships', {
      person: input.person,
      organization: input.organization,
      requestId: context.requestId,
    });

    const response = (await this.apiClient.getMemberships({
      ...input,
      page,
      page_size: pageSize,
    })) as PaginatedApiResponse;

    return this.success({
      summary: `Retrieved ${response.results?.length || 0} memberships`,
      memberships: response.results,
      pagination: createPaginationInfo(response, page, pageSize),
    });
  }
}

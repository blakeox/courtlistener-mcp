import { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { ResourceHandler, ResourceContext } from '../server/resource-handler.js';

export class SchemaResourceHandler implements ResourceHandler {
  readonly uriTemplate = 'courtlistener://schema/{type}';
  readonly name = 'CourtListener Schemas';
  readonly description = 'Schemas for CourtListener data models';
  readonly mimeType = 'application/json';

  private readonly schemas: Record<string, object> = {
    opinion: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        absolute_url: { type: 'string' },
        cluster_id: { type: 'integer' },
        author_id: { type: 'integer' },
        joined_by_ids: { type: 'array', items: { type: 'integer' } },
        date_created: { type: 'string', format: 'date-time' },
        date_modified: { type: 'string', format: 'date-time' },
        author_str: { type: 'string' },
        per_curiam: { type: 'boolean' },
        joined_by_str: { type: 'string' },
        type: { type: 'string' },
        sha1: { type: 'string' },
        page_count: { type: 'integer' },
        download_url: { type: 'string' },
        local_path: { type: 'string' },
        plain_text: { type: 'string' },
        html: { type: 'string' },
        html_lawbox: { type: 'string' },
        html_columbia: { type: 'string' },
        html_anon_2020: { type: 'string' },
        xml_harvard: { type: 'string' },
        html_with_citations: { type: 'string' },
        extracted_by_ocr: { type: 'boolean' },
        opinions_cited: { type: 'array', items: { type: 'string' } },
      },
    },
    docket: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        court: { type: 'string' },
        docket_number: { type: 'string' },
        case_name: { type: 'string' },
        case_name_short: { type: 'string' },
        case_name_full: { type: 'string' },
        slug: { type: 'string' },
        docket_number_core: { type: 'string' },
        pacer_case_id: { type: 'string' },
        date_created: { type: 'string', format: 'date-time' },
        date_modified: { type: 'string', format: 'date-time' },
        source: { type: 'integer' },
        appeal_from_str: { type: 'string' },
        assigned_to_str: { type: 'string' },
        referred_to_str: { type: 'string' },
        panel_str: { type: 'string' },
        date_last_index: { type: 'string', format: 'date-time' },
        date_cert_granted: { type: 'string', format: 'date' },
        date_cert_denied: { type: 'string', format: 'date' },
        date_argument: { type: 'string', format: 'date' },
        date_reargument: { type: 'string', format: 'date' },
        date_submitted: { type: 'string', format: 'date' },
        date_decision: { type: 'string', format: 'date' },
        date_dismissed: { type: 'string', format: 'date' },
        date_filed: { type: 'string', format: 'date' },
        date_terminated: { type: 'string', format: 'date' },
        date_last_filing: { type: 'string', format: 'date' },
        case_name_party1: { type: 'string' },
        case_name_party2: { type: 'string' },
        cause: { type: 'string' },
        nature_of_suit: { type: 'string' },
        jury_demand: { type: 'string' },
        jurisdiction_type: { type: 'string' },
        appellate_fee_status: { type: 'string' },
        appellate_case_type_information: { type: 'string' },
        mdl_status: { type: 'string' },
        filepath_local: { type: 'string' },
        filepath_ia: { type: 'string' },
        filepath_ia_json: { type: 'string' },
        ia_upload_failure_count: { type: 'integer' },
        ia_needs_upload: { type: 'boolean' },
        ia_date_first_change: { type: 'string', format: 'date-time' },
        view_count: { type: 'integer' },
        date_blocked: { type: 'string', format: 'date-time' },
        blocked: { type: 'boolean' },
        appeal_from: { type: 'string' },
        assigned_to: { type: 'string' },
        referred_to: { type: 'string' },
        panel: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
      },
    },
    court: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        short_name: { type: 'string' },
        full_name: { type: 'string' },
        url: { type: 'string' },
        start_date: { type: 'string', format: 'date' },
        end_date: { type: 'string', format: 'date' },
        jurisdiction: { type: 'string' },
      },
    },
    judge: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        first_name: { type: 'string' },
        middle_name: { type: 'string' },
        last_name: { type: 'string' },
        suffix: { type: 'string' },
        date_dob: { type: 'string', format: 'date' },
        date_dod: { type: 'string', format: 'date' },
        date_granularity_dob: { type: 'string' },
        date_granularity_dod: { type: 'string' },
        gender: { type: 'string' },
        race: { type: 'string' },
        is_alias_of: { type: 'integer' },
      },
    },
    'search-params': {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Query string' },
        type: { type: 'string', enum: ['o', 'd', 'r'], description: 'o: opinion, d: docket, r: recap' },
        order_by: { type: 'string', enum: ['score desc', 'dateFiled desc', 'dateFiled asc'] },
        stat_Precedential: { type: 'boolean' },
        court: { type: 'array', items: { type: 'string' } },
        judge: { type: 'string' },
        filed_after: { type: 'string', format: 'date' },
        filed_before: { type: 'string', format: 'date' },
      },
    },
  };

  matches(uri: string): boolean {
    return uri.startsWith('courtlistener://schema/');
  }

  async read(uri: string, _context: ResourceContext): Promise<ReadResourceResult> {
    const type = uri.replace('courtlistener://schema/', '');
    const schema = this.schemas[type];

    if (!schema) {
      throw new Error(`Schema not found: ${type}`);
    }

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(schema, null, 2),
        },
      ],
    };
  }

  list(): Resource[] {
    return Object.keys(this.schemas).map(type => ({
      uri: `courtlistener://schema/${type}`,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} Schema`,
      description: `Schema for ${type} data structure`,
      mimeType: 'application/json',
    }));
  }
}

/**
 * Type-safe fluent query builders for CourtListener API
 * Phase 4: Advanced Improvements
 */

/**
 * Base query builder with common pagination and filtering
 */
export abstract class BaseQueryBuilder<T> {
  protected params: Record<string, unknown> = {};

  /**
   * Set pagination parameters
   */
  paginate(page: number, pageSize: number = 20): this {
    this.params.page = page;
    this.params.page_size = pageSize;
    return this;
  }

  /**
   * Set date range filters
   */
  dateRange(after?: string, before?: string): this {
    if (after) this.params.date_filed_after = after;
    if (before) this.params.date_filed_before = before;
    return this;
  }

  /**
   * Set court filter
   */
  court(courtId: string): this {
    this.params.court = courtId;
    return this;
  }

  /**
   * Set ordering
   */
  orderBy(field: string): this {
    this.params.order_by = field;
    return this;
  }

  /**
   * Build final query parameters
   */
  build(): T {
    return this.params as T;
  }

  /**
   * Reset builder state
   */
  reset(): this {
    this.params = {};
    return this;
  }
}

/**
 * Query builder for opinion searches
 */
export class OpinionQueryBuilder extends BaseQueryBuilder<Record<string, unknown>> {
  /**
   * Set search query text
   */
  query(text: string): this {
    this.params.q = text;
    return this;
  }

  /**
   * Filter by judge name
   */
  judge(judgeName: string): this {
    this.params.judge = judgeName;
    return this;
  }

  /**
   * Filter by citation
   */
  citation(citation: string): this {
    this.params.citation = citation;
    return this;
  }

  /**
   * Filter by case name
   */
  caseName(name: string): this {
    this.params.case_name = name;
    return this;
  }

  /**
   * Filter by precedential status
   */
  precedentialStatus(status: string): this {
    this.params.precedential_status = status;
    return this;
  }

  /**
   * Filter by citation count range
   */
  citationCount(min?: number, max?: number): this {
    if (min !== undefined) this.params.cited_gt = min;
    if (max !== undefined) this.params.cited_lt = max;
    return this;
  }
}

/**
 * Query builder for case searches
 */
export class CaseQueryBuilder extends BaseQueryBuilder<Record<string, unknown>> {
  /**
   * Set search query text
   */
  query(text: string): this {
    this.params.q = text;
    return this;
  }

  /**
   * Filter by judge
   */
  judge(judgeName: string): this {
    this.params.judge = judgeName;
    return this;
  }

  /**
   * Filter by case name
   */
  caseName(name: string): this {
    this.params.case_name = name;
    return this;
  }

  /**
   * Filter by citation
   */
  citation(citation: string): this {
    this.params.citation = citation;
    return this;
  }

  /**
   * Filter by docket number
   */
  docketNumber(number: string): this {
    this.params.docket_number = number;
    return this;
  }

  /**
   * Filter by precedential status
   */
  precedentialStatus(status: string): this {
    this.params.precedential_status = status;
    return this;
  }
}

/**
 * Query builder for docket searches
 */
export class DocketQueryBuilder extends BaseQueryBuilder<Record<string, unknown>> {
  /**
   * Filter by case name
   */
  caseName(name: string): this {
    this.params.case_name = name;
    return this;
  }

  /**
   * Filter by docket number
   */
  docketNumber(number: string): this {
    this.params.docket_number = number;
    return this;
  }

  /**
   * Filter by nature of suit
   */
  natureOfSuit(nature: string): this {
    this.params.nature_of_suit = nature;
    return this;
  }

  /**
   * Filter by case status
   */
  status(status: string): this {
    this.params.status = status;
    return this;
  }

  /**
   * Filter by jurisdiction
   */
  jurisdiction(jurisdiction: string): this {
    this.params.court__jurisdiction = jurisdiction;
    return this;
  }
}

/**
 * Query builder for judge searches
 */
export class JudgeQueryBuilder extends BaseQueryBuilder<Record<string, unknown>> {
  /**
   * Filter by judge name
   */
  name(judgeName: string): this {
    this.params.name = judgeName;
    return this;
  }

  /**
   * Filter by active status
   */
  active(isActive: boolean): this {
    this.params.active = isActive;
    return this;
  }

  /**
   * Filter by school
   */
  school(schoolName: string): this {
    this.params.school = schoolName;
    return this;
  }

  /**
   * Filter by appointer
   */
  appointer(appointerName: string): this {
    this.params.appointer = appointerName;
    return this;
  }

  /**
   * Filter by appointment year
   */
  appointmentYear(year: number): this {
    this.params.appointment_year = year;
    return this;
  }
}

/**
 * Factory for creating query builders
 */
export class QueryBuilderFactory {
  static opinions(): OpinionQueryBuilder {
    return new OpinionQueryBuilder();
  }

  static cases(): CaseQueryBuilder {
    return new CaseQueryBuilder();
  }

  static dockets(): DocketQueryBuilder {
    return new DocketQueryBuilder();
  }

  static judges(): JudgeQueryBuilder {
    return new JudgeQueryBuilder();
  }
}

// Convenience exports
export const QueryBuilder = QueryBuilderFactory;


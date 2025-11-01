/**
 * Branded Types
 *
 * Provides type-safe IDs and other values using TypeScript's branded types pattern.
 * Branded types prevent accidental misuse of similar-looking values.
 *
 * **Problem**: Without branded types
 * ```typescript
 * const caseId: string = "123";
 * const courtId: string = "456";
 * fetchCase(courtId); // Oops! Wrong ID type, but TypeScript doesn't catch it
 * ```
 *
 * **Solution**: With branded types
 * ```typescript
 * const caseId: CaseId = brandCaseId("123");
 * const courtId: CourtId = brandCourtId("456");
 * fetchCase(courtId); // ❌ Type error! Can't use CourtId where CaseId is expected
 * ```
 *
 * @see https://egghead.io/blog/using-branded-types-in-typescript
 */

/**
 * Brand symbol for nominal typing
 * @internal
 */
declare const brand: unique symbol;

/**
 * Branded type helper
 * Creates a nominal type from a base type
 * @internal
 */
type Brand<T, TBrand extends string> = T & { readonly [brand]: TBrand };

/**
 * Case ID
 *
 * Unique identifier for legal cases in CourtListener
 *
 * @example
 * ```typescript
 * const id = brandCaseId("12345");
 * const caseData = await fetchCase(id);
 * ```
 */
export type CaseId = Brand<string, 'CaseId'>;

/**
 * Court ID
 *
 * Unique identifier for courts in CourtListener
 *
 * @example
 * ```typescript
 * const id = brandCourtId("ca9");
 * const court = await fetchCourt(id);
 * ```
 */
export type CourtId = Brand<string, 'CourtId'>;

/**
 * Opinion ID
 *
 * Unique identifier for opinions in CourtListener
 */
export type OpinionId = Brand<string, 'OpinionId'>;

/**
 * Docket ID
 *
 * Unique identifier for dockets in CourtListener
 */
export type DocketId = Brand<string, 'DocketId'>;

/**
 * Judge ID
 *
 * Unique identifier for judges in CourtListener
 */
export type JudgeId = Brand<string, 'JudgeId'>;

/**
 * Request ID
 *
 * Unique identifier for tracking requests
 */
export type RequestId = Brand<string, 'RequestId'>;

/**
 * User ID
 *
 * Unique identifier for users
 */
export type UserId = Brand<string, 'UserId'>;

/**
 * Session ID
 *
 * Unique identifier for user sessions
 */
export type SessionId = Brand<string, 'SessionId'>;

/**
 * Brand a string as a CaseId
 *
 * @param id - Raw string ID
 * @returns Branded CaseId
 *
 * @example
 * ```typescript
 * const caseId = brandCaseId("12345");
 * ```
 */
export function brandCaseId(id: string): CaseId {
  return id as CaseId;
}

/**
 * Brand a string as a CourtId
 *
 * @param id - Raw string ID (e.g., "ca9", "scotus")
 * @returns Branded CourtId
 */
export function brandCourtId(id: string): CourtId {
  return id as CourtId;
}

/**
 * Brand a string as an OpinionId
 *
 * @param id - Raw string ID
 * @returns Branded OpinionId
 */
export function brandOpinionId(id: string): OpinionId {
  return id as OpinionId;
}

/**
 * Brand a string as a DocketId
 *
 * @param id - Raw string ID
 * @returns Branded DocketId
 */
export function brandDocketId(id: string): DocketId {
  return id as DocketId;
}

/**
 * Brand a string as a JudgeId
 *
 * @param id - Raw string ID
 * @returns Branded JudgeId
 */
export function brandJudgeId(id: string): JudgeId {
  return id as JudgeId;
}

/**
 * Brand a string as a RequestId
 *
 * @param id - Raw string ID
 * @returns Branded RequestId
 */
export function brandRequestId(id: string): RequestId {
  return id as RequestId;
}

/**
 * Brand a string as a UserId
 *
 * @param id - Raw string ID
 * @returns Branded UserId
 */
export function brandUserId(id: string): UserId {
  return id as UserId;
}

/**
 * Brand a string as a SessionId
 *
 * @param id - Raw string ID
 * @returns Branded SessionId
 */
export function brandSessionId(id: string): SessionId {
  return id as SessionId;
}

/**
 * Unbrand an ID back to a raw string
 *
 * @param id - Branded ID
 * @returns Raw string value
 *
 * @example
 * ```typescript
 * const caseId = brandCaseId("12345");
 * const rawId = unbrandId(caseId); // "12345"
 * ```
 */
export function unbrandId<T extends string>(id: Brand<string, T>): string {
  return id as string;
}

/**
 * Check if a string is a valid CaseId format
 *
 * @param id - String to validate
 * @returns True if valid CaseId format
 */
export function isValidCaseId(id: string): boolean {
  // CourtListener case IDs are typically numeric
  return /^\d+$/.test(id);
}

/**
 * Check if a string is a valid CourtId format
 *
 * @param id - String to validate
 * @returns True if valid CourtId format
 */
export function isValidCourtId(id: string): boolean {
  // CourtListener court IDs are alphanumeric slugs
  return /^[a-z0-9-]+$/.test(id);
}

/**
 * Safely brand a CaseId with validation
 *
 * @param id - String to brand
 * @returns Branded CaseId if valid
 * @throws {Error} If ID format is invalid
 *
 * @example
 * ```typescript
 * try {
 *   const caseId = safeBrandCaseId("12345");
 * } catch (error) {
 *   console.error("Invalid case ID format");
 * }
 * ```
 */
export function safeBrandCaseId(id: string): CaseId {
  if (!isValidCaseId(id)) {
    throw new Error(`Invalid CaseId format: ${id}`);
  }
  return brandCaseId(id);
}

/**
 * Safely brand a CourtId with validation
 *
 * @param id - String to brand
 * @returns Branded CourtId if valid
 * @throws {Error} If ID format is invalid
 */
export function safeBrandCourtId(id: string): CourtId {
  if (!isValidCourtId(id)) {
    throw new Error(`Invalid CourtId format: ${id}`);
  }
  return brandCourtId(id);
}

/**
 * Type guard to check if a value is a branded CaseId
 *
 * @param value - Value to check
 * @returns True if value is a CaseId
 */
export function isCaseId(value: unknown): value is CaseId {
  return typeof value === 'string' && isValidCaseId(value);
}

/**
 * Type guard to check if a value is a branded CourtId
 *
 * @param value - Value to check
 * @returns True if value is a CourtId
 */
export function isCourtId(value: unknown): value is CourtId {
  return typeof value === 'string' && isValidCourtId(value);
}

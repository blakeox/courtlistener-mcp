/**
 * Enhanced tool definitions with categories, examples, and improved documentation
 */

import { EnhancedTool } from './types.js';

export const TOOL_CATEGORIES = {
  SEARCH: 'search',
  DETAILS: 'details', 
  ANALYSIS: 'analysis',
  MONITORING: 'monitoring',
  REFERENCE: 'reference'
} as const;

export function getEnhancedToolDefinitions(): EnhancedTool[] {
  return [
    {
      name: "search_cases",
      description: "Search for legal cases and opinions using CourtListener's comprehensive database with advanced filtering capabilities",
      category: "search",
      complexity: "simple",
      rateLimitWeight: 1,
      examples: [
        {
          name: "Search by citation",
          description: "Find a specific case using its legal citation",
          arguments: { citation: "410 U.S. 113" }
        },
        {
          name: "Search by case name",
          description: "Find cases containing specific names",
          arguments: { case_name: "Roe v. Wade" }
        },
        {
          name: "Court-specific search",
          description: "Search within a specific court's opinions",
          arguments: { 
            query: "privacy rights", 
            court: "scotus",
            date_filed_after: "2020-01-01"
          }
        }
      ],
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query for case names, legal concepts, or keywords"
          },
          court: {
            type: "string",
            description: "Court identifier (e.g., 'scotus', 'ca1', 'ca2'). Use list_courts to see available courts."
          },
          judge: {
            type: "string",
            description: "Judge name to filter by"
          },
          case_name: {
            type: "string",
            description: "Specific case name to search for"
          },
          citation: {
            type: "string",
            description: "Legal citation (e.g., '410 U.S. 113')"
          },
          date_filed_after: {
            type: "string",
            description: "Find cases filed after this date (YYYY-MM-DD)",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$"
          },
          date_filed_before: {
            type: "string",
            description: "Find cases filed before this date (YYYY-MM-DD)",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$"
          },
          precedential_status: {
            type: "string",
            description: "Filter by precedential status",
            enum: ["Published", "Unpublished", "Errata", "Separate", "In-chambers", "Relating-to", "Unknown"]
          },
          page: {
            type: "number",
            description: "Page number for pagination (starts at 1)",
            minimum: 1
          },
          page_size: {
            type: "number", 
            description: "Number of results per page (max 100, recommended: 20)",
            minimum: 1,
            maximum: 100
          }
        },
        additionalProperties: false
      }
    },
    {
      name: "get_case_details", 
      description: "Get comprehensive details about a specific case including full metadata, citations, and related information",
      category: "details",
      complexity: "simple",
      rateLimitWeight: 1,
      examples: [
        {
          name: "Get case details",
          description: "Retrieve full details for a known case",
          arguments: { cluster_id: 112332 }
        }
      ],
      inputSchema: {
        type: "object",
        properties: {
          cluster_id: {
            type: "number",
            description: "CourtListener cluster ID for the case. Use search_cases to find cluster IDs.",
            minimum: 1
          }
        },
        required: ["cluster_id"],
        additionalProperties: false
      }
    },
    {
      name: "get_opinion_text",
      description: "Retrieve the full text content of a specific legal opinion, including HTML and plain text formats",
      category: "details", 
      complexity: "simple",
      rateLimitWeight: 1,
      examples: [
        {
          name: "Get opinion full text",
          description: "Retrieve the complete text of an opinion for analysis",
          arguments: { opinion_id: 108713 }
        }
      ],
      inputSchema: {
        type: "object",
        properties: {
          opinion_id: {
            type: "number",
            description: "CourtListener opinion ID. Use get_case_details to find opinion IDs from a case.",
            minimum: 1
          }
        },
        required: ["opinion_id"],
        additionalProperties: false
      }
    },
    {
      name: "analyze_legal_argument",
      description: "Analyze a legal argument by finding supporting and opposing cases, with AI-powered relevance assessment",
      category: "analysis",
      complexity: "advanced", 
      rateLimitWeight: 3,
      examples: [
        {
          name: "Constitutional analysis",
          description: "Find cases supporting a constitutional argument",
          arguments: {
            argument: "The First Amendment protects commercial speech",
            search_query: "commercial speech First Amendment",
            jurisdiction: "scotus"
          }
        },
        {
          name: "Precedent research",
          description: "Research precedents for a specific legal principle",
          arguments: {
            argument: "Qualified immunity protects government officials",
            search_query: "qualified immunity government officials",
            date_range_start: "2010-01-01"
          }
        }
      ],
      inputSchema: {
        type: "object", 
        properties: {
          argument: {
            type: "string",
            description: "The legal argument or claim to analyze",
            minLength: 1
          },
          search_query: {
            type: "string",
            description: "Keywords to search for relevant cases",
            minLength: 1
          },
          jurisdiction: {
            type: "string",
            description: "Limit search to specific jurisdiction (court identifier)"
          },
          date_range_start: {
            type: "string",
            description: "Start date for case search (YYYY-MM-DD)",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$"
          },
          date_range_end: {
            type: "string", 
            description: "End date for case search (YYYY-MM-DD)",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$"
          }
        },
        required: ["argument", "search_query"],
        additionalProperties: false
      }
    },
    {
      name: "get_citation_network",
      description: "Analyze citation networks and precedent relationships to understand case law evolution and influence",
      category: "analysis",
      complexity: "advanced",
      rateLimitWeight: 2,
      examples: [
        {
          name: "Citation influence analysis", 
          description: "Map how a landmark case influenced later decisions",
          arguments: {
            opinion_id: 108713,
            depth: 2,
            cited_by: true,
            cites_to: true
          }
        }
      ],
      inputSchema: {
        type: "object",
        properties: {
          opinion_id: {
            type: "number",
            description: "Opinion ID to analyze citation network for",
            minimum: 1
          },
          depth: {
            type: "number",
            description: "Depth of citation network to traverse (1-3, higher = more comprehensive)",
            minimum: 1,
            maximum: 3
          },
          cited_by: {
            type: "boolean", 
            description: "Include cases that cite this opinion (default: true)"
          },
          cites_to: {
            type: "boolean",
            description: "Include cases that this opinion cites (default: true)"
          }
        },
        required: ["opinion_id"],
        additionalProperties: false
      }
    },
    {
      name: "list_courts",
      description: "List all available courts with their metadata, jurisdiction information, and operational status",
      category: "reference",
      complexity: "simple",
      rateLimitWeight: 1,
      examples: [
        {
          name: "List all federal courts",
          description: "Get all federal courts currently in use",
          arguments: { jurisdiction: "F", in_use: true }
        },
        {
          name: "List Supreme Court",
          description: "Get Supreme Court information", 
          arguments: { jurisdiction: "F" }
        }
      ],
      inputSchema: {
        type: "object",
        properties: {
          jurisdiction: {
            type: "string",
            description: "Filter by jurisdiction: F=Federal, S=State, C=Circuit, etc.",
            enum: ["F", "FD", "FB", "FT", "FS", "S", "SA", "C", "I"]
          },
          in_use: {
            type: "boolean",
            description: "Filter by whether court is currently in use"
          }
        },
        additionalProperties: false
      }
    },
    {
      name: "get_docket_entries",
      description: "Get individual court filings and orders for a specific docket, providing case timeline and procedural history",
      category: "details",
      complexity: "simple",
      rateLimitWeight: 1,
      examples: [
        {
          name: "Get case filings",
          description: "Retrieve all filings for a docket",
          arguments: { docket: 12345 }
        }
      ],
      inputSchema: {
        type: "object",
        properties: {
          docket: {
            type: ["number", "string"],
            description: "Docket ID to get entries for"
          },
          entry_number: {
            type: ["number", "string"],
            description: "Specific entry number to filter by"
          },
          date_filed_after: {
            type: "string",
            description: "Get entries filed after this date (YYYY-MM-DD)",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$"
          },
          date_filed_before: {
            type: "string",
            description: "Get entries filed before this date (YYYY-MM-DD)", 
            pattern: "^\\d{4}-\\d{2}-\\d{2}$"
          },
          page: {
            type: "number",
            description: "Page number for pagination (default: 1)",
            minimum: 1
          },
          page_size: {
            type: "number",
            description: "Number of entries per page (default: 20, max: 100)",
            minimum: 1,
            maximum: 100
          }
        },
        required: ["docket"],
        additionalProperties: false
      }
    },
    {
      name: "get_comprehensive_judge_profile",
      description: "Get complete judicial profile including positions, education, political affiliations, ABA ratings, and financial disclosures",
      category: "analysis",
      complexity: "advanced",
      rateLimitWeight: 4,
      examples: [
        {
          name: "Complete judge analysis",
          description: "Get comprehensive profile for judicial analytics",
          arguments: { judge_id: 2581 }
        }
      ],
      inputSchema: {
        type: "object",
        properties: {
          judge_id: {
            type: "number",
            description: "Judge ID for comprehensive profile",
            minimum: 1
          }
        },
        required: ["judge_id"],
        additionalProperties: false
      }
    },
    {
      name: "get_comprehensive_case_analysis",
      description: "Get complete case analysis including docket entries, parties, attorneys, and tags for full case intelligence",
      category: "analysis", 
      complexity: "advanced",
      rateLimitWeight: 4,
      examples: [
        {
          name: "Full case intelligence",
          description: "Get comprehensive case data for legal strategy",
          arguments: { cluster_id: 112332 }
        }
      ],
      inputSchema: {
        type: "object",
        properties: {
          cluster_id: {
            type: "number",
            description: "Case cluster ID for comprehensive analysis",
            minimum: 1
          }
        },
        required: ["cluster_id"],
        additionalProperties: false
      }
    },
    {
      name: "get_financial_disclosure_details",
      description: "Get detailed financial disclosure information including investments, debts, gifts, and income sources",
      category: "details",
      complexity: "intermediate",
      rateLimitWeight: 2,
      examples: [
        {
          name: "Investment analysis",
          description: "Get judge investment portfolios",
          arguments: { disclosure_type: "investments", person: 2581 }
        },
        {
          name: "Gift analysis", 
          description: "Get gifts received by judge",
          arguments: { disclosure_type: "gifts", person: 2581 }
        }
      ],
      inputSchema: {
        type: "object",
        properties: {
          disclosure_type: {
            type: "string",
            description: "Type of financial disclosure",
            enum: ["investments", "debts", "gifts", "agreements", "positions", "reimbursements", "spouse_incomes", "non_investment_incomes"]
          },
          person: {
            type: "number",
            description: "Judge ID for financial disclosures",
            minimum: 1
          },
          year: {
            type: "number",
            description: "Disclosure year",
            minimum: 1980
          }
        },
        required: ["disclosure_type"],
        additionalProperties: false
      }
    },
    {
      name: "validate_citations",
      description: "Validate and parse citations from text to prevent AI hallucinations and ensure accurate legal references",
      category: "reference",
      complexity: "simple",
      rateLimitWeight: 1,
      examples: [
        {
          name: "Citation validation",
          description: "Check if citations in text are valid",
          arguments: { text: "See Roe v. Wade, 410 U.S. 113 (1973) and Brown v. Board, 347 U.S. 483 (1954)" }
        }
      ],
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Text containing citations to validate",
            minLength: 1
          }
        },
        required: ["text"],
        additionalProperties: false
      }
    },
    {
      name: "get_enhanced_recap_data",
      description: "Access advanced RECAP/PACER features including document fetching and email notifications",
      category: "details",
      complexity: "intermediate", 
      rateLimitWeight: 2,
      examples: [
        {
          name: "Fetch PACER document",
          description: "Retrieve document from PACER",
          arguments: { action: "fetch", pacer_doc_id: "12345" }
        },
        {
          name: "RECAP query",
          description: "Query RECAP database",
          arguments: { action: "query", court: "dcd", case_number: "1:20-cv-01234" }
        }
      ],
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "RECAP action to perform",
            enum: ["fetch", "query", "email"]
          },
          pacer_doc_id: {
            type: "string",
            description: "PACER document ID for fetching"
          },
          court: {
            type: "string",
            description: "Court identifier for queries"
          },
          case_number: {
            type: "string",
            description: "Case number for queries"
          }
        },
        required: ["action"],
        additionalProperties: false
      }
    }
    // Note: This is a sample of enhanced definitions - would continue for all 24 tools
  ];
}

/**
 * Get tools organized by category
 */
export function getToolsByCategory(): Record<string, EnhancedTool[]> {
  const tools = getEnhancedToolDefinitions();
  const categories: Record<string, EnhancedTool[]> = {};
  
  for (const tool of tools) {
    if (!categories[tool.category]) {
      categories[tool.category] = [];
    }
    categories[tool.category].push(tool);
  }
  
  return categories;
}

/**
 * Get tool usage examples for documentation
 */
export function getToolExamples(): Record<string, Array<{ description: string; code: string }>> {
  const tools = getEnhancedToolDefinitions();
  const examples: Record<string, Array<{ description: string; code: string }>> = {};
  
  for (const tool of tools) {
    examples[tool.name] = tool.examples?.map(example => ({
      description: example.description,
      code: JSON.stringify(example.arguments, null, 2)
    })) || [];
  }
  
  return examples;
}

/**
 * Enhanced tool definitions with categories, examples, and improved documentation
 *
 * Definitions are co-located with their domain handlers. This barrel re-exports
 * them all and provides aggregate helper functions.
 */

import { EnhancedTool } from './types.js';
import { searchToolDefinitions } from './domains/search/definitions.js';
import { caseToolDefinitions } from './domains/cases/definitions.js';
import { opinionToolDefinitions } from './domains/opinions/definitions.js';
import { courtToolDefinitions } from './domains/courts/definitions.js';
import { docketToolDefinitions } from './domains/dockets/definitions.js';
import { miscellaneousToolDefinitions } from './domains/miscellaneous/definitions.js';
import { enhancedToolDefinitions } from './domains/enhanced/definitions.js';

export { searchToolDefinitions } from './domains/search/definitions.js';
export { caseToolDefinitions } from './domains/cases/definitions.js';
export { opinionToolDefinitions } from './domains/opinions/definitions.js';
export { courtToolDefinitions } from './domains/courts/definitions.js';
export { docketToolDefinitions } from './domains/dockets/definitions.js';
export { miscellaneousToolDefinitions } from './domains/miscellaneous/definitions.js';
export { enhancedToolDefinitions } from './domains/enhanced/definitions.js';

export const TOOL_CATEGORIES = {
  SEARCH: 'search',
  DETAILS: 'details',
  ANALYSIS: 'analysis',
  MONITORING: 'monitoring',
  REFERENCE: 'reference',
} as const;

export function getEnhancedToolDefinitions(): EnhancedTool[] {
  return [
    ...searchToolDefinitions,
    ...caseToolDefinitions,
    ...opinionToolDefinitions,
    ...courtToolDefinitions,
    ...docketToolDefinitions,
    ...miscellaneousToolDefinitions,
    ...enhancedToolDefinitions,
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
    examples[tool.name] =
      tool.examples?.map((example) => ({
        description: example.description,
        code: JSON.stringify(example.arguments, null, 2),
      })) || [];
  }

  return examples;
}

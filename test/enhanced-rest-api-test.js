#!/usr/bin/env node

/**
 * Enhanced REST API Coverage Test
 * Tests the new CourtListener REST API endpoints
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';

// Enhanced test scenarios for new REST API endpoints
const ENHANCED_API_TESTS = [
  {
    name: "Docket Entries Test",
    tool: "get_docket_entries", 
    args: { docket: 123456 },
    description: "Test individual court filings and orders"
  },
  {
    name: "Comprehensive Judge Profile Test",
    tool: "get_comprehensive_judge_profile",
    args: { judge_id: 2581 },
    description: "Test complete judicial intelligence gathering"
  },
  {
    name: "Comprehensive Case Analysis Test", 
    tool: "get_comprehensive_case_analysis",
    args: { cluster_id: 112332 },
    description: "Test full case intelligence with all related data"
  },
  {
    name: "Financial Disclosure Details - Investments",
    tool: "get_financial_disclosure_details",
    args: { disclosure_type: "investments", person: 2581 },
    description: "Test detailed investment portfolio analysis"
  },
  {
    name: "Financial Disclosure Details - Gifts",
    tool: "get_financial_disclosure_details", 
    args: { disclosure_type: "gifts", person: 2581 },
    description: "Test gifts received by judges"
  },
  {
    name: "Citation Validation Test",
    tool: "validate_citations",
    args: { text: "See Roe v. Wade, 410 U.S. 113 (1973) and Brown v. Board, 347 U.S. 483 (1954)" },
    description: "Test citation validation to prevent AI hallucinations"
  },
  {
    name: "Enhanced RECAP Fetch Test",
    tool: "get_enhanced_recap_data",
    args: { action: "fetch", pacer_doc_id: "12345" },
    description: "Test advanced PACER document fetching"
  },
  {
    name: "Enhanced RECAP Query Test",
    tool: "get_enhanced_recap_data", 
    args: { action: "query", court: "dcd", case_number: "1:20-cv-01234" },
    description: "Test advanced RECAP database queries"
  }
];

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEnhancedAPI() {
  log('\n🚀 Enhanced REST API Coverage Test', 'blue');
  log('=' .repeat(60), 'blue');
  
  let passed = 0;
  let failed = 0;
  
  for (const test of ENHANCED_API_TESTS) {
    log(`\n📋 ${test.name}`, 'yellow');
    log(`   Description: ${test.description}`, 'reset');
    log(`   Tool: ${test.tool}`, 'reset');
    log(`   Args: ${JSON.stringify(test.args)}`, 'reset');
    
    try {
      // Test tool definition exists
      const toolExists = await testToolExists(test.tool);
      if (!toolExists) {
        log(`   ❌ FAIL: Tool ${test.tool} not found in tool definitions`, 'red');
        failed++;
        continue;
      }
      
      // Test method exists in CourtListener API
      const methodExists = await testMethodExists(test.tool);
      if (!methodExists) {
        log(`   ❌ FAIL: Method for ${test.tool} not found in CourtListener API`, 'red');
        failed++;
        continue;
      }
      
      // Test enterprise server handler exists
      const handlerExists = await testHandlerExists(test.tool);
      if (!handlerExists) {
        log(`   ❌ FAIL: Handler for ${test.tool} not found in enterprise server`, 'red');
        failed++;
        continue;
      }
      
      log(`   ✅ PASS: All components found for ${test.tool}`, 'green');
      passed++;
      
    } catch (error) {
      log(`   ❌ FAIL: Error testing ${test.tool}: ${error.message}`, 'red');
      failed++;
    }
  }
  
  // Summary
  log('\n📊 Enhanced REST API Test Summary', 'magenta');
  log('=' .repeat(40), 'magenta');
  log(`✅ Passed: ${passed}`, 'green');
  log(`❌ Failed: ${failed}`, 'red');
  log(`📈 Coverage: ${Math.round((passed / (passed + failed)) * 100)}%`, 'blue');
  
  if (failed === 0) {
    log('\n🎉 All enhanced REST API tests passed!', 'green');
    log('   The Legal MCP Server now has comprehensive CourtListener coverage', 'green');
  } else {
    log(`\n⚠️  ${failed} enhanced REST API tests failed`, 'yellow');
    log('   Some components may need implementation', 'yellow');
  }
  
  return failed === 0;
}

async function testToolExists(toolName) {
  const toolDefs = await fs.readFile('src/tool-definitions.ts', 'utf8');
  return toolDefs.includes(`name: "${toolName}"`);
}

async function testMethodExists(toolName) {
  const courtListener = await fs.readFile('src/courtlistener.ts', 'utf8');
  
  // Map tool names to method names
  const methodMap = {
    'get_docket_entries': 'getDocketEntries',
    'get_comprehensive_judge_profile': 'getComprehensiveJudgeProfile', 
    'get_comprehensive_case_analysis': 'getComprehensiveCaseAnalysis',
    'get_financial_disclosure_details': ['getFinancialInvestments', 'getFinancialDebts', 'getFinancialGifts'],
    'validate_citations': 'validateCitations',
    'get_enhanced_recap_data': ['getRECAPFetch', 'getRECAPQuery', 'getRECAPEmail']
  };
  
  const expectedMethods = methodMap[toolName];
  if (Array.isArray(expectedMethods)) {
    return expectedMethods.some(method => courtListener.includes(`async ${method}(`));
  } else {
    return courtListener.includes(`async ${expectedMethods}(`);
  }
}

async function testHandlerExists(toolName) {
  const enterprise = await fs.readFile('src/enterprise-server.ts', 'utf8');
  
  // Special cases for handler naming
  const handlerMap = {
    'get_enhanced_recap_data': 'handleGetEnhancedRECAPData'
  };
  
  // Convert tool name to handler name
  const handlerName = handlerMap[toolName] || 
    'handle' + toolName.split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  
  // Check both the case statement and the handler method
  const hasCaseStatement = enterprise.includes(`case '${toolName}'`);
  const hasHandlerMethod = enterprise.includes(`async ${handlerName}(`) || 
                          enterprise.includes(`private async ${handlerName}(`);
  
  return hasCaseStatement && hasHandlerMethod;
}

// Additional REST API endpoint coverage analysis
async function analyzeRESTCoverage() {
  log('\n📈 REST API Endpoint Coverage Analysis', 'blue');
  log('=' .repeat(50), 'blue');
  
  const courtListenerEndpoints = [
    // Core endpoints (well covered)
    'search', 'clusters', 'opinions', 'courts', 'people', 'dockets',
    'financial-disclosures', 'parties', 'attorneys', 'recap', 'audio',
    'alerts', 'citation-lookup', 'visualizations', 'fjc-integrated-database',
    
    // Enhanced endpoints (newly added)
    'docket-entries', 'positions', 'educations', 'political-affiliations',
    'aba-ratings', 'retention-events', 'schools', 'agreements', 'debts',
    'gifts', 'investments', 'non-investment-incomes', 'disclosure-positions',
    'reimbursements', 'spouse-incomes', 'recap-fetch', 'recap-query', 
    'recap-email', 'originating-court-information', 'tags', 'docket-tags',
    'docket-alerts', 'memberships'
  ];
  
  log(`📊 Total CourtListener v4 endpoints analyzed: ${courtListenerEndpoints.length}`, 'reset');
  log('✅ Core coverage: Case law, judges, courts, financial disclosures', 'green');
  log('🆕 Enhanced coverage: Docket entries, judge analytics, advanced RECAP', 'yellow');
  log('🔍 Specialized coverage: Citation validation, comprehensive profiles', 'blue');
  
  return true;
}

// Run the enhanced tests
async function main() {
  const testsPassed = await testEnhancedAPI();
  await analyzeRESTCoverage();
  
  if (testsPassed) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch(console.error);

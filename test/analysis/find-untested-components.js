#!/usr/bin/env node

/**
 * 🔍 FIND UNTESTED COMPONENTS SCRIPT
 * Identifies critical infrastructure components that may need additional testing
 */

import fs from 'fs';
import path from 'path';

// Critical infrastructure patterns to look for
const CRITICAL_PATTERNS = [
  'class ',
  'export class',
  'export const', 
  'export function',
  'export default',
  'function ',
  'const.*=.*{',
  'interface ',
  'type '
];

// Files to analyze
const SOURCE_DIR = './src';
const TEST_DIR = './test';

console.log('🔍 Finding Critical Infrastructure Components...\n');

// Get all source files
function getSourceFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...getSourceFiles(fullPath));
    } else if (item.endsWith('.ts') || item.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Get all test files
function getTestFiles(dir) {
  const files = [];
  try {
    const items = fs.readdirSync(dir, { recursive: true });
    
    for (const item of items) {
      if (typeof item === 'string' && (item.endsWith('.js') || item.endsWith('.ts'))) {
        files.push(path.join(dir, item));
      }
    }
  } catch (error) {
    console.log(`⚠️ Warning: Could not read test directory: ${error.message}`);
  }
  
  return files;
}

// Extract components from source file
function extractComponents(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const components = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      for (const pattern of CRITICAL_PATTERNS) {
        const regex = new RegExp(pattern);
        if (regex.test(line)) {
          // Extract component name
          let componentName = line;
          
          // Clean up the line to extract name
          if (line.includes('class ')) {
            componentName = line.match(/class\s+(\w+)/)?.[1] || 'Unknown';
          } else if (line.includes('function ')) {
            componentName = line.match(/function\s+(\w+)/)?.[1] || 'Unknown';
          } else if (line.includes('const ') || line.includes('export const')) {
            componentName = line.match(/const\s+(\w+)/)?.[1] || 'Unknown';
          } else if (line.includes('interface ')) {
            componentName = line.match(/interface\s+(\w+)/)?.[1] || 'Unknown';
          } else if (line.includes('type ')) {
            componentName = line.match(/type\s+(\w+)/)?.[1] || 'Unknown';
          }
          
          components.push({
            name: componentName,
            line: i + 1,
            code: line,
            type: getComponentType(line)
          });
          break;
        }
      }
    }
    
    return components;
  } catch (error) {
    console.log(`⚠️ Error reading ${filePath}: ${error.message}`);
    return [];
  }
}

function getComponentType(line) {
  if (line.includes('class ')) return 'class';
  if (line.includes('function ')) return 'function';
  if (line.includes('const ')) return 'constant';
  if (line.includes('interface ')) return 'interface';
  if (line.includes('type ')) return 'type';
  return 'other';
}

// Check if component is tested
function isComponentTested(componentName, testFiles) {
  for (const testFile of testFiles) {
    try {
      const content = fs.readFileSync(testFile, 'utf8');
      if (content.includes(componentName)) {
        return true;
      }
    } catch (error) {
      // Ignore read errors
    }
  }
  return false;
}

// Main analysis
async function analyzeComponents() {
  const sourceFiles = getSourceFiles(SOURCE_DIR);
  const testFiles = getTestFiles(TEST_DIR);
  
  console.log(`📁 Found ${sourceFiles.length} source files`);
  console.log(`🧪 Found ${testFiles.length} test files\n`);
  
  const allComponents = [];
  const componentsByFile = {};
  
  // Extract components from each source file
  for (const sourceFile of sourceFiles) {
    const components = extractComponents(sourceFile);
    allComponents.push(...components);
    componentsByFile[sourceFile] = components;
    
    console.log(`📄 ${sourceFile}:`);
    if (components.length === 0) {
      console.log('   ✅ No critical components found');
    } else {
      for (const component of components) {
        const tested = isComponentTested(component.name, testFiles);
        const status = tested ? '✅' : '❌';
        console.log(`   ${status} ${component.type}: ${component.name} (line ${component.line})`);
      }
    }
    console.log();
  }
  
  // Summary
  console.log('📊 SUMMARY:\n');
  
  const testedComponents = allComponents.filter(comp => 
    isComponentTested(comp.name, testFiles)
  );
  const untestedComponents = allComponents.filter(comp => 
    !isComponentTested(comp.name, testFiles)
  );
  
  console.log(`✅ Tested Components: ${testedComponents.length}`);
  console.log(`❌ Untested Components: ${untestedComponents.length}`);
  console.log(`📈 Test Coverage: ${Math.round((testedComponents.length / allComponents.length) * 100)}%\n`);
  
  if (untestedComponents.length > 0) {
    console.log('🚨 UNTESTED COMPONENTS THAT NEED ATTENTION:\n');
    
    const componentsByType = {};
    for (const comp of untestedComponents) {
      if (!componentsByType[comp.type]) {
        componentsByType[comp.type] = [];
      }
      componentsByType[comp.type].push(comp);
    }
    
    for (const [type, components] of Object.entries(componentsByType)) {
      console.log(`${type.toUpperCase()}S:`);
      for (const comp of components) {
        console.log(`   - ${comp.name}`);
      }
      console.log();
    }
  } else {
    console.log('🎉 ALL CRITICAL COMPONENTS HAVE TESTS!');
  }
  
  // Recommendations
  console.log('💡 RECOMMENDATIONS:\n');
  
  if (untestedComponents.length > 0) {
    console.log('1. Create unit tests for untested components');
    console.log('2. Prioritize testing classes and functions first');
    console.log('3. Consider integration tests for complex interactions');
  } else {
    console.log('1. Consider adding integration tests');
    console.log('2. Add performance tests for critical paths');
    console.log('3. Consider end-to-end testing scenarios');
  }
  
  console.log('4. Review test coverage regularly');
  console.log('5. Add tests when adding new components\n');
  
  console.log('🏁 Analysis complete!');
}

// Run the analysis
analyzeComponents().catch(console.error);

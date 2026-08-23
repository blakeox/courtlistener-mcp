#!/usr/bin/env node

/**
 * Version Consistency Checker
 * Ensures package.json and related files have consistent versions
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Resolve repository root (scripts/build -> repo root)
const repoRoot = path.resolve(__dirname, '..', '..');

console.log('🔍 Checking version consistency...\n');

const errors = [];
const versions = new Map();

/**
 * Read version from package.json
 */
function getPackageVersion(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const pkg = JSON.parse(content);
    return {
      version: pkg.version,
      name: pkg.name,
      dependencies: pkg.dependencies || {},
      devDependencies: pkg.devDependencies || {}
    };
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${error.message}`);
  }
}

/**
 * Check package.json
 */
console.log('📦 Checking package.json...');
const packagePath = path.join(repoRoot, 'package.json');

if (!fs.existsSync(packagePath)) {
  errors.push('package.json not found');
} else {
  try {
    const packageInfo = getPackageVersion(packagePath);
    versions.set('package.json', packageInfo);
    console.log(`   ✅ package.json version: ${packageInfo.version}`);
  } catch (error) {
    errors.push(`package.json: ${error.message}`);
  }
}

/**
 * Check package-lock.json
 */
console.log('\n🔒 Checking package-lock.json...');
const lockPath = path.join(repoRoot, 'package-lock.json');

if (!fs.existsSync(lockPath)) {
  console.log('   ⚠️  package-lock.json not found (this is okay for pnpm projects)');
} else {
  try {
    const lockContent = fs.readFileSync(lockPath, 'utf8');
    const lockFile = JSON.parse(lockContent);
    const packageInfo = versions.get('package.json');
    
    if (packageInfo && lockFile.version !== packageInfo.version) {
      errors.push(`package-lock.json version (${lockFile.version}) does not match package.json version (${packageInfo.version})`);
    } else {
      console.log(`   ✅ package-lock.json version matches: ${lockFile.version}`);
    }
  } catch (error) {
    errors.push(`package-lock.json: ${error.message}`);
  }
}

/**
 * Check pnpm-lock.yaml (if present)
 */
console.log('\n📌 Checking pnpm-lock.yaml...');
const pnpmLockPath = path.join(repoRoot, 'pnpm-lock.yaml');

if (fs.existsSync(pnpmLockPath)) {
  console.log('   ✅ pnpm-lock.yaml found');
  // File timestamps are not reliable after Git checkout or CI artifact
  // restoration. The release workflow's `pnpm install --frozen-lockfile`
  // check is the authoritative lockfile consistency gate.
  console.log('   ✅ Lockfile consistency is enforced by pnpm install --frozen-lockfile');
} else {
  console.log('   ℹ️  No pnpm-lock.yaml found');
}

/**
 * Check MCP dependencies
 */
console.log('\n🔗 Checking MCP dependencies...');
const packageInfo = versions.get('package.json');

if (packageInfo) {
  const githubRefName = process.env.GITHUB_REF_NAME;
  if (githubRefName?.startsWith('v')) {
    const tagVersion = githubRefName.slice(1);
    if (tagVersion !== packageInfo.version) {
      errors.push(
        `git tag version (${tagVersion}) does not match package.json version (${packageInfo.version})`,
      );
    } else {
      console.log(`   ✅ git tag version matches package.json: ${tagVersion}`);
    }
  }

  const mcpDeps = Object.entries(packageInfo.dependencies)
    .filter(([name]) => name.includes('modelcontextprotocol'))
    .concat(Object.entries(packageInfo.devDependencies)
      .filter(([name]) => name.includes('modelcontextprotocol')));
  
  if (mcpDeps.length > 0) {
    console.log('   MCP Dependencies found:');
    mcpDeps.forEach(([name, version]) => {
      console.log(`   - ${name}: ${version}`);
    });
    
    // Runtime MCP packages must stay aligned.
    const runtimeMcpDeps = mcpDeps.filter(([name]) => name === '@modelcontextprotocol/server');
    const mcpVersions = runtimeMcpDeps.map(([, version]) => version);
    const uniqueMcpVersions = [...new Set(mcpVersions.map((v) => v.replace(/[\^~]/, '')))];

    if (uniqueMcpVersions.length > 1) {
      console.log(`   ⚠️  Multiple MCP runtime versions detected: ${uniqueMcpVersions.join(', ')}`);
      console.log('   Consider using one aligned @modelcontextprotocol/server release');
    } else {
      console.log('   ✅ MCP runtime packages have consistent versions');
    }
  } else {
    console.log('   ℹ️  No MCP dependencies found');
  }
}

/**
 * Check workspace configuration
 */
console.log('\n🏗️  Checking workspace configuration...');

// Check for workspace indicators
const workspaceIndicators = [
  'pnpm-workspace.yaml',
  'lerna.json',
  'rush.json'
];

let isWorkspace = false;
workspaceIndicators.forEach(indicator => {
  const indicatorPath = path.join(repoRoot, indicator);
  if (fs.existsSync(indicatorPath)) {
    console.log(`   ✅ Workspace configuration found: ${indicator}`);
    isWorkspace = true;
  }
});

if (!isWorkspace) {
  console.log('   ℹ️  No workspace configuration detected (single package project)');
}

/**
 * Validate TypeScript configuration
 */
console.log('\n📝 Checking TypeScript configuration...');
const tsconfigPath = path.join(repoRoot, 'tsconfig.json');

if (fs.existsSync(tsconfigPath)) {
  try {
    const tsconfigContent = fs.readFileSync(tsconfigPath, 'utf8');
    const tsconfig = JSON.parse(tsconfigContent);
    
    console.log('   ✅ tsconfig.json found and valid');
    
    // Check for common TypeScript configurations
    if (tsconfig.compilerOptions?.target) {
      console.log(`   📋 TypeScript target: ${tsconfig.compilerOptions.target}`);
    }
    
    if (tsconfig.compilerOptions?.moduleResolution) {
      console.log(`   📋 Module resolution: ${tsconfig.compilerOptions.moduleResolution}`);
    }
    
  } catch (error) {
    errors.push(`tsconfig.json: ${error.message}`);
  }
} else {
  console.log('   ⚠️  No tsconfig.json found');
}

/**
 * Check CI/CD configuration
 */
console.log('\n🔄 Checking CI/CD configuration...');
const githubWorkflowsPath = path.join(repoRoot, '.github', 'workflows');

if (fs.existsSync(githubWorkflowsPath)) {
  const workflows = fs.readdirSync(githubWorkflowsPath).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  console.log(`   ✅ Found ${workflows.length} GitHub workflow(s):`);
  workflows.forEach(workflow => {
    console.log(`   - ${workflow}`);
  });
} else {
  console.log('   ℹ️  No GitHub workflows found');
}

/**
 * Final result
 */
console.log('\n🎯 Version Consistency Check Results:');
console.log('='.repeat(50));

if (errors.length === 0) {
  console.log('✅ All version consistency checks passed!');
  console.log('\nProject is ready for CI/CD integration.');
  
  if (packageInfo) {
    console.log(`\n📊 Project Summary:`);
    console.log(`   Name: ${packageInfo.name}`);
    console.log(`   Version: ${packageInfo.version}`);
    console.log(`   MCP Dependencies: ${Object.keys(packageInfo.dependencies).filter(name => name.includes('modelcontextprotocol')).length}`);
    console.log(`   Total Dependencies: ${Object.keys(packageInfo.dependencies).length}`);
    console.log(`   Dev Dependencies: ${Object.keys(packageInfo.devDependencies).length}`);
  }
  
  process.exit(0);
} else {
  console.log('❌ Version consistency issues detected:');
  errors.forEach(error => {
    console.log(`   - ${error}`);
  });
  
  console.log('\n💡 Recommendations:');
  console.log('   - Run pnpm install --lockfile-only to update the lockfile');
  console.log('   - Ensure all package.json files have the same version');
  console.log('   - Check for typos in dependency versions');
  
  process.exit(1);
}

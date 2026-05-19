#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const spaRoot = path.join(repoRoot, 'src/web-spa');
const stylesEntry = path.join(spaRoot, 'src/styles.css');
const componentStyleFiles = ['primitives.css', 'workspace.css', 'landing.css'];
const stylesDir = path.join(spaRoot, 'src/styles');

const colorLiteralPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
const invalidMediaVarPattern = /@media[^{]*\bvar\(/;
const tailwindImportPattern = /@import\s+['"]tailwindcss['"]/;
const themePattern = /@theme\b/;
const uiClassesPath = path.join(spaRoot, 'src/lib/ui-classes.ts');
const landingClassesPath = path.join(spaRoot, 'src/lib/landing-classes.ts');
const playgroundClassesPath = path.join(spaRoot, 'src/lib/playground-classes.ts');
const landingLayoutPath = path.join(spaRoot, 'src/components/landing-layout.tsx');
const landingPagePath = path.join(spaRoot, 'src/pages/LandingPage.tsx');
const playgroundPagePath = path.join(spaRoot, 'src/pages/PlaygroundPage.tsx');
const workspaceClassesPath = path.join(spaRoot, 'src/lib/workspace-classes.ts');
const shellClassesPath = path.join(spaRoot, 'src/lib/shell-classes.ts');
const shellPath = path.join(spaRoot, 'src/components/Shell.tsx');
const toastClassesPath = path.join(spaRoot, 'src/lib/toast-classes.ts');
const toastPath = path.join(spaRoot, 'src/components/Toast.tsx');
const workspacePagesDir = path.join(spaRoot, 'src/pages');
const spaDistAssetsDir = path.join(repoRoot, '.spa-dist/assets');
const maxProductionCssBytes = 92 * 1024;

const errors = [];

function readText(filePath) {
  return readFileSync(filePath, 'utf8');
}

function checkPackageJson() {
  const pkg = JSON.parse(readText(path.join(repoRoot, 'package.json')));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!deps.tailwindcss) {
    errors.push('package.json must include tailwindcss (v4).');
  }
  if (!deps['@tailwindcss/vite']) {
    errors.push('package.json must include @tailwindcss/vite for the SPA build.');
  }
}

function checkStylesEntry() {
  const source = readText(stylesEntry);
  if (!tailwindImportPattern.test(source)) {
    errors.push('src/web-spa/src/styles.css must @import "tailwindcss".');
  }
  if (!/@source\b/.test(source)) {
    errors.push('src/web-spa/src/styles.css must declare @source for TSX/HTML scanning.');
  }
  if (!source.includes('./styles/theme.css')) {
    errors.push('src/web-spa/src/styles.css must import styles/theme.css (@theme bridge).');
  }
  if (!source.includes('./styles/tokens.css')) {
    errors.push('src/web-spa/src/styles.css must import styles/tokens.css (design tokens).');
  }
}

const requiredSemanticTokens = [
  '--text-primary',
  '--bg-panel',
  '--bg-glass',
  '--border-default',
  '--action-primary-bg',
  '--status-success-text',
];

const requiredThemeColorUtilities = [
  '--color-foreground',
  '--color-muted',
  '--color-faint',
  '--color-panel',
  '--color-border',
  '--color-status-success',
];

const legacyTokenDefinitionPatterns = [
  /\n  --ink:/,
  /\n  --ink-muted:/,
  /\n  --line:/,
  /\n  --card:/,
  /\n  --bg-soft:/,
  /\n  --bg:/,
  /\n  --text-subtle:/,
];

const legacyThemeUtilityPatterns = [
  /--color-ink\b/,
  /--color-ink-muted\b/,
  /--color-line\b/,
  /--color-card\b/,
  /--color-bg-soft\b/,
  /--color-bg\b/,
  /--color-subtle\b/,
  /--color-text-primary\b/,
];

const legacyRecipeUtilityPattern =
  /(?<![-\w])(text-ink|text-ink-muted|text-subtle|text-text-primary|text-text-secondary|text-text-tertiary|bg-card|bg-bg-soft|bg-bg|border-line|border-border-default|border-l-ink|bg-ink-muted)(?![-\w])/;

const legacyRecipeVarPattern =
  /var\(--(ink|ink-muted|line|bg-soft|text-subtle)\)|var\(--card\)(?![-a-zA-Z0-9])|var\(--bg\)(?![-a-zA-Z0-9])/;

const requiredThemeTypeUtilities = ['--text-ui-sm', '--text-ui-lg', '--text-ui-xl'];

const opaqueRecipeModules = [uiClassesPath, workspaceClassesPath, playgroundClassesPath];

const deprecatedOpaqueSurfacePatterns = [
  /bg-\[color:var\(--surface-bg\)\]/,
  /bg-\[color:var\(--card\)\]/,
];

function checkSemanticTokens() {
  const tokensPath = path.join(stylesDir, 'tokens.css');
  const source = readText(tokensPath);
  for (const token of requiredSemanticTokens) {
    if (!source.includes(`${token}:`)) {
      errors.push(`tokens.css must define semantic token ${token}.`);
    }
  }
  for (const pattern of legacyTokenDefinitionPatterns) {
    if (pattern.test(source)) {
      errors.push(
        'tokens.css must not define legacy tokens (--ink, --card, --line, --bg); use semantic names.',
      );
      break;
    }
  }
}

function checkThemeBridge() {
  const themePath = path.join(stylesDir, 'theme.css');
  const source = readText(themePath);
  if (!themePattern.test(source)) {
    errors.push('src/web-spa/src/styles/theme.css must define @theme (Tailwind v4).');
  }
  if (!/@custom-variant\s+dark\b/.test(source)) {
    errors.push(
      'src/web-spa/src/styles/theme.css must define @custom-variant dark for data-theme.',
    );
  }
  for (const utility of requiredThemeColorUtilities) {
    if (!source.includes(utility)) {
      errors.push(`theme.css @theme must map ${utility} from semantic tokens.`);
    }
  }
  for (const utility of requiredThemeTypeUtilities) {
    if (!source.includes(utility)) {
      errors.push(`theme.css @theme must map ${utility} for text-ui-* utilities.`);
    }
  }
  for (const pattern of legacyThemeUtilityPatterns) {
    if (pattern.test(source)) {
      errors.push('theme.css must not map legacy utilities (--color-ink, --color-card, …).');
      break;
    }
  }
}

function checkRecipeModernUtilities() {
  const recipeModules = [
    uiClassesPath,
    workspaceClassesPath,
    playgroundClassesPath,
    shellClassesPath,
    toastClassesPath,
    landingClassesPath,
  ];
  for (const filePath of recipeModules) {
    const source = readText(filePath);
    const rel = path.relative(repoRoot, filePath);
    if (legacyRecipeUtilityPattern.test(source)) {
      errors.push(
        `${rel} uses legacy Tailwind utilities; prefer text-foreground, bg-panel, border-border, text-muted, text-faint.`,
      );
    }
    if (legacyRecipeVarPattern.test(source)) {
      errors.push(
        `${rel} references legacy CSS variables; use --text-primary, --bg-panel, --border-default, etc.`,
      );
    }
  }
}

function checkOpaqueRecipeSurfaces() {
  for (const filePath of opaqueRecipeModules) {
    const source = readText(filePath);
    const rel = path.relative(repoRoot, filePath);
    for (const pattern of deprecatedOpaqueSurfacePatterns) {
      if (pattern.test(source)) {
        errors.push(
          `${rel} must use bg-panel for readable surfaces, not translucent --surface-bg or legacy --card arbitrary.`,
        );
      }
    }
  }
  const tokensSource = readText(path.join(stylesDir, 'tokens.css'));
  if (!/--shell-topbar-bg:\s*var\(--bg-glass\)/.test(tokensSource)) {
    errors.push('tokens.css must set --shell-topbar-bg to var(--bg-glass).');
  }
}

function checkRecipeTokenNamespaces() {
  const workspaceSource = readText(workspaceClassesPath);
  const playgroundSource = readText(playgroundClassesPath);
  const landingTokenPattern = /var\(--landing-/;
  if (landingTokenPattern.test(workspaceSource)) {
    errors.push(
      'workspace-classes.ts must not use --landing-* tokens; use semantic or workspace tokens.',
    );
  }
  if (landingTokenPattern.test(playgroundSource)) {
    errors.push(
      'playground-classes.ts must not use --landing-* tokens; use semantic or workspace tokens.',
    );
  }
}

function checkStylesheet(filePath) {
  const source = readText(filePath);
  const rel = path.relative(repoRoot, filePath);
  if (colorLiteralPattern.test(source)) {
    errors.push(`${rel} contains raw color literals; use tokens.css.`);
  }
  if (invalidMediaVarPattern.test(source)) {
    errors.push(
      `${rel} uses var() inside @media; use a literal breakpoint (see --breakpoint-modal / --size-modal-max).`,
    );
  }
  if (rel.endsWith('workspace.css') && /@media\b/.test(source)) {
    errors.push(
      `${rel} must not use @media; compose responsive layout via shell-classes.ts / ui-classes.ts / workspace-classes.ts.`,
    );
  }
  if (rel.endsWith('landing.css') && /@media\b/.test(source)) {
    errors.push(
      `${rel} must not use @media; compose responsive layout via landing-classes.ts and landing-layout.tsx.`,
    );
  }
  if (rel.endsWith('primitives.css')) {
    const legacyComponentPattern =
      /\.(menu|brand-link|nav-card-link|page-hero|chip|btn-compact|btn-tiny|password-checks|token-box|surface-grid|surface-list)\b/;
    if (legacyComponentPattern.test(source)) {
      errors.push(
        `${rel} must not define legacy component classes; use ui-classes.ts / shell-classes.ts / playground-classes.ts.`,
      );
    }
  }
}

function checkComponentStylesheets() {
  for (const fileName of componentStyleFiles) {
    checkStylesheet(path.join(stylesDir, fileName));
  }
  for (const entry of readdirSync(stylesDir)) {
    if (!entry.endsWith('.css') || entry === 'tokens.css' || entry === 'theme.css') {
      continue;
    }
    const filePath = path.join(stylesDir, entry);
    if (componentStyleFiles.includes(entry)) {
      continue;
    }
    checkStylesheet(filePath);
  }
}

function checkUiClassesModule() {
  const source = readText(uiClassesPath);
  if (!source.includes('export function buttonClassName')) {
    errors.push('src/web-spa/src/lib/ui-classes.ts must export buttonClassName().');
  }
  if (!source.includes('export const textLinkClass')) {
    errors.push('src/web-spa/src/lib/ui-classes.ts must export textLinkClass.');
  }
  if (!source.includes('export function navCardLinkClassName')) {
    errors.push('src/web-spa/src/lib/ui-classes.ts must export navCardLinkClassName().');
  }
  if (!source.includes('export const metaNoteDetailClass')) {
    errors.push('src/web-spa/src/lib/ui-classes.ts must export metaNoteDetailClass.');
  }
  if (!source.includes('export const inlineGroupRowClass')) {
    errors.push('src/web-spa/src/lib/ui-classes.ts must export inlineGroupRowClass.');
  }
  if (!source.includes('export const monoClass')) {
    errors.push('src/web-spa/src/lib/ui-classes.ts must export monoClass.');
  }
}

function checkUiTsx() {
  const uiPath = path.join(spaRoot, 'src/components/ui.tsx');
  const source = readText(uiPath);
  if (!source.includes("from '../lib/ui-classes'")) {
    errors.push('src/web-spa/src/components/ui.tsx must import class recipes from ui-classes.ts.');
  }
  if (/className=\{`btn /.test(source) || /className=\{`status /.test(source)) {
    errors.push(
      'src/web-spa/src/components/ui.tsx must compose classes via ui-classes.ts helpers, not template literals.',
    );
  }
}

function walkTsx(dir, visitor) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === 'node_modules') {
        continue;
      }
      walkTsx(fullPath, visitor);
      continue;
    }
    if (entry.endsWith('.tsx')) {
      visitor(fullPath);
    }
  }
}

function checkTsx() {
  const inlineStylePattern = /style=\{\{/;
  walkTsx(path.join(spaRoot, 'src'), (filePath) => {
    const source = readText(filePath);
    const rel = path.relative(repoRoot, filePath);
    if (inlineStylePattern.test(source)) {
      errors.push(`${rel} uses inline style={{}}; prefer Tailwind utilities or component classes.`);
    }
  });
}

function checkViteConfig() {
  const source = readText(path.join(spaRoot, 'vite.config.ts'));
  if (!source.includes('@tailwindcss/vite')) {
    errors.push('src/web-spa/vite.config.ts must register @tailwindcss/vite.');
  }
}

function checkDesignDoc() {
  const source = readText(path.join(spaRoot, 'DESIGN.md'));
  if (!/tailwind.*v4/i.test(source)) {
    errors.push('src/web-spa/DESIGN.md must document the Tailwind v4 setup.');
  }
  if (!source.includes('landing-classes.ts')) {
    errors.push('src/web-spa/DESIGN.md must document landing-classes.ts.');
  }
  if (!source.includes('playground-classes.ts')) {
    errors.push('src/web-spa/DESIGN.md must document playground-classes.ts.');
  }
  if (!source.includes('shell-classes.ts')) {
    errors.push('src/web-spa/DESIGN.md must document shell-classes.ts.');
  }
  if (!source.includes('toast-classes.ts')) {
    errors.push('src/web-spa/DESIGN.md must document toast-classes.ts.');
  }
}

function checkLandingClassesModule() {
  checkLandingClassesExports();
  const layout = readText(landingLayoutPath);
  if (!layout.includes("from '../lib/landing-classes'")) {
    errors.push('src/web-spa/src/components/landing-layout.tsx must import landing-classes.ts.');
  }
  const page = readText(landingPagePath);
  if (!page.includes("from '../components/landing-layout'")) {
    errors.push(
      'src/web-spa/src/pages/LandingPage.tsx must compose layout via landing-layout.tsx.',
    );
  }
  if (/className="landing-(page|container|header|hero-grid|feature-grid)"/.test(page)) {
    errors.push(
      'LandingPage.tsx must not use raw landing layout class strings; use landing-layout.tsx wrappers.',
    );
  }
  if (/className="landing-/.test(page)) {
    errors.push('LandingPage.tsx must use landing-classes.ts recipes, not string literals.');
  }
  if (/className=\{`[^`]*landing-/.test(page)) {
    errors.push('LandingPage.tsx must not template literal landing-* class strings.');
  }
  if (!page.includes("from '../lib/landing-classes'")) {
    errors.push(
      'src/web-spa/src/pages/LandingPage.tsx must import class recipes from landing-classes.ts.',
    );
  }
}

function checkClassRecipeModule(filePath, label, requiredExports) {
  const source = readText(filePath);
  for (const exportName of requiredExports) {
    if (!source.includes(exportName)) {
      errors.push(`${path.relative(repoRoot, filePath)} must export ${exportName}.`);
    }
  }
  if (!source.includes("from './cn'")) {
    errors.push(`${path.relative(repoRoot, filePath)} must compose classes with cn() from ./cn.`);
  }
}

function checkWorkspaceClassesModule() {
  checkClassRecipeModule(workspaceClassesPath, 'workspace-classes', [
    'export const stackClass',
    'export const twoColClass',
    "'stack",
    "'two-col",
  ]);
  walkTsx(workspacePagesDir, (filePath) => {
    if (path.basename(filePath) === 'LandingPage.tsx') {
      return;
    }
    const source = readText(filePath);
    const rel = path.relative(repoRoot, filePath);
    if (
      /className="(stack|two-col|two-up-grid|page-card-grid|ordered|table-scroll|table|turnstile-wrap|page-status-banner|muted|mono)"/.test(
        source,
      )
    ) {
      errors.push(
        `${rel} must compose workspace layout classes via workspace-classes.ts / ui-classes, not string literals.`,
      );
    }
    if (/descriptionClassName:\s*'mono'/.test(source)) {
      errors.push(`${rel} must use monoClass from ui-classes.ts for monospace detail text.`);
    }
    if (/descriptionClassName:\s*'row'/.test(source)) {
      errors.push(
        `${rel} must use inlineGroupRowClass from ui-classes.ts for flex row detail text.`,
      );
    }
    if (
      source.includes('className={mutedCopyClass}') &&
      !source.includes("from '../lib/ui-classes'")
    ) {
      errors.push(`${rel} uses mutedCopyClass but does not import ui-classes.ts.`);
    }
    if (
      /className="(stack|two-col|two-up-grid|page-card-grid)"/.test(source) &&
      !source.includes("from '../lib/workspace-classes'")
    ) {
      errors.push(`${rel} uses workspace layout classes but does not import workspace-classes.ts.`);
    }
  });
  const errorBoundaryPath = path.join(spaRoot, 'src/components/ErrorBoundary.tsx');
  const errorBoundary = readText(errorBoundaryPath);
  if (errorBoundary.includes('className="stack"')) {
    errors.push('ErrorBoundary.tsx must use stackClass from workspace-classes.ts.');
  }
}

function checkPlaygroundClassesModule() {
  checkClassRecipeModule(playgroundClassesPath, 'playground-classes', [
    'export const chatStreamClass',
    'export function transcriptEntryClassName',
    'export function protocolEntryClassName',
    'export function asyncJobItemClassName',
    "'chat-stream",
    "'protocol-entry",
    "'async-job-item",
  ]);
  const page = readText(playgroundPagePath);
  if (!page.includes("from '../lib/playground-classes'")) {
    errors.push(
      'src/web-spa/src/pages/PlaygroundPage.tsx must import class recipes from playground-classes.ts.',
    );
  }
  if (
    /className="(chat-|transcript-entry|comparison-grid|playground-mode-summary|protocol-|tool-catalog-|recent-prompts|async-job-|md-heading|grid-compact|tabs|hint |mono|meta-note-detail)/.test(
      page,
    )
  ) {
    errors.push(
      'PlaygroundPage.tsx must compose playground/ui class recipes, not string literals.',
    );
  }
  if (
    page.includes('className={metaNoteDetailClass}') &&
    !page.includes("from '../lib/ui-classes'")
  ) {
    errors.push('PlaygroundPage.tsx uses metaNoteDetailClass but does not import ui-classes.ts.');
  }
}

function checkToastClassesModule() {
  checkClassRecipeModule(toastClassesPath, 'toast-classes', [
    'export const toastContainerClass',
    'export function toastClassName',
    "'toast-container",
    "'toast-ok",
  ]);
  const toast = readText(toastPath);
  if (!toast.includes("from '../lib/toast-classes'")) {
    errors.push(
      'src/web-spa/src/components/Toast.tsx must import class recipes from toast-classes.ts.',
    );
  }
  if (/className="(toast-container|toast-dismiss|toast toast-)/.test(toast)) {
    errors.push('Toast.tsx must compose toast classes via toast-classes.ts, not string literals.');
  }
}

function checkShellClassesModule() {
  checkClassRecipeModule(shellClassesPath, 'shell-classes', [
    'export const workspaceShellClass',
    'export function workspaceSidebarClassName',
    'export const toolbarButtonClass',
    'export const toolbarUtilityButtonClass',
    'export const navCardLinkMetaClass',
    "'workspace-shell",
    "'workspace-topbar",
    "'toolbar-button",
    "'nav-card-link",
  ]);
  const shell = readText(shellPath);
  if (!shell.includes("from '../lib/shell-classes'")) {
    errors.push(
      'src/web-spa/src/components/Shell.tsx must import class recipes from shell-classes.ts.',
    );
  }
  if (/className="sidebar-secondary-link/.test(shell)) {
    errors.push('Shell.tsx must use sidebarSecondaryNavLinkClassName() from shell-classes.ts.');
  }
  if (
    /className="(workspace-shell|workspace-main-layout|workspace-sidebar|workspace-topbar|shell-main-column|account-menu|topbar-context)/.test(
      shell,
    )
  ) {
    errors.push(
      'Shell.tsx must compose shell layout classes via shell-classes.ts, not string literals.',
    );
  }
}

function checkLandingClassesExports() {
  checkClassRecipeModule(landingClassesPath, 'landing-classes', [
    'export const landingPageClass',
    'export const landingFeatureGridClass',
    'export const landingFeatureCardClass',
    'export const landingFooterStackClass',
    'export function landingTabButtonClassName',
    "'landing-page",
    "'landing-feature-grid",
    'landing-feature-card',
  ]);
}

function checkProductionCssBudget() {
  try {
    execFileSync('pnpm', ['exec', 'vite', 'build', '--config', 'src/web-spa/vite.config.ts'], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
  } catch {
    errors.push('Production CSS budget check failed: SPA build did not complete.');
    return;
  }
  let cssBytes = 0;
  for (const fileName of readdirSync(spaDistAssetsDir)) {
    if (!fileName.endsWith('.css')) {
      continue;
    }
    cssBytes += statSync(path.join(spaDistAssetsDir, fileName)).size;
  }
  if (cssBytes === 0) {
    errors.push('Production CSS budget check failed: no CSS assets in .spa-dist/assets.');
    return;
  }
  if (cssBytes > maxProductionCssBytes) {
    const kb = (cssBytes / 1024).toFixed(1);
    const maxKb = (maxProductionCssBytes / 1024).toFixed(0);
    errors.push(
      `Production CSS bundle is ${kb} kB (limit ${maxKb} kB). Trim primitives.css or move rules into class recipes.`,
    );
  }
}

checkPackageJson();
checkStylesEntry();
checkSemanticTokens();
checkThemeBridge();
checkRecipeTokenNamespaces();
checkRecipeModernUtilities();
checkOpaqueRecipeSurfaces();
checkComponentStylesheets();
checkUiClassesModule();
checkUiTsx();
checkLandingClassesModule();
checkWorkspaceClassesModule();
checkShellClassesModule();
checkToastClassesModule();
checkPlaygroundClassesModule();
checkTsx();
checkViteConfig();
checkDesignDoc();
if (process.env.DESIGN_SYSTEM_SKIP_PRODUCTION_BUILD !== '1') {
  checkProductionCssBudget();
}

if (errors.length === 0) {
  process.stdout.write('Design system check passed (Tailwind v4 + token bridge).\n');
  process.exit(0);
}

process.stderr.write('Design system check failed:\n');
for (const error of errors) {
  process.stderr.write(`- ${error}\n`);
}
process.exit(1);

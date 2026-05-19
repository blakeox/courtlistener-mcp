#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const spaRoot = path.join(repoRoot, 'src/web-spa');
const spaSrc = path.join(spaRoot, 'src');
const indexHtml = path.join(spaRoot, 'index.html');
const primitivesCss = path.join(spaRoot, 'src/styles/primitives.css');
const tokensCss = path.join(spaRoot, 'src/styles/tokens.css');
const designDoc = path.join(spaRoot, 'DESIGN.md');
const shellPath = path.join(spaSrc, 'components/Shell.tsx');
const landingPagePath = path.join(spaSrc, 'pages/LandingPage.tsx');
const uiPath = path.join(spaSrc, 'components/ui.tsx');
const documentTitleHook = path.join(spaSrc, 'hooks/useDocumentTitle.ts');

const workspacePages = [
  'WorkspaceDashboardPage.tsx',
  'PlaygroundPage.tsx',
  'AccountPage.tsx',
  'UsagePage.tsx',
  'ObservabilityPage.tsx',
  'OnboardingPage.tsx',
  'HostedAuthRedirectPage.tsx',
];

const errors = [];

function readText(filePath) {
  return readFileSync(filePath, 'utf8');
}

function rel(filePath) {
  return path.relative(repoRoot, filePath);
}

/** Slice from a JSX element open through its close (or self-close) for attribute checks. */
function jsxElementSlice(source, startIndex, tagName) {
  const selfClose = source.indexOf('/>', startIndex);
  const closeTag = `</${tagName}>`;
  const close = source.indexOf(closeTag, startIndex);
  let end = startIndex + 1200;
  if (selfClose !== -1) {
    end = Math.min(end, selfClose + 2);
  }
  if (close !== -1) {
    end = Math.min(end, close);
  }
  return source.slice(startIndex, end);
}

function walkTsx(dir, visitor) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') {
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

function checkIndexHtml() {
  const source = readText(indexHtml);
  if (!/<html\s+lang="en"/i.test(source)) {
    errors.push(`${rel(indexHtml)} must set lang="en" on <html>.`);
  }
  if (!/<meta\s+name="viewport"/i.test(source)) {
    errors.push(`${rel(indexHtml)} must include a viewport meta tag.`);
  }
}

function checkFocusAndMotion() {
  const primitives = readText(primitivesCss);
  if (!/button:focus-visible/.test(primitives) || !/a:focus-visible/.test(primitives)) {
    errors.push(`${rel(primitivesCss)} must define :focus-visible outlines for buttons and links.`);
  }
  if (!/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/.test(primitives)) {
    errors.push(
      `${rel(primitivesCss)} must gate motion/animation under prefers-reduced-motion: reduce.`,
    );
  }
  const tokens = readText(tokensCss);
  if (!/--shell-focus-ring/.test(tokens) || !/--size-focus-ring/.test(tokens)) {
    errors.push(`${rel(tokensCss)} must define focus ring tokens for keyboard visibility.`);
  }
  if (!/--placeholder-text/.test(tokens)) {
    errors.push(`${rel(tokensCss)} must define --placeholder-text for form placeholders.`);
  }
}

function checkSkipLinksAndLandmarks() {
  const shell = readText(shellPath);
  if (!shell.includes('<SkipLink')) {
    errors.push(`${rel(shellPath)} must render a SkipLink before workspace chrome.`);
  }
  if (!shell.includes('id="main-content"')) {
    errors.push(`${rel(shellPath)} must expose <main id="main-content"> for skip targets.`);
  }

  const landing = readText(landingPagePath);
  if (!landing.includes('<SkipLink')) {
    errors.push(`${rel(landingPagePath)} must render a SkipLink before marketing chrome.`);
  }
  if (!/<main\s+id="landing-main"/.test(landing)) {
    errors.push(`${rel(landingPagePath)} must expose <main id="landing-main">.`);
  }
}

function checkDocumentTitles() {
  for (const pageName of workspacePages) {
    const pagePath = path.join(spaSrc, 'pages', pageName);
    const source = readText(pagePath);
    if (!source.includes('useDocumentTitle(')) {
      errors.push(`${rel(pagePath)} must call useDocumentTitle() for route-specific page titles.`);
    }
  }
  if (!readText(documentTitleHook).includes('CourtListener MCP')) {
    errors.push(`${rel(documentTitleHook)} must preserve the portal title suffix.`);
  }
}

function checkIconButtons() {
  walkTsx(spaSrc, (filePath) => {
    if (filePath.includes(`${path.sep}__tests__${path.sep}`)) {
      return;
    }
    const source = readText(filePath);
    const relPath = rel(filePath);
    let index = source.indexOf('<IconButton');
    while (index !== -1) {
      const slice = jsxElementSlice(source, index, 'IconButton');
      if (!/\baria-label=/.test(slice) && !/\baria-labelledby=/.test(slice)) {
        errors.push(
          `${relPath} renders <IconButton> without aria-label or aria-labelledby (${slice.slice(0, 96)}…).`,
        );
      }
      index = source.indexOf('<IconButton', index + 1);
    }
  });
}

function checkDecorativeSvgs() {
  walkTsx(path.join(spaSrc, 'pages'), (filePath) => {
    const source = readText(filePath);
    const relPath = rel(filePath);
    let index = source.indexOf('<svg');
    while (index !== -1) {
      const slice = jsxElementSlice(source, index, 'svg');
      if (
        !/\baria-hidden=/.test(slice) &&
        !/\brole=["']img["']/.test(slice) &&
        !/\baria-label=/.test(slice) &&
        !/\baria-labelledby=/.test(slice) &&
        !/<title[\s>]/.test(slice)
      ) {
        errors.push(
          `${relPath} includes inline <svg> without aria-hidden or an accessible name (${slice.slice(0, 96)}…).`,
        );
      }
      index = source.indexOf('<svg', index + 1);
    }
  });
}

function checkFormControlsInPages() {
  walkTsx(path.join(spaSrc, 'pages'), (filePath) => {
    const source = readText(filePath);
    const relPath = rel(filePath);
    for (const component of ['Input', 'Textarea', 'Select']) {
      const open = `<${component}`;
      let index = source.indexOf(open);
      while (index !== -1) {
        const slice = jsxElementSlice(source, index, component);
        if (!/\bid=/.test(slice)) {
          errors.push(`${relPath} uses <${component}> without an id for label association.`);
        }
        index = source.indexOf(open, index + 1);
      }
    }
  });
}

function checkAsideLandmarks() {
  walkTsx(spaSrc, (filePath) => {
    if (filePath.includes(`${path.sep}__tests__${path.sep}`)) {
      return;
    }
    const source = readText(filePath);
    const relPath = rel(filePath);
    let index = source.indexOf('<aside');
    while (index !== -1) {
      const slice = jsxElementSlice(source, index, 'aside');
      if (!/\baria-label=/.test(slice) && !/\baria-labelledby=/.test(slice)) {
        errors.push(
          `${relPath} renders <aside> without aria-label or aria-labelledby (${slice.slice(0, 96)}…).`,
        );
      }
      index = source.indexOf('<aside', index + 1);
    }
  });
}

function checkUiPrimitives() {
  const ui = readText(uiPath);
  if (!ui.includes('export function SkipLink')) {
    errors.push(`${rel(uiPath)} must export SkipLink.`);
  }
  if (!ui.includes('export function FormField')) {
    errors.push(`${rel(uiPath)} must export FormField for labeled controls.`);
  }
  if (!ui.includes('role="tab"')) {
    errors.push(`${rel(uiPath)} TabButton must expose role="tab" semantics.`);
  }
}

function checkDesignDoc() {
  const source = readText(designDoc);
  if (!/accessibility|a11y|WCAG/i.test(source)) {
    errors.push(`${rel(designDoc)} must document accessibility expectations and audit commands.`);
  }
}

checkIndexHtml();
checkFocusAndMotion();
checkSkipLinksAndLandmarks();
checkDocumentTitles();
checkIconButtons();
checkAsideLandmarks();
checkDecorativeSvgs();
checkFormControlsInPages();
checkUiPrimitives();
checkDesignDoc();

if (errors.length === 0) {
  process.stdout.write('Accessibility check passed (WCAG-oriented static rules).\n');
  process.exit(0);
}

process.stderr.write('Accessibility check failed:\n');
for (const error of errors) {
  process.stderr.write(`- ${error}\n`);
}
process.exit(1);

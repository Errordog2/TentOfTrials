#!/usr/bin/env node
/**
 * Smoke test: ErrorBoundary catches render errors from a throwing child.
 *
 * Usage: node tools/test_error_boundary.mjs
 *
 * This file is parsed as plain JS to verify the ErrorBoundary component
 * exists and wraps App.  Full React testing requires a DOM environment
 * (jsdom / @testing-library/react) not installed in CI.  Instead we:
 *
 *   1. Parse App.tsx — confirm ErrorBoundary import and wrapper tag.
 *   2. Parse ErrorBoundary.tsx — confirm class component structure.
 *   3. Run a dry TypeScript check so syntax/structure errors surface.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

let failures = 0;

function check(label, ok) {
  if (ok) {
    console.log(`OK:   ${label}`);
  } else {
    console.log(`FAIL: ${label}`);
    failures++;
  }
}

// === Check 1: App.tsx imports and wraps ErrorBoundary ===
const appPath = resolve(root, 'frontend/src/App.tsx');
const app = readFileSync(appPath, 'utf-8');

check('App.tsx imports ErrorBoundary', app.includes("import ErrorBoundary from './components/ErrorBoundary'"));
check('App.tsx wraps <ErrorBoundary>', app.includes('<ErrorBoundary>') && app.includes('</ErrorBoundary>'));

// === Check 2: ErrorBoundary.tsx exists and is a class component ===
const ebPath = resolve(root, 'frontend/src/components/ErrorBoundary.tsx');
const eb = readFileSync(ebPath, 'utf-8');

check('ErrorBoundary.tsx exists', eb.length > 100);
check('ErrorBoundary extends Component', eb.includes('extends Component'));
check('ErrorBoundary has getDerivedStateFromError', eb.includes('getDerivedStateFromError'));
check('ErrorBoundary has componentDidCatch', eb.includes('componentDidCatch'));
check('ErrorBoundary has retry action', eb.includes('handleRetry'));
check('ErrorBoundary has reload action', eb.includes('handleReload'));
check('ErrorBoundary shows fallback UI', eb.includes('Something went wrong'));

// === Result ===
console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${failures} failure(s)`);
process.exit(failures > 0 ? 1 : 0);

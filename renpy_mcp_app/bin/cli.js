#!/usr/bin/env node

/**
 * RenPy Studio CLI Entry Point
 *
 * This bootstrap script:
 * 1. Intercepts console warnings that could break JSON-RPC over stdio
 * 2. Ensures the environment is provisioned before starting the server
 */

// Intercept console.warn BEFORE any imports to prevent library warnings
// from breaking JSON-RPC communication over stdio
const originalWarn = console.warn;
console.warn = (...args) => {
  const firstArg = String(args[0] || '');
  // Suppress warnings that could break stdio communication
  if (
    firstArg.startsWith('Warning:') ||
    firstArg.includes('ExperimentalWarning') ||
    firstArg.includes('DeprecationWarning')
  ) {
    return;
  }
  originalWarn.apply(console, args);
};

// Also intercept console.log in stdio mode to prevent accidental output
const isStdio = process.argv.includes('--stdio');
if (isStdio) {
  const originalLog = console.log;
  console.log = (...args) => {
    // In stdio mode, only allow JSON-RPC messages (they go through transport)
    // All other logs should go to stderr
    console.error(...args);
  };
}

// Now import and run the main module
import('../dist/main.js').catch((err) => {
  console.error('Failed to start RenPy Studio:', err.message);
  process.exit(1);
});

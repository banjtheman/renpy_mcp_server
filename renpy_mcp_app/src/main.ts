/**
 * RenPy Studio - Main Server Entry Point
 *
 * Supports two transport modes:
 * - HTTP: For testing with basic-host
 * - Stdio: For Claude Desktop integration
 */

import { ensureEnvironment, isProvisioned, DATA_DIR } from './provision/index.js';
import { createServer } from './index.js';
import { cleanupPreviewServers } from './server/tools/build-tools.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import type { Request, Response } from 'express';
import cors from 'cors';

const PORT = parseInt(process.env.PORT || '3001', 10);
const isStdio = process.argv.includes('--stdio');

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Step 1: Ensure environment is provisioned
  console.error('RenPy Studio starting...');

  const result = await ensureEnvironment({
    onProgress: (msg) => console.error(msg),
  });

  if (!result.success) {
    console.error('\n' + result.error);
    process.exit(1);
  }

  // Step 2: Start server in appropriate mode
  if (isStdio) {
    await startStdioServer();
  } else {
    await startHTTPServer();
  }
}

/**
 * Start stdio server for Claude Desktop
 */
async function startStdioServer(): Promise<void> {
  console.error('Starting stdio server...');

  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error('RenPy Studio connected via stdio');

  // Keep process alive
  process.on('SIGINT', async () => {
    console.error('Shutting down...');
    await cleanupPreviewServers();
    process.exit(0);
  });
}

/**
 * Start HTTP server for testing
 */
async function startHTTPServer(): Promise<void> {
  // Use MCP Express app (handles body parsing correctly for MCP)
  const app = createMcpExpressApp({ host: '0.0.0.0' });

  // CORS middleware
  app.use(cors());

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      name: 'renpy-studio',
      version: '1.0.0',
      provisioned: isProvisioned(),
      dataDir: DATA_DIR,
    });
  });

  // MCP endpoint - create new server instance per request (stateless)
  app.all('/mcp', async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
    });

    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // Start server
  const httpServer = app.listen(PORT, () => {
    console.error(`RenPy Studio v1.0.0`);
    console.error(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.error(`Health check: http://localhost:${PORT}/health`);
  });

  let isShuttingDown = false;

  const shutdown = async () => {
    if (isShuttingDown) {
      // Force exit on second signal
      console.error('Force exiting...');
      process.exit(1);
    }
    isShuttingDown = true;
    console.error('\nShutting down...');

    // Cleanup preview servers first
    await cleanupPreviewServers();

    // Force exit after 3 seconds if server doesn't close gracefully
    const forceExitTimer = setTimeout(() => {
      console.error('Force exiting (timeout)...');
      process.exit(0);
    }, 3000);

    httpServer.close(() => {
      clearTimeout(forceExitTimer);
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

/**
 * Build and preview tools - Silent tools for model, App tools for UI
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

import { WORKSPACE_DIR } from '../../provision/index.js';
import { runPythonScript } from '../python-runner.js';

// Track active preview servers
const previewServers = new Map<string, { pid: number; port: number }>();

/**
 * Cleanup all running preview servers
 * Call this on process shutdown to avoid orphaned processes
 */
export async function cleanupPreviewServers(): Promise<void> {
  console.error(`[Build Tools] Cleaning up ${previewServers.size} preview servers...`);

  for (const [projectName, serverInfo] of previewServers.entries()) {
    try {
      process.kill(serverInfo.pid, 'SIGTERM');
      console.error(`[Build Tools] Killed preview server for ${projectName} (PID: ${serverInfo.pid})`);
    } catch (e) {
      // Process may already be dead
    }
  }

  previewServers.clear();
}

/**
 * Register build and preview tools
 */
export function registerBuildTools(
  server: McpServer,
  resourceUri: string
): void {
  // Build project to web - Silent tool (model-facing)
  server.tool(
    'build_project',
    "Compile the project to a playable web game using Ren'Py. " +
      'This copies assets to the game folder and creates a web build.\n\n' +
      'WORKFLOW: After build succeeds, call start_preview to start the game server, ' +
      'then call view_studio with initialView="preview" and projectName to let the user ' +
      'play their game directly in the embedded UI player.',
    {
      projectName: z.string().min(1).describe('Name of the project'),
      forceRebuild: z.boolean().optional().default(false).describe('Force clean rebuild'),
    },
    async (args: { projectName: string; forceRebuild?: boolean }) => {
      try {
        const result = await runPythonScript('build_manager.py', [
          '--project', args.projectName,
          ...(args.forceRebuild ? ['--force'] : []),
        ]);

        return {
          content: [
            {
              type: 'text',
              text: result.success
                ? `Build successful! Output: ${result.outputPath}`
                : `Build failed: ${result.error}`,
            },
          ],
          structuredContent: result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Build failed: ${message}`,
            },
          ],
        };
      }
    }
  );

  // Start preview server - Silent tool (model-facing)
  server.tool(
    'start_preview',
    'Start a local HTTP server to preview the built web game.\n\n' +
      'IMPORTANT: After starting the preview, call view_studio with initialView="preview" ' +
      'and projectName to let the user play the game INSIDE the studio UI. ' +
      'Users do NOT need to open external browser links - the game plays in an embedded iframe.',
    {
      projectName: z.string().min(1).describe('Name of the project'),
    },
    async (args: { projectName: string }) => {
      // Python preview_manager handles path resolution
      try {
        const result = await runPythonScript('preview_manager.py', [
          '--project', args.projectName,
          '--action', 'start',
        ]);

        if (result.port) {
          previewServers.set(args.projectName, {
            pid: result.pid,
            port: result.port,
          });
        }

        return {
          content: [
            {
              type: 'text',
              text: `Preview server started at ${result.url}`,
            },
          ],
          structuredContent: result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to start preview: ${message}`,
            },
          ],
        };
      }
    }
  );

  // Alias for start_preview to match Python API naming
  server.tool(
    'start_web_preview',
    'Serve the generated web build from a local HTTP server.\n\n' +
      'IMPORTANT: After starting the preview, call view_studio with initialView="preview" ' +
      'and projectName to let the user play the game INSIDE the studio UI.',
    {
      projectName: z.string().min(1).describe('Name of the project'),
    },
    async (args: { projectName: string }) => {
      // Python preview_manager handles path resolution
      try {
        const result = await runPythonScript('preview_manager.py', [
          '--project', args.projectName,
          '--action', 'start',
        ]);

        if (result.port) {
          previewServers.set(args.projectName, {
            pid: result.pid,
            port: result.port,
          });
        }

        return {
          content: [
            {
              type: 'text',
              text: `Preview server started at ${result.url}`,
            },
          ],
          structuredContent: result,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to start preview: ${message}`,
            },
          ],
        };
      }
    }
  );

  // Stop preview server - Silent tool (model-facing)
  server.tool(
    'stop_preview',
    'Stop the preview server for a project.',
    {
      projectName: z.string().min(1).describe('Name of the project'),
    },
    async (args: { projectName: string }) => {
      const serverInfo = previewServers.get(args.projectName);

      if (!serverInfo) {
        return {
          content: [
            {
              type: 'text',
              text: `No preview server running for "${args.projectName}".`,
            },
          ],
        };
      }

      try {
        await runPythonScript('preview_manager.py', [
          '--project', args.projectName,
          '--action', 'stop',
          '--pid', String(serverInfo.pid),
        ]);

        previewServers.delete(args.projectName);

        return {
          content: [
            {
              type: 'text',
              text: `Preview server stopped for "${args.projectName}".`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to stop preview: ${message}`,
            },
          ],
        };
      }
    }
  );

  // Alias for stop_preview to match Python API naming
  server.tool(
    'stop_web_preview',
    'Stop the local preview server.',
    {
      projectName: z.string().min(1).describe('Name of the project'),
    },
    async (args: { projectName: string }) => {
      const serverInfo = previewServers.get(args.projectName);

      if (!serverInfo) {
        return {
          content: [
            {
              type: 'text',
              text: `No preview server running for "${args.projectName}".`,
            },
          ],
        };
      }

      try {
        await runPythonScript('preview_manager.py', [
          '--project', args.projectName,
          '--action', 'stop',
          '--pid', String(serverInfo.pid),
        ]);

        previewServers.delete(args.projectName);

        return {
          content: [
            {
              type: 'text',
              text: `Preview server stopped for "${args.projectName}".`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Failed to stop preview: ${message}`,
            },
          ],
        };
      }
    }
  );

  // Get preview blob for iframe (app-only) - keeps resourceUri for UI access
  registerAppTool(
    server,
    'ui_get_preview',
    {
      title: 'Get Preview Data',
      description: 'Get the built web game as data for iframe embedding.',
      inputSchema: {
        projectName: z.string().min(1).describe('Name of the project'),
      },
      _meta: {
        ui: {
          resourceUri,
          visibility: ['app'],
        },
      },
    },
    async (args: { projectName: string }) => {
      const projectPath = path.join(WORKSPACE_DIR, args.projectName);

      // Find web build directory - check multiple locations
      const candidates = [
        // Workspace level (preferred)
        path.join(WORKSPACE_DIR, `${args.projectName}-dists`, `${args.projectName}-web`),
        // Inside project (legacy)
        path.join(projectPath, `${args.projectName}-dists`, `${args.projectName}-web`),
      ];

      let webBuildDir: string | null = null;

      for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) continue;

        // Check for web/ subdirectory (SDK nested structure)
        const webSubdir = path.join(candidate, 'web');
        if (fs.existsSync(path.join(webSubdir, 'index.html'))) {
          webBuildDir = webSubdir;
          break;
        }
        // Check for direct index.html
        if (fs.existsSync(path.join(candidate, 'index.html'))) {
          webBuildDir = candidate;
          break;
        }
      }

      if (!webBuildDir) {
        return {
          content: [{ type: 'text', text: 'No web build found.' }],
          structuredContent: { error: 'Build not found' },
        };
      }

      // Read index.html
      const indexPath = path.join(webBuildDir, 'index.html');
      if (!fs.existsSync(indexPath)) {
        return {
          content: [{ type: 'text', text: 'Build incomplete - no index.html.' }],
          structuredContent: { error: 'Index not found' },
        };
      }

      const html = fs.readFileSync(indexPath, 'utf-8');

      // Get list of all files for asset serving
      const files: Array<{ name: string; base64: string; mimeType: string }> = [];

      function addFiles(dir: string, prefix = '') {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const filePath = path.join(dir, entry.name);
          const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            addFiles(filePath, relativePath);
          } else if (entry.name !== 'index.html') {
            const buffer = fs.readFileSync(filePath);
            const ext = path.extname(entry.name).toLowerCase();
            const mimeTypes: Record<string, string> = {
              '.js': 'application/javascript',
              '.wasm': 'application/wasm',
              '.data': 'application/octet-stream',
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.webp': 'image/webp',
              '.json': 'application/json',
              '.zip': 'application/zip',
            };

            files.push({
              name: relativePath,
              base64: buffer.toString('base64'),
              mimeType: mimeTypes[ext] || 'application/octet-stream',
            });
          }
        }
      }

      addFiles(webBuildDir);

      return {
        content: [
          {
            type: 'text',
            text: `Preview data loaded (${files.length} files).`,
          },
        ],
        structuredContent: {
          html,
          files,
          buildDir: webBuildDir,
        },
      };
    }
  );

  // Get game bundle for React player (no iframe needed)
  registerAppTool(
    server,
    'ui_get_game_bundle',
    {
      title: 'Get Game Bundle',
      description: 'Get all game files as base64 for direct React rendering (no iframe).',
      inputSchema: {
        projectName: z.string().min(1).describe('Name of the project'),
      },
      _meta: {
        ui: {
          resourceUri,
          visibility: ['app'],
        },
      },
    },
    async (args: { projectName: string }) => {
      const projectPath = path.join(WORKSPACE_DIR, args.projectName);

      // Find web build directory
      const candidates = [
        path.join(WORKSPACE_DIR, `${args.projectName}-dists`, `${args.projectName}-web`),
        path.join(projectPath, `${args.projectName}-dists`, `${args.projectName}-web`),
      ];

      let webBuildDir: string | null = null;

      for (const candidate of candidates) {
        if (!fs.existsSync(candidate)) continue;
        const webSubdir = path.join(candidate, 'web');
        if (fs.existsSync(path.join(webSubdir, 'index.html'))) {
          webBuildDir = webSubdir;
          break;
        }
        if (fs.existsSync(path.join(candidate, 'index.html'))) {
          webBuildDir = candidate;
          break;
        }
      }

      if (!webBuildDir) {
        return {
          content: [{ type: 'text', text: 'No web build found.' }],
          structuredContent: { error: 'Build not found' },
        };
      }

      // Read the core files needed for Ren'Py
      const readFileAsBase64 = (filename: string): string | null => {
        const filePath = path.join(webBuildDir!, filename);
        if (!fs.existsSync(filePath)) return null;
        return fs.readFileSync(filePath).toString('base64');
      };

      const renpyJs = readFileAsBase64('renpy.js');
      const renpyPreJs = readFileAsBase64('renpy-pre.js');
      const renpyWasm = readFileAsBase64('renpy.wasm');
      const renpyData = readFileAsBase64('renpy.data');
      const gameZip = readFileAsBase64('game.zip');
      const indexHtml = fs.existsSync(path.join(webBuildDir, 'index.html'))
        ? fs.readFileSync(path.join(webBuildDir, 'index.html'), 'utf-8')
        : null;

      if (!renpyJs || !renpyPreJs || !renpyWasm || !gameZip) {
        return {
          content: [{ type: 'text', text: 'Build incomplete - missing core files.' }],
          structuredContent: { error: 'Missing files' },
        };
      }

      // Calculate sizes for progress reporting
      const sizes = {
        renpyJs: renpyJs ? Buffer.from(renpyJs, 'base64').length : 0,
        renpyPreJs: renpyPreJs ? Buffer.from(renpyPreJs, 'base64').length : 0,
        renpyWasm: renpyWasm ? Buffer.from(renpyWasm, 'base64').length : 0,
        renpyData: renpyData ? Buffer.from(renpyData, 'base64').length : 0,
        gameZip: gameZip ? Buffer.from(gameZip, 'base64').length : 0,
      };

      const totalSize = Object.values(sizes).reduce((a, b) => a + b, 0);

      return {
        content: [
          {
            type: 'text',
            text: `Game bundle loaded (${(totalSize / 1024 / 1024).toFixed(1)}MB total).`,
          },
        ],
        structuredContent: {
          renpyJs,
          renpyPreJs,
          renpyWasm,
          renpyData,
          gameZip,
          indexHtml,
          sizes,
          buildDir: webBuildDir,
        },
      };
    }
  );
}

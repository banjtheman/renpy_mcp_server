/**
 * RenPy Studio - MCP Server Factory
 *
 * Creates an MCP server with all tools and UI resource registered.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { DATA_DIR, WORKSPACE_DIR } from './provision/index.js';
import { registerProjectTools } from './server/tools/project-tools.js';
import { registerAssetTools } from './server/tools/asset-tools.js';
import { registerScriptTools } from './server/tools/script-tools.js';
import { registerBuildTools } from './server/tools/build-tools.js';

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine DIST_DIR based on whether we're running from source or compiled
// When running with tsx from src/, we need to look in ../dist/
// When running compiled from dist/, __dirname is already correct
const isRunningFromSource = __dirname.endsWith('src') || __dirname.includes('/src/');
const PROJECT_ROOT = isRunningFromSource ? path.join(__dirname, '..') : path.join(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

// UI resource URI
export const RESOURCE_URI = 'ui://renpy-studio/studio.html';

// Shared state for context sync
export interface StudioState {
  selectedProject: string | null;
  selectedScript: string | null;
  openAssets: string[];
}

export const studioState: StudioState = {
  selectedProject: null,
  selectedScript: null,
  openAssets: [],
};

/**
 * Create a new MCP server instance with all tools registered
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: 'renpy-studio',
    version: '1.0.0',
  });

  // Register UI resource
  registerUIResource(server);

  // Register tool groups
  registerViewStudioTool(server);
  registerProjectTools(server, RESOURCE_URI);
  registerAssetTools(server, RESOURCE_URI);
  registerScriptTools(server, RESOURCE_URI);
  registerBuildTools(server, RESOURCE_URI);
  registerContextTools(server);

  return server;
}

/**
 * Register the main UI resource
 */
function registerUIResource(server: McpServer): void {
  registerAppResource(
    server,
    RESOURCE_URI,
    RESOURCE_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      _meta: {
        ui: {
          csp: {
            // Allow blob URLs for embedding Ren'Py web builds in iframes
            frameDomains: ['http://localhost:*', 'http://127.0.0.1:*', 'blob:'],
            // Allow fetch/XHR to localhost preview server
            connectDomains: ['http://localhost:*', 'http://127.0.0.1:*'],
            // Allow loading resources from localhost
            resourceDomains: ['http://localhost:*', 'http://127.0.0.1:*'],
          },
        },
      },
    },
    async () => {
      // Try to load the bundled UI
      const uiPath = path.join(DIST_DIR, 'ui', 'index.html');

      let content: string;
      if (fs.existsSync(uiPath)) {
        content = fs.readFileSync(uiPath, 'utf-8');
      } else {
        // Fallback UI if not built yet
        content = getFallbackUI();
      }

      return {
        contents: [
          {
            uri: RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: content,
          },
        ],
      };
    }
  );
}

/**
 * Register the main view_studio tool that opens the UI
 */
function registerViewStudioTool(server: McpServer): void {
  registerAppTool(
    server,
    'view_studio',
    {
      title: 'View RenPy Studio',
      description:
        'Opens the RenPy Studio interface where users can browse projects, ' +
        'view generated assets, edit scripts, and play their visual novel. ' +
        '\n\n' +
        'IMPORTANT WORKFLOW GUIDANCE:\n' +
        '- Call this ONCE at the start when user wants to open the studio\n' +
        '- Do NOT call this between create_project, generate_character, generate_background, generate_script calls\n' +
        '- Call this AGAIN with initialView="preview" AFTER build_project and start_web_preview to let users play their game\n' +
        '- The game is playable INSIDE the studio UI - users do NOT need to open external browser links\n' +
        '\n' +
        'Use initialView parameter to open directly to a specific tab:\n' +
        '- "welcome" - New story creation\n' +
        '- "projects" - Project library\n' +
        '- "assets" - Asset gallery\n' +
        '- "story" - Story flow editor\n' +
        '- "preview" - Play the game (use this after building!)',
      inputSchema: {
        initialView: z.enum(['welcome', 'projects', 'assets', 'story', 'preview']).optional()
          .describe('Which tab to open initially. Use "preview" after building to let users play.'),
        projectName: z.string().optional()
          .describe('Project to select when opening. Required for assets, story, or preview views.'),
      },
      _meta: {
        ui: {
          resourceUri: RESOURCE_URI,
        },
      },
    },
    async (args: { initialView?: string; projectName?: string }) => {
      // List available projects
      const projects = listProjects();

      // Update selected project if provided
      if (args.projectName) {
        studioState.selectedProject = args.projectName;
      }

      const viewMessage = args.initialView === 'preview'
        ? 'RenPy Studio opened to Play tab. The game is ready to play in the embedded player!'
        : projects.length > 0
          ? `RenPy Studio opened. Found ${projects.length} project(s): ${projects.map((p) => p.name).join(', ')}`
          : 'RenPy Studio opened. No projects yet - create one to get started!';

      return {
        content: [
          {
            type: 'text',
            text: viewMessage,
          },
        ],
        structuredContent: {
          projects,
          selectedProject: studioState.selectedProject,
          initialView: args.initialView || 'welcome',
        },
      };
    }
  );
}

/**
 * Register context sync tools
 */
function registerContextTools(server: McpServer): void {
  // App-only: UI syncs selected project
  registerAppTool(
    server,
    'ui_select_project',
    {
      title: 'Select Project',
      description: 'Track which project the user has selected in the UI',
      inputSchema: {
        projectName: z.string().nullable().describe('Name of the selected project'),
      },
      _meta: {
        ui: {
          resourceUri: RESOURCE_URI,
          visibility: ['app'],
        },
      },
    },
    async (args: { projectName: string | null }) => {
      studioState.selectedProject = args.projectName;
      return {
        content: [{ type: 'text', text: 'OK' }],
      };
    }
  );

  // App-only: UI syncs selected script
  registerAppTool(
    server,
    'ui_select_script',
    {
      title: 'Select Script',
      description: 'Track which script the user is viewing in the UI',
      inputSchema: {
        scriptPath: z.string().nullable().describe('Path to the selected script'),
      },
      _meta: {
        ui: {
          resourceUri: RESOURCE_URI,
          visibility: ['app'],
        },
      },
    },
    async (args: { scriptPath: string | null }) => {
      studioState.selectedScript = args.scriptPath;
      return {
        content: [{ type: 'text', text: 'OK' }],
      };
    }
  );

  // Model-only: Claude gets current context
  server.registerTool(
    'get_studio_context',
    {
      description:
        'Get information about what the user is currently viewing in RenPy Studio. ' +
        'Returns the selected project, current script, and any open assets. ' +
        'Use this to understand context before making suggestions or edits.',
      inputSchema: z.object({}),
    },
    async () => {
      return {
        content: [
          {
            type: 'text',
            text: studioState.selectedProject
              ? `User is viewing project "${studioState.selectedProject}"` +
                (studioState.selectedScript
                  ? `, editing script "${studioState.selectedScript}"`
                  : '')
              : 'No project currently selected in the UI.',
          },
        ],
        structuredContent: {
          selectedProject: studioState.selectedProject,
          selectedScript: studioState.selectedScript,
          openAssets: studioState.openAssets,
        },
      };
    }
  );
}

/**
 * List all projects in the workspace
 */
function listProjects(): Array<{ name: string; path: string; createdAt: string }> {
  if (!fs.existsSync(WORKSPACE_DIR)) {
    return [];
  }

  const projects: Array<{ name: string; path: string; createdAt: string }> = [];

  for (const entry of fs.readdirSync(WORKSPACE_DIR, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const projectPath = path.join(WORKSPACE_DIR, entry.name);
      const gameDir = path.join(projectPath, 'game');

      // Only include directories that look like Ren'Py projects
      if (fs.existsSync(gameDir)) {
        const stats = fs.statSync(projectPath);
        projects.push({
          name: entry.name,
          path: projectPath,
          createdAt: stats.birthtime.toISOString(),
        });
      }
    }
  }

  return projects.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Fallback UI when the React app hasn't been built
 */
function getFallbackUI(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RenPy Studio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overflow: hidden; }
    body {
      font-family: 'Cormorant Garamond', Georgia, serif;
      background: #faf6f0;
      color: #2d2a26;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 1rem;
      color: #5c4a3d;
    }
    p {
      font-size: 1.2rem;
      color: #8b7355;
      max-width: 400px;
      line-height: 1.6;
    }
    .icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">📖</div>
    <h1>RenPy Studio</h1>
    <p>The UI is being built. Run <code>npm run build:ui</code> to build the React interface.</p>
  </div>
</body>
</html>`;
}

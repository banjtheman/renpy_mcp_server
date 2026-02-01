/**
 * Project management tools - Silent tools (no UI re-rendering)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

import { WORKSPACE_DIR } from '../../provision/index.js';
import { studioState } from '../../index.js';

/**
 * Register project management tools as silent tools (no UI triggering)
 */
export function registerProjectTools(
  server: McpServer,
  _resourceUri: string  // Kept for API compatibility but not used
): void {
  // List all projects - Silent tool
  server.tool(
    'list_projects',
    'List all visual novel projects in the workspace.\n\n' +
      'WORKSPACE: Projects are stored in the workspace directory.',
    {},
    async () => {
      const projects = getProjects();

      let textOutput = `WORKSPACE: ${WORKSPACE_DIR}\n\n`;

      if (projects.length === 0) {
        textOutput += 'No projects found. Create one with create_project.';
      } else {
        textOutput += `Found ${projects.length} project(s):\n\n`;
        for (const p of projects) {
          textOutput += `• ${p.name}\n`;
          textOutput += `    Path: ${p.path}\n`;
          textOutput += `    Scripts: ${p.scriptCount}, Has assets: ${p.hasAssets}\n`;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: textOutput,
          },
        ],
        structuredContent: {
          workspace: WORKSPACE_DIR,
          projects,
        },
      };
    }
  );

  // Create a new project - Silent tool
  server.tool(
    'create_project',
    'Create a new visual novel project with the basic Ren\'Py structure. ' +
      'The project will be created in the workspace directory.\n\n' +
      'WORKFLOW: After creating a project, continue with generate_character, generate_background, ' +
      'and generate_script calls. Do NOT call view_studio between these steps - only call it once ' +
      'at the very end with initialView="preview" to let users play their game.',
    {
      name: z.string().min(1).max(50).describe('Project name (alphanumeric with underscores or dashes)'),
    },
    async (args: { name: string }) => {
      const projectPath = path.join(WORKSPACE_DIR, args.name);

      // Check if project already exists
      if (fs.existsSync(projectPath)) {
        return {
          content: [
            {
              type: 'text',
              text: `Project "${args.name}" already exists.`,
            },
          ],
          structuredContent: { error: 'Project already exists' },
        };
      }

      // Create project structure
      const gameDir = path.join(projectPath, 'game');
      const assetsDir = path.join(projectPath, 'assets');
      const bgDir = path.join(assetsDir, 'background');
      const charDir = path.join(assetsDir, 'character');
      const imagesDir = path.join(gameDir, 'images');

      fs.mkdirSync(gameDir, { recursive: true });
      fs.mkdirSync(bgDir, { recursive: true });
      fs.mkdirSync(charDir, { recursive: true });
      fs.mkdirSync(imagesDir, { recursive: true });

      // Create default script.rpy
      const scriptContent = `# ${args.name}
# A visual novel created with RenPy Studio

label start:
    "Welcome to ${args.name}!"
    "This is where your story begins..."

    menu:
        "What would you like to do?"

        "Continue the adventure":
            "Great choice! The story continues..."

        "Take a different path":
            "You chose a different path..."

    "Thank you for playing!"
    return
`;
      fs.writeFileSync(path.join(gameDir, 'script.rpy'), scriptContent);

      // Create options.rpy
      const optionsContent = `# Game Options

define config.name = "${args.name}"
define config.developer = True
`;
      fs.writeFileSync(path.join(gameDir, 'options.rpy'), optionsContent);

      // Update state
      studioState.selectedProject = args.name;

      return {
        content: [
          {
            type: 'text',
            text: `Created project "${args.name}"!\n\n` +
              `PROJECT STRUCTURE:\n` +
              `  ${projectPath}/\n` +
              `    game/\n` +
              `      script.rpy      <- Main script (has label start)\n` +
              `      options.rpy     <- Game configuration\n` +
              `      images/         <- Images copied here during build\n` +
              `    assets/\n` +
              `      background/     <- Generate backgrounds here\n` +
              `      character/      <- Generate characters here\n\n` +
              `NEXT STEPS:\n` +
              `  1. generate_character - Create character sprites\n` +
              `  2. generate_background - Create scene backgrounds\n` +
              `  3. generate_script - Write your story (creates new .rpy file)\n` +
              `  4. build_project - Compile for web\n` +
              `  5. start_web_preview - Play your game!`,
          },
        ],
        structuredContent: {
          name: args.name,
          projectPath,
          workspace: WORKSPACE_DIR,
          directories: {
            game: gameDir,
            assets: assetsDir,
            backgrounds: bgDir,
            characters: charDir,
            images: imagesDir,
          },
          files: ['game/script.rpy', 'game/options.rpy'],
        },
      };
    }
  );

  // List files in a project - Silent tool
  server.tool(
    'list_project_files',
    'List all files in a project\'s game directory.\n\n' +
      'PROJECT STRUCTURE:\n' +
      '  {WORKSPACE}/{project_name}/\n' +
      '    game/           <- Scripts (.rpy files)\n' +
      '    assets/\n' +
      '      background/   <- Background images\n' +
      '      character/    <- Character sprites (with _transparent.png)',
    {
      projectName: z.string().min(1).describe('Name of the project'),
    },
    async (args: { projectName: string }) => {
      const projectPath = path.join(WORKSPACE_DIR, args.projectName);
      const gameDir = path.join(projectPath, 'game');
      const assetsDir = path.join(projectPath, 'assets');

      if (!fs.existsSync(projectPath)) {
        // List available projects to help
        const availableProjects: string[] = [];
        if (fs.existsSync(WORKSPACE_DIR)) {
          for (const entry of fs.readdirSync(WORKSPACE_DIR, { withFileTypes: true })) {
            if (entry.isDirectory() && fs.existsSync(path.join(WORKSPACE_DIR, entry.name, 'game'))) {
              availableProjects.push(entry.name);
            }
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `Project "${args.projectName}" not found.\n` +
                `Looked in: ${WORKSPACE_DIR}\n` +
                `Available projects: ${availableProjects.length > 0 ? availableProjects.join(', ') : 'none'}`,
            },
          ],
          structuredContent: {
            error: 'Project not found',
            searchedPath: projectPath,
            availableProjects,
          },
        };
      }

      // Get game directory files
      const gameFiles = fs.existsSync(gameDir) ? listFilesRecursive(gameDir, gameDir) : [];

      // Get asset counts
      const bgDir = path.join(assetsDir, 'background');
      const charDir = path.join(assetsDir, 'character');

      const backgroundCount = fs.existsSync(bgDir)
        ? fs.readdirSync(bgDir).filter(f => ['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(f).toLowerCase())).length
        : 0;

      const characterFiles = fs.existsSync(charDir)
        ? fs.readdirSync(charDir).filter(f => f.includes('_transparent') && f.endsWith('.png'))
        : [];
      const characterNames = new Set(
        characterFiles.map(f => f.replace('_transparent.png', '').split('_').slice(0, -1).join('_'))
      );

      // Build text output
      let textOutput = `PROJECT: ${args.projectName}\n`;
      textOutput += `PROJECT PATH: ${projectPath}\n`;
      textOutput += `WORKSPACE: ${WORKSPACE_DIR}\n\n`;

      textOutput += `=== SCRIPTS (game/) ===\n`;
      const scripts = gameFiles.filter(f => f.path.endsWith('.rpy'));
      for (const file of scripts) {
        textOutput += `  ${file.path} (${file.size} bytes)\n`;
        textOutput += `    Full path: ${path.join(gameDir, file.path)}\n`;
      }

      textOutput += `\n=== ASSETS ===\n`;
      textOutput += `  Backgrounds: ${backgroundCount} (in ${bgDir})\n`;
      textOutput += `  Characters: ${characterNames.size} with ${characterFiles.length} emotion variants (in ${charDir})\n`;
      if (characterNames.size > 0) {
        textOutput += `    Names: ${Array.from(characterNames).join(', ')}\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: textOutput,
          },
        ],
        structuredContent: {
          projectName: args.projectName,
          projectPath,
          workspace: WORKSPACE_DIR,
          gameDir,
          assetsDir,
          scripts: scripts.map(f => ({
            ...f,
            fullPath: path.join(gameDir, f.path),
          })),
          assets: {
            backgroundCount,
            backgroundDir: bgDir,
            characterCount: characterNames.size,
            characterNames: Array.from(characterNames),
            characterDir: charDir,
          },
        },
      };
    }
  );

  // Delete a project - Silent tool
  server.tool(
    'delete_project',
    'Delete a visual novel project and all its files. This action cannot be undone.',
    {
      projectName: z.string().min(1).describe('Name of the project to delete'),
    },
    async (args: { projectName: string }) => {
      const projectPath = path.join(WORKSPACE_DIR, args.projectName);

      // Check if project exists
      if (!fs.existsSync(projectPath)) {
        return {
          content: [
            {
              type: 'text',
              text: `Project "${args.projectName}" not found.`,
            },
          ],
          structuredContent: { error: 'Project not found' },
        };
      }

      // Delete the project directory recursively
      fs.rmSync(projectPath, { recursive: true, force: true });

      // Clear selected project if it was the deleted one
      if (studioState.selectedProject === args.projectName) {
        studioState.selectedProject = null;
      }

      return {
        content: [
          {
            type: 'text',
            text: `Deleted project "${args.projectName}" and all its files.`,
          },
        ],
        structuredContent: {
          deleted: true,
          projectName: args.projectName,
        },
      };
    }
  );
}

/**
 * Get all projects in the workspace
 */
function getProjects(): Array<{
  name: string;
  path: string;
  createdAt: string;
  hasAssets: boolean;
  scriptCount: number;
}> {
  if (!fs.existsSync(WORKSPACE_DIR)) {
    return [];
  }

  const projects: Array<{
    name: string;
    path: string;
    createdAt: string;
    hasAssets: boolean;
    scriptCount: number;
  }> = [];

  for (const entry of fs.readdirSync(WORKSPACE_DIR, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const projectPath = path.join(WORKSPACE_DIR, entry.name);
      const gameDir = path.join(projectPath, 'game');
      const assetsDir = path.join(projectPath, 'assets');

      if (fs.existsSync(gameDir)) {
        const stats = fs.statSync(projectPath);

        // Count scripts
        let scriptCount = 0;
        if (fs.existsSync(gameDir)) {
          for (const file of fs.readdirSync(gameDir)) {
            if (file.endsWith('.rpy')) {
              scriptCount++;
            }
          }
        }

        // Check for assets
        const hasAssets =
          fs.existsSync(assetsDir) &&
          (fs.readdirSync(path.join(assetsDir, 'background')).length > 0 ||
            fs.readdirSync(path.join(assetsDir, 'character')).length > 0);

        projects.push({
          name: entry.name,
          path: projectPath,
          createdAt: stats.birthtime.toISOString(),
          hasAssets,
          scriptCount,
        });
      }
    }
  }

  return projects.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Recursively list files in a directory
 */
function listFilesRecursive(
  dir: string,
  baseDir: string
): Array<{ path: string; type: string; size: number }> {
  const files: Array<{ path: string; type: string; size: number }> = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath, baseDir));
    } else {
      const stats = fs.statSync(fullPath);
      files.push({
        path: relativePath,
        type: path.extname(entry.name),
        size: stats.size,
      });
    }
  }

  return files;
}

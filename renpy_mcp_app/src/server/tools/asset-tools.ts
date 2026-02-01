/**
 * Asset generation and management tools
 *
 * These tools handle:
 * - Background generation via Gemini
 * - Character sprite generation with emotions
 * - Asset gallery browsing
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

import { WORKSPACE_DIR } from '../../provision/index.js';
import { runPythonScript } from '../python-runner.js';

// ============================================================================
// Metadata Types and Storage
// ============================================================================

interface CharacterMetadata {
  displayName: string;
  normalizedName: string;
  description: string;
  role: string;
  clothing?: string;
  personality?: string;
  createdAt: string;
  updatedAt: string;
}

interface BackgroundMetadata {
  displayName: string;
  filename: string;
  description: string;
  location?: string;
  timeOfDay?: string;
  mood?: string;
  details?: string;
  createdAt: string;
  updatedAt: string;
}

interface AssetMetadata {
  version: number;
  characters: Record<string, CharacterMetadata>;
  backgrounds: Record<string, BackgroundMetadata>;
}

/**
 * Get the metadata file path for a project
 */
function getMetadataPath(projectPath: string): string {
  return path.join(projectPath, 'assets', 'metadata.json');
}

/**
 * Load metadata for a project, creating default if not exists
 */
function loadMetadata(projectPath: string): AssetMetadata {
  const metadataPath = getMetadataPath(projectPath);

  if (fs.existsSync(metadataPath)) {
    try {
      const content = fs.readFileSync(metadataPath, 'utf-8');
      return JSON.parse(content) as AssetMetadata;
    } catch {
      // If corrupted, return default
      console.error('Failed to parse metadata.json, using default');
    }
  }

  return {
    version: 1,
    characters: {},
    backgrounds: {},
  };
}

/**
 * Save metadata for a project
 */
function saveMetadata(projectPath: string, metadata: AssetMetadata): void {
  const metadataPath = getMetadataPath(projectPath);
  const assetsDir = path.dirname(metadataPath);

  // Ensure assets directory exists
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
}

/**
 * Save character metadata
 */
function saveCharacterMetadata(
  projectPath: string,
  normalizedName: string,
  data: Omit<CharacterMetadata, 'createdAt' | 'updatedAt'>
): void {
  const metadata = loadMetadata(projectPath);
  const now = new Date().toISOString();

  const existing = metadata.characters[normalizedName];
  metadata.characters[normalizedName] = {
    ...data,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  saveMetadata(projectPath, metadata);
}

/**
 * Save background metadata
 */
function saveBackgroundMetadata(
  projectPath: string,
  filename: string,
  data: Omit<BackgroundMetadata, 'createdAt' | 'updatedAt'>
): void {
  const metadata = loadMetadata(projectPath);
  const now = new Date().toISOString();

  const existing = metadata.backgrounds[filename];
  metadata.backgrounds[filename] = {
    ...data,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  saveMetadata(projectPath, metadata);
}

/**
 * Delete character from metadata
 */
function deleteCharacterMetadata(projectPath: string, normalizedName: string): void {
  const metadata = loadMetadata(projectPath);
  delete metadata.characters[normalizedName];
  saveMetadata(projectPath, metadata);
}

/**
 * Delete background from metadata
 */
function deleteBackgroundMetadata(projectPath: string, filename: string): void {
  const metadata = loadMetadata(projectPath);
  delete metadata.backgrounds[filename];
  saveMetadata(projectPath, metadata);
}

/**
 * Register asset-related tools
 */
export function registerAssetTools(
  server: McpServer,
  resourceUri: string
): void {
  // Get project assets (app-only for gallery display)
  registerAppTool(
    server,
    'ui_get_assets',
    {
      title: 'Get Project Assets',
      description: 'Get all assets for a project as base64 images for display.',
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
      const assetsDir = path.join(projectPath, 'assets');

      if (!fs.existsSync(assetsDir)) {
        return {
          content: [{ type: 'text', text: 'No assets found.' }],
          structuredContent: { backgrounds: [], characters: [], metadata: null },
        };
      }

      // Load metadata
      const metadata = loadMetadata(projectPath);

      const backgrounds = getAssetsWithBase64(
        path.join(assetsDir, 'background')
      );
      const characters = getCharactersWithEmotions(
        path.join(assetsDir, 'character')
      );

      // Attach metadata to backgrounds
      const backgroundsWithMetadata = backgrounds.map(bg => ({
        ...bg,
        metadata: metadata.backgrounds[bg.name] || null,
      }));

      // Attach metadata to characters
      const charactersWithMetadata = characters.map(char => ({
        ...char,
        metadata: metadata.characters[char.name] || null,
      }));

      return {
        content: [
          {
            type: 'text',
            text: `Found ${backgrounds.length} backgrounds and ${characters.length} characters.`,
          },
        ],
        structuredContent: {
          backgrounds: backgroundsWithMetadata,
          characters: charactersWithMetadata,
          metadata,
        },
      };
    }
  );

  // Delete asset (app-only for UI delete functionality)
  registerAppTool(
    server,
    'ui_delete_asset',
    {
      title: 'Delete Asset',
      description: 'Delete an asset and all associated files.',
      inputSchema: {
        projectName: z.string().min(1).describe('Name of the project'),
        assetType: z.enum(['character', 'background']).describe('Type of asset to delete'),
        assetId: z.string().min(1).describe('Asset identifier (character name or background filename without extension)'),
      },
      _meta: {
        ui: {
          resourceUri,
          visibility: ['app'],
        },
      },
    },
    async (args: { projectName: string; assetType: 'character' | 'background'; assetId: string }) => {
      const projectPath = path.join(WORKSPACE_DIR, args.projectName);
      const assetsDir = path.join(projectPath, 'assets', args.assetType);

      if (!fs.existsSync(assetsDir)) {
        return {
          content: [{ type: 'text', text: `No ${args.assetType} assets directory found.` }],
          structuredContent: { success: false, error: 'Assets directory not found' },
        };
      }

      const deletedFiles: string[] = [];

      if (args.assetType === 'character') {
        // Delete all emotion variants for this character
        const files = fs.readdirSync(assetsDir);
        for (const file of files) {
          // Match files like: charactername_emotion.png or charactername_emotion_transparent.png
          if (file.startsWith(args.assetId + '_')) {
            const filePath = path.join(assetsDir, file);
            fs.unlinkSync(filePath);
            deletedFiles.push(file);
          }
        }
        // Remove from metadata
        deleteCharacterMetadata(projectPath, args.assetId);
      } else {
        // Delete background file(s)
        const files = fs.readdirSync(assetsDir);
        for (const file of files) {
          const baseName = path.basename(file, path.extname(file));
          if (baseName === args.assetId) {
            const filePath = path.join(assetsDir, file);
            fs.unlinkSync(filePath);
            deletedFiles.push(file);
          }
        }
        // Remove from metadata
        deleteBackgroundMetadata(projectPath, args.assetId);
      }

      return {
        content: [
          {
            type: 'text',
            text: deletedFiles.length > 0
              ? `Deleted ${deletedFiles.length} file(s): ${deletedFiles.join(', ')}`
              : `No files found for ${args.assetType} "${args.assetId}"`,
          },
        ],
        structuredContent: {
          success: deletedFiles.length > 0,
          deletedFiles,
          warning: 'If this asset was referenced in scripts, the game may not work. You should regenerate the script.',
        },
      };
    }
  );

  // Generate background (model-only, Claude writes prompts)
  server.registerTool(
    'generate_background',
    {
      description:
        'Generate a background image for your visual novel scene. ' +
        'Describe the scene in detail: location, time of day, atmosphere, specific objects. ' +
        'Example: "Cozy café interior, evening, warm lighting from vintage lamps, ' +
        'wooden tables, large windows showing city lights outside"' +
        '\n\nIMPORTANT: After generating, you MUST add an image definition to your script: ' +
        '\n  image bg cafe = "images/cafe.png"' +
        '\n  scene bg cafe with dissolve',
      inputSchema: z.object({
        projectName: z.string().min(1).describe('Name of the project'),
        description: z.string().min(20).describe('Detailed scene description'),
        filename: z.string().optional().describe('Optional filename (use underscores, e.g., "cafe_interior")'),
      }),
    },
    async (args: { projectName: string; description: string; filename?: string }) => {
      try {
        const result = await runPythonScript('image_service.py', [
          '--type', 'background',
          '--project', args.projectName,
          '--prompt', args.description,
          ...(args.filename ? ['--filename', args.filename] : []),
        ]);

        // Add helpful information for script writing
        if (result.success && result.filename) {
          const filename = result.filename as string;
          const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '');
          // Convert hyphens to underscores for valid Ren'Py identifier
          const bgName = filenameWithoutExt.replace(/-/g, '_');

          result.full_path = path.join(WORKSPACE_DIR, args.projectName, 'assets', 'background', filename);
          result.script_image_definition = `image bg ${bgName} = "images/${filename}"`;
          result.script_usage = `scene bg ${bgName} with dissolve`;

          // Save metadata for gallery display
          const projectPath = path.join(WORKSPACE_DIR, args.projectName);
          const displayName = bgName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          saveBackgroundMetadata(projectPath, filenameWithoutExt, {
            displayName,
            filename,
            description: args.description,
          });

          return {
            content: [
              {
                type: 'text',
                text: `Background generated successfully!\n` +
                  `- File: ${filename}\n` +
                  `- Full path: ${result.full_path}\n\n` +
                  `Add this to your script:\n` +
                  `  ${result.script_image_definition}\n\n` +
                  `Use in scenes:\n` +
                  `  ${result.script_usage}`,
              },
            ],
            structuredContent: result,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Background generated successfully: ${result.filename}`,
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
              text: `Failed to generate background: ${message}`,
            },
          ],
        };
      }
    }
  );

  // Generate character (model-only, Claude writes prompts)
  server.registerTool(
    'generate_character',
    {
      description:
        'Generate a character sprite with multiple emotion variants and transparent background. ' +
        'Characters are automatically normalized to 750px height for consistent display. ' +
        'Backgrounds are automatically removed to create transparent PNGs. ' +
        '\n\nDescribe the character\'s appearance in detail: physical features, clothing, accessories. ' +
        'Example: "Young woman with shoulder-length brown hair, warm brown eyes, ' +
        'wearing a green apron over white shirt, friendly barista"' +
        '\n\nWhen generateEmotions=true (default), creates 5 variants: neutral, happy, sad, surprised, angry. ' +
        'Files are saved as: {name}_neutral_transparent.png, {name}_happy_transparent.png, etc. ' +
        '\n\nIMPORTANT: In your script, you must define these images and a Character: ' +
        '\n  define alice = Character("Alice", color="#4a90e2")' +
        '\n  image alice neutral = "images/alice_neutral_transparent.png"' +
        '\n  image alice happy = "images/alice_happy_transparent.png"' +
        '\n  # ... etc for each emotion',
      inputSchema: z.object({
        projectName: z.string().min(1).describe('Name of the project'),
        characterName: z.string().min(1).describe('Character name (lowercase, e.g., "alice")'),
        description: z.string().min(20).describe('Detailed character description'),
        generateEmotions: z.boolean().optional().default(true).describe('Generate emotion variants'),
      }),
    },
    async (args: {
      projectName: string;
      characterName: string;
      description: string;
      generateEmotions?: boolean;
    }) => {
      try {
        // Normalize character name: lowercase, replace hyphens/spaces with underscores
        // This ensures consistency between filenames and Ren'Py identifiers
        const normalizedName = args.characterName
          .toLowerCase()
          .replace(/[-\s]+/g, '_')  // Replace hyphens and spaces with underscores
          .replace(/[^a-z0-9_]/g, '');  // Remove any other invalid characters

        // Step 1: Generate the character images
        const result = await runPythonScript('image_service.py', [
          '--type', 'character',
          '--project', args.projectName,
          '--name', normalizedName,  // Use normalized name
          '--prompt', args.description,
          ...(args.generateEmotions !== false ? ['--emotions'] : []),
        ]);

        // Step 2: Remove backgrounds from generated images
        if (result.success) {
          const assetsDir = path.join(WORKSPACE_DIR, args.projectName, 'assets', 'character');
          try {
            const bgResult = await runPythonScript('background_remover.py', [
              '--directory', assetsDir,
            ]);
            // Add transparent files info to result
            if (bgResult.success) {
              result.transparent_files = bgResult.results?.map((r: { output_path: string }) => r.output_path) || [];
              result.background_removal = 'success';
            }
          } catch (bgError) {
            // Log but don't fail - original images still usable
            console.error('Background removal failed:', bgError);
            result.background_removal = 'failed';
          }

          // Add helpful script definitions using normalized name
          // Create a nice display name from the original input (capitalize words)
          const displayName = args.characterName
            .replace(/[-_]/g, ' ')  // Replace separators with spaces
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
          const emotions = ['neutral', 'happy', 'sad', 'surprised', 'angry'];

          result.assets_dir = assetsDir;
          result.normalized_name = normalizedName;  // Tell Claude what name to use
          result.script_character_definition = `define ${normalizedName} = Character("${displayName}", color="#4a90e2")`;
          result.script_image_definitions = emotions.map(
            (e) => `image ${normalizedName} ${e} = "images/${normalizedName}_${e}_transparent.png"`
          );
          result.script_usage_example = `show ${normalizedName} neutral at scaled, center_pos with moveinleft`;

          // Save metadata for gallery display
          const projectPath = path.join(WORKSPACE_DIR, args.projectName);
          saveCharacterMetadata(projectPath, normalizedName, {
            displayName,
            normalizedName,
            description: args.description,
            role: 'generated',
          });

          const imageDefsText = result.script_image_definitions.join('\n  ');

          return {
            content: [
              {
                type: 'text',
                text: `Character "${args.characterName}" generated with ${
                  args.generateEmotions !== false ? '5 emotion variants' : 'single pose'
                }.\nBackgrounds removed and images normalized to 750px height.\n\n` +
                  `IMPORTANT: Character name normalized to "${normalizedName}" (use this in scripts!)\n\n` +
                  `Assets directory: ${assetsDir}\n\n` +
                  `ADD THESE TO YOUR SCRIPT:\n\n` +
                  `# Character definition\n` +
                  `  ${result.script_character_definition}\n\n` +
                  `# Image definitions\n` +
                  `  ${imageDefsText}\n\n` +
                  `# Usage example\n` +
                  `  ${result.script_usage_example}`,
              },
            ],
            structuredContent: result,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Character "${args.characterName}" generated with ${
                args.generateEmotions !== false ? '5 emotion variants' : 'single pose'
              }. Backgrounds removed and images normalized to 750px height.`,
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
              text: `Failed to generate character: ${message}`,
            },
          ],
        };
      }
    }
  );

  // List all project assets with paths and script definitions (model-facing debugging tool)
  server.registerTool(
    'list_project_assets',
    {
      description:
        'List all assets in a project with their full paths and the script definitions needed to use them. ' +
        'Use this tool to debug when images are not showing - it will tell you exactly what ' +
        'image definitions need to be in your script.\n\n' +
        'PROJECT STRUCTURE:\n' +
        '  {WORKSPACE}/\n' +
        '    {project_name}/\n' +
        '      assets/\n' +
        '        background/     <- Background images\n' +
        '        character/      <- Character sprites\n' +
        '      game/\n' +
        '        script.rpy      <- Main script\n' +
        '        *.rpy           <- Your scripts\n' +
        '        images/         <- Copied during build',
      inputSchema: z.object({
        projectName: z.string().min(1).describe('Name of the project'),
      }),
    },
    async (args: { projectName: string }) => {
      const projectPath = path.join(WORKSPACE_DIR, args.projectName);
      const assetsDir = path.join(projectPath, 'assets');
      const gameDir = path.join(projectPath, 'game');

      if (!fs.existsSync(projectPath)) {
        return {
          content: [
            {
              type: 'text',
              text: `Project "${args.projectName}" not found at ${projectPath}`,
            },
          ],
          structuredContent: { error: 'Project not found', projectPath },
        };
      }

      // Get backgrounds
      const backgroundsDir = path.join(assetsDir, 'background');
      const backgrounds: Array<{
        filename: string;
        fullPath: string;
        imageDefinition: string;
        sceneUsage: string;
      }> = [];

      if (fs.existsSync(backgroundsDir)) {
        for (const file of fs.readdirSync(backgroundsDir)) {
          const ext = path.extname(file).toLowerCase();
          if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
            const filenameWithoutExt = file.replace(/\.[^/.]+$/, '');
            const bgName = filenameWithoutExt.replace(/-/g, '_');
            backgrounds.push({
              filename: file,
              fullPath: path.join(backgroundsDir, file),
              imageDefinition: `image bg ${bgName} = "images/${file}"`,
              sceneUsage: `scene bg ${bgName} with dissolve`,
            });
          }
        }
      }

      // Get characters (group transparent files)
      const charactersDir = path.join(assetsDir, 'character');
      const characterMap = new Map<
        string,
        {
          emotions: string[];
          files: Array<{ filename: string; fullPath: string }>;
        }
      >();

      if (fs.existsSync(charactersDir)) {
        for (const file of fs.readdirSync(charactersDir)) {
          const ext = path.extname(file).toLowerCase();
          if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
            // Only include transparent files for character definitions
            if (!file.includes('_transparent')) continue;

            const baseName = path.basename(file, ext);
            const parts = baseName.replace('_transparent', '').split('_');
            if (parts.length >= 2) {
              const emotion = parts.pop()!;
              const charName = parts.join('_');

              if (!characterMap.has(charName)) {
                characterMap.set(charName, { emotions: [], files: [] });
              }
              const char = characterMap.get(charName)!;
              char.emotions.push(emotion);
              char.files.push({
                filename: file,
                fullPath: path.join(charactersDir, file),
              });
            }
          }
        }
      }

      // Build character definitions
      const characters: Array<{
        name: string;
        displayName: string;
        emotions: string[];
        characterDefinition: string;
        imageDefinitions: string[];
        usageExample: string;
      }> = [];

      for (const [charName, data] of characterMap) {
        const displayName = charName.charAt(0).toUpperCase() + charName.slice(1);
        const sortedEmotions = data.emotions.sort((a, b) => {
          const order = ['neutral', 'happy', 'sad', 'surprised', 'angry'];
          return order.indexOf(a) - order.indexOf(b);
        });

        characters.push({
          name: charName,
          displayName,
          emotions: sortedEmotions,
          characterDefinition: `define ${charName} = Character("${displayName}", color="#4a90e2")`,
          imageDefinitions: sortedEmotions.map(
            (e) => `image ${charName} ${e} = "images/${charName}_${e}_transparent.png"`
          ),
          usageExample: `show ${charName} neutral at scaled, center_pos with moveinleft`,
        });
      }

      // Get scripts
      const scripts: Array<{ filename: string; fullPath: string }> = [];
      if (fs.existsSync(gameDir)) {
        for (const file of fs.readdirSync(gameDir)) {
          if (file.endsWith('.rpy')) {
            scripts.push({
              filename: file,
              fullPath: path.join(gameDir, file),
            });
          }
        }
      }

      // Build text output
      let textOutput = `PROJECT: ${args.projectName}\n`;
      textOutput += `WORKSPACE: ${WORKSPACE_DIR}\n`;
      textOutput += `PROJECT PATH: ${projectPath}\n\n`;

      textOutput += `=== BACKGROUNDS (${backgrounds.length}) ===\n`;
      for (const bg of backgrounds) {
        textOutput += `\n${bg.filename}\n`;
        textOutput += `  Path: ${bg.fullPath}\n`;
        textOutput += `  Script definition: ${bg.imageDefinition}\n`;
        textOutput += `  Usage: ${bg.sceneUsage}\n`;
      }

      textOutput += `\n=== CHARACTERS (${characters.length}) ===\n`;
      for (const char of characters) {
        textOutput += `\n${char.name} (${char.emotions.join(', ')})\n`;
        textOutput += `  Character definition: ${char.characterDefinition}\n`;
        textOutput += `  Image definitions:\n`;
        for (const imgDef of char.imageDefinitions) {
          textOutput += `    ${imgDef}\n`;
        }
        textOutput += `  Usage: ${char.usageExample}\n`;
      }

      textOutput += `\n=== SCRIPTS (${scripts.length}) ===\n`;
      for (const script of scripts) {
        textOutput += `  ${script.filename}: ${script.fullPath}\n`;
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
          backgrounds,
          characters,
          scripts,
        },
      };
    }
  );
}

/**
 * Get assets from a directory with base64 encoding
 */
function getAssetsWithBase64(
  dir: string
): Array<{ name: string; path: string; base64: string; mimeType: string }> {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const assets: Array<{
    name: string;
    path: string;
    base64: string;
    mimeType: string;
  }> = [];

  for (const file of fs.readdirSync(dir)) {
    const ext = path.extname(file).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      const filePath = path.join(dir, file);
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');
      const mimeType =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';

      assets.push({
        name: path.basename(file, ext),
        path: filePath,
        base64,
        mimeType,
      });
    }
  }

  return assets;
}

/**
 * Get characters grouped by name with emotion variants
 * Returns both regular and transparent versions for each emotion
 */
function getCharactersWithEmotions(dir: string): Array<{
  name: string;
  emotions: Array<{
    emotion: string;
    base64: string;
    base64Transparent: string;
    mimeType: string;
  }>;
}> {
  if (!fs.existsSync(dir)) {
    return [];
  }

  // First pass: collect all files grouped by character and emotion
  const characterEmotionMap = new Map<
    string,
    Map<string, { regular?: { base64: string; mimeType: string }; transparent?: { base64: string; mimeType: string } }>
  >();

  for (const file of fs.readdirSync(dir)) {
    const ext = path.extname(file).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      const baseName = path.basename(file, ext);
      const isTransparent = baseName.includes('_transparent');
      const cleanBaseName = baseName.replace('_transparent', '');
      const parts = cleanBaseName.split('_');

      if (parts.length >= 2) {
        const emotion = parts.pop()!;
        const charName = parts.join('_');

        const filePath = path.join(dir, file);
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString('base64');
        const mimeType =
          ext === '.png'
            ? 'image/png'
            : ext === '.webp'
              ? 'image/webp'
              : 'image/jpeg';

        if (!characterEmotionMap.has(charName)) {
          characterEmotionMap.set(charName, new Map());
        }
        const emotionMap = characterEmotionMap.get(charName)!;

        if (!emotionMap.has(emotion)) {
          emotionMap.set(emotion, {});
        }
        const emotionData = emotionMap.get(emotion)!;

        if (isTransparent) {
          emotionData.transparent = { base64, mimeType };
        } else {
          emotionData.regular = { base64, mimeType };
        }
      }
    }
  }

  // Second pass: build the result with both versions for each emotion
  return Array.from(characterEmotionMap.entries()).map(([name, emotionMap]) => ({
    name,
    emotions: Array.from(emotionMap.entries())
      .map(([emotion, data]) => ({
        emotion,
        // Regular version (non-transparent)
        base64: data.regular?.base64 || data.transparent?.base64 || '',
        // Transparent version
        base64Transparent: data.transparent?.base64 || data.regular?.base64 || '',
        mimeType: data.transparent?.mimeType || data.regular?.mimeType || 'image/png',
      }))
      .filter(e => e.base64 || e.base64Transparent)
      .sort((a, b) => {
        const order = ['neutral', 'happy', 'sad', 'surprised', 'angry'];
        return order.indexOf(a.emotion) - order.indexOf(b.emotion);
      }),
  }));
}

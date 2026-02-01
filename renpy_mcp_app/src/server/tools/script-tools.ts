/**
 * Script editing tools - Silent tools for model, App tools for UI
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

import { WORKSPACE_DIR } from '../../provision/index.js';
import { studioState } from '../../index.js';
import { parseMultipleScripts } from '../../lib/renpy-parser.js';

/**
 * Validation result for a single script
 */
interface ScriptValidationResult {
  file: string;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * Validate a script file for common Ren'Py errors
 */
function validateScriptFile(
  projectName: string,
  scriptFile: string,
  content: string,
  availableBackgrounds: Set<string>,
  availableCharacters: Set<string>
): ScriptValidationResult {
  const lines = content.split('\n');
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Track definitions found in script
  const definedCharacters = new Set<string>();
  const definedImages = new Set<string>();
  const definedPositions = new Set<string>();
  let hasScaledTransform = false;

  // Track usage
  const usedCharactersInDialogue = new Set<string>();
  const usedCharactersInShow = new Set<string>();
  const usedBackgrounds = new Set<string>();
  const showWithoutAt: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Check for "label start:" (forbidden in generated scripts)
    if (/^label\s+start\s*:/.test(line) && scriptFile !== 'script.rpy') {
      errors.push(`Line ${lineNum}: Uses "label start:" which conflicts with main script.rpy. Use a unique label name like "label ${scriptFile.replace('.rpy', '')}:"`);
    }

    // Track character definitions: define alice = Character(...)
    const charDefMatch = line.match(/^define\s+(\w+)\s*=\s*Character\s*\(/);
    if (charDefMatch) {
      definedCharacters.add(charDefMatch[1].toLowerCase());
    }

    // Track image definitions: image alice neutral = "..."
    const imageDefMatch = line.match(/^image\s+(\w+)\s+(\w+)\s*=/);
    if (imageDefMatch) {
      definedImages.add(`${imageDefMatch[1].toLowerCase()}_${imageDefMatch[2].toLowerCase()}`);
    }

    // Track background definitions: image bg cafe = "..."
    const bgDefMatch = line.match(/^image\s+bg\s+(\w+)\s*=/);
    if (bgDefMatch) {
      definedImages.add(`bg_${bgDefMatch[1].toLowerCase()}`);
    }

    // Track position definitions
    const posDefMatch = line.match(/^define\s+(\w+_pos|\w+)\s*=\s*Position\s*\(/);
    if (posDefMatch) {
      definedPositions.add(posDefMatch[1]);
    }

    // Track transform definitions
    if (/^transform\s+scaled\s*:/.test(line)) {
      hasScaledTransform = true;
    }

    // Track character usage in dialogue: alice "Hello"
    const dialogueMatch = line.match(/^(\w+)\s+"[^"]*"/);
    if (dialogueMatch && !['scene', 'show', 'hide', 'with', 'menu', 'label', 'jump', 'call', 'return', 'if', 'else', 'elif', 'pass', 'python', 'init', 'define', 'image', 'transform'].includes(dialogueMatch[1].toLowerCase())) {
      usedCharactersInDialogue.add(dialogueMatch[1].toLowerCase());
    }

    // Track show statements: show alice neutral at scaled, left_pos
    const showMatch = line.match(/^show\s+(\w+)(?:\s+(\w+))?/);
    if (showMatch) {
      const charName = showMatch[1].toLowerCase();
      const emotion = showMatch[2]?.toLowerCase();

      if (charName !== 'bg') {
        usedCharactersInShow.add(charName);
        if (emotion) {
          usedCharactersInShow.add(`${charName}_${emotion}`);
        }
      }

      // Check if "at" clause is missing
      if (!line.includes(' at ') && charName !== 'bg') {
        showWithoutAt.push(`Line ${lineNum}: "show ${charName}" missing "at scaled, position" clause`);
      }
    }

    // Track scene statements: scene bg cafe_interior
    const sceneMatch = line.match(/^scene\s+bg\s+(\w+)/);
    if (sceneMatch) {
      usedBackgrounds.add(sceneMatch[1].toLowerCase());
    }
  }

  // Check for missing character definitions
  for (const char of usedCharactersInDialogue) {
    if (!definedCharacters.has(char) && char !== 'narrator') {
      errors.push(`Missing character definition: "define ${char} = Character(\\"${char.charAt(0).toUpperCase() + char.slice(1)}\\", color=\\"#4a90e2\\")"`);
    }
  }

  // Check for missing image definitions
  for (const charWithEmotion of usedCharactersInShow) {
    if (charWithEmotion.includes('_')) {
      if (!definedImages.has(charWithEmotion)) {
        const [charName, emotion] = charWithEmotion.split('_');
        errors.push(`Missing image definition: "image ${charName} ${emotion} = \\"images/${charName}_${emotion}_transparent.png\\""`);
      }
    }
  }

  // Check for missing background definitions
  for (const bg of usedBackgrounds) {
    if (!definedImages.has(`bg_${bg}`)) {
      // Try to find matching asset file
      let foundFile = null;
      for (const assetFile of availableBackgrounds) {
        const assetName = assetFile.replace(/\.[^/.]+$/, '').replace(/-/g, '_').toLowerCase();
        if (assetName === bg || assetName.includes(bg)) {
          foundFile = assetFile;
          break;
        }
      }
      if (foundFile) {
        errors.push(`Missing background definition: "image bg ${bg} = \\"images/${foundFile}\\""`);
      } else {
        errors.push(`Missing background definition for "bg ${bg}" - asset file may not exist. Generate it first!`);
      }
    }
  }

  // Check for show statements without "at" clause
  for (const issue of showWithoutAt) {
    warnings.push(issue);
  }

  // Check for missing transform
  if (usedCharactersInShow.size > 0 && !hasScaledTransform) {
    suggestions.push('Consider adding "transform scaled:\\n    zoom 0.65" for consistent character sizing');
  }

  // Check for missing position definitions
  if (usedCharactersInShow.size > 0 && definedPositions.size === 0) {
    suggestions.push('Consider adding position definitions like "define left_pos = Position(xalign=0.2, yalign=1.0)"');
  }

  // Check for characters with image definitions that are never shown
  for (const char of definedCharacters) {
    // Check if this character has image definitions
    const hasImageDefs = Array.from(definedImages).some(img => img.startsWith(`${char}_`));
    // Check if this character is ever shown
    const isShown = Array.from(usedCharactersInShow).some(shown => shown === char || shown.startsWith(`${char}_`));

    if (hasImageDefs && !isShown && char !== 'narrator') {
      warnings.push(`Character "${char}" has image definitions but is never shown. Either add "show ${char}" statements or remove unused image definitions.`);
    }
  }

  return { file: scriptFile, errors, warnings, suggestions };
}

/**
 * Get available assets for a project
 */
function getAvailableAssets(projectName: string): {
  backgrounds: Set<string>;
  characters: Set<string>;
} {
  const assetsDir = path.join(WORKSPACE_DIR, projectName, 'assets');
  const availableBackgrounds = new Set<string>();
  const availableCharacters = new Set<string>();

  const bgDir = path.join(assetsDir, 'background');
  if (fs.existsSync(bgDir)) {
    for (const file of fs.readdirSync(bgDir)) {
      if (['.png', '.jpg', '.jpeg', '.webp'].includes(path.extname(file).toLowerCase())) {
        availableBackgrounds.add(file);
      }
    }
  }

  const charDir = path.join(assetsDir, 'character');
  if (fs.existsSync(charDir)) {
    for (const file of fs.readdirSync(charDir)) {
      if (file.includes('_transparent') && file.endsWith('.png')) {
        const parts = file.replace('_transparent.png', '').split('_');
        if (parts.length >= 2) {
          parts.pop(); // Remove emotion
          availableCharacters.add(parts.join('_'));
        }
      }
    }
  }

  return { backgrounds: availableBackgrounds, characters: availableCharacters };
}

/**
 * Format validation results as text
 */
function formatValidationResults(
  results: ScriptValidationResult[],
  availableBackgrounds: Set<string>,
  availableCharacters: Set<string>
): string {
  let textOutput = '';

  const hasIssues = results.some(r => r.errors.length > 0 || r.warnings.length > 0);

  if (!hasIssues) {
    textOutput += '✅ VALIDATION PASSED! Script looks good.\n';
  } else {
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const result of results) {
      if (result.errors.length > 0 || result.warnings.length > 0 || result.suggestions.length > 0) {
        textOutput += `\n=== ${result.file} ===\n`;

        if (result.errors.length > 0) {
          textOutput += `\n❌ ERRORS (${result.errors.length}):\n`;
          for (const err of result.errors) {
            textOutput += `  • ${err}\n`;
            totalErrors++;
          }
        }

        if (result.warnings.length > 0) {
          textOutput += `\n⚠️ WARNINGS (${result.warnings.length}):\n`;
          for (const warn of result.warnings) {
            textOutput += `  • ${warn}\n`;
            totalWarnings++;
          }
        }

        if (result.suggestions.length > 0) {
          textOutput += `\n💡 SUGGESTIONS:\n`;
          for (const sug of result.suggestions) {
            textOutput += `  • ${sug}\n`;
          }
        }
      }
    }

    if (totalErrors > 0) {
      textOutput += `\n⛔ FIX ${totalErrors} ERROR(S) before building!\n`;
    }
  }

  return textOutput;
}

/**
 * Register script-related tools
 */
export function registerScriptTools(
  server: McpServer,
  resourceUri: string
): void {
  // Get script graph for visual story builder (app-only for UI)
  registerAppTool(
    server,
    'get_script_graph',
    {
      title: 'Get Script Graph',
      description:
        "Parse all Ren'Py scripts in a project and return the story graph structure. " +
        'Returns nodes (labels, menus) and edges (jumps, calls, choices) for the visual story builder.',
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
      const gameDir = path.join(projectPath, 'game');

      if (!fs.existsSync(gameDir)) {
        return {
          content: [
            {
              type: 'text',
              text: `Project "${args.projectName}" not found or has no game directory.`,
            },
          ],
          structuredContent: { error: 'Project not found' },
        };
      }

      // Find all .rpy files
      const rpyFiles = fs.readdirSync(gameDir).filter((f) => f.endsWith('.rpy'));

      if (rpyFiles.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No .rpy script files found in project "${args.projectName}".`,
            },
          ],
          structuredContent: {
            nodes: [],
            edges: [],
            metadata: {
              projectName: args.projectName,
              scriptFiles: [],
              labelCount: 0,
              menuCount: 0,
              hasErrors: false,
            },
          },
        };
      }

      // Read and parse all scripts
      const scripts = rpyFiles.map((fileName) => ({
        fileName,
        content: fs.readFileSync(path.join(gameDir, fileName), 'utf-8'),
      }));

      const graph = parseMultipleScripts(scripts);
      graph.metadata.projectName = args.projectName;

      return {
        content: [
          {
            type: 'text',
            text: `Parsed ${rpyFiles.length} script(s): ${graph.metadata.labelCount} labels, ${graph.metadata.menuCount} menus, ${graph.edges.length} connections.`,
          },
        ],
        structuredContent: graph,
      };
    }
  );

  // Read a script file - Silent tool (model-facing)
  server.tool(
    'read_project_file',
    'Read the contents of a script or configuration file.\n\n' +
      'PROJECT STRUCTURE:\n' +
      '  {WORKSPACE}/{project_name}/\n' +
      '    game/           <- Script files (.rpy)\n' +
      '    assets/\n' +
      '      background/   <- Background images\n' +
      '      character/    <- Character sprites',
    {
      projectName: z.string().min(1).describe('Name of the project'),
      filePath: z.string().min(1).describe('Relative path within game/ directory (e.g., "script.rpy", "intro.rpy")'),
    },
    async (args: { projectName: string; filePath: string }) => {
      const projectPath = path.join(WORKSPACE_DIR, args.projectName);
      const gameDir = path.join(projectPath, 'game');
      const targetFile = path.join(gameDir, args.filePath);

      if (!fs.existsSync(targetFile)) {
        // List available files to help the user
        const availableFiles: string[] = [];
        if (fs.existsSync(gameDir)) {
          for (const file of fs.readdirSync(gameDir)) {
            if (file.endsWith('.rpy')) {
              availableFiles.push(file);
            }
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `File "${args.filePath}" not found in project "${args.projectName}".\n` +
                `Looked in: ${gameDir}\n` +
                `Available scripts: ${availableFiles.length > 0 ? availableFiles.join(', ') : 'none'}`,
            },
          ],
          structuredContent: {
            error: 'File not found',
            searchedPath: targetFile,
            gameDir,
            availableScripts: availableFiles,
          },
        };
      }

      const content = fs.readFileSync(targetFile, 'utf-8');

      // Update state
      studioState.selectedScript = args.filePath;

      return {
        content: [
          {
            type: 'text',
            text: `File: ${targetFile}\n` +
              `Lines: ${content.split('\n').length}\n\n` +
              `--- CONTENT ---\n${content}`,
          },
        ],
        structuredContent: {
          projectName: args.projectName,
          filePath: args.filePath,
          fullPath: targetFile,
          gameDir,
          content,
          lines: content.split('\n').length,
        },
      };
    }
  );

  // Edit/create a script file - Silent tool (model-facing)
  server.tool(
    'edit_project_file',
    'Create or update a script file. IMPORTANT: After editing scripts, ' +
      'use build_project to recompile before previewing.\n\n' +
      'Files are saved to: {WORKSPACE}/{project_name}/game/{filePath}',
    {
      projectName: z.string().min(1).describe('Name of the project'),
      filePath: z.string().min(1).describe('Relative path within game/ directory (e.g., "script.rpy", "intro.rpy")'),
      content: z.string().describe('Full file content'),
    },
    async (args: { projectName: string; filePath: string; content: string }) => {
      const projectPath = path.join(WORKSPACE_DIR, args.projectName);
      const gameDir = path.join(projectPath, 'game');
      const targetFile = path.join(gameDir, args.filePath);

      // Ensure directory exists
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });

      // Check if file exists (for messaging)
      const isNew = !fs.existsSync(targetFile);

      // Write file
      fs.writeFileSync(targetFile, args.content);

      const action = isNew ? 'Created' : 'Updated';

      return {
        content: [
          {
            type: 'text',
            text: `${action} "${args.filePath}"\n` +
              `Full path: ${targetFile}\n` +
              `Lines: ${args.content.split('\n').length}\n\n` +
              `⚠️ Remember to run build_project before previewing!`,
          },
        ],
        structuredContent: {
          projectName: args.projectName,
          filePath: args.filePath,
          fullPath: targetFile,
          gameDir,
          lines: args.content.split('\n').length,
          action: action.toLowerCase(),
        },
      };
    }
  );

  // Generate a new script - Silent tool (model-facing, Claude writes scripts)
  // Complete script writing guidelines from the original MCP server
  const scriptGuidelines = `Write a Ren'Py script file to the project.

YOU (the MCP client) should generate the script content based on these guidelines,
then pass it to this tool to save. Gemini is only for images, not dialogue!

SCRIPT WRITING GUIDELINES:

Create interactive visual novel scenes with proper Ren'Py structure and player choices.

CRITICAL REQUIREMENTS:

0. LABEL NAMING (VERY IMPORTANT):
   NEVER use "label start" in generated scripts!
   - The main script.rpy already has "label start"
   - Use a unique label name based on the script name
   - Example: If script is "tennis_date.rpy", use "label tennis_date:"
   - The main script.rpy will call your label

   WRONG: label start: "This will cause an error!"
   CORRECT: label my_scene: "This works perfectly!"

1. CHARACTER DEFINITIONS (REQUIRED AT TOP OF SCRIPT):
   You MUST define characters before using them in dialogue:

   define alice = Character("Alice", color="#4a90e2")
   define bob = Character("Bob", color="#e74c3c")
   define narrator = Character(None)  # For narration without a name

2. IMAGE DEFINITIONS (REQUIRED FOR EACH CHARACTER):
   You MUST define image mappings for character sprites:

   image alice neutral = "images/alice_neutral_transparent.png"
   image alice happy = "images/alice_happy_transparent.png"
   image alice sad = "images/alice_sad_transparent.png"
   image alice surprised = "images/alice_surprised_transparent.png"
   image alice angry = "images/alice_angry_transparent.png"

3. INTERACTIVE CHOICES (REQUIRED):
   Every scene MUST include at least ONE menu with 2-3 player choices.
   Each choice should lead to different dialogue/responses.

4. CHARACTER POSITIONING:
   ALWAYS add an "at" clause so sprites don't stack center-screen.
   Characters are normalized to 750px height for consistent sizing.

   Define positions with good spacing:

   # Custom positions with wider spacing (RECOMMENDED)
   define left_pos = Position(xalign=0.2, yalign=1.0)   # 20% from left
   define center_pos = Position(xalign=0.5, yalign=1.0)  # Center
   define right_pos = Position(xalign=0.8, yalign=1.0)   # 80% from left

   # Characters are 750px, zoom 0.65 works great
   transform scaled:
       zoom 0.65

   Then use in scenes:
   - 1 character: show alice at scaled, center_pos
   - 2 characters: show alice at scaled, left_pos / show bob at scaled, right_pos
   - 3 characters: use left_pos, center_pos, right_pos

5. IMAGE REFERENCES & EMOTION SWITCHING:
   - Backgrounds: "images/{filename}.png"
   - Characters: "images/{name}_{emotion}_transparent.png"

   CRITICAL: When switching emotions, ALWAYS include "at scaled, position"!

   show alice neutral at scaled, left_pos with moveinleft
   alice "Hello there."

   show alice happy at scaled, left_pos with dissolve  # MUST include BOTH!
   alice "It's so nice to see you!"

   - Missing transform -> character changes size
   - Missing position -> creates DUPLICATE character at different location

6. TRANSITIONS & VISUAL FLOW:
   - Use transitions: scene bg cafe_interior with dissolve
   - Character entrances: show bob at scaled, right with moveinright
   - Character exits: hide bob with moveoutright
   - Emotion changes: show alice happy with dissolve

7. SCENE STRUCTURE:
   Every scene follows this pattern:

   label my_scene_name:
       scene bg {background_name} with dissolve
       show {character} at {position} with moveinleft

       Character "Dialogue text"

       menu:
           "Question or prompt?"
           "Choice 1":
               Character "Response to choice 1"
           "Choice 2":
               Character "Response to choice 2"

       Character "Concluding dialogue"
       return

COMPLETE EXAMPLE:

# File: cafe_intro.rpy

# Character definitions (REQUIRED)
define alice = Character("Alice", color="#4a90e2")
define bob = Character("Bob", color="#e74c3c")

# Image definitions (REQUIRED for each character)
image alice neutral = "images/alice_neutral_transparent.png"
image alice happy = "images/alice_happy_transparent.png"
image alice sad = "images/alice_sad_transparent.png"
image bob neutral = "images/bob_neutral_transparent.png"
image bob happy = "images/bob_happy_transparent.png"

# Position definitions
define left_pos = Position(xalign=0.2, yalign=1.0)
define right_pos = Position(xalign=0.8, yalign=1.0)
define center_pos = Position(xalign=0.5, yalign=1.0)

transform scaled:
    zoom 0.65

label cafe_intro:
    scene bg cafe_interior with fade
    show alice neutral at scaled, left_pos with moveinleft
    show bob neutral at scaled, right_pos with moveinright

    alice "Welcome to The Daily Grind!"
    bob "Thanks! This place looks cozy."

    menu:
        "What would you like to order?"
        "I'll have a latte.":
            show alice happy at scaled, left_pos with dissolve
            alice "Excellent choice!"
        "Just water.":
            alice "Of course!"

    alice "I'll have that ready soon!"
    return

TONE EXAMPLES: upbeat, mysterious, romantic, dramatic, comedic

CHOICE DESIGN: Make choices meaningful, keep text concise, provide 2-3 options.`;

  server.tool(
    'generate_script',
    scriptGuidelines,
    {
      projectName: z.string().min(1).describe('Name of the project'),
      scriptName: z.string().min(1).describe('Script name (becomes filename)'),
      scriptContent: z.string().min(10).describe("Complete Ren'Py script content following the guidelines above"),
    },
    async (args: {
      projectName: string;
      scriptName: string;
      scriptContent: string;
    }) => {
      const projectPath = path.join(WORKSPACE_DIR, args.projectName);
      const gameDir = path.join(projectPath, 'game');
      const safeName = args.scriptName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const scriptFile = path.join(gameDir, `${safeName}.rpy`);
      const mainScript = path.join(gameDir, 'script.rpy');

      // Ensure game directory exists
      fs.mkdirSync(gameDir, { recursive: true });

      // Write the new script
      fs.writeFileSync(scriptFile, args.scriptContent);

      // Extract the label name from the script
      const labelMatch = args.scriptContent.match(/^label\s+(\w+):/m);
      const labelName = labelMatch ? labelMatch[1] : safeName;

      // Update main script to call this label
      if (fs.existsSync(mainScript)) {
        const mainContent = fs.readFileSync(mainScript, 'utf-8');

        // Check if it's the default template
        if (
          mainContent.includes('Welcome to') &&
          mainContent.includes('label start:')
        ) {
          // Replace with a call to the new script
          const newMain = `# ${args.projectName}
# A visual novel created with RenPy Studio

label start:
    call ${labelName}
    return
`;
          fs.writeFileSync(mainScript, newMain);
        }
      }

      // AUTO-VALIDATE: Run validation on the newly created script
      const { backgrounds, characters } = getAvailableAssets(args.projectName);
      const validationResult = validateScriptFile(
        args.projectName,
        `${safeName}.rpy`,
        args.scriptContent,
        backgrounds,
        characters
      );

      const validationText = formatValidationResults([validationResult], backgrounds, characters);
      const hasErrors = validationResult.errors.length > 0;
      const hasWarnings = validationResult.warnings.length > 0;

      let statusText = `Created "${safeName}.rpy" with label "${labelName}". Main script updated to call it.\n\n`;
      statusText += `--- AUTO-VALIDATION ---\n`;
      statusText += validationText;

      return {
        content: [
          {
            type: 'text',
            text: statusText,
          },
        ],
        structuredContent: {
          projectName: args.projectName,
          scriptFile: `${safeName}.rpy`,
          labelName,
          validation: {
            errors: validationResult.errors,
            warnings: validationResult.warnings,
            suggestions: validationResult.suggestions,
            hasErrors,
            hasWarnings,
          },
        },
      };
    }
  );

  // Validate script for common errors - Silent tool (model-facing)
  server.tool(
    'validate_script',
    'Validate a Ren\'Py script for common errors BEFORE building. ' +
      'Checks for: missing character definitions, missing image definitions, ' +
      'forbidden "label start", missing position/transform definitions, ' +
      'characters shown without "at" clause, and missing background definitions. ' +
      'This is also automatically run after generate_script.',
    {
      projectName: z.string().min(1).describe('Name of the project'),
      scriptFile: z.string().optional().describe('Specific script file to validate (default: all .rpy files)'),
    },
    async (args: { projectName: string; scriptFile?: string }) => {
      const projectPath = path.join(WORKSPACE_DIR, args.projectName);
      const gameDir = path.join(projectPath, 'game');

      if (!fs.existsSync(gameDir)) {
        return {
          content: [
            {
              type: 'text',
              text: `Project "${args.projectName}" not found or has no game directory.`,
            },
          ],
          structuredContent: { error: 'Project not found' },
        };
      }

      // Get available assets using helper function
      const { backgrounds, characters } = getAvailableAssets(args.projectName);

      // Get scripts to validate
      const scriptsToValidate: string[] = [];
      if (args.scriptFile) {
        scriptsToValidate.push(args.scriptFile);
      } else {
        for (const file of fs.readdirSync(gameDir)) {
          if (file.endsWith('.rpy')) {
            scriptsToValidate.push(file);
          }
        }
      }

      // Validate each script using helper function
      const allResults: ScriptValidationResult[] = [];
      for (const scriptFile of scriptsToValidate) {
        const scriptPath = path.join(gameDir, scriptFile);
        if (!fs.existsSync(scriptPath)) continue;

        const content = fs.readFileSync(scriptPath, 'utf-8');
        const result = validateScriptFile(args.projectName, scriptFile, content, backgrounds, characters);

        if (result.errors.length > 0 || result.warnings.length > 0 || result.suggestions.length > 0) {
          allResults.push(result);
        }
      }

      // Build output
      let textOutput = `VALIDATION RESULTS FOR: ${args.projectName}\n`;
      textOutput += `Scripts checked: ${scriptsToValidate.length}\n`;
      textOutput += `Available backgrounds: ${backgrounds.size}\n`;
      textOutput += `Available characters: ${characters.size} (${Array.from(characters).join(', ')})\n\n`;
      textOutput += formatValidationResults(allResults, backgrounds, characters);

      return {
        content: [
          {
            type: 'text',
            text: textOutput,
          },
        ],
        structuredContent: {
          projectName: args.projectName,
          scriptsChecked: scriptsToValidate,
          availableAssets: {
            backgrounds: Array.from(backgrounds),
            characters: Array.from(characters),
          },
          issues: allResults,
          hasErrors: allResults.some((r) => r.errors.length > 0),
          hasWarnings: allResults.some((r) => r.warnings.length > 0),
        },
      };
    }
  );
}

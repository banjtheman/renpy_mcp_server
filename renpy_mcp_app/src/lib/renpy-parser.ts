/**
 * Ren'Py Script Parser
 *
 * Parses Ren'Py scripts and extracts story structure for the visual builder.
 * Ported from the Go parser at bootstrap_renpy/renpy-graphviz/parser/parser.go
 */

import type {
  SceneNode,
  SceneEdge,
  ScriptGraph,
  GraphMetadata,
  ParserContext,
  LabelStackItem,
  NodeTags,
  CharacterState,
  DialogueLine,
  MenuChoice,
  SceneNodeData,
  EdgeType,
} from './story-types.js';
import { defaultTags } from './story-types.js';

// ============================================================================
// Regex Patterns (from regexes.go)
// ============================================================================

const PATTERNS = {
  // Label definition: label name(...):
  label: /^\s*label\s+([\w.]+)(?:\([^)]*\))?\s*:\s*(?:#.*)?$/,
  // Jump statement: jump target
  jump: /^\s*jump\s+([\w.]+)\s*(?:#.*)?$/,
  // Call statement: call target(...)
  call: /^\s*call\s+([\w.]+)(?:\([^)]*\))?\s*(?:#.*)?$/,
  // Call screen: call screen name
  callScreen: /^\s*call\s+screen\s+(\w+).*(?:#.*)?$/,
  // Menu block: menu:
  menu: /^\s*menu.*:\s*(?:#.*)?$/,
  // Choice in menu: "text": or 'text':
  choice: /^\s*["'](.+?)["'].*:\s*(?:#.*)?$/,
  // Return statement
  return: /^\s{0,4}return\s*(?:#.*)?$/,
  // Comment or blank line
  comment: /^\s*(#.*)?$/,
  // Scene (background): scene bg name or scene bg_name with transition
  scene: /^\s*scene\s+(?:bg\s+)?(\w+)(?:\s+with\s+(\w+))?/,
  // Show character: show name emotion at transform, position with transition
  // Captures: name, emotion, and position (left_pos, center_pos, right_pos, left, center, right)
  show: /^\s*show\s+(\w+)(?:\s+(\w+))?(?:\s+at\s+[\w,\s]*?(left|center|right)[\w_]*)?/i,
  // Hide character: hide name
  hide: /^\s*hide\s+(\w+)/,
  // Dialogue: Character "text" or "text" (narration)
  dialogue: /^\s*(\w+)\s+"(.+)"(?:\s*#.*)?$/,
  narration: /^\s*"(.+)"(?:\s*#.*)?$/,
  // Screen definition
  screen: /^\s*(?:init\s+[-\w]*\s+)?screen\s+([\w.]+).*:\s*(?:#.*)?$/,
  // Screen to label: action Jump("label") or Call("label")
  screenToLabel: /^\s*action\s+.*(?:Jump|Call)\("(.*?)".*\).*(?:#.*)?$/,
  // Get leading spaces
  spaces: /^(\s*)/,
};

// ============================================================================
// Parser State Machine
// ============================================================================

type Situation = 'pending' | 'label' | 'jump' | 'call' | 'menu' | 'choice' | 'screen' | 'return';

interface ParsedLine {
  situation: Situation;
  labelName?: string;
  targetName?: string;
  choiceText?: string;
  background?: string;
  transition?: string;
  character?: { name: string; emotion?: string; position?: 'left' | 'center' | 'right' };
  dialogue?: { speaker: string | null; text: string };
}

/**
 * Get indentation level of a line (-1 for comments/blank)
 */
function getIndent(line: string): number {
  if (PATTERNS.comment.test(line)) {
    return -1;
  }
  const match = line.match(PATTERNS.spaces);
  return match ? match[1].length : 0;
}

/**
 * Parse a single line and determine its situation
 */
function parseLine(line: string, context: ParserContext): ParsedLine {
  const result: ParsedLine = { situation: 'pending' };

  // Check for return statement (breaks flow)
  if (PATTERNS.return.test(line)) {
    result.situation = 'return';
    return result;
  }

  // Check for label definition
  const labelMatch = line.match(PATTERNS.label);
  if (labelMatch) {
    result.situation = 'label';
    result.labelName = labelMatch[1];
    return result;
  }

  // Check for jump statement
  const jumpMatch = line.match(PATTERNS.jump);
  if (jumpMatch) {
    result.situation = 'jump';
    result.targetName = jumpMatch[1];
    return result;
  }

  // Check for call statement (not call screen)
  if (!PATTERNS.callScreen.test(line)) {
    const callMatch = line.match(PATTERNS.call);
    if (callMatch) {
      result.situation = 'call';
      result.targetName = callMatch[1];
      return result;
    }
  }

  // Check for menu
  if (PATTERNS.menu.test(line)) {
    result.situation = 'menu';
    return result;
  }

  // Check for choice (only inside menu)
  if (context.menuIndent > 0) {
    const choiceMatch = line.match(PATTERNS.choice);
    if (choiceMatch) {
      result.situation = 'choice';
      result.choiceText = choiceMatch[1].replace(/\\/g, '');
      return result;
    }
  }

  // Check for scene (background)
  const sceneMatch = line.match(PATTERNS.scene);
  if (sceneMatch) {
    result.background = sceneMatch[1];
    result.transition = sceneMatch[2];
  }

  // Check for show (character)
  const showMatch = line.match(PATTERNS.show);
  if (showMatch) {
    // Extract position from match group 3 (left, center, or right)
    const posMatch = showMatch[3]?.toLowerCase() as 'left' | 'center' | 'right' | undefined;
    result.character = {
      name: showMatch[1],
      emotion: showMatch[2],
      position: posMatch || 'center',
    };
  }

  // Check for dialogue
  const dialogueMatch = line.match(PATTERNS.dialogue);
  if (dialogueMatch) {
    result.dialogue = {
      speaker: dialogueMatch[1],
      text: dialogueMatch[2],
    };
  } else {
    const narrationMatch = line.match(PATTERNS.narration);
    if (narrationMatch) {
      result.dialogue = {
        speaker: null,
        text: narrationMatch[1],
      };
    }
  }

  // Check for screen
  const screenMatch = line.match(PATTERNS.screen);
  if (screenMatch) {
    result.situation = 'screen';
    result.labelName = screenMatch[1];
  }

  return result;
}

/**
 * Clean context based on indentation changes
 */
function cleanContextByIndent(context: ParserContext, line: string, currentNodeBuilder: NodeBuilder | null): void {
  const indent = context.indent;

  // Reset choice context when leaving choice branch (dedented past choice level)
  if (context.choiceIndent > 0 && indent >= 0 && indent <= context.choiceIndent) {
    // Finalize the current choice if it has inline dialogue
    if (currentNodeBuilder?.currentChoice) {
      // Add to current menu if exists
      if (currentNodeBuilder.currentMenu) {
        currentNodeBuilder.currentMenu.choices.push(currentNodeBuilder.currentChoice);
      }
      // Also add to deprecated top-level choices for backwards compat
      currentNodeBuilder.choices.push(currentNodeBuilder.currentChoice);
      currentNodeBuilder.currentChoice = null;
    }
    context.choiceIndent = 0;
    context.lastChoice = '';
  }

  // Reset menu context when leaving menu
  if (indent >= 0 && indent <= context.menuIndent) {
    // Finalize any pending choice first
    if (currentNodeBuilder?.currentChoice) {
      if (currentNodeBuilder.currentMenu) {
        currentNodeBuilder.currentMenu.choices.push(currentNodeBuilder.currentChoice);
      }
      currentNodeBuilder.choices.push(currentNodeBuilder.currentChoice);
      currentNodeBuilder.currentChoice = null;
    }

    // Finalize the current menu
    if (currentNodeBuilder?.currentMenu) {
      currentNodeBuilder.menus.push(currentNodeBuilder.currentMenu);
      currentNodeBuilder.currentMenu = null;
    }

    context.menuIndent = 0;
    context.lastChoice = '';
    context.choiceIndent = 0;
  }

  // Pop labels from stack when dedenting
  const trimmed = line.trimStart();
  if (trimmed.length >= 4 && !trimmed.startsWith('menu')) {
    if (indent >= 0) {
      for (let i = 0; i < context.labelStack.length; i++) {
        if (indent <= context.labelStack[i].indent) {
          context.lastLabel = context.labelStack[i].labelName;
          context.labelStack = context.labelStack.slice(0, i);
          break;
        }
      }
    }
  }

  // Reset screen at root level
  if (indent === 0) {
    context.currentScreen = '';
  }
}

// ============================================================================
// Main Parser
// ============================================================================

interface MenuBuilder {
  atDialogueIndex: number;
  prompt?: string;
  choices: MenuChoice[];
}

interface NodeBuilder {
  id: string;
  type: 'label' | 'menu' | 'screen';
  background?: string;
  backgroundTransition?: string;
  characters: CharacterState[];
  dialogue: DialogueLine[];
  choices: MenuChoice[]; // Deprecated, kept for backwards compat
  /** All menus in this scene */
  menus: MenuBuilder[];
  /** Current menu being built */
  currentMenu: MenuBuilder | null;
  /** Visual events tracked with dialogue position */
  visualEvents: Array<{
    type: 'scene' | 'show' | 'hide';
    beforeDialogueIndex: number;
    background?: string;
    transition?: string;
    character?: { name: string; emotion?: string; position?: 'left' | 'center' | 'right' };
  }>;
  /** Current choice being built (for inline dialogue) */
  currentChoice: MenuChoice | null;
  /** Index in dialogue[] where the menu appears */
  menuAtDialogueIndex?: number; // Deprecated
  file: string;
  lineStart: number;
  lineEnd: number;
  rawCode: string[];
}

/**
 * Parse Ren'Py script content and return a ScriptGraph
 */
export function parseRenpyScript(
  content: string,
  fileName: string = 'script.rpy'
): ScriptGraph {
  const lines = content.split('\n');
  const nodes: Map<string, NodeBuilder> = new Map();
  const edges: SceneEdge[] = [];

  const context: ParserContext = {
    currentSituation: 'pending',
    indent: 0,
    currentLabel: '',
    labelStack: [],
    lastLabel: '',
    detectImplicitJump: false,
    menuIndent: 0,
    lastChoice: '',
    choiceIndent: 0,
    currentScreen: '',
    tags: { ...defaultTags },
  };

  let currentNodeBuilder: NodeBuilder | null = null;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const indent = getIndent(line);

    // Skip comments/blank lines for indent tracking
    if (indent >= 0) {
      context.indent = indent;
      cleanContextByIndent(context, line, currentNodeBuilder);
    }

    const parsed = parseLine(line, context);

    switch (parsed.situation) {
      case 'label': {
        // Finalize any pending choice before saving
        if (currentNodeBuilder?.currentChoice) {
          currentNodeBuilder.choices.push(currentNodeBuilder.currentChoice);
          currentNodeBuilder.currentChoice = null;
        }

        // Save previous node
        if (currentNodeBuilder) {
          currentNodeBuilder.lineEnd = lineNum - 1;
          nodes.set(currentNodeBuilder.id, currentNodeBuilder);
        }

        const labelName = parsed.labelName!;

        // Check for implicit jump from previous label
        if (context.detectImplicitJump && context.lastLabel) {
          edges.push({
            id: `${context.lastLabel}->${labelName}-implicit`,
            source: context.lastLabel,
            target: labelName,
            data: { edgeType: 'implicit' },
          });
        }

        // Check for stacked labels
        if (context.labelStack.length > 0) {
          const parentLabel = context.labelStack[context.labelStack.length - 1].labelName;
          edges.push({
            id: `${parentLabel}->${labelName}-nested`,
            source: parentLabel,
            target: labelName,
            data: { edgeType: 'implicit' },
          });
        }

        // Push to stack
        context.labelStack.push({ indent: context.indent, labelName });
        context.currentLabel = labelName;
        context.detectImplicitJump = true;

        // Start new node builder
        currentNodeBuilder = {
          id: labelName,
          type: 'label',
          characters: [],
          dialogue: [],
          choices: [],
          menus: [],
          currentMenu: null,
          visualEvents: [],
          currentChoice: null,
          file: fileName,
          lineStart: lineNum,
          lineEnd: lineNum,
          rawCode: [line],
        };
        break;
      }

      case 'jump': {
        if (context.labelStack.length > 0) {
          const fromLabel = context.labelStack[context.labelStack.length - 1].labelName;
          const toLabel = parsed.targetName!;

          edges.push({
            id: `${fromLabel}->${toLabel}-jump${context.lastChoice ? `-${context.lastChoice}` : ''}`,
            source: fromLabel,
            target: toLabel,
            data: {
              edgeType: context.lastChoice ? 'choice' : 'jump',
              choiceText: context.lastChoice || undefined,
            },
          });

          // If we're inside a choice with inline dialogue, set its target and finalize
          if (context.lastChoice && currentNodeBuilder?.currentChoice) {
            currentNodeBuilder.currentChoice.target = toLabel;
            // Add to current menu
            if (currentNodeBuilder.currentMenu) {
              currentNodeBuilder.currentMenu.choices.push(currentNodeBuilder.currentChoice);
            }
            currentNodeBuilder.choices.push(currentNodeBuilder.currentChoice);
            currentNodeBuilder.currentChoice = null;
          } else if (context.lastChoice && currentNodeBuilder) {
            // Simple choice with just a jump
            const newChoice = {
              text: context.lastChoice,
              target: toLabel,
            };
            if (currentNodeBuilder.currentMenu) {
              currentNodeBuilder.currentMenu.choices.push(newChoice);
            }
            currentNodeBuilder.choices.push(newChoice);
          }
        }

        context.lastLabel = '';
        context.detectImplicitJump = false;
        context.lastChoice = '';
        context.choiceIndent = 0;
        break;
      }

      case 'call': {
        if (context.labelStack.length > 0) {
          const fromLabel = context.labelStack[context.labelStack.length - 1].labelName;
          const toLabel = parsed.targetName!;

          edges.push({
            id: `${fromLabel}->${toLabel}-call`,
            source: fromLabel,
            target: toLabel,
            data: { edgeType: 'call' },
          });
        }

        // Call acts like a temporary label
        context.labelStack.push({ indent: context.indent, labelName: parsed.targetName! });
        context.detectImplicitJump = true;
        break;
      }

      case 'menu': {
        context.menuIndent = context.indent;

        if (currentNodeBuilder) {
          // Finalize any previous menu
          if (currentNodeBuilder.currentMenu) {
            currentNodeBuilder.menus.push(currentNodeBuilder.currentMenu);
          }

          // Start a new menu at the current dialogue index
          currentNodeBuilder.currentMenu = {
            atDialogueIndex: currentNodeBuilder.dialogue.length,
            choices: [],
          };

          currentNodeBuilder.type = 'menu';
          // Keep deprecated field for backwards compat
          currentNodeBuilder.menuAtDialogueIndex = currentNodeBuilder.dialogue.length;
        }
        break;
      }

      case 'choice': {
        // Finalize previous choice if it had inline dialogue
        if (currentNodeBuilder?.currentChoice && currentNodeBuilder.currentMenu) {
          currentNodeBuilder.currentMenu.choices.push(currentNodeBuilder.currentChoice);
          // Also add to deprecated top-level choices for backwards compat
          currentNodeBuilder.choices.push(currentNodeBuilder.currentChoice);
          currentNodeBuilder.currentChoice = null;
        }

        context.lastChoice = parsed.choiceText || '';
        context.choiceIndent = context.indent;

        // Start a new choice with potential inline dialogue
        if (currentNodeBuilder) {
          currentNodeBuilder.currentChoice = {
            text: parsed.choiceText || '',
            target: '', // Will be set if there's a jump, empty for inline
            inlineDialogue: [],
            inlineVisualEvents: [],
          };
        }
        break;
      }

      case 'return': {
        context.lastLabel = '';
        context.detectImplicitJump = false;
        break;
      }

      case 'pending':
      default: {
        // Collect scene data for current node
        if (currentNodeBuilder) {
          // Check if we're inside a choice branch (has inline dialogue)
          const insideChoiceBranch = currentNodeBuilder.currentChoice !== null;

          // Track visual events BEFORE adding dialogue
          // This allows us to know what the visual state is at each dialogue index
          const currentDialogueIndex = insideChoiceBranch
            ? (currentNodeBuilder.currentChoice?.inlineDialogue?.length ?? 0)
            : currentNodeBuilder.dialogue.length;

          if (parsed.background) {
            currentNodeBuilder.background = parsed.background;
            currentNodeBuilder.backgroundTransition = parsed.transition;

            const visualEvent = {
              type: 'scene' as const,
              beforeDialogueIndex: currentDialogueIndex,
              background: parsed.background,
              transition: parsed.transition,
            };

            if (insideChoiceBranch) {
              currentNodeBuilder.currentChoice!.inlineVisualEvents =
                currentNodeBuilder.currentChoice!.inlineVisualEvents || [];
              currentNodeBuilder.currentChoice!.inlineVisualEvents.push(visualEvent);
            } else {
              currentNodeBuilder.visualEvents.push(visualEvent);
            }
          }
          if (parsed.character) {
            // Update or add character to the cumulative list
            const existing = currentNodeBuilder.characters.find(
              (c) => c.name === parsed.character!.name
            );
            const charPosition = parsed.character.position || 'center';
            if (existing) {
              existing.emotion = parsed.character.emotion || existing.emotion;
              existing.position = charPosition;
            } else {
              currentNodeBuilder.characters.push({
                name: parsed.character.name,
                emotion: parsed.character.emotion || 'neutral',
                position: charPosition,
              });
            }

            const visualEvent = {
              type: 'show' as const,
              beforeDialogueIndex: currentDialogueIndex,
              character: {
                name: parsed.character.name,
                emotion: parsed.character.emotion,
                position: charPosition,
              },
            };

            if (insideChoiceBranch) {
              currentNodeBuilder.currentChoice!.inlineVisualEvents =
                currentNodeBuilder.currentChoice!.inlineVisualEvents || [];
              currentNodeBuilder.currentChoice!.inlineVisualEvents.push(visualEvent);
            } else {
              currentNodeBuilder.visualEvents.push(visualEvent);
            }
          }
          if (parsed.dialogue) {
            // Check if this is a menu prompt (narration inside menu, before any choices)
            const isMenuPrompt =
              currentNodeBuilder.currentMenu !== null &&
              currentNodeBuilder.currentMenu.choices.length === 0 &&
              currentNodeBuilder.currentChoice === null &&
              parsed.dialogue.speaker === null;

            if (isMenuPrompt) {
              // Capture as menu prompt, not as dialogue
              currentNodeBuilder.currentMenu!.prompt = parsed.dialogue.text;
            } else if (insideChoiceBranch) {
              // Add to inline choice dialogue with branch marker
              currentNodeBuilder.currentChoice!.inlineDialogue =
                currentNodeBuilder.currentChoice!.inlineDialogue || [];
              currentNodeBuilder.currentChoice!.inlineDialogue.push({
                ...parsed.dialogue,
                choiceBranch: context.lastChoice,
              });
            } else {
              currentNodeBuilder.dialogue.push(parsed.dialogue);
            }
          }
          currentNodeBuilder.rawCode.push(line);
        }

        // Track that we have content after a label
        if (context.labelStack.length > 0 || context.lastLabel) {
          context.detectImplicitJump = true;
        }
        break;
      }
    }
  }

  // Finalize any pending choice before saving final node
  if (currentNodeBuilder?.currentChoice) {
    if (currentNodeBuilder.currentMenu) {
      currentNodeBuilder.currentMenu.choices.push(currentNodeBuilder.currentChoice);
    }
    currentNodeBuilder.choices.push(currentNodeBuilder.currentChoice);
    currentNodeBuilder.currentChoice = null;
  }

  // Finalize any pending menu
  if (currentNodeBuilder?.currentMenu) {
    currentNodeBuilder.menus.push(currentNodeBuilder.currentMenu);
    currentNodeBuilder.currentMenu = null;
  }

  // Save final node
  if (currentNodeBuilder) {
    currentNodeBuilder.lineEnd = lines.length - 1;
    nodes.set(currentNodeBuilder.id, currentNodeBuilder);
  }

  // Convert node builders to SceneNodes
  const sceneNodes: SceneNode[] = Array.from(nodes.values()).map((builder) => ({
    id: builder.id,
    type: builder.type,
    position: { x: 0, y: 0 }, // Will be laid out later
    data: {
      label: builder.id,
      background: builder.background,
      backgroundTransition: builder.backgroundTransition,
      characters: builder.characters,
      dialogue: builder.dialogue,
      choices: builder.choices.length > 0 ? builder.choices : undefined,
      visualEvents: builder.visualEvents.length > 0 ? builder.visualEvents : undefined,
      menuAtDialogueIndex: builder.menuAtDialogueIndex,
      menus: builder.menus.length > 0 ? builder.menus : undefined,
      tags: { ...defaultTags },
      file: builder.file,
      lineStart: builder.lineStart,
      lineEnd: builder.lineEnd,
      rawCode: builder.rawCode,
    },
  }));

  // Ensure all edge targets exist as nodes (create placeholder if missing)
  const nodeIds = new Set(sceneNodes.map((n) => n.id));
  for (const edge of edges) {
    if (!nodeIds.has(edge.target)) {
      sceneNodes.push({
        id: edge.target,
        type: 'label',
        position: { x: 0, y: 0 },
        data: {
          label: edge.target,
          characters: [],
          dialogue: [],
          tags: { ...defaultTags },
          file: '',
          lineStart: 0,
          lineEnd: 0,
          rawCode: [],
        },
      });
      nodeIds.add(edge.target);
    }
  }

  return {
    nodes: sceneNodes,
    edges,
    metadata: {
      projectName: '',
      scriptFiles: [fileName],
      labelCount: sceneNodes.filter((n) => n.type === 'label').length,
      menuCount: sceneNodes.filter((n) => n.type === 'menu').length,
      hasErrors: false,
    },
  };
}

/**
 * Parse multiple script files and merge into one graph
 */
export function parseMultipleScripts(
  scripts: Array<{ fileName: string; content: string }>
): ScriptGraph {
  const allNodes: SceneNode[] = [];
  const allEdges: SceneEdge[] = [];
  const fileNames: string[] = [];

  for (const script of scripts) {
    const graph = parseRenpyScript(script.content, script.fileName);
    allNodes.push(...graph.nodes);
    allEdges.push(...graph.edges);
    fileNames.push(script.fileName);
  }

  // Deduplicate nodes (keep first occurrence)
  const nodeMap = new Map<string, SceneNode>();
  for (const node of allNodes) {
    if (!nodeMap.has(node.id)) {
      nodeMap.set(node.id, node);
    }
  }

  // Deduplicate edges
  const edgeMap = new Map<string, SceneEdge>();
  for (const edge of allEdges) {
    const key = `${edge.source}->${edge.target}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, edge);
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
    metadata: {
      projectName: '',
      scriptFiles: fileNames,
      labelCount: Array.from(nodeMap.values()).filter((n) => n.type === 'label').length,
      menuCount: Array.from(nodeMap.values()).filter((n) => n.type === 'menu').length,
      hasErrors: false,
    },
  };
}

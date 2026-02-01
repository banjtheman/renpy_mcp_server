/**
 * Story Builder Types
 *
 * TypeScript interfaces for the visual story graph structure.
 * Used by both the parser and UI components.
 */

// ============================================================================
// Character and Dialogue Types
// ============================================================================

export interface CharacterState {
  name: string;
  emotion: string;
  position: 'left' | 'center' | 'right';
  [key: string]: unknown;
}

export interface DialogueLine {
  speaker: string | null; // null for narration
  text: string;
  /** If this dialogue is inside a menu choice branch, the choice text */
  choiceBranch?: string;
  [key: string]: unknown;
}

export interface MenuChoice {
  text: string;
  target: string; // Label to jump to (empty string if inline branch with no jump)
  /** Inline dialogue within this choice branch (if no jump) */
  inlineDialogue?: DialogueLine[];
  /** Visual events within this choice branch */
  inlineVisualEvents?: VisualEvent[];
  [key: string]: unknown;
}

/** A menu (choice point) within a scene */
export interface SceneMenu {
  /** Index in dialogue[] where this menu appears */
  atDialogueIndex: number;
  /** Optional prompt text (e.g., "How do you respond?") */
  prompt?: string;
  /** The choices available at this menu */
  choices: MenuChoice[];
}

// ============================================================================
// Visual Events - Track when visual state changes relative to dialogue
// ============================================================================

export type VisualEventType = 'scene' | 'show' | 'hide';

export interface VisualEvent {
  type: VisualEventType;
  /** Position in the dialogue array BEFORE which this event occurs */
  beforeDialogueIndex: number;
  /** For scene events */
  background?: string;
  transition?: string;
  /** For show/hide events */
  character?: {
    name: string;
    emotion?: string;
    position?: 'left' | 'center' | 'right';
  };
}

// ============================================================================
// Node Tags (from parser directives)
// ============================================================================

export interface NodeTags {
  ignore: boolean;
  title: boolean;
  breakFlow: boolean;
  gameOver: boolean;
  skipLink: boolean;
  screen: boolean;
  [key: string]: unknown;
}

// ============================================================================
// Scene Node Data
// ============================================================================

export interface SceneNodeData {
  label: string;
  background?: string;
  backgroundTransition?: string;
  characters: CharacterState[];
  dialogue: DialogueLine[];
  /** @deprecated Use menus instead. Kept for backwards compatibility. */
  choices?: MenuChoice[];
  /** Visual events in order - tracks when backgrounds/characters change */
  visualEvents?: VisualEvent[];
  /** @deprecated Use menus instead. Kept for backwards compatibility. */
  menuAtDialogueIndex?: number;
  /** All menus (choice points) in this scene, in order of appearance */
  menus?: SceneMenu[];
  tags: NodeTags;
  // Source location info
  file: string;
  lineStart: number;
  lineEnd: number;
  rawCode: string[];
  [key: string]: unknown;
}

export type SceneNodeType = 'label' | 'menu' | 'screen';

// React Flow compatible node type
export interface SceneNode {
  id: string;
  type: SceneNodeType;
  position: { x: number; y: number };
  data: SceneNodeData;
  [key: string]: unknown;
}

// ============================================================================
// Edge Types
// ============================================================================

export type EdgeType = 'jump' | 'call' | 'choice' | 'implicit';

export interface SceneEdgeData {
  edgeType: EdgeType;
  choiceText?: string;
  [key: string]: unknown;
}

// React Flow compatible edge type
export interface SceneEdge {
  id: string;
  source: string;
  target: string;
  data: SceneEdgeData;
  [key: string]: unknown;
}

// ============================================================================
// Graph Structure
// ============================================================================

export interface GraphMetadata {
  projectName: string;
  scriptFiles: string[];
  labelCount: number;
  menuCount: number;
  hasErrors: boolean;
  parseErrors?: string[];
  [key: string]: unknown;
}

export interface ScriptGraph {
  nodes: SceneNode[];
  edges: SceneEdge[];
  metadata: GraphMetadata;
  [key: string]: unknown;
}

// ============================================================================
// Parser Context (internal state machine)
// ============================================================================

export interface LabelStackItem {
  indent: number;
  labelName: string;
}

export interface ParserContext {
  currentSituation: 'pending' | 'label' | 'jump' | 'call' | 'menu' | 'choice' | 'screen' | 'return';
  indent: number;
  currentLabel: string;
  labelStack: LabelStackItem[];
  lastLabel: string;
  detectImplicitJump: boolean;
  menuIndent: number;
  lastChoice: string;
  /** Indentation level of the current choice (for tracking inline branch content) */
  choiceIndent: number;
  currentScreen: string;
  tags: NodeTags;
}

// ============================================================================
// Default Values
// ============================================================================

export const defaultTags: NodeTags = {
  ignore: false,
  title: false,
  breakFlow: false,
  gameOver: false,
  skipLink: false,
  screen: false,
};

export const defaultContext: ParserContext = {
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

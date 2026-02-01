/**
 * Visual Builder Types
 *
 * TypeScript interfaces for the visual scene builder state management.
 */

import type { MenuChoice, CharacterState, DialogueLine, SceneNode, SceneEdge, VisualEvent, SceneMenu } from '../../../lib/story-types';

// ============================================================================
// Story Beat - Individual moment in the story
// ============================================================================

export type BeatType = 'dialogue' | 'narration' | 'choice' | 'label-start';

export interface StoryBeat {
  /** Unique ID for this beat */
  id: string;
  /** Type of beat */
  type: BeatType;
  /** Source scene/label this beat came from */
  sourceLabel: string;
  /** Index within the source scene's dialogue array */
  dialogueIndex: number;

  /** For dialogue/narration beats */
  speaker: string | null;
  text: string;

  /** For choice beats */
  choices?: MenuChoice[];

  /** Current state at this moment */
  background: string | null;
  characters: CharacterState[];

  /** For label-start beats */
  isLabelStart?: boolean;

  /** If this beat is part of an inline choice branch, the choice text */
  choiceBranch?: string;
  /** Index of the choice within the menu (for inline branches) */
  choiceIndex?: number;
}

export interface BeatConnection {
  id: string;
  sourceId: string;
  targetId: string;
  /** For choice connections, which choice leads here */
  choiceIndex?: number;
  choiceText?: string;
}

// ============================================================================
// Expand scenes into beats
// ============================================================================

export function expandScenesIntoBeats(
  scenes: Map<string, SceneNode>,
  edges: SceneEdge[]
): { beats: StoryBeat[]; connections: BeatConnection[] } {
  const beats: StoryBeat[] = [];
  const connections: BeatConnection[] = [];

  // Debug logging (set to false for production)
  const DEBUG = false;
  const log = (...args: unknown[]) => { if (DEBUG) console.log('[BeatExpansion]', ...args); };

  // Track beat IDs for connecting
  const beatIdMap = new Map<string, string>();
  const lastBeatByLabel = new Map<string, string>();
  const firstBeatByLabel = new Map<string, string>();

  // Process each scene
  for (const [labelId, scene] of scenes.entries()) {
    const data = scene.data;
    const visualEvents = data.visualEvents || [];
    const dialogue = data.dialogue || [];

    // Get menus array - use new menus field if available, otherwise convert from old format
    const menus: SceneMenu[] = data.menus || (
      data.choices && data.choices.length > 0
        ? [{ atDialogueIndex: data.menuAtDialogueIndex ?? dialogue.length, choices: data.choices }]
        : []
    );

    // Sort menus by their position in the dialogue
    const sortedMenus = [...menus].sort((a, b) => a.atDialogueIndex - b.atDialogueIndex);

    log(`Scene ${labelId}: ${dialogue.length} dialogue lines, ${sortedMenus.length} menus`);
    sortedMenus.forEach((m, i) => {
      log(`  Menu ${i} at dialogue index ${m.atDialogueIndex}, ${m.choices.length} choices`);
      m.choices.forEach((c, ci) => {
        log(`    Choice ${ci}: "${c.text.slice(0, 30)}..." has ${c.inlineDialogue?.length ?? 0} inline lines`);
      });
    });

    // Helper: get visual state at a dialogue index
    const getVisualStateAt = (dialogueIndex: number): { background: string | null; characters: CharacterState[] } => {
      let bg: string | null = null;
      let chars: CharacterState[] = [];

      for (const event of visualEvents) {
        if (event.beforeDialogueIndex <= dialogueIndex) {
          if (event.type === 'scene' && event.background) {
            bg = event.background;
          } else if (event.type === 'show' && event.character) {
            const existingIdx = chars.findIndex(
              (c) => c.name.toLowerCase() === event.character!.name.toLowerCase()
            );
            const charState: CharacterState = {
              name: event.character.name,
              emotion: event.character.emotion || 'neutral',
              position: event.character.position || 'center',
            };
            if (existingIdx >= 0) {
              chars[existingIdx] = charState;
            } else {
              chars.push(charState);
            }
          } else if (event.type === 'hide' && event.character) {
            chars = chars.filter(
              (c) => c.name.toLowerCase() !== event.character!.name.toLowerCase()
            );
          }
        }
      }

      return { background: bg, characters: chars };
    };

    // Helper to create a beat from a dialogue line
    const createDialogueBeat = (line: DialogueLine, index: number, isFirstOfLabel: boolean): StoryBeat => {
      const { background, characters } = getVisualStateAt(index);
      const isNarration = line.speaker === null;
      const beatId = `${labelId}:${index}`;

      return {
        id: beatId,
        type: isNarration ? 'narration' : 'dialogue',
        sourceLabel: labelId,
        dialogueIndex: index,
        speaker: line.speaker,
        text: line.text,
        background,
        characters: [...characters],
        isLabelStart: isFirstOfLabel,
      };
    };

    let prevBeatId: string | null = null;
    let isFirstBeat = true;

    // Empty scene - create a label marker
    if (dialogue.length === 0 && sortedMenus.length === 0) {
      const { background, characters } = getVisualStateAt(0);
      const beatId = `${labelId}:start`;
      const beat: StoryBeat = {
        id: beatId,
        type: 'label-start',
        sourceLabel: labelId,
        dialogueIndex: -1,
        speaker: null,
        text: `[${labelId.replace(/_/g, ' ')}]`,
        background,
        characters: [...characters],
        isLabelStart: true,
      };
      beats.push(beat);
      beatIdMap.set(`${labelId}:-1`, beatId);
      firstBeatByLabel.set(labelId, beatId);
      lastBeatByLabel.set(labelId, beatId);
      continue;
    }

    // Process dialogue and menus in order
    let currentDialogueIdx = 0;
    let menuCounter = 0;

    for (let menuNum = 0; menuNum <= sortedMenus.length; menuNum++) {
      // Determine the end of this dialogue segment
      const segmentEnd = menuNum < sortedMenus.length
        ? sortedMenus[menuNum].atDialogueIndex
        : dialogue.length;

      // Create beats for dialogue in this segment
      for (let idx = currentDialogueIdx; idx < segmentEnd; idx++) {
        const line = dialogue[idx];
        const beat = createDialogueBeat(line, idx, isFirstBeat);
        beats.push(beat);
        beatIdMap.set(`${labelId}:${idx}`, beat.id);

        if (isFirstBeat) {
          firstBeatByLabel.set(labelId, beat.id);
          isFirstBeat = false;
        }

        // Connect to previous beat
        if (prevBeatId) {
          connections.push({
            id: `${prevBeatId}->${beat.id}`,
            sourceId: prevBeatId,
            targetId: beat.id,
          });
        }

        prevBeatId = beat.id;
        lastBeatByLabel.set(labelId, beat.id);
      }

      currentDialogueIdx = segmentEnd;

      // Process menu if there is one at this position
      if (menuNum < sortedMenus.length) {
        const menu = sortedMenus[menuNum];
        const { background: choiceBg, characters: choiceChars } = getVisualStateAt(menu.atDialogueIndex);
        const choiceBeatId = `${labelId}:menu${menuNum}`;

        const choiceBeat: StoryBeat = {
          id: choiceBeatId,
          type: 'choice',
          sourceLabel: labelId,
          dialogueIndex: menu.atDialogueIndex,
          speaker: null,
          text: menu.prompt || 'Choose:',
          choices: menu.choices,
          background: choiceBg,
          characters: [...choiceChars],
        };

        beats.push(choiceBeat);

        // Connect previous beat to choice
        if (prevBeatId) {
          connections.push({
            id: `${prevBeatId}->${choiceBeatId}`,
            sourceId: prevBeatId,
            targetId: choiceBeatId,
          });
        } else {
          firstBeatByLabel.set(labelId, choiceBeatId);
          isFirstBeat = false;
        }

        // Track last beats of inline branches
        const branchLastBeats: string[] = [];

        // Process inline dialogue for each choice
        menu.choices.forEach((choice, choiceIdx) => {
          if (choice.inlineDialogue && choice.inlineDialogue.length > 0) {
            const inlineEvents = choice.inlineVisualEvents || [];

            // Helper for inline visual state
            const getInlineVisualState = (lineIdx: number) => {
              let bg = choiceBg;
              let chars = [...choiceChars];

              for (const event of inlineEvents) {
                if (event.beforeDialogueIndex <= lineIdx) {
                  if (event.type === 'scene' && event.background) {
                    bg = event.background;
                  } else if (event.type === 'show' && event.character) {
                    const existingIdx = chars.findIndex(
                      (c) => c.name.toLowerCase() === event.character!.name.toLowerCase()
                    );
                    const charState: CharacterState = {
                      name: event.character.name,
                      emotion: event.character.emotion || 'neutral',
                      position: event.character.position || 'center',
                    };
                    if (existingIdx >= 0) {
                      chars[existingIdx] = charState;
                    } else {
                      chars.push(charState);
                    }
                  } else if (event.type === 'hide' && event.character) {
                    chars = chars.filter(
                      (c) => c.name.toLowerCase() !== event.character!.name.toLowerCase()
                    );
                  }
                }
              }

              return { background: bg, characters: chars };
            };

            let branchPrevBeatId = choiceBeatId;

            // Create beats for inline dialogue
            choice.inlineDialogue.forEach((line, lineIdx) => {
              const { background: lineBg, characters: lineChars } = getInlineVisualState(lineIdx);
              const inlineBeatId = `${labelId}:menu${menuNum}:choice${choiceIdx}:${lineIdx}`;
              const isNarration = line.speaker === null;

              const inlineBeat: StoryBeat = {
                id: inlineBeatId,
                type: isNarration ? 'narration' : 'dialogue',
                sourceLabel: labelId,
                dialogueIndex: menu.atDialogueIndex,
                speaker: line.speaker,
                text: line.text,
                background: lineBg,
                characters: [...lineChars],
                choiceBranch: choice.text,
                choiceIndex: choiceIdx,
              };

              beats.push(inlineBeat);

              connections.push({
                id: `${branchPrevBeatId}->${inlineBeatId}`,
                sourceId: branchPrevBeatId,
                targetId: inlineBeatId,
                choiceIndex: lineIdx === 0 ? choiceIdx : undefined,
                choiceText: lineIdx === 0 ? choice.text : undefined,
              });

              branchPrevBeatId = inlineBeatId;
            });

            branchLastBeats.push(branchPrevBeatId);
            beatIdMap.set(`${labelId}:menu${menuNum}:branch${choiceIdx}`, branchPrevBeatId);
          } else {
            // No inline dialogue - choice beat is the branch end
            branchLastBeats.push(choiceBeatId);
            beatIdMap.set(`${labelId}:menu${menuNum}:branch${choiceIdx}`, choiceBeatId);
          }
        });

        // Determine what comes after this menu
        const nextSegmentStart = menuNum + 1 < sortedMenus.length
          ? sortedMenus[menuNum + 1].atDialogueIndex
          : dialogue.length;

        if (currentDialogueIdx < nextSegmentStart) {
          // There's dialogue after this menu - connect branches to it
          // We'll create a "merge point" ID to reference later
          beatIdMap.set(`${labelId}:menu${menuNum}:merge`, `${labelId}:${currentDialogueIdx}`);
          log(`  Set merge point for menu ${menuNum}: ${labelId}:${currentDialogueIdx}`);

          // Store branch info for connecting when we create the next dialogue beat
          for (let i = 0; i < menu.choices.length; i++) {
            const branchEndId = beatIdMap.get(`${labelId}:menu${menuNum}:branch${i}`);
            if (branchEndId) {
              beatIdMap.set(`${labelId}:menu${menuNum}:branchEnd:${i}`, branchEndId);
            }
          }
        }

        // If there's a continuation, we'll connect branches to it when we create that beat
        // For now, set prevBeatId to null so the first continuation beat can handle merging
        prevBeatId = null;

        // Store menu info for the next iteration
        beatIdMap.set(`${labelId}:menu${menuNum}:id`, choiceBeatId);
        beatIdMap.set(`${labelId}:menu${menuNum}:choiceCount`, String(menu.choices.length));

        lastBeatByLabel.set(labelId, choiceBeatId);
        menuCounter++;
      }
    }

    // Connect any pending branches to the first continuation beat
    // This happens in the loop above when we create dialogue beats after a menu
    // But we need to handle the case where branches connect to dialogue created earlier
    log(`Creating merge connections for ${sortedMenus.length} menus in ${labelId}`);
    for (let menuNum = 0; menuNum < sortedMenus.length; menuNum++) {
      const mergeTargetId = beatIdMap.get(`${labelId}:menu${menuNum}:merge`);
      log(`  Menu ${menuNum}: mergeTargetId = ${mergeTargetId}`);
      if (mergeTargetId) {
        const choiceCount = parseInt(beatIdMap.get(`${labelId}:menu${menuNum}:choiceCount`) || '0', 10);
        const choiceBeatId = beatIdMap.get(`${labelId}:menu${menuNum}:id`);
        log(`    choiceCount = ${choiceCount}, choiceBeatId = ${choiceBeatId}`);

        for (let i = 0; i < choiceCount; i++) {
          const branchEndId = beatIdMap.get(`${labelId}:menu${menuNum}:branchEnd:${i}`);
          log(`    Branch ${i}: branchEndId = ${branchEndId}`);
          if (branchEndId) {
            if (branchEndId !== choiceBeatId) {
              // Has inline dialogue - connect branch end to merge point
              log(`      Creating merge connection: ${branchEndId} -> ${mergeTargetId}`);
              connections.push({
                id: `${branchEndId}->${mergeTargetId}:merge`,
                sourceId: branchEndId,
                targetId: mergeTargetId,
              });
            } else {
              // No inline dialogue - direct choice to merge point
              log(`      Creating choice-to-merge connection: ${choiceBeatId} -> ${mergeTargetId}`);
              connections.push({
                id: `${choiceBeatId}->${mergeTargetId}:choice${i}`,
                sourceId: choiceBeatId!,
                targetId: mergeTargetId,
                choiceIndex: i,
                choiceText: sortedMenus[menuNum].choices[i]?.text,
              });
            }
          } else {
            log(`      WARNING: No branchEndId found for branch ${i}`);
          }
        }
      }
    }
  }

  // Connect labels based on edges
  for (const edge of edges) {
    const sourceLastBeat = lastBeatByLabel.get(edge.source);
    const targetFirstBeat = firstBeatByLabel.get(edge.target);

    if (sourceLastBeat && targetFirstBeat) {
      const sourceBeat = beats.find(b => b.id === sourceLastBeat);

      if (sourceBeat?.type === 'choice' && edge.data?.choiceText) {
        const choiceIndex = sourceBeat.choices?.findIndex(c => c.text === edge.data.choiceText) ?? -1;

        connections.push({
          id: `${sourceLastBeat}->${targetFirstBeat}:choice${choiceIndex}`,
          sourceId: sourceLastBeat,
          targetId: targetFirstBeat,
          choiceIndex,
          choiceText: edge.data.choiceText,
        });
      } else if (sourceBeat?.type !== 'choice') {
        connections.push({
          id: `${sourceLastBeat}->${targetFirstBeat}`,
          sourceId: sourceLastBeat,
          targetId: targetFirstBeat,
        });
      }
    }
  }

  return { beats, connections };
}

// ============================================================================
// Navigation State
// ============================================================================

export interface NavigationState {
  /** Current scene ID (label name) */
  currentSceneId: string | null;
  /** Current dialogue line index within the scene */
  currentDialogueIndex: number;
  /** History of visited scenes for back navigation */
  history: string[];
  /** Index in history (for forward/back) */
  historyIndex: number;
  /** When at a choice point, the available branches */
  pendingBranch: MenuChoice[] | null;
  /** Selected branch index when choosing */
  selectedBranchIndex: number | null;
}

export const defaultNavigationState: NavigationState = {
  currentSceneId: null,
  currentDialogueIndex: 0,
  history: [],
  historyIndex: -1,
  pendingBranch: null,
  selectedBranchIndex: null,
};

// ============================================================================
// Edit State (for batch changes to Claude)
// ============================================================================

export type ChangeType = 'background' | 'character' | 'dialogue' | 'choice';
export type ChangeAction = 'add' | 'update' | 'delete';

export interface PendingChange {
  id: string;
  sceneId: string;
  type: ChangeType;
  action: ChangeAction;
  index?: number;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  description: string;
}

export interface EditState {
  /** List of pending changes not yet sent to Claude */
  pendingChanges: PendingChange[];
  /** Whether the Claude request panel is open */
  showClaudePanel: boolean;
  /** User notes for Claude */
  claudeNotes: string;
}

export const defaultEditState: EditState = {
  pendingChanges: [],
  showClaudePanel: false,
  claudeNotes: '',
};

// ============================================================================
// Local Scene State (working copy with edits)
// ============================================================================

export interface LocalSceneState {
  background?: string;
  characters: CharacterState[];
  dialogue: DialogueLine[];
  choices?: MenuChoice[];
}

// ============================================================================
// Combined Visual Builder State
// ============================================================================

export interface VisualBuilderState {
  navigation: NavigationState;
  edit: EditState;
  /** Local working copy of current scene (with unsaved edits) */
  localScene: LocalSceneState | null;
}

export const defaultVisualBuilderState: VisualBuilderState = {
  navigation: defaultNavigationState,
  edit: defaultEditState,
  localScene: null,
};

// ============================================================================
// Helper Functions
// ============================================================================

let changeIdCounter = 0;

export function createPendingChange(
  sceneId: string,
  type: ChangeType,
  action: ChangeAction,
  description: string,
  options?: {
    index?: number;
    field?: string;
    oldValue?: unknown;
    newValue?: unknown;
  }
): PendingChange {
  return {
    id: `change-${++changeIdCounter}`,
    sceneId,
    type,
    action,
    description,
    ...options,
  };
}

export function formatChangesForClaude(
  changes: PendingChange[],
  sceneLabel: string,
  userNotes: string
): string {
  if (changes.length === 0 && !userNotes.trim()) {
    return '';
  }

  const lines: string[] = [
    `I'm editing scene "${sceneLabel}".`,
    '',
  ];

  if (changes.length > 0) {
    lines.push('Changes to apply:');
    for (const change of changes) {
      lines.push(`- ${change.description}`);
    }
    lines.push('');
  }

  if (userNotes.trim()) {
    lines.push('Additional notes:');
    lines.push(userNotes.trim());
    lines.push('');
  }

  lines.push('Please update the script accordingly using edit_project_file or generate_script.');

  return lines.join('\n');
}

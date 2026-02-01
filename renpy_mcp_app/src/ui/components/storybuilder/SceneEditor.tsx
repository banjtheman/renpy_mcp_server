/**
 * SceneEditor - Table-Based Scene Editor Panel
 *
 * Displays scene elements in a table format for easy editing:
 * - Background selection
 * - Character list with positions
 * - Dialogue lines
 * - Menu choices (if applicable)
 */

import React, { useCallback, useMemo } from 'react';
import {
  BackgroundRow,
  CharacterRow,
  TextRow,
  ChoiceRow,
  AddRowButton,
} from './EditorRows';
import type { CharacterState, DialogueLine, MenuChoice } from '../../../lib/story-types';
import type { LocalSceneState, PendingChange } from './visual-builder-types';

// ============================================================================
// Asset Types
// ============================================================================

interface CharacterAsset {
  name: string;
  emotions: Array<{ emotion: string; base64: string; mimeType: string }>;
}

interface BackgroundAsset {
  name: string;
  path: string;
  base64: string;
  mimeType: string;
}

// ============================================================================
// Component Props
// ============================================================================

interface SceneEditorProps {
  scene: LocalSceneState;
  backgrounds: BackgroundAsset[];
  characters: CharacterAsset[];
  pendingChanges: PendingChange[];
  onBackgroundChange: (bgName: string) => void;
  onCharacterChange: (index: number, changes: Partial<CharacterState>) => void;
  onCharacterAdd: () => void;
  onCharacterRemove: (index: number) => void;
  onDialogueChange: (index: number, changes: Partial<DialogueLine>) => void;
  onDialogueAdd: () => void;
  onDialogueRemove: (index: number) => void;
  onChoiceChange: (index: number, changes: Partial<MenuChoice>) => void;
  onAskClaude: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function SceneEditor({
  scene,
  backgrounds,
  characters,
  pendingChanges,
  onBackgroundChange,
  onCharacterChange,
  onCharacterAdd,
  onCharacterRemove,
  onDialogueChange,
  onDialogueAdd,
  onDialogueRemove,
  onChoiceChange,
  onAskClaude,
}: SceneEditorProps) {
  // Check if a field has been modified
  const isModified = useCallback(
    (type: string, index?: number): boolean => {
      return pendingChanges.some(
        (c) => c.type === type && (index === undefined || c.index === index)
      );
    },
    [pendingChanges]
  );

  // Available scenes for choice targets (we don't have the full list here,
  // so we'll just show current choices and allow typing)
  const availableScenes = useMemo(() => {
    const scenes: string[] = [];
    if (scene.choices) {
      for (const choice of scene.choices) {
        if (!scenes.includes(choice.target)) {
          scenes.push(choice.target);
        }
      }
    }
    return scenes;
  }, [scene.choices]);

  // Character handlers with index binding
  const handleCharacterChange = useCallback(
    (index: number) => (changes: Partial<CharacterState>) => {
      onCharacterChange(index, changes);
    },
    [onCharacterChange]
  );

  const handleCharacterRemove = useCallback(
    (index: number) => () => {
      onCharacterRemove(index);
    },
    [onCharacterRemove]
  );

  // Dialogue handlers with index binding
  const handleDialogueChange = useCallback(
    (index: number) => (changes: Partial<DialogueLine>) => {
      onDialogueChange(index, changes);
    },
    [onDialogueChange]
  );

  const handleDialogueRemove = useCallback(
    (index: number) => () => {
      onDialogueRemove(index);
    },
    [onDialogueRemove]
  );

  // Choice handlers with index binding
  const handleChoiceChange = useCallback(
    (index: number) => (changes: Partial<MenuChoice>) => {
      onChoiceChange(index, changes);
    },
    [onChoiceChange]
  );

  const handleChoiceRemove = useCallback(
    (index: number) => () => {
      // TODO: Add onChoiceRemove handler
      console.log('Remove choice', index);
    },
    []
  );

  return (
    <div className="scene-editor">
      {/* Header */}
      <div className="editor-header">
        <h3 className="editor-title">Scene Editor</h3>
        {pendingChanges.length > 0 && (
          <span className="editor-changes-badge">
            {pendingChanges.length} change{pendingChanges.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Background Section */}
      <div className="editor-section">
        <h4 className="section-title">Background</h4>
        <BackgroundRow
          currentBg={scene.background}
          availableBackgrounds={backgrounds}
          onChange={onBackgroundChange}
          isModified={isModified('background')}
        />
      </div>

      {/* Characters Section */}
      <div className="editor-section">
        <h4 className="section-title">
          Characters
          <span className="section-count">({scene.characters.length})</span>
        </h4>
        <div className="editor-rows">
          {scene.characters.map((char, i) => (
            <CharacterRow
              key={i}
              character={char}
              index={i}
              availableCharacters={characters}
              onChange={handleCharacterChange(i)}
              onRemove={handleCharacterRemove(i)}
              isModified={isModified('character', i)}
            />
          ))}
          {scene.characters.length === 0 && (
            <div className="empty-section-message">No characters in this scene</div>
          )}
        </div>
        <AddRowButton type="character" onClick={onCharacterAdd} />
      </div>

      {/* Dialogue Section */}
      <div className="editor-section">
        <h4 className="section-title">
          Dialogue
          <span className="section-count">({scene.dialogue.length})</span>
        </h4>
        <div className="editor-rows">
          {scene.dialogue.map((line, i) => (
            <TextRow
              key={i}
              dialogue={line}
              index={i}
              availableCharacters={characters}
              onChange={handleDialogueChange(i)}
              onRemove={handleDialogueRemove(i)}
              isModified={isModified('dialogue', i)}
            />
          ))}
          {scene.dialogue.length === 0 && (
            <div className="empty-section-message">No dialogue in this scene</div>
          )}
        </div>
        <AddRowButton type="dialogue" onClick={onDialogueAdd} />
      </div>

      {/* Choices Section (only if scene has choices) */}
      {scene.choices && scene.choices.length > 0 && (
        <div className="editor-section">
          <h4 className="section-title">
            Choices
            <span className="section-count">({scene.choices.length})</span>
          </h4>
          <div className="editor-rows">
            {scene.choices.map((choice, i) => (
              <ChoiceRow
                key={i}
                choice={choice}
                index={i}
                availableScenes={availableScenes}
                onChange={handleChoiceChange(i)}
                onRemove={handleChoiceRemove(i)}
                isModified={isModified('choice', i)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Ask Claude Button */}
      <div className="editor-footer">
        <button className="btn-claude" onClick={onAskClaude}>
          <span className="claude-icon">&#10024;</span>
          <span className="claude-text">
            {pendingChanges.length > 0 ? 'Send Changes to Claude' : 'Ask Claude'}
          </span>
        </button>
      </div>
    </div>
  );
}

export default SceneEditor;

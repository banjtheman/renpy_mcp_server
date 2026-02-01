/**
 * SceneEditModal - Modal for Editing a Scene
 *
 * Opens when clicking a scene card in the storyboard view.
 * Contains the full-size preview and editor panel.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { VisualPreview } from './VisualPreview';
import { SceneEditor } from './SceneEditor';
import type { SceneNodeData, CharacterState, DialogueLine, MenuChoice } from '../../../lib/story-types';
import type { LocalSceneState, PendingChange } from './visual-builder-types';
import { createPendingChange, formatChangesForClaude } from './visual-builder-types';

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

interface SceneEditModalProps {
  scene: SceneNodeData;
  backgrounds: BackgroundAsset[];
  characters: CharacterAsset[];
  onClose: () => void;
  onSendToClaude: (prompt: string) => void;
  projectName: string;
}

// ============================================================================
// Component
// ============================================================================

export function SceneEditModal({
  scene,
  backgrounds,
  characters,
  onClose,
  onSendToClaude,
  projectName,
}: SceneEditModalProps) {
  // Local scene state (working copy)
  const [localScene, setLocalScene] = useState<LocalSceneState>({
    background: scene.background,
    characters: [...scene.characters],
    dialogue: [...scene.dialogue],
    choices: scene.choices ? [...scene.choices] : undefined,
  });

  // Dialogue navigation
  const [dialogueIndex, setDialogueIndex] = useState(0);

  // Pending changes
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);

  // Claude panel
  const [showClaudePanel, setShowClaudePanel] = useState(false);
  const [claudeNotes, setClaudeNotes] = useState('');

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Dialogue advance
  const handleDialogueAdvance = useCallback(() => {
    if (dialogueIndex < localScene.dialogue.length - 1) {
      setDialogueIndex(dialogueIndex + 1);
    }
  }, [dialogueIndex, localScene.dialogue.length]);

  // Edit handlers
  const handleBackgroundChange = useCallback(
    (newBg: string) => {
      const oldBg = localScene.background;
      setLocalScene({ ...localScene, background: newBg });

      const change = createPendingChange(
        scene.label,
        'background',
        'update',
        `Change background: "${oldBg || 'none'}" → "${newBg}"`,
        { oldValue: oldBg, newValue: newBg }
      );
      setPendingChanges((prev) => [...prev, change]);
    },
    [localScene, scene.label]
  );

  const handleCharacterChange = useCallback(
    (index: number, changes: Partial<CharacterState>) => {
      const oldChar = localScene.characters[index];
      const newCharacters = [...localScene.characters];
      newCharacters[index] = { ...oldChar, ...changes };
      setLocalScene({ ...localScene, characters: newCharacters });

      const changeDesc = Object.entries(changes)
        .map(([k, v]) => `${k}: "${v}"`)
        .join(', ');

      const change = createPendingChange(
        scene.label,
        'character',
        'update',
        `Update ${oldChar.name}: ${changeDesc}`,
        { index, oldValue: oldChar, newValue: newCharacters[index] }
      );
      setPendingChanges((prev) => [...prev, change]);
    },
    [localScene, scene.label]
  );

  const handleCharacterAdd = useCallback(() => {
    const newChar: CharacterState = {
      name: 'New Character',
      emotion: 'neutral',
      position: 'center',
    };
    setLocalScene({
      ...localScene,
      characters: [...localScene.characters, newChar],
    });

    const change = createPendingChange(
      scene.label,
      'character',
      'add',
      `Add character: ${newChar.name}`,
      { newValue: newChar }
    );
    setPendingChanges((prev) => [...prev, change]);
  }, [localScene, scene.label]);

  const handleCharacterRemove = useCallback(
    (index: number) => {
      const removedChar = localScene.characters[index];
      const newCharacters = localScene.characters.filter((_, i) => i !== index);
      setLocalScene({ ...localScene, characters: newCharacters });

      const change = createPendingChange(
        scene.label,
        'character',
        'delete',
        `Remove character: ${removedChar.name}`,
        { index, oldValue: removedChar }
      );
      setPendingChanges((prev) => [...prev, change]);
    },
    [localScene, scene.label]
  );

  const handleDialogueChange = useCallback(
    (index: number, changes: Partial<DialogueLine>) => {
      const oldLine = localScene.dialogue[index];
      const newDialogue = [...localScene.dialogue];
      newDialogue[index] = { ...oldLine, ...changes };
      setLocalScene({ ...localScene, dialogue: newDialogue });

      const change = createPendingChange(
        scene.label,
        'dialogue',
        'update',
        `Edit line ${index + 1}: "${changes.text?.slice(0, 30) || ''}..."`,
        { index, oldValue: oldLine, newValue: newDialogue[index] }
      );
      setPendingChanges((prev) => [...prev, change]);
    },
    [localScene, scene.label]
  );

  const handleDialogueAdd = useCallback(() => {
    const newLine: DialogueLine = {
      speaker: null,
      text: 'New dialogue line...',
    };
    setLocalScene({
      ...localScene,
      dialogue: [...localScene.dialogue, newLine],
    });

    const change = createPendingChange(
      scene.label,
      'dialogue',
      'add',
      'Add new dialogue line',
      { newValue: newLine }
    );
    setPendingChanges((prev) => [...prev, change]);
  }, [localScene, scene.label]);

  const handleDialogueRemove = useCallback(
    (index: number) => {
      const removedLine = localScene.dialogue[index];
      const newDialogue = localScene.dialogue.filter((_, i) => i !== index);
      setLocalScene({ ...localScene, dialogue: newDialogue });

      // Adjust dialogue index if needed
      if (dialogueIndex >= newDialogue.length) {
        setDialogueIndex(Math.max(0, newDialogue.length - 1));
      }

      const change = createPendingChange(
        scene.label,
        'dialogue',
        'delete',
        `Remove line ${index + 1}`,
        { index, oldValue: removedLine }
      );
      setPendingChanges((prev) => [...prev, change]);
    },
    [localScene, scene.label, dialogueIndex]
  );

  const handleChoiceChange = useCallback(
    (index: number, changes: Partial<MenuChoice>) => {
      if (!localScene.choices) return;

      const oldChoice = localScene.choices[index];
      const newChoices = [...localScene.choices];
      newChoices[index] = { ...oldChoice, ...changes };
      setLocalScene({ ...localScene, choices: newChoices });

      const change = createPendingChange(
        scene.label,
        'choice',
        'update',
        `Edit choice ${index + 1}: "${changes.text || oldChoice.text}"`,
        { index, oldValue: oldChoice, newValue: newChoices[index] }
      );
      setPendingChanges((prev) => [...prev, change]);
    },
    [localScene, scene.label]
  );

  // Claude integration
  const handleSendToClaude = useCallback(() => {
    const prompt = formatChangesForClaude(pendingChanges, scene.label, claudeNotes);

    if (prompt) {
      onSendToClaude(prompt);
    }

    setPendingChanges([]);
    setShowClaudePanel(false);
    setClaudeNotes('');
    onClose();
  }, [pendingChanges, scene.label, claudeNotes, onSendToClaude, onClose]);

  const handleQuickAction = useCallback(
    (action: string) => {
      let prompt = `I'm editing scene "${scene.label}" in project "${projectName}". `;

      switch (action) {
        case 'expand':
          prompt += 'Please expand the dialogue with more detail and character interaction.';
          break;
        case 'add-character':
          prompt += 'Please add a new character to this scene.';
          break;
        case 'add-choice':
          prompt += 'Please add player choices at the end of this scene.';
          break;
        case 'rewrite':
          prompt += 'Please rewrite this scene to be more engaging.';
          break;
        default:
          prompt += action;
      }

      onSendToClaude(prompt);
      onClose();
    },
    [scene.label, projectName, onSendToClaude, onClose]
  );

  return (
    <div className="scene-edit-modal-overlay" onClick={onClose}>
      <div className="scene-edit-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">
            {scene.label.replace(/_/g, ' ')}
          </h2>
          <button className="modal-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="modal-content">
          {/* Preview (Left) */}
          <div className="modal-preview">
            <VisualPreview
              scene={localScene}
              sceneLabel={scene.label}
              dialogueIndex={dialogueIndex}
              backgrounds={backgrounds}
              characters={characters}
              onDialogueClick={handleDialogueAdvance}
            />
          </div>

          {/* Editor (Right) */}
          <div className="modal-editor">
            <SceneEditor
              scene={localScene}
              backgrounds={backgrounds}
              characters={characters}
              pendingChanges={pendingChanges}
              onBackgroundChange={handleBackgroundChange}
              onCharacterChange={handleCharacterChange}
              onCharacterAdd={handleCharacterAdd}
              onCharacterRemove={handleCharacterRemove}
              onDialogueChange={handleDialogueChange}
              onDialogueAdd={handleDialogueAdd}
              onDialogueRemove={handleDialogueRemove}
              onChoiceChange={handleChoiceChange}
              onAskClaude={() => setShowClaudePanel(true)}
            />
          </div>
        </div>

        {/* Claude Panel */}
        {showClaudePanel && (
          <div className="modal-claude-panel">
            <div className="claude-panel-content">
              <h3>Send to Claude</h3>

              {pendingChanges.length > 0 && (
                <div className="changes-list">
                  <h4>Pending Changes ({pendingChanges.length})</h4>
                  <ul>
                    {pendingChanges.map((c) => (
                      <li key={c.id}>{c.description}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="notes-section">
                <label>Additional Notes</label>
                <textarea
                  value={claudeNotes}
                  onChange={(e) => setClaudeNotes(e.target.value)}
                  placeholder="Add instructions for Claude..."
                  rows={3}
                />
              </div>

              <div className="quick-actions">
                <h4>Quick Actions</h4>
                <div className="action-buttons">
                  <button onClick={() => handleQuickAction('expand')}>Expand Dialogue</button>
                  <button onClick={() => handleQuickAction('add-character')}>Add Character</button>
                  <button onClick={() => handleQuickAction('add-choice')}>Add Choices</button>
                  <button onClick={() => handleQuickAction('rewrite')}>Rewrite Scene</button>
                </div>
              </div>

              <div className="panel-footer">
                <button className="btn-cancel" onClick={() => setShowClaudePanel(false)}>
                  Cancel
                </button>
                <button
                  className="btn-send"
                  onClick={handleSendToClaude}
                  disabled={pendingChanges.length === 0 && !claudeNotes.trim()}
                >
                  Send to Claude
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SceneEditModal;

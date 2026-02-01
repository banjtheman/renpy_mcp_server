/**
 * BeatEditModal - Modal for Editing a Story Beat
 *
 * Shows the beat's context (background, characters) and allows
 * full editing via a table-based editor.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { SceneNodeData, CharacterState } from '../../../lib/story-types';
import type { StoryBeat } from './visual-builder-types';

// ============================================================================
// Asset Types
// ============================================================================

interface CharacterAsset {
  name: string;
  emotions: Array<{ emotion: string; base64: string; base64Transparent: string; mimeType: string }>;
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

interface BeatEditModalProps {
  beat: StoryBeat;
  scene: SceneNodeData;
  backgrounds: BackgroundAsset[];
  characters: CharacterAsset[];
  onClose: () => void;
  onSendToClaude: (prompt: string) => void;
  projectName: string;
}

// ============================================================================
// Helper: Normalize for matching
// ============================================================================

const normalize = (s: string) =>
  s.replace(/^bg_?/i, '').replace(/_/g, '-').toLowerCase();

// ============================================================================
// Component
// ============================================================================

export function BeatEditModal({
  beat,
  scene,
  backgrounds,
  characters,
  onClose,
  onSendToClaude,
  projectName,
}: BeatEditModalProps) {
  // ============================================================================
  // Local Edit State
  // ============================================================================

  // Dialogue
  const [editedText, setEditedText] = useState(beat.text);
  const [editedSpeaker, setEditedSpeaker] = useState(beat.speaker || '');

  // Background - find matching asset name (normalize underscore/hyphen)
  const [editedBackground, setEditedBackground] = useState(() => {
    if (!beat.background) return '';
    // Find the matching background asset by normalizing the name
    const beatBgNorm = beat.background.replace(/^bg_?/i, '').replace(/_/g, '-').toLowerCase();
    const match = backgrounds.find((bg) => {
      const bgNorm = bg.name.replace(/_/g, '-').toLowerCase();
      return bgNorm === beatBgNorm || bgNorm.includes(beatBgNorm) || beatBgNorm.includes(bgNorm);
    });
    return match?.name || '';
  });

  // Characters - mutable copy (limit to 3 max, one per position)
  const [editedCharacters, setEditedCharacters] = useState<CharacterState[]>(() =>
    beat.characters.slice(0, 3).map((c) => ({ ...c }))
  );

  // UI state
  const [claudeNotes, setClaudeNotes] = useState('');
  const [showClaudePanel, setShowClaudePanel] = useState(false);

  // ============================================================================
  // Change Detection
  // ============================================================================

  const hasTextChanges = editedText !== beat.text || editedSpeaker !== (beat.speaker || '');
  const hasBgChanges = editedBackground !== (beat.background || '');
  const hasCharChanges = JSON.stringify(editedCharacters) !== JSON.stringify(beat.characters);
  const hasChanges = hasTextChanges || hasBgChanges || hasCharChanges;

  // ============================================================================
  // Escape Key Handler
  // ============================================================================

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // ============================================================================
  // Asset Matching
  // ============================================================================

  const backgroundAsset = useMemo(() => {
    const bgToFind = editedBackground || beat.background;
    if (!bgToFind) return null;

    const beatBgNorm = normalize(bgToFind);
    let match = backgrounds.find((bg) => normalize(bg.name) === beatBgNorm);
    if (!match) {
      match = backgrounds.find((bg) => {
        const bgNorm = normalize(bg.name);
        return bgNorm.includes(beatBgNorm) || beatBgNorm.includes(bgNorm);
      });
    }
    return match;
  }, [editedBackground, beat.background, backgrounds]);

  const characterAssets = useMemo(() => {
    return editedCharacters.map((char) => {
      const charAsset = characters.find(
        (c) => c.name.toLowerCase() === char.name.toLowerCase()
      );
      if (!charAsset) return { ...char, asset: null, availableEmotions: [] as string[] };

      const emotionAsset =
        charAsset.emotions.find(
          (e) => e.emotion.toLowerCase() === (char.emotion || 'neutral').toLowerCase()
        ) || charAsset.emotions[0];

      return {
        ...char,
        asset: emotionAsset,
        availableEmotions: charAsset.emotions.map((e) => e.emotion),
      };
    });
  }, [editedCharacters, characters]);

  // ============================================================================
  // Character Editing
  // ============================================================================

  const handleCharacterChange = useCallback(
    (index: number, field: keyof CharacterState, value: string) => {
      setEditedCharacters((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
    },
    []
  );

  const handleAddCharacter = useCallback(() => {
    // Max 3 characters (one per position)
    if (editedCharacters.length >= 3) return;

    // Find characters not already in the scene
    const availableChars = characters.filter(
      (c) => !editedCharacters.some((ec) => ec.name.toLowerCase() === c.name.toLowerCase())
    );
    if (availableChars.length === 0) return;

    // Find next available position
    const usedPositions = new Set(editedCharacters.map((c) => c.position));
    const positions: Array<'left' | 'center' | 'right'> = ['center', 'left', 'right'];
    const nextPosition = positions.find((p) => !usedPositions.has(p)) || 'center';

    const newChar: CharacterState = {
      name: availableChars[0].name,
      emotion: 'neutral',
      position: nextPosition,
    };
    setEditedCharacters((prev) => [...prev, newChar]);
  }, [characters, editedCharacters]);

  // Can add more characters?
  const canAddCharacter = editedCharacters.length < 3 &&
    characters.some((c) => !editedCharacters.some((ec) => ec.name.toLowerCase() === c.name.toLowerCase()));

  const handleRemoveCharacter = useCallback((index: number) => {
    setEditedCharacters((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ============================================================================
  // Send to Claude
  // ============================================================================

  const handleSendUpdate = useCallback(() => {
    let prompt = `I'm editing a beat in scene "${beat.sourceLabel}" of project "${projectName}".\n\n`;

    prompt += `Current state:\n`;
    prompt += `- Speaker: ${beat.speaker || 'Narrator'}\n`;
    prompt += `- Text: "${beat.text}"\n`;
    prompt += `- Background: ${beat.background || 'none'}\n`;
    prompt += `- Characters: ${beat.characters.map((c) => `${c.name} (${c.emotion}, ${c.position})`).join(', ') || 'none'}\n\n`;

    const changes: string[] = [];

    if (editedSpeaker !== (beat.speaker || '')) {
      changes.push(`- Change speaker to: ${editedSpeaker || 'Narrator'}`);
    }
    if (editedText !== beat.text) {
      changes.push(`- Change text to: "${editedText}"`);
    }
    if (hasBgChanges) {
      changes.push(`- Change background to: ${editedBackground || 'none'}`);
    }
    if (hasCharChanges) {
      const charDesc = editedCharacters
        .map((c) => `${c.name} (${c.emotion}, ${c.position})`)
        .join(', ');
      changes.push(`- Update characters to: ${charDesc || 'none'}`);
    }

    if (changes.length > 0) {
      prompt += `Changes to apply:\n${changes.join('\n')}\n\n`;
    }

    if (claudeNotes.trim()) {
      prompt += `Additional notes:\n${claudeNotes}\n\n`;
    }

    prompt += 'Please update the script file accordingly using edit_project_file.';

    onSendToClaude(prompt);
    onClose();
  }, [
    beat,
    editedText,
    editedSpeaker,
    editedBackground,
    editedCharacters,
    hasBgChanges,
    hasCharChanges,
    claudeNotes,
    projectName,
    onSendToClaude,
    onClose,
  ]);

  // ============================================================================
  // Quick Actions
  // ============================================================================

  const handleQuickAction = useCallback(
    (action: string) => {
      let prompt = `In scene "${beat.sourceLabel}" of project "${projectName}", `;

      switch (action) {
        case 'expand':
          prompt += `please expand this dialogue: "${beat.text}" - add more detail and emotion.`;
          break;
        case 'shorten':
          prompt += `please make this dialogue more concise: "${beat.text}"`;
          break;
        case 'add-before':
          prompt += `please add a new dialogue line BEFORE: "${beat.text}"`;
          break;
        case 'add-after':
          prompt += `please add a new dialogue line AFTER: "${beat.text}"`;
          break;
        case 'delete':
          prompt += `please remove this dialogue line: "${beat.text}"`;
          break;
        case 'change-emotion':
          prompt += `please change the emotion/tone of: "${beat.text}" - make it more expressive.`;
          break;
        default:
          prompt += action;
      }

      onSendToClaude(prompt);
      onClose();
    },
    [beat, projectName, onSendToClaude, onClose]
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="beat-edit-modal-overlay" onClick={onClose}>
      <div className="beat-edit-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-info">
            <span className="modal-label-tag">{beat.sourceLabel.replace(/_/g, ' ')}</span>
            <span className="modal-beat-type">{beat.type}</span>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>

        {/* Main Content - Side by Side */}
        <div className="beat-modal-content">
          {/* Left: Preview */}
          <div className="beat-modal-preview">
            {backgroundAsset ? (
              <img
                src={`data:${backgroundAsset.mimeType};base64,${backgroundAsset.base64}`}
                alt=""
                className="beat-modal-bg"
              />
            ) : (
              <div className="beat-modal-bg-placeholder">
                {editedBackground || beat.background || 'No background'}
              </div>
            )}

            <div className="beat-modal-characters">
              {characterAssets.map((char, i) => (
                <div key={i} className={`beat-modal-char beat-modal-char-${char.position}`}>
                  {char.asset ? (
                    <img
                      src={`data:${char.asset.mimeType};base64,${char.asset.base64Transparent || char.asset.base64}`}
                      alt={char.name}
                    />
                  ) : (
                    <div className="char-placeholder">
                      <span>{char.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="beat-modal-dialogue">
              {editedSpeaker && <span className="dialogue-speaker">{editedSpeaker}</span>}
              <p className="dialogue-text">{editedText}</p>
            </div>
          </div>

          {/* Right: Table Editor */}
          <div className="beat-modal-editor-panel">
            {/* Background Row */}
            <div className="editor-section">
              <h4>Background</h4>
              <div className="editor-row">
                <select
                  value={editedBackground}
                  onChange={(e) => setEditedBackground(e.target.value)}
                  className="editor-select-full"
                >
                  <option value="">No background</option>
                  {backgrounds.map((bg) => (
                    <option key={bg.name} value={bg.name}>
                      {bg.name.replace(/-/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Characters Section */}
            <div className="editor-section">
              <div className="section-header">
                <h4>Characters ({editedCharacters.length}/3)</h4>
                <button
                  className="btn-add-small"
                  onClick={handleAddCharacter}
                  disabled={!canAddCharacter}
                  title={canAddCharacter ? 'Add character' : 'Max 3 characters'}
                >
                  +
                </button>
              </div>
              {editedCharacters.length === 0 ? (
                <p className="empty-hint">No characters in this beat</p>
              ) : (
                <table className="editor-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Position</th>
                      <th>Emotion</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {characterAssets.map((char, i) => {
                      // Only show characters not already used (except current one)
                      const otherUsedNames = editedCharacters
                        .filter((_, idx) => idx !== i)
                        .map((c) => c.name.toLowerCase());
                      const availableForRow = characters.filter(
                        (c) => c.name.toLowerCase() === char.name.toLowerCase() ||
                               !otherUsedNames.includes(c.name.toLowerCase())
                      );
                      return (
                      <tr key={i}>
                        <td>
                          <select
                            value={char.name}
                            onChange={(e) => handleCharacterChange(i, 'name', e.target.value)}
                          >
                            {availableForRow.map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            value={char.position}
                            onChange={(e) => handleCharacterChange(i, 'position', e.target.value)}
                          >
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </td>
                        <td>
                          <select
                            value={char.emotion || 'neutral'}
                            onChange={(e) => handleCharacterChange(i, 'emotion', e.target.value)}
                          >
                            {(char.availableEmotions.length > 0
                              ? char.availableEmotions
                              : ['neutral', 'happy', 'sad', 'surprised', 'angry']
                            ).map((em) => (
                              <option key={em} value={em}>
                                {em}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            className="btn-remove-small"
                            onClick={() => handleRemoveCharacter(i)}
                            title="Remove"
                          >
                            &times;
                          </button>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Dialogue Section */}
            {beat.type !== 'choice' && (
              <div className="editor-section">
                <h4>Dialogue</h4>
                <div className="editor-row">
                  <label>Speaker</label>
                  <select
                    value={editedSpeaker}
                    onChange={(e) => setEditedSpeaker(e.target.value)}
                  >
                    <option value="">Narrator</option>
                    {characters.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="editor-row">
                  <label>Text</label>
                  <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            )}

            {/* Choice Display */}
            {beat.type === 'choice' && beat.choices && (
              <div className="editor-section">
                <h4>Player Choices</h4>
                <div className="beat-modal-choices">
                  {beat.choices.map((choice, i) => (
                    <div key={i} className="choice-item">
                      <span className="choice-num">{i + 1}.</span>
                      <span className="choice-text">{choice.text}</span>
                      {choice.target && (
                        <span className="choice-target">→ {choice.target}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="beat-modal-actions">
          <div className="quick-actions">
            <button onClick={() => handleQuickAction('expand')}>Expand</button>
            <button onClick={() => handleQuickAction('shorten')}>Shorten</button>
            <button onClick={() => handleQuickAction('add-before')}>+ Before</button>
            <button onClick={() => handleQuickAction('add-after')}>+ After</button>
            <button onClick={() => handleQuickAction('delete')} className="btn-danger">
              Delete
            </button>
          </div>

          <div className="main-actions">
            {hasChanges && (
              <button className="btn-primary" onClick={() => setShowClaudePanel(true)}>
                Apply Changes
              </button>
            )}
            <button className="btn-secondary" onClick={() => setShowClaudePanel(true)}>
              Edit with AI
            </button>
          </div>
        </div>

        {/* Claude Panel */}
        {showClaudePanel && (
          <div className="beat-claude-panel">
            <div className="claude-panel-content">
              <h3>Send Update</h3>

              {hasChanges && (
                <div className="changes-summary">
                  <h4>Pending Changes</h4>
                  <ul>
                    {hasTextChanges && <li>Dialogue updated</li>}
                    {hasBgChanges && <li>Background changed</li>}
                    {hasCharChanges && <li>Characters modified</li>}
                  </ul>
                </div>
              )}

              <div className="notes-section">
                <label>Additional instructions (optional)</label>
                <textarea
                  value={claudeNotes}
                  onChange={(e) => setClaudeNotes(e.target.value)}
                  placeholder="e.g., Make this more emotional, add a pause, change the tone..."
                  rows={3}
                />
              </div>

              <div className="panel-footer">
                <button className="btn-cancel" onClick={() => setShowClaudePanel(false)}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleSendUpdate}>
                  Send Update
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BeatEditModal;
